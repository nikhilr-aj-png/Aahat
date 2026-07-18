import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDpFIzMghS94ujM7tiMgymw7SfPJe1icT8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'aahat-e1351.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'aahat-e1351',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'aahat-e1351.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '993575117808',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:993575117808:web:3e4d7fd6a0395c5f83b335',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-YLPP2VGNJZ'
};

const publicVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BOjhzHnDpy795rds-XG-oegvd0UmV3XIrfoRWiCBROCsfno8k3-IGzvvVS049I-juXCxhHdpAC9lPZuxhQu0sRI';

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
let messagingPromise = null;

const getMessagingInstance = async () => {
  if (!app) return null;
  if (!messagingPromise) {
    messagingPromise = isSupported().then((supported) => (supported ? getMessaging(app) : null));
  }
  return messagingPromise;
};

export const requestNotificationPermission = async () => {
  try {
    if (!isFirebaseConfigured) {
      console.warn("Firebase is not configured. Skipping notification registration.");
      return null;
    }

    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.warn("Firebase messaging is not supported in this browser.");
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn("Notification permission denied.");
      return null;
    }

    const tokenOptions = { vapidKey: publicVapidKey };

    if ('serviceWorker' in navigator) {
      try {
        const existing = await navigator.serviceWorker.getRegistration('/');
        tokenOptions.serviceWorkerRegistration = existing || await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      } catch (swErr) {
        console.warn("Service Worker not ready for FCM registration:", swErr);
      }
    }

    return getToken(messaging, tokenOptions);
  } catch (error) {
    console.error("Error requesting permission:", error);
    return null;
  }
};
