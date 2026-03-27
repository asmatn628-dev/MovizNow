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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(!auth.currentUser);
  const [error, setError] = useState<string | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        if (!sessionStorage.getItem('session_started')) {
          sessionStorage.setItem('session_started', 'true');
          sessionStartTimeRef.current = Date.now();
          logEvent('session_start', currentUser.uid);
        }

        const userRef = doc(db, 'users', currentUser.uid);
        
        // Listen to profile changes
        unsubProfile = onSnapshot(userRef, async (docSnap) => {
          try {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              const isAdmin = currentUser.email === 'asmatn628@gmail.com' || currentUser.email === 'asmatullah9327@gmail.com';
              
              // Auto-expire logic
              const now = new Date();
              if (data.status === 'active' && data.expiryDate) {
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

              if (isAdmin && (data.role !== 'admin' || data.status !== 'active')) {
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

              const isAdmin = currentUser.email === 'asmatn628@gmail.com' || currentUser.email === 'asmatullah9327@gmail.com';
              const roleToSet = isAdmin ? 'admin' : (pendingData.role && ['user', 'trial', 'selected_content'].includes(pendingData.role) ? pendingData.role : 'user');
              const newProfile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: currentUser.displayName || '',
                photoURL: currentUser.photoURL || '',
                role: roleToSet,
                status: isAdmin ? 'active' : (pendingData.status || 'pending'),
                createdAt: pendingData.createdAt || new Date().toISOString(),
                sessionsCount: 1,
                timeSpent: 0,
                ...(pendingData.expiryDate && { expiryDate: pendingData.expiryDate }),
                ...(pendingData.managedBy && { managedBy: pendingData.managedBy }),
                ...(pendingData.phone && { phone: pendingData.phone }),
              };
              try {
                await setDoc(userRef, newProfile);
              } catch (err) {
                console.error("Failed to create user profile:", err);
              }
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

  return (
    <AuthContext.Provider value={{ user, profile, loading, authLoading, error, signInWithGoogle, logout }}>
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
