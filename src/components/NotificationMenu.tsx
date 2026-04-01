import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AppNotification } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

interface NotificationMenuProps {}

export const NotificationMenu: React.FC<NotificationMenuProps> = () => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification))
        .filter(n => !n.targetUserId || n.targetUserId === profile.uid);
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && profile?.uid) {
      // Update lastNotificationCheck when opening the menu
      try {
        const userRef = doc(db, 'users', profile.uid);
        await updateDoc(userRef, {
          lastNotificationCheck: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error updating lastNotificationCheck:', error);
      }
    }
  };

  if (!profile) return null;

  const unreadCount = notifications.filter(n => {
    const notifDate = new Date(n.createdAt);
    const userCreatedAt = new Date(profile.createdAt);
    const lastCheck = profile.lastNotificationCheck ? new Date(profile.lastNotificationCheck) : userCreatedAt;
    return notifDate > lastCheck && notifDate > userCreatedAt;
  }).length;

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={handleOpen}
        className="relative p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white border-2 border-zinc-950">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
            <h3 className="font-bold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs font-medium text-emerald-500">{unreadCount} new</span>
            )}
          </div>
          
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {notifications.map(notification => {
                  const isNew = profile.lastNotificationCheck 
                    ? new Date(notification.createdAt) > new Date(profile.lastNotificationCheck)
                    : new Date(notification.createdAt) > new Date(profile.createdAt);

                  return (
                    <Link 
                      key={notification.id}
                      to={`/movie/${notification.contentId}`}
                      onClick={() => setIsOpen(false)}
                      className={`block p-4 hover:bg-zinc-800/50 transition-colors ${isNew ? 'bg-emerald-500/5' : ''}`}
                    >
                      <div className="flex gap-4">
                        {notification.posterUrl ? (
                          <img 
                            src={notification.posterUrl} 
                            alt="Poster" 
                            className="w-12 h-16 object-cover rounded-md shrink-0 border border-zinc-800"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-16 bg-zinc-800 rounded-md shrink-0 flex items-center justify-center">
                            <Bell className="w-5 h-5 text-zinc-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-white mb-1 leading-tight">{notification.title}</h4>
                          <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{notification.body}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500 font-medium">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                              {notification.type === 'movie' || notification.title.includes('Movie') ? 'View Movie' : 
                               notification.type === 'series' || notification.title.includes('Series') ? 'View Series' : 
                               'View Content'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
