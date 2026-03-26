import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, setDoc, collection, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Use initializeFirestore with experimentalForceLongPolling: true to fix connection issues in sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a a time.
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // The current browser does not support all of the features required to enable persistence
      console.warn('Firestore persistence is not supported by this browser');
    }
  });
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// Function to request notification permission and get token
export const requestNotificationPermission = async () => {
  if (!messaging || typeof window === 'undefined') return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Register service worker explicitly to ensure it's the right one
      let registration;
      if ('serviceWorker' in navigator) {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js?v=4');
      }

      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
        serviceWorkerRegistration: registration
      });
      
      if (token) {
        // Store token in Firestore
        await setDoc(doc(collection(db, 'fcm_tokens'), token), {
          token,
          updatedAt: new Date().toISOString(),
          userId: auth.currentUser?.uid || 'anonymous'
        });
        
        // Also register with server for topic subscription
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        
        return token;
      }
    }
  } catch (error) {
    console.error('Error getting notification permission:', error);
  }
  return null;
};

if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('Message received. ', payload);
    // Custom handling for foreground messages if needed
  });
}

// Test connection to Firestore (Optional diagnostic)
// async function testConnection() {
//   try {
//     await getDocFromServer(doc(db, 'test', 'connection'));
//     console.log("Firestore connection successful.");
//   } catch (error) {
//     if(error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
//       console.error("Please check your Firebase configuration. It looks like the project was remixed and needs to be set up again, or the database ID is incorrect.");
//     } else {
//       console.error("Firestore connection error:", error);
//     }
//   }
// }
// testConnection();

