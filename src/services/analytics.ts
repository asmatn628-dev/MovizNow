import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

export const logEvent = async (
  type: 'session_start' | 'content_click' | 'link_click' | 'time_spent',
  userId: string,
  data?: {
    contentId?: string;
    contentTitle?: string;
    linkId?: string;
    linkName?: string;
    duration?: number;
    playerType?: string;
  }
) => {
  if (!userId) return;

  try {
    const eventsRef = collection(db, 'analytics');
    await addDoc(eventsRef, {
      type,
      userId,
      timestamp: new Date().toISOString(),
      ...data
    });

    if (type === 'session_start') {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        sessionsCount: increment(1)
      });
    }
  } catch (error) {
    console.error('Error logging analytics event:', error);
  }
};

export const updateTimeSpent = async (userId: string, minutes: number) => {
  if (!userId || minutes <= 0) return;
  
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      timeSpent: increment(minutes)
    });
    
    // Also log an event for time range filtering
    await logEvent('time_spent', userId, { duration: minutes });
  } catch (error) {
    console.error('Error updating time spent:', error);
  }
};
