/**

 * Homework Hub marketing landing — one-click tier → login-gated PayPal checkout.

 */

(function (global) {

  "use strict";



  const CONTACT_SERVICE = "Homework Hub";



  function startCheckout(productId) {

    if (!productId) return;

    if (global.HwCheckout?.startCheckout) {

      global.HwCheckout.startCheckout(productId);

      return;

    }

    const session = global.HwAuth?.getSession?.();

    if (!session) {

      global.location.href =

        "/homework.html?signup=1&checkout=" + encodeURIComponent(productId);

      return;

    }

    const checkoutUrl = global.HwCheckout?.buildCheckoutUrl?.(productId, session);

    if (checkoutUrl) {

      global.open(checkoutUrl, "_blank", "noopener,noreferrer");

      return;

    }

    global.location.href = "/homework.html?checkout=" + encodeURIComponent(productId);

  }



  function startContact(message) {

    const params = new URLSearchParams();

    params.set("service", CONTACT_SERVICE);

    if (message) params.set("message", message);

    global.location.href = "/?" + params.toString() + "#contact";

  }



  function activateTier(card) {

    if (!card) return;

    const action = card.getAttribute("data-hub-action") || "contact";

    if (action === "checkout") {

      const productId =

        card.getAttribute("data-hw-checkout") ||

        card.getAttribute("data-hub-tier") ||

        "";

      startCheckout(productId);

      return;

    }

    startContact(card.getAttribute("data-hub-message") || "");

  }



  document.querySelectorAll(".hub-tier-card[data-hub-tier]").forEach((card) => {

    card.addEventListener("click", () => activateTier(card));

  });



  /* Defer YouTube until near viewport (same idea as homepage). */

  (function lazyYoutubeEmbeds() {

    const frames = document.querySelectorAll("iframe[data-src*='youtube']");

    if (!frames.length) return;

    const activate = (el) => {

      if (el.dataset.src && !el.getAttribute("src")) {

        el.setAttribute("src", el.dataset.src);

      }

    };

    if (!("IntersectionObserver" in window)) {

      frames.forEach(activate);

      return;

    }

    const io = new IntersectionObserver(

      (entries) => {

        entries.forEach((entry) => {

          if (!entry.isIntersecting) return;

          activate(entry.target);

          io.unobserve(entry.target);

        });

      },

      { rootMargin: "200px 0px" }

    );

    frames.forEach((el) => io.observe(el));

  })();

})(window);


