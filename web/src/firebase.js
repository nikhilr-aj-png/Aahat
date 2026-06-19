import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDpFIzMghS94ujM7tiMgymw7SfPJe1icT8",
  authDomain: "aahat-e1351.firebaseapp.com",
  projectId: "aahat-e1351",
  storageBucket: "aahat-e1351.firebasestorage.app",
  messagingSenderId: "993575117808",
  appId: "1:993575117808:web:3e4d7fd6a0395c5f83b335",
  measurementId: "G-YLPP2VGNJZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

// Request permission and get FCM token
export const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: 'BOjhzHnDpy795rds-XG-oegvdOUmV3XlrfoRWiCBROCsfno8k3-IGzvvSO49l-juXCxhHdpAC9lPZuxhQuOsRI'
      });
      return token;
    } else {
      console.warn("Notification permission denied.");
      return null;
    }
  } catch (error) {
    console.error("Error requesting permission:", error);
    return null;
  }
};
