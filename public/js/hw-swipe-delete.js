/**
 * Swipe a filled example row to the left to remove it (phones / touch).
 * PC uses the little × button on the right of the row instead.
 *
 * HwSwipeDelete.bind(listEl, { item: "li", hasContent(li), onDelete(li) })
 */
(function (global) {
  "use strict";

  function bind(list, opts) {
    if (!list || list.dataset.swipeDel === "1") return;
    list.dataset.swipeDel = "1";
    const itemSel = opts.item || "li";
    let g = null;

    function reset(spring) {
      if (!g) return;
      const li = g.li;
      li.removeAttribute("data-no-swipe");
      if (spring) {
        li.style.transition = "transform 160ms ease, opacity 160ms ease";
        li.style.transform = "";
        li.style.opacity = "";
        window.setTimeout(() => {
          li.style.transition = "";
        }, 180);
      }
      g = null;
    }

    list.addEventListener("pointerdown", (ev) => {
      if (g || ev.pointerType === "mouse" || ev.isPrimary === false) return;
      const li = ev.target.closest && ev.target.closest(itemSel);
      if (!li || !list.contains(li) || !opts.hasContent(li)) return;
      /* keep the hub's left/right tab swipe out of the way for this row */
      li.setAttribute("data-no-swipe", "");
      g = { li, id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, dx: 0, drag: false };
    });

    list.addEventListener("pointermove", (ev) => {
      if (!g || ev.pointerId !== g.id) return;
      const dx = ev.clientX - g.sx;
      const dy = ev.clientY - g.sy;
      if (!g.drag) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.25) {
          g.drag = true;
          g.li.style.transition = "none";
          try {
            g.li.setPointerCapture(ev.pointerId);
          } catch (_) {
            /* ignore */
          }
        } else {
          reset(false);
          return;
        }
      }
      g.dx = Math.min(0, dx);
      g.li.style.transform = "translateX(" + g.dx + "px)";
      g.li.style.opacity = String(Math.max(0.35, 1 - Math.abs(g.dx) / 260));
    });

    const finish = (ev) => {
      if (!g || ev.pointerId !== g.id) return;
      const cur = g;
      if (!cur.drag) {
        reset(false);
        return;
      }
      /* the tap that ends a drag must not also press a button */
      const eat = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      document.addEventListener("click", eat, true);
      window.setTimeout(() => document.removeEventListener("click", eat, true), 350);
      const far = Math.abs(cur.dx) > Math.min(110, cur.li.offsetWidth * 0.3);
      if (far && ev.type !== "pointercancel") {
        cur.li.style.transition = "transform 150ms ease, opacity 150ms ease";
        cur.li.style.transform = "translateX(-110%)";
        cur.li.style.opacity = "0";
        g = null;
        window.setTimeout(() => {
          cur.li.removeAttribute("data-no-swipe");
          cur.li.style.transition = "";
          cur.li.style.transform = "";
          cur.li.style.opacity = "";
          opts.onDelete(cur.li);
        }, 160);
      } else {
        reset(true);
      }
    };
    list.addEventListener("pointerup", finish);
    list.addEventListener("pointercancel", finish);
  }

  global.HwSwipeDelete = { bind };
})(window);
