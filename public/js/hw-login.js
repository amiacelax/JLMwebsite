/**
 * Homework landing — always starts logged out (refresh shows login inlay).
 */
(function () {
  HwAuth.logout();

  const loginForm = document.getElementById("hw-login-form");
  const loginError = document.getElementById("hw-login-error");

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = document.getElementById("hw-username")?.value ?? "";
      const password = document.getElementById("hw-password")?.value ?? "";
      const remember = document.getElementById("hw-remember")?.checked ?? false;
      const result = HwAuth.login(username, password, remember);
      if (result.ok) {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");
        const dest =
          next && next.startsWith("/homework/") ? decodeURIComponent(next) : HwAuth.PLATFORM_PATH;
        window.location.href = dest;
        return;
      }
      if (loginError) {
        loginError.hidden = false;
        loginError.textContent = result.error;
      }
    });
  }
})();
