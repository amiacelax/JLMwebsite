(function () {
  "use strict";

  const html = document.documentElement;
  const nav = document.querySelector(".nav");
  const navToggle = document.querySelector(".nav__toggle");
  const navMenu = document.querySelector(".nav__menu");
  const themeToggle = document.querySelector(".theme-toggle");
  const yearEl = document.getElementById("year");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  themeToggle?.addEventListener("click", () => {
    const current = html.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });

  function closeMenu() {
    nav?.classList.remove("is-open");
    navMenu?.classList.remove("is-open");
    document.body.classList.remove("is-nav-open");
    navToggle?.setAttribute("aria-expanded", "false");
    navToggle?.setAttribute("aria-label", "Open menu");
  }

  navToggle?.addEventListener("click", () => {
    if (navMenu?.classList.contains("is-open")) closeMenu();
    else {
      nav?.classList.add("is-open");
      navMenu?.classList.add("is-open");
      document.body.classList.add("is-nav-open");
      navToggle?.setAttribute("aria-expanded", "true");
      navToggle?.setAttribute("aria-label", "Close menu");
    }
  });

  navMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
})();
