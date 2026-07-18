// =========================================================
// IT Ticketing System — Service Worker
// Handles browser notification click → open correct ticket page
// =========================================================

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle notification click: focus existing tab or open new window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url;
  if (!url) return;

  const absoluteUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if a tab with this URL already exists
        for (const client of clientList) {
          if (client.url === absoluteUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Check if any admin tab is open — navigate it instead of opening new
        for (const client of clientList) {
          if (client.url.includes('/admin') && 'navigate' in client) {
            client.focus();
            return client.navigate(absoluteUrl);
          }
        }
        // No existing tab: open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(absoluteUrl);
        }
      })
  );
});

// Handle push events (future Web Push support)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'IT Ticketing', body: event.data.text(), url: '/admin' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'IT Ticketing', {
      body: payload.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: payload.url || '/admin' },
      tag: payload.url || 'it-notif',
      renotify: true,
    })
  );
});
