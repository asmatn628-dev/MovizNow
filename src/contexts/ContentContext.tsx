import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Content, Genre, Language, Quality } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface ContentContextType {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  loading: boolean;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [contentList, setContentList] = useState<Content[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubContent = onSnapshot(collection(db, 'content'), (snapshot) => {
      setContentList(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content)));
      setLoading(false);
    }, (error) => {
      console.error("Content snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'content');
    });
    const unsubGenres = onSnapshot(collection(db, 'genres'), (snapshot) => {
      setGenres(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Genre)));
    }, (error) => {
      console.error("Genres snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'genres');
    });
    const unsubLangs = onSnapshot(collection(db, 'languages'), (snapshot) => {
      setLanguages(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Language)));
    }, (error) => {
      console.error("Languages snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'languages');
    });
    const unsubQualities = onSnapshot(collection(db, 'qualities'), (snapshot) => {
      setQualities(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quality)));
    }, (error) => {
      console.error("Qualities snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'qualities');
    });
    return () => { 
      unsubContent(); unsubGenres(); unsubLangs(); unsubQualities(); 
    };
  }, []);

  return (
    <ContentContext.Provider value={{ contentList, genres, languages, qualities, loading }}>
      {children}
    </ContentContext.Provider>
  );
}

export const useContent = () => {
  const context = useContext(ContentContext);
  if (context === undefined) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};
