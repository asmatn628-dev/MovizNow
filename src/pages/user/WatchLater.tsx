import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Content, Quality, Language, Genre } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Film, Clock, ArrowLeft } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { formatContentTitle } from '../../utils/contentUtils';
import { NotificationMenu } from '../../components/NotificationMenu';

export default function WatchLater() {
  const { profile } = useAuth();
  const [contentList, setContentList] = useState<Content[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const unsubContent = onSnapshot(collection(db, 'content'), (snapshot) => {
      setContentList(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content)));
    }, (error) => {
      console.error("Content snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'content');
    });
    const unsubQualities = onSnapshot(collection(db, 'qualities'), (snapshot) => {
      setQualities(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quality)));
    }, (error) => {
      console.error("Qualities snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'qualities');
    });
    const unsubLangs = onSnapshot(collection(db, 'languages'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Language));
      setLanguages(data.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.name.localeCompare(b.name);
      }));
    }, (error) => {
      console.error("Languages snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'languages');
    });
    const unsubGenres = onSnapshot(collection(db, 'genres'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Genre));
      setGenres(data.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.name.localeCompare(b.name);
      }));
    }, (error) => {
      console.error("Genres snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'genres');
    });
    return () => { unsubContent(); unsubQualities(); unsubLangs(); unsubGenres(); };
  }, []);

  const watchLaterContent = contentList.filter(c => 
    profile?.watchLater?.includes(c.id) && 
    (profile?.role === 'admin' || profile?.role === 'data_editor' || c.status !== 'draft')
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-500" />
              Watch Later
            </h1>
          </div>
          {profile && <NotificationMenu profile={profile} />}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {watchLaterContent.map((content) => {
            const isAssigned = (profile?.role === 'temporary' || profile?.role === 'selected_content') && profile.assignedContent?.some(id => id === content.id || id.startsWith(`${content.id}:`));
            const isLocked = profile?.status !== 'active' || ((profile?.role === 'temporary' || profile?.role === 'selected_content') && !isAssigned);
            
            const contentQuality = qualities.find(q => q.id === content.qualityId)?.name;
            const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
            const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');

            return (
              <Link
                key={content.id}
                to={`/movie/${content.id}`}
                className={`group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-transform hover:scale-105 hover:border-emerald-500/50`}
              >
                <div className="relative aspect-[2/3] w-full">
                  <img
                    src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'}
                    alt={content.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  <div className={`absolute top-2 right-2 backdrop-blur-md px-2 py-1 rounded text-xs font-bold uppercase tracking-wider text-white ${content.type === 'movie' ? 'bg-blue-500/80' : 'bg-purple-500/80'}`}>
                    {content.type}
                  </div>
                  {isLocked && (
                    <div className="absolute top-2 left-2 bg-red-500/90 backdrop-blur-md px-2 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg text-white z-20">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      Locked
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-bold text-base md:text-lg leading-tight mb-2">{formatContentTitle(content)}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-zinc-400 text-xs mb-2">
                    <span>{content.year}</span>
                    {contentQuality && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400 font-medium">{contentQuality}</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mt-auto">
                    {contentGenres && (
                      <p className="text-zinc-500 text-xs line-clamp-1">
                        {contentGenres}
                      </p>
                    )}
                    {contentLangs && (
                      <p className="text-zinc-500 text-xs line-clamp-1">
                        {contentLangs}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        
        {watchLaterContent.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">Your Watch Later list is empty</p>
          </div>
        )}
      </main>
    </div>
  );
}
