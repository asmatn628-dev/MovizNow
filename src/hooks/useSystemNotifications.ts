import { useEffect, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db, requestNotificationPermission } from "../firebase";
import { AppNotification, UserProfile } from "../types";

export function useSystemNotifications(profile: UserProfile | null) {
  const isFirstLoad = useRef(true);
  const lastNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    // Check if browser supports notifications
    if (!("Notification" in window)) {
      console.log("This browser does not support system notifications");
      return;
    }

    // Request permission and get FCM token
    if (Notification.permission === "default" || Notification.permission === "granted") {
      requestNotificationPermission().catch(console.error);
    }

    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
      limit(1),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;

      const latestDoc = snapshot.docs[0];
      const notification = {
        id: latestDoc.id,
        ...latestDoc.data(),
      } as AppNotification;

      // Skip the first load so we don't show a notification for old messages
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        lastNotificationId.current = notification.id;
        return;
      }

      // Ignore notifications targeted at other users
      if (
        notification.targetUserId &&
        notification.targetUserId !== profile.uid
      ) {
        lastNotificationId.current = notification.id;
        return;
      }

      // Only show if it's a new notification and created after the user's account
      if (
        notification.id !== lastNotificationId.current &&
        new Date(notification.createdAt) > new Date(profile.createdAt)
      ) {
        lastNotificationId.current = notification.id;
        // FCM handles system notifications now. We just update the local state/UI if needed.
      }
    });

    return () => unsubscribe();
  }, [profile]);
}
