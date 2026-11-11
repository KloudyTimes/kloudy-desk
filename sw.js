// Service worker: Web Push only. No caching of API responses.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Kloudy Desk', {
    body: d.body || '', icon: d.icon || 'icons/icon-192-v20261118e.png', badge: 'icons/icon-192-v20261118e.png', data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';   // exact links.coin_url string from the server
  e.waitUntil(self.clients.openWindow(url));
});
