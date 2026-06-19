importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDpFIzMghS94ujM7tiMgymw7SfPJe1icT8",
  authDomain: "aahat-e1351.firebaseapp.com",
  projectId: "aahat-e1351",
  storageBucket: "aahat-e1351.firebasestorage.app",
  messagingSenderId: "993575117808",
  appId: "1:993575117808:web:3e4d7fd6a0395c5f83b335",
  measurementId: "G-YLPP2VGNJZ"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Received background message ', payload);
  const notificationTitle = payload.notification.title || "Aahat Message";
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png',
    badge: '/badge.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
