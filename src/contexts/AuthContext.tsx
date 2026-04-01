import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, query, collection, where, getDocs, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { logEvent, updateTimeSpent } from '../services/analytics';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authLoading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  toggleFavorite: (contentId: string) => Promise<void>;
  toggleWatchLater: (contentId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(!auth.currentUser);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const sessionStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync offline actions when coming back online
  useEffect(() => {
    if (isOnline && user) {
      const syncOfflineActions = async () => {
        const pendingFavorites = JSON.parse(localStorage.getItem('pending_favorites') || '[]');
        const pendingWatchLater = JSON.parse(localStorage.getItem('pending_watch_later') || '[]');

        if (pendingFavorites.length > 0 || pendingWatchLater.length > 0) {
          const userRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            const currentProfile = docSnap.data() as UserProfile;
            let newFavorites = [...(currentProfile.favorites || [])];
            let newWatchLater = [...(currentProfile.watchLater || [])];

            pendingFavorites.forEach((id: string) => {
              if (newFavorites.includes(id)) {
                newFavorites = newFavorites.filter(fid => fid !== id);
              } else {
                newFavorites.push(id);
              }
            });

            pendingWatchLater.forEach((id: string) => {
              if (newWatchLater.includes(id)) {
                newWatchLater = newWatchLater.filter(wid => wid !== id);
              } else {
                newWatchLater.push(id);
              }
            });

            await updateDoc(userRef, {
              favorites: newFavorites,
              watchLater: newWatchLater
            });

            localStorage.removeItem('pending_favorites');
            localStorage.removeItem('pending_watch_later');
          }
        }
      };
      syncOfflineActions().catch(console.error);
    }
  }, [isOnline, user]);

  useEffect(() => {
    // Load from cache initially
    const cachedProfile = localStorage.getItem('profile_cache');
    if (cachedProfile) {
      setProfile(JSON.parse(cachedProfile));
      setLoading(false);
    }

    let unsubProfile: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);

        if (!sessionStorage.getItem('session_started')) {
          sessionStorage.setItem('session_started', 'true');
          sessionStartTimeRef.current = Date.now();
          logEvent('session_start', currentUser.uid);
          
          // Update lastActive on session start
          updateDoc(userRef, { lastActive: new Date().toISOString() }).catch(console.error);
        }
        
        // Listen to profile changes
        unsubProfile = onSnapshot(userRef, async (docSnap) => {
          try {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              localStorage.setItem('profile_cache', JSON.stringify(data));
              
              const isOwner = currentUser.email === 'asmatn628@gmail.com';
              const isAdmin = currentUser.email === 'asmatullah9327@gmail.com';
              
              // Auto-expire logic
              const now = new Date();
              if (data.status === 'active' && data.expiryDate && data.role !== 'owner') {
                const expiryDate = new Date(data.expiryDate);
                // Add 1 day to expiryDate so it expires on the next day
                expiryDate.setDate(expiryDate.getDate() + 1);
                if (expiryDate < now) {
                  try {
                    await updateDoc(userRef, { status: 'expired' });
                    data.status = 'expired';
                  } catch (err) {
                    console.error("Failed to auto-expire user:", err);
                  }
                }
              }

              if (isOwner && (data.role !== 'owner' || data.status !== 'active' || data.expiryDate !== 'Lifetime')) {
                try {
                  await updateDoc(userRef, { role: 'owner', status: 'active', expiryDate: 'Lifetime' });
                  setProfile({ ...data, role: 'owner', status: 'active', expiryDate: 'Lifetime' });
                } catch (err) {
                  console.error("Failed to update owner role:", err);
                  setProfile({ ...data, role: 'owner', status: 'active', expiryDate: 'Lifetime' }); // Set locally anyway
                }
              } else if (isAdmin && (data.role !== 'admin' || data.status !== 'active')) {
                try {
                  await updateDoc(userRef, { role: 'admin', status: 'active' });
                  setProfile({ ...data, role: 'admin', status: 'active' });
                } catch (err) {
                  console.error("Failed to update admin role:", err);
                  setProfile({ ...data, role: 'admin', status: 'active' }); // Set locally anyway
                }
              } else {
                setProfile(data);
              }
            } else {
              // Create new user profile
              let pendingData: Partial<UserProfile> = {};
              if (currentUser.email) {
                try {
                  const pendingQuery = query(collection(db, 'users'), where('email', '==', currentUser.email), where('status', '==', 'pending'));
                  const pendingSnap = await getDocs(pendingQuery);
                  if (!pendingSnap.empty) {
                    const pendingDoc = pendingSnap.docs[0];
                    pendingData = pendingDoc.data();
                    // Delete the pending document since we are creating the real one
                    await deleteDoc(pendingDoc.ref);
                  }
                } catch (err) {
                  console.error("Error checking pending users:", err);
                }
              }

              const isOwner = currentUser.email === 'asmatn628@gmail.com';
              const isAdmin = currentUser.email === 'asmatullah9327@gmail.com';
              const roleToSet = isOwner ? 'owner' : isAdmin ? 'admin' : (pendingData.role && ['user', 'trial', 'selected_content'].includes(pendingData.role) ? pendingData.role : 'user');
              const newProfile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: currentUser.displayName || '',
                photoURL: currentUser.photoURL || '',
                role: roleToSet,
                status: (isOwner || isAdmin) ? 'active' : (pendingData.status || 'pending'),
                createdAt: pendingData.createdAt || new Date().toISOString(),
                sessionsCount: 1,
                timeSpent: 0,
                expiryDate: isOwner ? 'Lifetime' : (pendingData.expiryDate || null),
                ...(pendingData.managedBy && { managedBy: pendingData.managedBy }),
                ...(pendingData.phone && { phone: pendingData.phone }),
              };
              try {
                await setDoc(userRef, newProfile);
              } catch (err) {
                console.error("Failed to create user profile:", err);
              }
              localStorage.setItem('profile_cache', JSON.stringify(newProfile));
              setProfile(newProfile);
            }
          } catch (error) {
            console.error("Error updating/creating profile:", error);
          } finally {
            setLoading(false);
          }
        }, (error) => {
          console.error("Profile snapshot error for UID:", currentUser.uid, error);
          setLoading(false);
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        });
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = undefined;
        }
        localStorage.removeItem('profile_cache');
        setProfile(null);
        setLoading(false);
        
        if (sessionStartTimeRef.current) {
          sessionStorage.removeItem('session_started');
          sessionStartTimeRef.current = null;
        }
      }
    });

    // Track time spent periodically (every 1 minute)
    const timeTrackerInterval = setInterval(() => {
      if (auth.currentUser && sessionStartTimeRef.current) {
        updateTimeSpent(auth.currentUser.uid, 1);
        
        // Update lastActive every 5 minutes
        const minutesSinceStart = Math.floor((Date.now() - sessionStartTimeRef.current) / 60000);
        if (minutesSinceStart % 5 === 0) {
          updateDoc(doc(db, 'users', auth.currentUser.uid), { lastActive: new Date().toISOString() }).catch(console.error);
        }
      }
    }, 60000);

    // Also track time spent when window unloads
    const handleBeforeUnload = () => {
      if (auth.currentUser && sessionStartTimeRef.current) {
        const timeSpentMs = Date.now() - sessionStartTimeRef.current;
        const timeSpentMinutes = Math.floor(timeSpentMs / 60000);
        if (timeSpentMinutes > 0) {
          // We can't reliably await async calls in beforeunload, but we can try
          // Usually beacon API is better, but this is a simple approach
          // The periodic interval is the main tracker
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
      clearInterval(timeTrackerInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Failed to login");
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const toggleFavorite = async (contentId: string) => {
    if (!profile || !user) return;

    const newFavorites = profile.favorites?.includes(contentId)
      ? profile.favorites.filter(id => id !== contentId)
      : [...(profile.favorites || []), contentId];

    // Optimistic update
    const updatedProfile = { ...profile, favorites: newFavorites };
    setProfile(updatedProfile);
    localStorage.setItem('profile_cache', JSON.stringify(updatedProfile));

    if (isOnline) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { favorites: newFavorites });
      } catch (err) {
        console.error("Failed to update favorites online:", err);
        // If it failed despite being online, queue it
        const pending = JSON.parse(localStorage.getItem('pending_favorites') || '[]');
        pending.push(contentId);
        localStorage.setItem('pending_favorites', JSON.stringify(pending));
      }
    } else {
      const pending = JSON.parse(localStorage.getItem('pending_favorites') || '[]');
      pending.push(contentId);
      localStorage.setItem('pending_favorites', JSON.stringify(pending));
    }
  };

  const toggleWatchLater = async (contentId: string) => {
    if (!profile || !user) return;

    const newWatchLater = profile.watchLater?.includes(contentId)
      ? profile.watchLater.filter(id => id !== contentId)
      : [...(profile.watchLater || []), contentId];

    // Optimistic update
    const updatedProfile = { ...profile, watchLater: newWatchLater };
    setProfile(updatedProfile);
    localStorage.setItem('profile_cache', JSON.stringify(updatedProfile));

    if (isOnline) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { watchLater: newWatchLater });
      } catch (err) {
        console.error("Failed to update watch later online:", err);
        const pending = JSON.parse(localStorage.getItem('pending_watch_later') || '[]');
        pending.push(contentId);
        localStorage.setItem('pending_watch_later', JSON.stringify(pending));
      }
    } else {
      const pending = JSON.parse(localStorage.getItem('pending_watch_later') || '[]');
      pending.push(contentId);
      localStorage.setItem('pending_watch_later', JSON.stringify(pending));
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, authLoading, error, signInWithGoogle, logout, toggleFavorite, toggleWatchLater }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
