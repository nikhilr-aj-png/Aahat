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
    const notificationTitle = payload.notification?.title || 'Aahat Message';
    const notificationOptions = {
      body: payload.notification?.body || 'You have a new message.',
      icon: '/logo.png',
      badge: '/logo.png',
      data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}
