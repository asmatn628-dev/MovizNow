import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
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
    // Load from cache initially
    const cachedContent = localStorage.getItem('content_cache');
    const cachedGenres = localStorage.getItem('genres_cache');
    const cachedLanguages = localStorage.getItem('languages_cache');
    const cachedQualities = localStorage.getItem('qualities_cache');
    
    if (cachedContent) setContentList(JSON.parse(cachedContent));
    if (cachedGenres) setGenres(JSON.parse(cachedGenres));
    if (cachedLanguages) setLanguages(JSON.parse(cachedLanguages));
    if (cachedQualities) setQualities(JSON.parse(cachedQualities));
    
    if (cachedContent || cachedGenres || cachedLanguages || cachedQualities) setLoading(false);

    let unsubContent: () => void;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubContent) unsubContent();

      const q = user ? collection(db, 'content') : query(collection(db, 'content'), where('status', '==', 'published'));
      
      unsubContent = onSnapshot(q, (snapshot) => {
        const rawContent = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
        
        // Sanitize content for cache (remove links)
        const sanitizedContent = rawContent.map(c => ({
          ...c,
          movieLinks: undefined,
          fullSeasonZip: undefined,
          fullSeasonMkv: undefined,
          seasons: undefined
        }));
        
        localStorage.setItem('content_cache', JSON.stringify(sanitizedContent));
        setContentList(rawContent);
        setLoading(false);
      }, (error) => {
        console.error("Content snapshot error:", error);
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'content');
      });
    });

    const fetchStaticData = async () => {
      try {
        const { getDocs } = await import('firebase/firestore');
        
        // Fetch Genres
        const genresSnap = await getDocs(collection(db, 'genres'));
        const genresData = genresSnap.docs.map(d => ({ id: d.id, ...d.data() } as Genre));
        genresData.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
        localStorage.setItem('genres_cache', JSON.stringify(genresData));
        setGenres(genresData);

        // Fetch Languages
        const langsSnap = await getDocs(collection(db, 'languages'));
        const langsData = langsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Language));
        langsData.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
        localStorage.setItem('languages_cache', JSON.stringify(langsData));
        setLanguages(langsData);

        // Fetch Qualities
        const qualitiesSnap = await getDocs(collection(db, 'qualities'));
        const qualitiesData = qualitiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Quality));
        qualitiesData.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
        localStorage.setItem('qualities_cache', JSON.stringify(qualitiesData));
        setQualities(qualitiesData);

      } catch (error) {
        console.error("Error fetching static data:", error);
      }
    };

    fetchStaticData();

    return () => { 
      unsubAuth();
      if (unsubContent) unsubContent();
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
