import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

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

    const tokenOptions = {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
    };

    if ('serviceWorker' in navigator) {
      try {
        tokenOptions.serviceWorkerRegistration = await navigator.serviceWorker.ready;
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
