try {
  importScripts('/firebase-config.js');
} catch (error) {
  console.warn('Firebase service worker config not found. Background notifications disabled.', error);
}

if (self.FIREBASE_CONFIG) {
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

  firebase.initializeApp(self.FIREBASE_CONFIG);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Aahat Message';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'You have a new message.',
      icon: payload.data?.icon || '/logo.png',
      badge: '/logo.png',
      tag: payload.data?.conversationId ? `conversation-${payload.data.conversationId}` : undefined,
      renotify: true,
      data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId || '';
  const target = new URL('/', self.location.origin);
  if (conversationId) target.searchParams.set('conversation', conversationId);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      if (clients[0]) {
        await clients[0].navigate(target.href);
        return clients[0].focus();
      }
      return self.clients.openWindow(target.href);
    })
  );
});