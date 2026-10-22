"""Read-only PayPal look: who paid recently, and who is at/over their lesson total.

  python paypal_check.py payments [--days 30]   incoming payments, matched to students
  python paypal_check.py owed                   students at/over total + whether a payment came after that

Needs PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (LIVE app, Transaction Search enabled) in .env.
Student matching uses `paypal_names` in students.json (lowercase name parts or emails); unmatched
payers are listed so JD can say who they are.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import settings
import students

API = "https://api-m.paypal.com"


def token() -> str:
    cid, sec = os.environ.get("PAYPAL_CLIENT_ID", ""), os.environ.get("PAYPAL_CLIENT_SECRET", "")
    if not cid or not sec:
        raise SystemExit("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing in .env")
    auth = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    req = urllib.request.Request(f"{API}/v1/oauth2/token", data=b"grant_type=client_credentials", method="POST",
                                 headers={"Authorization": f"Basic {auth}",
                                          "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["access_token"]


def get(path: str, tok: str, **params) -> dict:
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        if e.code in (401, 403):
            raise SystemExit(f"PayPal says no ({e.code}). Turn on 'Transaction search' for the LIVE app "
                             f"(it can take a few hours to activate). {body}")
        raise SystemExit(f"PayPal error {e.code}: {body}")


def incoming(days: int) -> list[dict]:
    tok = token()
    end = datetime.now(timezone.utc) - timedelta(minutes=5)
    start = end - timedelta(days=min(days, 31))
    fmt = "%Y-%m-%dT%H:%M:%S-0000"
    out, page = [], 1
    while True:
        r = get("/v1/reporting/transactions", tok, start_date=start.strftime(fmt), end_date=end.strftime(fmt),
                fields="transaction_info,payer_info", page_size=100, page=page)
        for t in r.get("transaction_details", []):
            ti, pi = t.get("transaction_info", {}), t.get("payer_info", {})
            amt = float(ti.get("transaction_amount", {}).get("value", 0) or 0)
            if amt <= 0 or ti.get("transaction_status") != "S":
                continue
            name = (pi.get("payer_name", {}) or {}).get("alternate_full_name") or \
                   " ".join(filter(None, [(pi.get("payer_name", {}) or {}).get("given_name"),
                                          (pi.get("payer_name", {}) or {}).get("surname")]))
            out.append({"date": ti.get("transaction_initiation_date", "")[:10], "amount": amt,
                        "currency": ti.get("transaction_amount", {}).get("currency_code", ""),
                        "name": name or "?", "email": (pi.get("email_address") or "").lower(),
                        "note": ti.get("transaction_subject") or ti.get("transaction_note") or ""})
        if page >= int(r.get("total_pages", 1)):
            break
        page += 1
    return sorted(out, key=lambda x: x["date"])


def match(sdata: dict, pay: dict):
    blob = f"{pay['name']} {pay['email']}".lower()
    for s in sdata["students"]:
        for token_ in s.get("paypal_names", []):
            if token_.lower() in blob:
                return s
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("payments"); p.add_argument("--days", type=int, default=30)
    sub.add_parser("owed")
    args = ap.parse_args()
    sdata = students.load()
    pays = incoming(getattr(args, "days", 45))
    if args.cmd == "payments":
        for x in pays:
            s = match(sdata, x)
            print(f"{x['date']}  {x['amount']:>8.2f} {x['currency']}  {x['name']:28} {x['email']:30} -> "
                  f"{s['display'] if s else 'UNMATCHED'}  {x['note'][:40]}")
        return 0
    for s in sdata["students"]:
        if s.get("same_as_number") or s["last"] < s["total"]:
            continue
        later = [x for x in pays if match(sdata, x) is s]
        over = s["last"] - s["total"]
        last_pay = later[-1] if later else None
        status = f"last payment {last_pay['date']} {last_pay['amount']:.2f}" if last_pay else "no payment found in 45 days"
        print(f"{s['display']:9} {s['last']}/{s['total']}{f' (+{over})' if over else ''}  {status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
