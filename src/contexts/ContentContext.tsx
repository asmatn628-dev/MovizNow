import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, getDoc, getDocs, doc, setDoc, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Content, Genre, Language, Quality } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface ContentContextType {
  contentList: Content[];
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  loading: boolean;
  isOffline: boolean;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [contentList, setContentList] = useState<Content[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubContent) unsubContent();

      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      let isAdminOrEditor = false;
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const role = userDoc.data().role;
            isAdminOrEditor = role === 'admin' || role === 'owner' || role === 'content_manager' || role === 'manager';
          }
        } catch (e) {
          console.error("Error fetching user role", e);
        }
      }

      if (isAdminOrEditor) {
        // Admin/Editor: Load all content and keep search_index updated
        const q = collection(db, 'content');
        unsubContent = onSnapshot(q, (snapshot) => {
          const rawContent = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
          
          // Update search_index
          const searchIndex = rawContent.filter(c => c.status === 'published').map(c => {
            const seasons = Array.isArray(c.seasons) ? c.seasons : [];
            const seasonsInfo = seasons.map(s => {
              const lastEp = s.episodes && s.episodes.length > 0 ? s.episodes[s.episodes.length - 1].episodeNumber : '';
              return `${s.seasonNumber}:${lastEp}`;
            }).join(',') || '';
            
            return `${c.id}|${c.title}|${c.year}|${c.posterUrl}|${c.type}|${c.qualityId || ''}|${c.languageIds?.join(',') || ''}|${c.genreIds?.join(',') || ''}|${c.createdAt}|${c.order ?? ''}|${seasonsInfo}`;
          });
          setDoc(doc(db, 'metadata', 'search_index'), { data: searchIndex }).catch(e => console.error("Failed to update search_index", e));

          localStorage.setItem('content_cache', JSON.stringify(rawContent));
          setContentList(rawContent);
          setLoading(false);
        }, (error) => {
          console.error("Content snapshot error:", error);
          setLoading(false);
          // Don't error out if offline, just use cache
          if (navigator.onLine) {
            handleFirestoreError(error, OperationType.LIST, 'content');
          }
        });
      } else {
        // Regular User: Load from search_index in real-time
        unsubContent = onSnapshot(doc(db, 'metadata', 'search_index'), async (indexDoc) => {
          if (indexDoc.exists()) {
            const data = indexDoc.data().data as string[];
            const parsedContent: Content[] = data.map(item => {
              const [id, title, year, posterUrl, type, qualityId, langIds, genreIds, createdAt, order, seasonsInfo] = item.split('|');
              
              const seasons = seasonsInfo ? seasonsInfo.split(',').map(s => {
                const [sNum, lastEp] = s.split(':');
                return {
                  id: `s${sNum}`,
                  seasonNumber: parseInt(sNum, 10),
                  episodes: lastEp ? [{ id: 'last', episodeNumber: parseInt(lastEp, 10), title: '', url: '' }] : []
                };
              }) : [];

              return {
                id,
                title,
                year,
                posterUrl,
                type: type as 'movie' | 'series',
                qualityId,
                languageIds: langIds ? langIds.split(',') : [],
                genreIds: genreIds ? genreIds.split(',') : [],
                createdAt,
                order: order ? parseInt(order, 10) : undefined,
                seasons,
                status: 'published',
                description: '',
                trailerUrl: '',
                cast: [],
                updatedAt: createdAt
              } as unknown as Content;
            });
            localStorage.setItem('content_cache', JSON.stringify(parsedContent));
            setContentList(parsedContent);
            setLoading(false);
          } else {
            // Fallback if search_index doesn't exist
            try {
              const q = query(collection(db, 'content'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(50));
              const snapshot = await getDocs(q);
              const rawContent = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
              
              const sanitizedContent = rawContent.map(c => ({
                ...c,
                movieLinks: undefined,
                fullSeasonZip: undefined,
                fullSeasonMkv: undefined,
                seasons: undefined
              }));
              
              localStorage.setItem('content_cache', JSON.stringify(sanitizedContent));
              setContentList(rawContent);
            } catch (error) {
              console.error("Error fetching fallback content", error);
            }
            setLoading(false);
          }
        }, (error) => {
          console.error("Search index snapshot error:", error);
          setLoading(false);
        });
      }
    });

    let unsubGenres: () => void;
    let unsubLanguages: () => void;
    let unsubQualities: () => void;

    const setupStaticDataListeners = () => {
      if (!navigator.onLine) return;

      unsubGenres = onSnapshot(collection(db, 'genres'), (snapshot) => {
        const genresData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Genre));
        genresData.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
        localStorage.setItem('genres_cache', JSON.stringify(genresData));
        setGenres(genresData);
      });

      unsubLanguages = onSnapshot(collection(db, 'languages'), (snapshot) => {
        const langsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Language));
        langsData.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
        localStorage.setItem('languages_cache', JSON.stringify(langsData));
        setLanguages(langsData);
      });

      unsubQualities = onSnapshot(collection(db, 'qualities'), (snapshot) => {
        const qualitiesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quality));
        qualitiesData.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
        localStorage.setItem('qualities_cache', JSON.stringify(qualitiesData));
        setQualities(qualitiesData);
      });
    };

    setupStaticDataListeners();

    return () => { 
      unsubAuth();
      if (unsubContent) unsubContent();
      if (unsubGenres) unsubGenres();
      if (unsubLanguages) unsubLanguages();
      if (unsubQualities) unsubQualities();
    };
  }, []);

  return (
    <ContentContext.Provider value={{ contentList, genres, languages, qualities, loading, isOffline }}>
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
