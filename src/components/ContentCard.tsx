import React from 'react';
import { Link } from 'react-router-dom';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { Heart, Clock, ShoppingCart } from 'lucide-react';
import { Content, Quality, Language, Genre } from '../types';
import { formatContentTitle } from '../utils/contentUtils';
import { clsx } from 'clsx';
import { useCart } from '../contexts/CartContext';

interface ContentCardProps {
  content: Content;
  profile: any;
  qualities: Quality[];
  languages: Language[];
  genres: Genre[];
  onToggleFavorite: (id: string) => void;
  onToggleWatchLater: (id: string) => void;
}

const ContentCard = React.memo(({ 
  content, 
  profile, 
  qualities, 
  languages, 
  genres, 
  onToggleFavorite, 
  onToggleWatchLater 
}: ContentCardProps) => {
  const { addToCart, cart } = useCart();
  const isAssigned = (profile?.role === 'temporary' || profile?.role === 'selected_content') && profile.assignedContent?.some((id: string) => id === content.id || id.startsWith(`${content.id}:`));
  const isLocked = profile?.status !== 'active' || ((profile?.role === 'temporary' || profile?.role === 'selected_content') && !isAssigned);
  const isPending = profile?.status === 'pending';
  
  const qualityObj = qualities.find(q => q.id === content.qualityId);
  const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
  const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');

  const isFavorite = profile?.favorites?.includes(content.id);
  const isWatchLater = profile?.watchLater?.includes(content.id);

  const isInCart = cart.some(item => item.contentId === content.id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (content.type === 'movie') {
      addToCart({
        contentId: content.id,
        title: content.title,
        type: 'movie',
        price: 50
      });
    } else {
      // For series, we might need to handle seasons differently, but for now we can add the whole series or let them choose in MovieDetails.
      // The requirement says "For 1 Season is Rs 100 adjust on card page".
      // If they click Add to Cart on the card for a series, maybe we add Season 1 by default, or just redirect to MovieDetails.
      // Let's just add the first season if available, or just redirect to MovieDetails.
      // Better to handle series cart addition in MovieDetails where they can select the season.
      // But requirement says "adjust on card page". Let's add the first season.
      let firstSeason = 1;
      try {
        if (content.seasons) {
          const parsed = JSON.parse(content.seasons);
          if (parsed && parsed.length > 0) {
            firstSeason = parsed[0].seasonNumber;
          }
        }
      } catch (err) {}
      
      addToCart({
        contentId: content.id,
        title: `${content.title} - Season ${firstSeason}`,
        type: 'season',
        seasonNumber: firstSeason,
        seasonId: `s${firstSeason}`,
        price: 100
      });
    }
  };

  return (
    <div className="group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all hover:scale-[1.02] hover:border-emerald-500/50 shadow-lg">
      <Link to={`/movie/${content.id}`} className="relative aspect-[2/3] w-full bg-zinc-800 block">
        <LazyLoadImage
          src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'}
          alt={content.title}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          wrapperClassName="w-full h-full"
        />
        
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-emerald-500 rounded-full p-3 transform translate-y-4 group-hover:translate-y-0 transition-transform">
            <Heart className="w-6 h-6 text-white fill-current" />
          </div>
        </div>

        <div className={clsx(
          "absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white z-10",
          content.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'
        )}>
          {content.type}
        </div>
        
        {qualityObj && (
          <div 
            className="absolute top-9 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-black shadow-lg z-10"
            style={{ backgroundColor: qualityObj.color || '#10b981' }}
          >
            {qualityObj.name}
          </div>
        )}

        {isLocked && (
          <div className={clsx(
            "absolute top-2 left-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg text-white z-20",
            isPending ? "bg-yellow-500" : "bg-red-500"
          )}>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            {isPending ? 'Pending' : 'Restricted'}
          </div>
        )}
      </Link>

      {/* Action Buttons */}
      <div className="absolute bottom-[88px] right-2 flex flex-col gap-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
        {isLocked && profile?.role === 'selected_content' && profile?.status !== 'expired' && (
          isInCart ? (
            <Link
              to="/cart"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg bg-emerald-500 text-white"
              title="View Cart"
            >
              <ShoppingCart className="w-4 h-4 fill-current" />
            </Link>
          ) : (
            <button
              onClick={handleAddToCart}
              className="p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg bg-black/50 text-white hover:bg-emerald-500"
              title="Add to Cart"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
          )
        )}
        {isLocked && (profile?.role === 'trial' || profile?.role === 'user') && (
          <Link
            to="/top-up"
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg bg-black/50 text-white hover:bg-emerald-500"
            title="Top Up Membership"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </Link>
        )}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(content.id);
          }}
          className={clsx(
            "p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg",
            isFavorite ? "bg-emerald-500 text-white" : "bg-black/50 text-white hover:bg-emerald-500"
          )}
          title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Heart className={clsx("w-4 h-4", isFavorite && "fill-current")} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleWatchLater(content.id);
          }}
          className={clsx(
            "p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg",
            isWatchLater ? "bg-emerald-500 text-white" : "bg-black/50 text-white hover:bg-emerald-500"
          )}
          title={isWatchLater ? "Remove from Watch Later" : "Add to Watch Later"}
        >
          <Clock className={clsx("w-4 h-4", isWatchLater && "fill-current")} />
        </button>
      </div>

      <div className="p-3 flex flex-col flex-1 bg-zinc-900">
        <Link to={`/movie/${content.id}`} className="hover:text-emerald-500 transition-colors">
          <h3 className="font-bold text-sm md:text-base leading-tight mb-1 line-clamp-2">{formatContentTitle(content)}</h3>
        </Link>
        <div className="flex items-center gap-2 text-zinc-500 text-sm mb-2">
          <span>{content.year}</span>
          {content.runtime && (
            <>
              <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
              <span>{content.runtime}</span>
            </>
          )}
        </div>
        <div className="flex flex-col gap-0.5 mt-auto">
          {contentGenres && (
            <p className="text-zinc-500 text-[10px] line-clamp-1 italic">
              {contentGenres}
            </p>
          )}
          {contentLangs && (
            <p className="text-zinc-400 text-sm font-medium line-clamp-1">
              {contentLangs}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

ContentCard.displayName = 'ContentCard';

export default ContentCard;
