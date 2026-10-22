"""Draft PayPal invoices for students who finished their package, and tell JD (Other Notifications).

When a student reaches their lesson total, `handle()`:
  1. creates a DRAFT invoice in PayPal (never sent - JD opens it, checks it, and presses Send)
  2. posts to the "Other Notifications" Discord channel: link to the draft + a copy/paste message for the student

Per-student settings live in students.json under "invoice":
  {"lessons": 4, "amount": 196, "currency": "USD", "email": "...", "name": "First Last", "greet": "Faye"}

Needs in .env:
  PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET   (LIVE app with "Invoicing" turned on)
  DISCORD_OTHER_WEBHOOK_URL                 (webhook of the Other Notifications channel)

Never raises: a failure here must not lose a lesson upload. If the draft can't be made, JD still gets the
ping with the amount and the copy/paste message.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import paypal_check
import settings
import students
from settings import log

INVOICE_STATE = settings.STATE_DIR / "invoices.json"
UA = "JLM-LessonUploader/1.0"

MESSAGE = "Hey {greet}! おつかれさまです。Is it okay if I send a new invoice for the next {lessons} lessons?"
# PayPal template "4 Lessons" (USD, $196). Every draft uses this unless that student has invoice.template set.
TEMPLATE_4_LESSONS = "TEMP-82S23355LK5365405"


# ------------------------------------------------------------------ small helpers
def _load() -> dict:
    if INVOICE_STATE.is_file():
        try:
            return json.loads(INVOICE_STATE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
    return {}


def _save(data: dict) -> None:
    INVOICE_STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = INVOICE_STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(INVOICE_STATE)


def _cycle_key(student: dict) -> str:
    """One draft per package: 'faye:114'. A new total (set-total) starts a new cycle."""
    return f"{student['key']}:{student['total']}"


def copy_message(student: dict) -> str:
    inv = student.get("invoice") or {}
    greet = inv.get("greet") or student["display"]
    return MESSAGE.format(greet=greet, lessons=inv.get("lessons") or 4)


# ------------------------------------------------------------------ PayPal
def _paypal(path: str, tok: str, method: str = "GET", body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        paypal_check.API + path, data=data, method=method,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"message": raw[:300]}


def build_payload(student: dict, invoice_number: str | None, template: dict, template_id: str) -> dict:
    """Fill the draft from the PayPal template (logo, color, line, amount). Only the recipient changes."""
    inv = student["invoice"]
    full = (inv.get("name") or student["display"]).strip()
    given, _, surname = full.partition(" ")
    src_detail = template.get("detail") or {}
    detail = {
        "currency_code": src_detail.get("currency_code") or inv.get("currency", "USD"),
        "payment_term": src_detail.get("payment_term") or {"term_type": "NO_DUE_DATE"},
    }
    if src_detail.get("category_code"):
        detail["category_code"] = src_detail["category_code"]
    if invoice_number:
        detail["invoice_number"] = invoice_number
    items = []
    for item in template.get("items") or []:
        items.append({k: item[k] for k in ("name", "description", "quantity", "unit_amount", "unit_of_measure") if k in item})
    invoicer = {k: v for k, v in (template.get("invoicer") or {}).items()
                if k in ("business_name", "name", "email_address", "logo_url", "address", "phones", "website")}
    cfg = {k: v for k, v in (template.get("configuration") or {}).items()
           if k in ("tax_calculated_after_discount", "tax_inclusive", "allow_tip", "theme")}
    cfg["template_id"] = template_id
    return {
        "detail": detail,
        "invoicer": invoicer,
        "primary_recipients": [{
            "billing_info": {
                "name": {"given_name": given, "surname": surname} if surname else {"given_name": given},
                "email_address": inv["email"],
            }
        }],
        "items": items,
        "configuration": cfg,
    }


def create_draft(student: dict) -> dict:
    """-> {"ok": True, "id", "url"} or {"ok": False, "error"}. Creates a DRAFT only (nothing is sent)."""
    inv = student.get("invoice") or {}
    if not inv.get("email") or not inv.get("amount"):
        return {"ok": False, "error": "no PayPal email / amount saved for this student yet"}
    try:
        tok = paypal_check.token()
    except SystemExit as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:
        return {"ok": False, "error": f"PayPal login failed: {e!r}"}

    code, num = _paypal("/v2/invoicing/generate-next-invoice-number", tok, "POST")
    if code in (401, 403):
        return {"ok": False, "error": "PayPal says the app can't use Invoicing yet (turn on 'Invoicing' for the LIVE app)"}
    number = num.get("invoice_number") if code == 200 else None

    template_id = inv.get("template") or TEMPLATE_4_LESSONS
    tcode, tmpl = _paypal(f"/v2/invoicing/templates/{template_id}", tok)
    if tcode != 200 or not (tmpl.get("template_info") or {}).get("items"):
        return {"ok": False, "error": f"couldn't read the 4 Lessons template ({tcode})"}
    code, res = _paypal("/v2/invoicing/invoices", tok, "POST",
                        build_payload(student, number, tmpl["template_info"], template_id))
    if code not in (200, 201):
        msg = res.get("message") or res.get("name") or f"HTTP {code}"
        if code in (401, 403):
            msg = "PayPal says the app can't use Invoicing yet (turn on 'Invoicing' for the LIVE app)"
        return {"ok": False, "error": msg}
    href = res.get("href") or ""
    inv_id = href.rstrip("/").rsplit("/", 1)[-1] if href else ""
    url = ""
    if inv_id:
        c2, full = _paypal(f"/v2/invoicing/invoices/{inv_id}", tok)
        if c2 == 200:
            url = (full.get("detail", {}).get("metadata", {}) or {}).get("invoicer_view_url", "")
        url = url or f"https://www.paypal.com/invoice/details/{inv_id}"
    return {"ok": True, "id": inv_id, "url": url}


# ------------------------------------------------------------------ Discord (Other Notifications)
def post_other(text: str) -> bool:
    hook = os.environ.get("DISCORD_OTHER_WEBHOOK_URL", "").strip()
    if not hook:
        log("invoices: DISCORD_OTHER_WEBHOOK_URL missing in .env - cannot post")
        return False
    req = urllib.request.Request(
        hook, method="POST",
        data=json.dumps({"content": text[:1900], "flags": 4}).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return 200 <= r.status < 300
    except Exception as e:
        log(f"invoices: Discord post failed: {e!r}")
        return False


def build_ping(student: dict, result: dict, n: int | None = None) -> str:
    inv = student.get("invoice") or {}
    lessons = inv.get("lessons") or 4
    cur = inv.get("currency", "USD")
    amount = f"{float(inv['amount']):,.0f} {cur}" if inv.get("amount") else "amount not set"
    where = ""
    if n is not None and student.get("total"):
        over = n - student["total"]
        where = f" ({n}/{student['total']}" + (f", {over} over" if over > 0 else "") + ")"
    lines = [f"Invoice time: {student['display']}{where}"]
    if result.get("ok"):
        lines.append(f"Draft ready ({lessons} lessons, {amount}) - open it, check, Send:")
        lines.append(result["url"])
    else:
        lines.append(f"Couldn't make the draft: {result.get('error')}")
        lines.append(f"Invoice to make by hand: {lessons} lessons, {amount}")
    lines += ["", "Copy/paste to the student:", "```", copy_message(student), "```"]
    return "\n".join(lines)


# ------------------------------------------------------------------ main entry points
def handle(student: dict, n: int | None = None, force: bool = False) -> bool:
    """Make the draft + ping JD, once per package. Returns True if a ping went out. Never raises."""
    try:
        if student.get("same_as_number") or not student.get("invoice"):
            if not student.get("same_as_number"):
                log(f"invoices: no invoice settings for {student['display']} - skipping")
            return False
        state = _load()
        key = _cycle_key(student)
        if (state.get(key) or {}).get("draft") and not force:
            return False
        result = create_draft(student)
        log(f"invoices: {student['display']} draft -> {result}")
        sent = post_other(build_ping(student, result, n))
        if sent:
            state[key] = {"draft": bool(result.get("ok")), "id": result.get("id", ""), "url": result.get("url", "")}
            _save(state)
        return sent
    except Exception as e:  # never lose a lesson upload over an invoice
        log(f"invoices: failed for {student.get('display')}: {e!r}")
        return False


def cmd_invoice(student_key: str, force: bool = True) -> int:
    sdata = students.load()
    st = students.by_key(sdata, student_key)
    if not st:
        print("Unknown student")
        return 1
    ok = handle(st, n=st.get("last"), force=force)
    print("sent to Other Notifications" if ok else "nothing sent (see uploader.log)")
    return 0 if ok else 1
