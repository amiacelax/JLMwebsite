self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let body = "Time to relax with Japanese";
  try {
    const data = event.data ? event.data.json() : null;
    if (data && data.message) body = String(data.message).slice(0, 180);
  } catch {
    /* empty push */
  }
  event.waitUntil(
    self.registration.showNotification("Japanese reminder", {
      body,
      tag: "jlm-study-reminder",
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "jlm-study-ping") return;
  const body = String(data.message || "Time to relax with Japanese").slice(0, 180);
  event.waitUntil(
    self.registration.showNotification("Japanese reminder", {
      body,
      tag: "jlm-study-reminder-" + Date.now(),
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (String(client.url || "").indexOf("/homework") !== -1 && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow("/homework/platform.html");
    })
  );
});
