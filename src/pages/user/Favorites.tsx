import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { Film, Heart, ArrowLeft } from 'lucide-react';
import { formatContentTitle } from '../../utils/contentUtils';
import { NotificationMenu } from '../../components/NotificationMenu';
import { LazyLoadImage } from 'react-lazy-load-image-component';

// Force rebuild
export default function Favorites() {
  const { profile } = useAuth();
  const { contentList, genres, languages, qualities } = useContent();

  const favoriteContent = contentList.filter(c => 
    profile?.favorites?.includes(c.id) && 
    (profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager' || (
      c.status !== 'draft' && (
        c.status !== 'selected_content' || 
        profile?.assignedContent?.some(id => id === c.id || id.startsWith(`${c.id}:`))
      )
    ))
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              Favorites
            </h1>
          </div>
          {profile && <NotificationMenu profile={profile} />}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {favoriteContent.map((content) => {
            const isAssigned = profile?.assignedContent?.some(id => id === content.id || id.startsWith(`${content.id}:`));
            const isLocked = profile?.status !== 'active' || ((profile?.role === 'temporary' || profile?.role === 'selected_content' || content.status === 'selected_content') && !isAssigned);
            
            const contentQuality = qualities.find(q => q.id === content.qualityId)?.name;
            const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
            const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');

            return (
              <Link
                key={content.id}
                to={`/movie/${content.id}`}
                className={`group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-transform hover:scale-105 hover:border-emerald-500/50`}
              >
                <div className="relative aspect-[2/3] w-full bg-zinc-800">
                  <LazyLoadImage
                    src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'}
                    alt={content.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    wrapperClassName="w-full h-full"
                  />
                  <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider text-white ${content.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'}`}>
                    {content.type}
                  </div>
                  {isLocked && (
                    <div className="absolute top-2 left-2 bg-red-500 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg text-white z-20">
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
        
        {favoriteContent.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">Your Favorites list is empty</p>
          </div>
        )}
      </main>
    </div>
  );
}
