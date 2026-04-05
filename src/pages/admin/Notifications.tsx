import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { AppNotification } from "../../types";
import { Bell, Trash2, Search, Calendar } from "lucide-react";
import { format, isToday } from "date-fns";
import ConfirmModal from "../../components/ConfirmModal";
import { useModalBehavior } from "../../hooks/useModalBehavior";

export default function Notifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useModalBehavior(!!deleteId, () => setDeleteId(null));

  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }) as AppNotification)
        .filter((n) => !n.targetUserId); // Only show global notifications in the admin panel
      setNotifications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, "notifications", deleteId));
      setDeleteId(null);
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const filteredNotifications = notifications.filter(
    (n) =>
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.body.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const notificationsToday = notifications.filter((n) =>
    isToday(new Date(n.createdAt)),
  ).length;

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-500">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-zinc-900 dark:text-white transition-colors duration-300">
            <Bell className="w-8 h-8 text-blue-500" />
            Notifications
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 transition-colors duration-300">
            Manage push notifications sent to users
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center gap-4 transition-colors duration-300">
          <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white transition-colors duration-300">
              {notificationsToday}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold transition-colors duration-300">
              Sent Today
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-200px)] transition-colors duration-300">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-blue-500 text-zinc-900 dark:text-white transition-colors duration-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 transition-colors duration-300">
              <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No notifications found</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center transition-colors duration-300"
              >
                {notification.posterUrl ? (
                  <img
                    src={notification.posterUrl}
                    alt="Poster"
                    className="w-16 h-24 object-cover rounded-lg shrink-0 border border-zinc-200 dark:border-zinc-800 transition-colors duration-300"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-16 h-24 bg-zinc-100 dark:bg-zinc-900 rounded-lg shrink-0 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                    <Bell className="w-6 h-6 text-zinc-600" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-bold text-lg text-zinc-900 dark:text-white leading-tight transition-colors duration-300">
                      {notification.title}
                    </h3>
                    <span className="text-xs text-zinc-500 whitespace-nowrap bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded-md transition-colors duration-300">
                      {format(
                        new Date(notification.createdAt),
                        "MMM dd, yyyy HH:mm",
                      )}
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-3 transition-colors duration-300">
                    {notification.body}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 px-2 py-1 rounded">
                      Push Notification
                    </span>
                  </div>
                </div>

                <div className="shrink-0 self-end sm:self-center mt-4 sm:mt-0">
                  <button
                    onClick={() => setDeleteId(notification.id)}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete Notification"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Notification"
        message="Are you sure you want to delete this notification? This will remove it from users' notification history."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
