/**
 * Student platform — worksheet save, logout, placeholder actions.
 */
(function () {
  const session = HwAuth.getSession();
  if (!session) return;

  const greet = document.getElementById("hw-platform-greet");
  if (greet) greet.textContent = session.displayName;

  document.getElementById("hw-platform-logout")?.addEventListener("click", () => {
    HwAuth.logout();
    window.location.href = HwAuth.LOGIN_PATH;
  });

  document.querySelectorAll("[data-placeholder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const msg = btn.getAttribute("data-placeholder-msg") || "Coming soon.";
      showToast(msg);
    });
  });

  const toastEl = document.getElementById("hw-platform-toast");
  let toastTimer = 0;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  const worksheetForm = document.getElementById("hw-demo-worksheet");
  const saveStatus = document.getElementById("hw-save-status");
  if (worksheetForm && session.username) {
    const storageKey = `jlm-hw-answers-${session.username}`;
    const inputs = worksheetForm.querySelectorAll(".hw-blank");
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      inputs.forEach((inp) => {
        if (inp.name && saved[inp.name] != null) inp.value = saved[inp.name];
      });
    } catch (_) {}

    worksheetForm.addEventListener("input", () => {
      const data = {};
      inputs.forEach((inp) => {
        if (inp.name) data[inp.name] = inp.value;
      });
      localStorage.setItem(storageKey, JSON.stringify(data));
      if (saveStatus) saveStatus.textContent = "Saved in your browser.";
    });

    worksheetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (saveStatus) {
        saveStatus.textContent = "Submitted — demo only (not sent to JD yet).";
      }
    });
  }
})();
