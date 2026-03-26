import { useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { AppNotification, UserProfile } from '../types';

export function useSystemNotifications(profile: UserProfile | null) {
  const isFirstLoad = useRef(true);
  const lastNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    // Check if browser supports notifications
    if (!('Notification' in window)) {
      console.log('This browser does not support system notifications');
      return;
    }

    // Request permission for system notifications
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Register service worker for reliable notifications (especially on mobile)
    if ('serviceWorker' in navigator) {
      // Versioning the SW registration to force an update if needed
      navigator.serviceWorker.register('/firebase-messaging-sw.js?v=4').catch(err => console.error('SW registration failed:', err));
    }

    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;

      const latestDoc = snapshot.docs[0];
      const notification = { id: latestDoc.id, ...latestDoc.data() } as AppNotification;

      // Skip the first load so we don't show a notification for old messages
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        lastNotificationId.current = notification.id;
        return;
      }

      // Only show if it's a new notification and created after the user's account
      if (
        notification.id !== lastNotificationId.current &&
        new Date(notification.createdAt) > new Date(profile.createdAt)
      ) {
        lastNotificationId.current = notification.id;

        if (Notification.permission === 'granted') {
          try {
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistrations().then(registrations => {
                const myReg = registrations.find(reg => reg.active && reg.active.scriptURL.includes('firebase-messaging-sw.js'));
                
                if (myReg) {
                  myReg.showNotification(notification.title, {
                    body: notification.body,
                    icon: notification.posterUrl || '/favicon.ico',
                    image: notification.posterUrl,
                    tag: notification.id,
                    data: {
                      url: notification.contentId ? `/movie/${notification.contentId}` : '/'
                    }
                  } as any);
                } else {
                  // Fallback to standard Notification if SW not found or not active yet
                  const sysNotif = new Notification(notification.title, {
                    body: notification.body,
                    icon: notification.posterUrl || '/favicon.ico',
                    image: notification.posterUrl,
                    tag: notification.id,
                  } as any);

                  sysNotif.onclick = () => {
                    window.focus();
                    if (notification.contentId) {
                      window.location.href = `/movie/${notification.contentId}`;
                    }
                    sysNotif.close();
                  };
                }
              });
            } else {
              const sysNotif = new Notification(notification.title, {
                body: notification.body,
                icon: notification.posterUrl || '/favicon.ico',
                image: notification.posterUrl,
                tag: notification.id,
              } as any);

              sysNotif.onclick = () => {
                window.focus();
                if (notification.contentId) {
                  window.location.href = `/movie/${notification.contentId}`;
                }
                sysNotif.close();
              };
            }
          } catch (error) {
            console.error('Error showing system notification:', error);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [profile]);
}
