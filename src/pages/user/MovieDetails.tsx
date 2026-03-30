import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { db } from '../../firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Content, QualityLinks, Season } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { Film, ArrowLeft, Play, Clock, Heart, MessageCircle, AlertCircle, Download, Share2, Chrome, Copy, Youtube, X, Edit2, Trash2, Settings, Lock, ChevronDown, ChevronUp, Loader2, Search, AlertTriangle } from 'lucide-react';
import { logEvent } from '../../services/analytics';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import { motion, AnimatePresence } from 'motion/react';
import { formatContentTitle, formatReleaseDate, formatRuntime } from '../../utils/contentUtils';
import { generateTinyUrl } from '../../utils/tinyurl';
import { MediaModal } from '../../components/MediaModal';
import { LazyLoadImage } from 'react-lazy-load-image-component';

export default function MovieDetails() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading: profileLoading } = useAuth();
  const { contentList, genres, languages, qualities, loading: contentLoading } = useContent();
  const content = useMemo(() => {
    console.log('DEBUG: id=', id, 'contentList length=', contentList.length);
    if (contentList.length > 0) {
      console.log('DEBUG: First content id=', contentList[0].id);
    }
    const found = contentList.find(c => c.id === id) || null;
    if (!found) {
      console.log('DEBUG: Content NOT found for id=', id);
      console.log('DEBUG: contentList=', contentList);
    } else {
      console.log('DEBUG: Content found=', found);
    }
    return found;
  }, [contentList, id]);
  
  const [loading, setLoading] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    console.log('DEBUG: contentList changed, length=', contentList.length);
  }, [contentList]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isWatchLaterLoading, setIsWatchLaterLoading] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [linkPopup, setLinkPopup] = useState<{ isOpen: boolean; url: string; name: string; id: string; isZip?: boolean; tinyUrl?: string } | null>(null);
  const [isPosterExpanded, setIsPosterExpanded] = useState(false);
  const [isTrailerPopupOpen, setIsTrailerPopupOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<string, boolean>>({});
  const [cachedMetadata, setCachedMetadata] = useState<Partial<Content>>({});
  const [isReporting, setIsReporting] = useState(false);
  const [imdbData, setImdbData] = useState<any>(null);
  const [fetchingImdb, setFetchingImdb] = useState(false);
  const hasLoggedView = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Scroll to top on mount or ID change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [id]);

  // Load cache from sessionStorage
  useEffect(() => {
    if (id) {
      const cached = sessionStorage.getItem(`content_cache_${id}`);
      if (cached) {
        try {
          setCachedMetadata(JSON.parse(cached));
        } catch (e) {
          console.error("Error parsing cached metadata:", e);
        }
      }
    }
  }, [id]);

  const mergedContent = useMemo(() => {
    if (!content) return null;
    return {
      ...content,
      ...cachedMetadata
    };
  }, [content, cachedMetadata]);

  const title = mergedContent ? `${formatContentTitle(mergedContent)} (${mergedContent.year}) - MovizNow` : 'MovizNow';
  const description = mergedContent?.description || 'Watch the latest movies and series on MovizNow.';
  const imageUrl = mergedContent?.posterUrl || 'https://Moviz-Now.vercel.app/logo.svg';
  const pageUrl = window.location.href;

  // Initialize IMDb data from mergedContent
  useEffect(() => {
    if (mergedContent) {
      const initialData = {
        title: mergedContent.title,
        year: mergedContent.year,
        description: mergedContent.description,
        cast: mergedContent.cast?.join(', '),
        posterUrl: mergedContent.posterUrl,
        genres: genres.filter(g => mergedContent.genreIds?.includes(g.id)).map(g => g.name).join(', '),
        releaseDate: mergedContent.releaseDate,
        duration: mergedContent.runtime,
        type: mergedContent.type,
        rating: mergedContent.imdbRating,
        isFetched: !!mergedContent.imdbRating
      };

      setImdbData(initialData);
    }
  }, [mergedContent, genres]);

  useEffect(() => {
    if (!contentLoading) {
      setLoading(false);
      if (content && !hasLoggedView.current && profile?.uid) {
        hasLoggedView.current = true;
        logEvent('content_click', profile.uid, {
          contentId: content.id,
          contentTitle: content.title
        });
      }
    }
  }, [content, contentLoading, profile?.uid]);

  useEffect(() => {
    if (linkPopup) {
      window.history.pushState({ popup: true }, '');
      const handlePopState = () => {
        setLinkPopup(null);
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [linkPopup]);

  useEffect(() => {
    if (isPosterExpanded) {
      window.history.pushState({ posterPopup: true }, '');
      const handlePopState = () => {
        setIsPosterExpanded(false);
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isPosterExpanded]);

  const hasAttemptedFetch = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!mergedContent || !id || hasAttemptedFetch.current[id]) return;

    const fetchMissingData = async () => {
      const seasons = mergedContent.type === 'series' && mergedContent.seasons ? JSON.parse(mergedContent.seasons) : [];
      const needsEpisodeData = mergedContent.type === 'series' && seasons.some((s: any) => s.episodes?.some((ep: any) => !ep.description || !ep.duration));
      
      const needsStaticData = !mergedContent.runtime || !mergedContent.description || !mergedContent.cast || !mergedContent.releaseDate || !mergedContent.posterUrl || needsEpisodeData;
      const ratingCacheKey = `imdb_rating_${id}`;
      const hasLiveRating = sessionStorage.getItem(ratingCacheKey);
      const needsRating = !hasLiveRating;

      if (!needsStaticData && !needsRating) {
        // If we already have a cached rating, just display it
        if (hasLiveRating && mergedContent.imdbRating !== hasLiveRating) {
          setImdbData(prev => ({ ...prev, rating: hasLiveRating, isFetched: true }));
        }
        return;
      }

      hasAttemptedFetch.current[id] = true;
      setFetchingImdb(true);

      try {
        const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
        const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '19daa310';
        
        let tmdbData: any = null;
        let imdbId = mergedContent.imdbLink?.match(/tt\d+/)?.[0];

        // 1. Try IMDb ID first
        if (imdbId && needsStaticData) {
          const findRes = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
          const findData = await findRes.json();
          const results = mergedContent.type === 'series' ? findData.tv_results : findData.movie_results;
          if (results && results.length > 0) {
            tmdbData = results[0];
          }
        }

        // 2. Try Title + Year if not found
        if (!tmdbData && needsStaticData && mergedContent.title) {
          const searchType = mergedContent.type === 'series' ? 'tv' : 'movie';
          let searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(mergedContent.title)}`;
          if (mergedContent.year) {
            searchUrl += mergedContent.type === 'series' ? `&first_air_date_year=${mergedContent.year}` : `&primary_release_year=${mergedContent.year}`;
          }
          const searchRes = await fetch(searchUrl);
          const searchData = await searchRes.json();
          if (searchData.results && searchData.results.length > 0) {
            tmdbData = searchData.results[0];
            // If we found it by title, try to get the IMDb ID for OMDB
            const detailsRes = await fetch(`https://api.themoviedb.org/3/${searchType}/${tmdbData.id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
            const detailsData = await detailsRes.json();
            if (detailsData.external_ids?.imdb_id) {
              imdbId = detailsData.external_ids.imdb_id;
            }
          }
        }

        const updates: Partial<Content> = {};
        let hasUpdates = false;

        if (tmdbData && needsStaticData) {
          const typePath = mergedContent.type === 'series' ? 'tv' : 'movie';
          const detailsRes = await fetch(`https://api.themoviedb.org/3/${typePath}/${tmdbData.id}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids,videos`);
          const details = await detailsRes.json();

          if (!mergedContent.description && details.overview) { updates.description = details.overview; hasUpdates = true; }
          if (!mergedContent.releaseDate && (details.release_date || details.first_air_date)) { updates.releaseDate = details.release_date || details.first_air_date; hasUpdates = true; }
          if (!mergedContent.posterUrl && details.poster_path) { updates.posterUrl = `https://image.tmdb.org/t/p/w500${details.poster_path}`; hasUpdates = true; }
          
          if (!mergedContent.trailerUrl && details.videos?.results) {
            const trailer = details.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
            if (trailer) {
              updates.trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
              hasUpdates = true;
            }
          }

          if (!mergedContent.runtime) {
            if (details.runtime) { updates.runtime = `${details.runtime} min`; hasUpdates = true; }
            else if (details.episode_run_time && details.episode_run_time.length > 0) { updates.runtime = `${details.episode_run_time[0]} min/episode`; hasUpdates = true; }
          }

          if ((!mergedContent.cast || mergedContent.cast.length === 0) && details.credits?.cast) {
            updates.cast = details.credits.cast.slice(0, 5).map((a: any) => a.name);
            hasUpdates = true;
          }

          if (!mergedContent.imdbLink && details.external_ids?.imdb_id) {
            updates.imdbLink = `https://www.imdb.com/title/${details.external_ids.imdb_id}`;
            imdbId = details.external_ids.imdb_id;
            hasUpdates = true;
          }
          
          if ((!mergedContent.genreIds || mergedContent.genreIds.length === 0) && details.genres) {
            const matchedGenreIds: string[] = [];
            details.genres.forEach((tg: any) => {
              const match = genres.find(g => g.name.toLowerCase() === tg.name.toLowerCase());
              if (match) matchedGenreIds.push(match.id);
            });
            if (matchedGenreIds.length > 0) {
              updates.genreIds = matchedGenreIds;
              hasUpdates = true;
            }
          }

          // Episode Data Fetching for Series
          if (mergedContent.type === 'series' && mergedContent.seasons) {
            try {
              let seasonsUpdated = false;
              const currentSeasons = [...seasons];

              for (let i = 0; i < currentSeasons.length; i++) {
                const season = currentSeasons[i];
                const missingEpData = season.episodes?.some((ep: any) => !ep.description || !ep.duration);

                if (missingEpData) {
                  const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbData.id}/season/${season.seasonNumber}?api_key=${TMDB_API_KEY}`);
                  const seasonData = await seasonRes.json();

                  if (seasonData.episodes) {
                    season.episodes = season.episodes.map((ep: any) => {
                      const tmdbEp = seasonData.episodes.find((te: any) => te.episode_number === ep.episodeNumber);
                      if (tmdbEp) {
                        return {
                          ...ep,
                          description: ep.description || tmdbEp.overview,
                          duration: ep.duration || (tmdbEp.runtime ? `${tmdbEp.runtime} min` : undefined)
                        };
                      }
                      return ep;
                    });
                    seasonsUpdated = true;
                  }
                }
              }

              if (seasonsUpdated) {
                updates.seasons = JSON.stringify(currentSeasons);
                hasUpdates = true;
              }
            } catch (e) {
              console.error("Error auto-fetching episode data:", e);
            }
          }
        }

        // Fetch Live IMDb Rating
        if (imdbId && needsRating) {
          const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
          const omdbData = await omdbRes.json();
          if (omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
            const newRating = `${omdbData.imdbRating}/10`;
            sessionStorage.setItem(ratingCacheKey, newRating);
            setImdbData(prev => ({ ...prev, rating: newRating, isFetched: true }));
            if (mergedContent.imdbRating !== newRating) {
              updates.imdbRating = newRating;
              hasUpdates = true;
            }
          }
        }

        if (hasUpdates) {
          // Instead of updating Firestore, we update local cache only
          const newCache = { ...cachedMetadata, ...updates };
          setCachedMetadata(newCache);
          sessionStorage.setItem(`content_cache_${id}`, JSON.stringify(newCache));
        }

      } catch (err) {
        console.error("Auto-fetch failed:", err);
      } finally {
        setFetchingImdb(false);
      }
    };

    fetchMissingData();
  }, [mergedContent?.id, id, genres, cachedMetadata]);

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  useEffect(() => {
    return () => {
      // Set flag when leaving MovieDetails to trigger WhatsApp prompt on Home
      sessionStorage.setItem('from_movie_details', 'true');
    };
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div></div>;
  }

  const isAuthorized = content ? (
    profile?.role === 'admin' || 
    profile?.role === 'owner' || 
    profile?.role === 'content_manager' || 
    profile?.role === 'manager' || 
    content.status !== 'draft'
  ) : false;

  if (!content || !isAuthorized) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Content not found</div>;
  }

  const isPending = profile?.status === 'pending';
  const isExpired = profile?.status === 'expired';
  const isTemp = profile?.role === 'temporary';
  const isSelectedContent = profile?.role === 'selected_content';
  const isAssigned = profile?.assignedContent?.some(id => id === content.id || id.startsWith(`${content.id}:`));
  const canPlay = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager' || (profile?.status === 'active' && (!(isTemp || isSelectedContent || content.status === 'selected_content') || isAssigned));

  const allowedSeasons = profile?.assignedContent?.filter(id => id.startsWith(`${content.id}:`)).map(id => id.split(':')[1]) || [];
  const hasFullAccess = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'content_manager' || profile?.role === 'manager' || (!(isTemp || isSelectedContent || content.status === 'selected_content')) || profile?.assignedContent?.includes(content.id);

  const toggleWatchLater = async () => {
    if (!profile) return;
    setIsWatchLaterLoading(true);
    try {
      const userRef = doc(db, 'users', profile.uid);
      if (profile.watchLater?.includes(content.id)) {
        await updateDoc(userRef, { watchLater: arrayRemove(content.id) });
      } else {
        await updateDoc(userRef, { watchLater: arrayUnion(content.id) });
      }
    } catch (error) {
      console.error("Error toggling watch later:", error);
    } finally {
      setIsWatchLaterLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!profile) return;
    setIsFavoriteLoading(true);
    try {
      const userRef = doc(db, 'users', profile.uid);
      if (profile.favorites?.includes(content.id)) {
        await updateDoc(userRef, { favorites: arrayRemove(content.id) });
      } else {
        await updateDoc(userRef, { favorites: arrayUnion(content.id) });
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    } finally {
      setIsFavoriteLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'content', id));
      navigate('/admin/content');
    } catch (error) {
      console.error('Error deleting content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete content' });
    }
  };

  const handlePlayClick = (url: string, linkName?: string, linkId?: string, isZip?: boolean, tinyUrl?: string) => {
    // Allow Sample link to be played by anyone
    if (linkId === 'sample') {
      setLinkPopup({ isOpen: true, url, name: linkName || 'Sample', id: linkId, isZip, tinyUrl });
      return;
    }

    if (!profile) {
      setShowLoginPrompt(true);
      return;
    }
    if (!canPlay) {
      if (isPending) {
        setAlertConfig({ isOpen: true, title: 'Account Pending', message: 'Your account is pending admin approval. Please contact admin to activate your account.' });
      } else if (isExpired) {
        if (profile?.role === 'trial') {
          setAlertConfig({ isOpen: true, title: 'Trial Expired', message: 'Your free Trial has expired. Please get Membership to continue watching.' });
        } else {
          setAlertConfig({ isOpen: true, title: 'Membership Expired', message: 'Your membership has expired. Please renew to continue watching.' });
        }
      } else {
        setAlertConfig({ isOpen: true, title: 'Content Locked', message: 'This content is locked. Please contact admin to get access to this movie/series.' });
      }
      return;
    }
    
    setLinkPopup({ isOpen: true, url, name: linkName || 'Unknown Link', id: linkId || 'unknown', isZip, tinyUrl });
  };

  const closePosterPopup = () => {
    if (isPosterExpanded) {
      window.history.back();
      setIsPosterExpanded(false);
    }
  };

  const closeLinkPopup = () => {
    if (linkPopup) {
      window.history.back();
      setLinkPopup(null);
    }
  };

  const handlePlayExternal = async (player: 'vlc' | 'mx' | 'generic' | 'download' | 'browser') => {
    if (!linkPopup) return;
    
    if (profile?.uid) {
      logEvent('link_click', profile.uid, {
        contentId: content.id,
        contentTitle: content.title,
        linkId: linkPopup.id,
        linkName: linkPopup.name,
        playerType: player
      });
    }
    
    let urlToPlay = linkPopup.url;
    if (!urlToPlay.startsWith('http')) {
      urlToPlay = 'https://' + urlToPlay;
    }
    
    if (player === 'browser') {
      let browserUrl = urlToPlay;
      
      // Pixeldrain hotlink bypass: ensure we use the viewer page (/u/) for browser viewing
      browserUrl = browserUrl.replace(/pixeldrain\.(com|dev)\/api\/file\//i, 'pixeldrain.dev/u/');
      browserUrl = browserUrl.replace(/pixeldrain\.(com|dev)\/u\//i, 'pixeldrain.dev/u/');
      
      if (browserUrl.includes('pixeldrain.dev/u/')) {
        try {
          const urlObj = new URL(browserUrl);
          urlObj.search = ''; // Remove query params like ?download=true
          browserUrl = urlObj.toString();
        } catch (e) {}
      }

      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        try {
          const urlObj = new URL(browserUrl);
          const scheme = urlObj.protocol.replace(':', '');
          const hostAndPath = urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
          const intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};action=android.intent.action.VIEW;end`;
          window.location.href = intentUrl;
          closeLinkPopup();
          return;
        } catch (e) {
          console.error("Intent parsing failed", e);
        }
      }
      
      // Fallback for non-Android or if intent fails
      const html = `<!DOCTYPE html><html><head><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${browserUrl}"></head><body><script>window.location.replace("${browserUrl}");</script></body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      closeLinkPopup();
      return;
    }

    if (player === 'download') {
      let copyUrl = urlToPlay;
      if (!copyUrl.includes('pixeldrain.com') && !copyUrl.includes('pixeldrain.dev')) {
        if (linkPopup.tinyUrl) {
          copyUrl = linkPopup.tinyUrl;
        } else {
          try {
            const { generateTinyUrl } = await import('../../utils/tinyurl');
            copyUrl = await generateTinyUrl(copyUrl, false);
          } catch (e) {
            console.error("Failed to generate tinyurl on the fly", e);
          }
        }
      }

      navigator.clipboard.writeText(copyUrl).then(() => {
        setAlertConfig({
          isOpen: true,
          title: 'Link Copied!',
          message: 'The link has been copied to your clipboard.'
        });
      }).catch(err => {
        console.error('Failed to copy', err);
        setAlertConfig({
          isOpen: true,
          title: 'Copy Failed',
          message: 'Could not copy link. Please copy it manually: ' + copyUrl
        });
      });
      closeLinkPopup();
      return;
    }
    
    // For video players, we need the raw file API endpoint, not the viewer page
    let videoUrl = urlToPlay;
    if (player === 'vlc' || player === 'mx' || player === 'generic') {
      videoUrl = videoUrl.replace(/pixeldrain\.(com|dev)\/u\//i, 'pixeldrain.dev/api/file/');
      videoUrl = videoUrl.replace(/pixeldrain\.(com|dev)\/api\/file\//i, 'pixeldrain.dev/api/file/');
      
      if (videoUrl.includes('pixeldrain.dev/api/file/')) {
        try {
          const urlObj = new URL(videoUrl);
          urlObj.search = ''; // Remove query params
          videoUrl = urlObj.toString();
        } catch (e) {}
      }
    }
    
    try {
      const urlObj = new URL(videoUrl);
      const scheme = urlObj.protocol.replace(':', '');
      const hostAndPath = urlObj.host + urlObj.pathname + urlObj.search + urlObj.hash;
      const title = encodeURIComponent(content.title);
      
      let intentUrl = '';
      if (player === 'vlc') {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=org.videolan.vlc;type=video/*;S.title=${title};end`;
      } else if (player === 'mx') {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};package=com.mxtech.videoplayer.ad;type=video/*;S.title=${title};end`;
      } else {
        intentUrl = `intent://${hostAndPath}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=video/*;end`;
      }
      
      window.location.href = intentUrl;
    } catch (e) {
      console.error("Invalid URL for external player", e);
      const a = document.createElement('a');
      a.href = videoUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    
    closeLinkPopup();
  };

  const handleReportLink = async () => {
    if (!profile || !linkPopup || !content) return;
    
    setIsReporting(true);
    try {
      // Check if already reported by this user
      const q = query(
        collection(db, 'reported_links'),
        where('userId', '==', profile.uid),
        where('linkId', '==', linkPopup.id),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        setAlertConfig({ 
          isOpen: true, 
          title: 'Already Reported', 
          message: 'You have already reported this link. We are working on it!' 
        });
        setIsReporting(false);
        return;
      }

      await addDoc(collection(db, 'reported_links'), {
        userId: profile.uid,
        userName: profile.displayName || profile.email || 'Unknown User',
        contentId: content.id,
        contentTitle: content.title,
        contentType: content.type,
        linkId: linkPopup.id,
        linkName: linkPopup.name,
        linkUrl: linkPopup.url,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setAlertConfig({ isOpen: true, title: 'Report Submitted', message: 'Thank you for reporting. We will check and fix this link soon.' });
      closeLinkPopup();
    } catch (error) {
      console.error("Error reporting link:", error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to submit report. Please try again later.' });
    } finally {
      setIsReporting(false);
    }
  };

  const handlePlayDirectly = async () => {
    if (!linkPopup) return;
    
    if (profile?.uid) {
      logEvent('link_click', profile.uid, {
        contentId: content.id,
        contentTitle: content.title,
        linkId: linkPopup.id,
        linkName: linkPopup.name
      });
    }
    
    let url = linkPopup.url;
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    // Pixeldrain hotlink bypass: ensure we use the viewer page (/u/) for browser viewing
    url = url.replace(/pixeldrain\.(com|dev)\/api\/file\//i, 'pixeldrain.dev/u/');
    url = url.replace(/pixeldrain\.(com|dev)\/u\//i, 'pixeldrain.dev/u/');
    
    if (url.includes('pixeldrain.dev/u/')) {
      try {
        const urlObj = new URL(url);
        urlObj.search = ''; // Remove query params like ?download=true
        url = urlObj.toString();
      } catch (e) {}
    }
    
    window.open(url, '_blank', 'noopener,noreferrer');
    
    closeLinkPopup();
  };

  const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
  const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');

  const renderLinks = (links: QualityLinks, isZip?: boolean, contextName?: string) => {
    if (!Array.isArray(links)) return null;

    const validLinks = links.filter(l => l && l.url);
    if (validLinks.length === 0) return null;

    const getBytes = (size: string, unit: string) => {
      const val = parseFloat(size) || 0;
      return unit === 'GB' ? val * 1000 : val;
    };

    const sortedLinks = [...validLinks].sort((a, b) => getBytes(a.size, a.unit) - getBytes(b.size, b.unit));

    return (
      <div className="flex flex-wrap gap-3 justify-center">
        {sortedLinks.map((link) => {
          const fullName = contextName ? `${contextName} - ${link.name}` : link.name;
          return (
            <div key={link.id} className="flex flex-col sm:flex-row items-stretch sm:items-center bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700 flex-1 min-w-[200px] max-w-sm">
              <button
                onClick={() => handlePlayClick(link.url, fullName, link.id, isZip, link.tinyUrl)}
                className="flex-1 flex items-center justify-center gap-2 hover:bg-zinc-700 text-white px-4 py-3 sm:py-2 text-sm font-medium transition-colors border-b sm:border-b-0 sm:border-r border-zinc-700"
                title="Play"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span className="truncate">Play {link.name}</span>
              </button>
              <button
                onClick={() => handlePlayClick(link.url, fullName, link.id, isZip, link.tinyUrl)}
                className="flex items-center justify-center gap-2 hover:bg-zinc-700 text-white px-4 py-3 sm:py-2 text-sm font-medium transition-colors shrink-0"
                title="Download"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="text-zinc-400">({link.size} {link.unit})</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const handleShare = async () => {
    if (!content) return;
    setIsShareLoading(true);
    
    let shareUrl = window.location.href;
    
    // Try to shorten the URL without the number alias
    shareUrl = await generateTinyUrl(shareUrl, false);

    const contentQuality = qualities.find(q => q.id === content.qualityId)?.name || 'N/A';
    
    const baseText = `🎬 ${formatContentTitle(content)} (${content.year})\n\n` +
                     `🗣️ Language: ${contentLangs || 'N/A'}\n` +
                     `🎭 Genre: ${contentGenres || 'N/A'}\n` +
                     `🖨️ Print Quality: ${contentQuality}\n\n` +
                     `Watch it here: ${shareUrl}`;
    
    const textForShare = baseText;
    const textForClipboard = baseText;

    const shareData: ShareData = {
      title: `${formatContentTitle(content)} (${content.year})`,
      text: textForShare,
    };

    try {
      // Try to include poster image
      if (content.posterUrl && navigator.canShare && navigator.canShare({ files: [] })) {
        try {
          const response = await fetch(content.posterUrl);
          const blob = await response.blob();
          const file = new File([blob], 'poster.jpg', { type: blob.type });
          shareData.files = [file];
        } catch (e) {
          console.error('Failed to fetch poster for sharing', e);
        }
      }

      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(textForClipboard);
        setAlertConfig({ isOpen: true, title: 'Success', message: 'Link and details copied to clipboard!' });
      }
    } catch (err) {
      console.error('Error sharing:', err);
    } finally {
      setIsShareLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:url" content={pageUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
      </Helmet>
      {/* Hero Section */}
      <div className="relative h-[60vh] md:h-[70vh] w-full">
        <div className="absolute inset-0">
          <LazyLoadImage
            src={mergedContent.posterUrl || 'https://picsum.photos/seed/movie/1920/1080'}
            alt={mergedContent.title}
            className="w-full h-full object-cover opacity-30"
            referrerPolicy="no-referrer"
            wrapperClassName="w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
        </div>
        
        <div className="absolute top-0 left-0 w-full p-4 z-[100] pointer-events-none flex justify-between items-center">
          <button 
            onClick={() => {
              sessionStorage.setItem('from_movie_details', 'true');
              navigate('/');
            }} 
            className="inline-flex items-center gap-2 text-zinc-300 hover:text-white bg-black/40 backdrop-blur-md px-4 py-2 rounded-full transition-colors pointer-events-auto cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
          <div className="pointer-events-auto">
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center p-8 z-10 pt-20">
          <div className="max-w-7xl mx-auto flex flex-col items-center gap-8 text-center">
            <LazyLoadImage 
              src={mergedContent.posterUrl || 'https://picsum.photos/seed/movie/400/600'} 
              alt={mergedContent.title} 
              className="w-32 md:w-64 rounded-2xl shadow-2xl cursor-pointer hover:scale-105 transition-transform" 
              referrerPolicy="no-referrer" 
              onClick={() => setIsPosterExpanded(true)}
              wrapperClassName="w-32 md:w-64"
            />
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  {mergedContent.type}
                </span>
                <span className="text-zinc-300 font-medium">{mergedContent.year}</span>
                {mergedContent.qualityId && (
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    (() => {
                      const qName = qualities.find(q => q.id === mergedContent.qualityId)?.name || '';
                      return ['WEB-DL', 'WebRip', 'HDRip', 'BluRay'].some(hq => qName.toUpperCase().includes(hq.toUpperCase()))
                        ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                        : 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]';
                    })()
                  }`}>
                    {qualities.find(q => q.id === mergedContent.qualityId)?.name}
                  </span>
                )}
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">{formatContentTitle(mergedContent)}</h1>
              
              <div className="flex flex-wrap items-center justify-center gap-4">
                {mergedContent.trailerUrl && (
                  <button 
                    onClick={() => setIsTrailerPopupOpen(true)}
                    className={`${getYouTubeEmbedUrl(mergedContent.trailerUrl) ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-500 hover:bg-emerald-600'} text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-colors`}
                  >
                    {getYouTubeEmbedUrl(mergedContent.trailerUrl) ? <Youtube className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    Watch Trailer
                  </button>
                )}
                {mergedContent.sampleUrl && (
                  <button 
                    onClick={() => handlePlayClick(mergedContent.sampleUrl!, 'Sample', 'sample')}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-colors border border-zinc-700"
                  >
                    <Play className="w-5 h-5" /> Sample
                  </button>
                )}
                {mergedContent.imdbLink && (
                  <a href={mergedContent.imdbLink} target="_blank" rel="noreferrer" className="bg-yellow-500 hover:bg-yellow-600 text-black px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-colors">
                    IMDb
                  </a>
                )}
                
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleWatchLater}
                    disabled={isWatchLaterLoading}
                    className={`p-4 rounded-xl border transition-colors ${profile?.watchLater?.includes(mergedContent.id) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300'} ${isWatchLaterLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Watch Later"
                  >
                    {isWatchLaterLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                  </button>
                  
                  <button
                    onClick={toggleFavorite}
                    disabled={isFavoriteLoading}
                    className={`p-4 rounded-xl border transition-colors ${profile?.favorites?.includes(mergedContent.id) ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300'} ${isFavoriteLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Favorite"
                  >
                    {isFavoriteLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={`w-5 h-5 ${profile?.favorites?.includes(mergedContent.id) ? 'fill-current' : ''}`} />}
                  </button>

                  <button
                    onClick={handleShare}
                    disabled={isShareLoading}
                    className={`p-4 rounded-xl border bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors ${isShareLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Share"
                  >
                    {isShareLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                  </button>
                </div>

                {(profile?.role === 'admin' || profile?.role === 'owner') && (
                  <div className="flex gap-4">
                    <button
                      onClick={() => setIsMediaModalOpen(true)}
                      className="p-4 rounded-xl border bg-cyan-500/10 border-cyan-500 text-cyan-500 hover:bg-cyan-500/20 transition-colors flex items-center gap-2"
                      title="Fetch Media Data"
                    >
                      <Search className="w-5 h-5" />
                      <span className="hidden sm:inline">Fetch</span>
                    </button>
                    <Link
                      to={`/admin/content?edit=${mergedContent.id}`}
                      className="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500 text-emerald-500 hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
                      title="Edit Content"
                    >
                      <Edit2 className="w-5 h-5" />
                      <span className="hidden sm:inline">Edit</span>
                    </Link>
                    <button
                      onClick={() => setDeleteId(mergedContent.id)}
                      className="p-4 rounded-xl border bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500/20 transition-colors flex items-center gap-2"
                      title="Delete Content"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-8 py-12">
        {!profile ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-6 rounded-2xl mb-12 flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-lg mb-1">Sign in required</h3>
                <p className="text-emerald-400 mb-0">
                  Please sign in or log in to access links and watch this content.
                </p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/login', { state: { from: location.pathname } })}
              className="bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-600 transition-colors whitespace-nowrap"
            >
              Log In
            </button>
          </div>
        ) : !canPlay && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-2xl mb-12 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-lg mb-1">Access Restricted</h3>
              <p className="text-red-400 mb-4">
                {isPending ? 'Your account is pending admin approval.' : 
                 isExpired ? (profile?.role === 'trial' ? 'Your free Trial has expired. Please get Membership to continue watching.' : 'Your membership has expired.') : 
                 'You do not have permission to access links for this content.'}
              </p>
              <a href="https://wa.me/923363284466" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-red-500/20 px-4 py-2 rounded-xl font-medium hover:bg-red-500/30 transition-colors">
                <MessageCircle className="w-4 h-4" /> Contact Admin (03363284466)
              </a>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-12">
            <section className="mt-8">
              {imdbData ? (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 relative overflow-hidden group">
                  {fetchingImdb && (
                    <div className="absolute top-4 right-4 animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-cyan-500"></div>
                  )}
                  <div className="flex-1 space-y-4">
                    <div className="relative">
                      {imdbData.rating && (
                        <div className="float-right ml-4 mb-2 bg-[#f5c518] text-black px-2 py-1 rounded flex items-center gap-1.5 font-black text-xs shadow-[0_0_15px_rgba(245,197,24,0.3)] whitespace-nowrap">
                          <span className="bg-black text-[#f5c518] px-1 rounded-sm text-[10px] tracking-tighter">IMDb</span>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[10px]">⭐</span>
                            <span>{imdbData.rating.replace('/10', '')}</span>
                          </div>
                        </div>
                      )}
                      <h3 className="text-3xl font-bold text-cyan-400 leading-tight">
                        {imdbData.title} {imdbData.year ? `(${imdbData.year})` : ''}
                      </h3>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm font-medium text-cyan-400/80">
                      {imdbData.releaseDate && (
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Release Date</span>
                          <span>{formatReleaseDate(imdbData.releaseDate)}</span>
                        </div>
                      )}
                      {imdbData.duration && mergedContent.type !== 'series' && (
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Runtime</span>
                          <span>{formatRuntime(imdbData.duration)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-cyan-500/10">
                      {imdbData.genres && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-zinc-500 text-xs font-medium">Genre</span>
                          <span className="text-sm font-medium text-cyan-400/80">{imdbData.genres}</span>
                        </div>
                      )}
                      {contentLangs && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-zinc-500 text-xs font-medium">Language</span>
                          <span className="text-sm font-medium text-cyan-400/80">{contentLangs}</span>
                        </div>
                      )}
                      {mergedContent.subtitles && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-zinc-500 text-xs font-medium">Subtitle</span>
                          <span className="text-sm font-medium text-cyan-400/80">Yes</span>
                        </div>
                      )}
                    </div>
                    
                    {(imdbData.cast || (mergedContent.cast && mergedContent.cast.length > 0)) && (
                      <div className="pt-2">
                        <h4 className="text-sm font-bold text-cyan-400 mb-2 uppercase tracking-wider opacity-70">Cast</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {(imdbData.cast ? imdbData.cast.split(',').map(c => c.trim()) : mergedContent.cast).map((actor, idx) => (
                            <span key={idx} className="bg-cyan-500/5 border border-cyan-500/10 px-2 py-1 rounded-md text-[11px] text-zinc-400">
                              {actor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(imdbData.description || mergedContent.description) && (
                      <div className="pt-2">
                        <h4 className="text-sm font-bold text-cyan-400 mb-1 uppercase tracking-wider opacity-70">Synopsis</h4>
                        <p className="text-zinc-400 text-xs leading-relaxed">{imdbData.description || mergedContent.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-12">
                  <section className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-8 relative group">
                    <div className="relative mb-6">
                      {mergedContent.imdbRating && (
                        <div className="float-right ml-4 mb-2 bg-[#f5c518] text-black px-2 py-1 rounded flex items-center gap-1.5 font-black text-xs shadow-[0_0_15px_rgba(245,197,24,0.3)] whitespace-nowrap">
                          <span className="bg-black text-[#f5c518] px-1 rounded-sm text-[10px] tracking-tighter">IMDb</span>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[10px]">⭐</span>
                            <span>{mergedContent.imdbRating.replace('/10', '')}</span>
                          </div>
                        </div>
                      )}
                      <h3 className="text-3xl font-bold text-cyan-400 leading-tight">
                        {formatContentTitle(mergedContent)}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-6 mb-8 text-sm font-medium text-cyan-400/80">
                      {mergedContent.year && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4 text-cyan-500" /> {mergedContent.year}</span>}
                      {mergedContent.runtime && mergedContent.type !== 'series' && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4 text-cyan-500" /> {formatRuntime(mergedContent.runtime)}</span>}
                      {mergedContent.releaseDate && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Film className="w-4 h-4 text-cyan-500" /> {formatReleaseDate(mergedContent.releaseDate)}</span>}
                      {contentGenres && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg">Genre: {contentGenres}</span>}
                      {contentLangs && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg">Language: {contentLangs}</span>}
                      {mergedContent.qualityId && (
                        <span className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold ${
                          (() => {
                            const qName = qualities.find(q => q.id === mergedContent.qualityId)?.name || '';
                            return ['WEB-DL', 'WebRip', 'HDRip', 'BluRay'].some(hq => qName.toUpperCase().includes(hq.toUpperCase()))
                              ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                              : 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]';
                          })()
                        }`}>
                          Quality: {qualities.find(q => q.id === mergedContent.qualityId)?.name}
                        </span>
                      )}
                    </div>
                    
                    {mergedContent.cast && mergedContent.cast.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-cyan-400 mb-2 uppercase tracking-wider opacity-70">Cast</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {mergedContent.cast.map((actor, idx) => (
                            <span key={idx} className="bg-cyan-500/5 border border-cyan-500/10 px-2 py-1 rounded-md text-[11px] text-zinc-400">
                              {actor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <h3 className="text-sm font-bold mb-1 text-cyan-400 uppercase tracking-wider opacity-70">Synopsis</h3>
                    <p className="text-zinc-400 text-xs leading-relaxed">{mergedContent.description}</p>
                  </section>
                </div>
              )}
            </section>

            {/* Links Section */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Download & Play</h2>
              
              {mergedContent.type === 'movie' && mergedContent.movieLinks && (
                (() => {
                  try {
                    const links = JSON.parse(mergedContent.movieLinks);
                    const rendered = renderLinks(links);
                    if (!rendered) return null;
                    return (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 text-zinc-400">Movie Links</h3>
                        {rendered}
                      </div>
                    );
                  } catch (e) {
                    console.error("Error parsing movie links:", e);
                    return null;
                  }
                })()
              )}

              {mergedContent.type === 'series' && mergedContent.seasons && (
                <div className="space-y-6">
                  {(() => {
                    try {
                      const allSeasons = JSON.parse(mergedContent.seasons);
                      const sortedSeasons = [...allSeasons].sort((a: Season, b: Season) => {
                        const aAccess = hasFullAccess || allowedSeasons.includes(a.id);
                        const bAccess = hasFullAccess || allowedSeasons.includes(b.id);
                        if (aAccess && !bAccess) return -1;
                        if (!aAccess && bAccess) return 1;
                        return a.seasonNumber - b.seasonNumber;
                      });

                      return sortedSeasons.map((season: Season) => {
                        const isAccessible = hasFullAccess || allowedSeasons.includes(season.id);
                        
                        return (
                        <div key={season.id} className={`bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden ${(!isAccessible && profile) ? 'opacity-75' : ''}`}>
                          <div className="bg-zinc-950/50 p-6 border-b border-zinc-800 flex justify-between items-center">
                            <h3 className="text-xl font-bold">Season {season.seasonNumber}</h3>
                            {(!isAccessible && profile) && (
                              <span className="bg-red-500/10 text-red-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                                <Lock className="w-4 h-4" /> Restricted
                              </span>
                            )}
                            {!profile && (
                              <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                                <Lock className="w-4 h-4" /> Sign in to watch
                              </span>
                            )}
                          </div>
                          
                          <div className="p-6 space-y-8">
                            {(() => {
                              const zipLinks = (season.zipLinks || []).filter(l => l && l.url);
                              const mkvLinks = (season.mkvLinks || []).filter(l => l && l.url);
                              
                              return (
                                <>
                                  {zipLinks.length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-zinc-400 mb-3 text-sm uppercase tracking-wider">Full Season Zip</h4>
                                      {renderLinks(zipLinks, true, `S${season.seasonNumber} Zip`)}
                                    </div>
                                  )}
                                  {mkvLinks.length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-zinc-400 mb-3 text-sm uppercase tracking-wider">Full Season MKV</h4>
                                      {renderLinks(mkvLinks, false, `S${season.seasonNumber} MKV`)}
                                    </div>
                                  )}
                                  
                                  {season.episodes && season.episodes.length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-zinc-400 mb-4 text-sm uppercase tracking-wider">Episodes</h4>
                                      <div className="space-y-4">
                                        {season.episodes.map(ep => (
                                          <div key={ep.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
                                            <div className="flex flex-col gap-2">
                                              <div className="flex items-center flex-wrap gap-2">
                                                <span className="text-emerald-500 font-bold">E{ep.episodeNumber}</span>
                                                <span className="font-medium">{ep.title}</span>
                                                {ep.description && (
                                                  <button
                                                    onClick={() => setExpandedEpisodes(prev => ({ ...prev, [ep.id]: !prev[ep.id] }))}
                                                    className="text-xs text-zinc-400 hover:text-emerald-500 transition-colors"
                                                  >
                                                    {expandedEpisodes[ep.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                  </button>
                                                )}
                                                {ep.duration && (
                                                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded whitespace-nowrap">
                                                    {ep.duration}
                                                  </span>
                                                )}
                                              </div>
                                              
                                              {ep.description && expandedEpisodes[ep.id] && (
                                                <div className="text-sm text-zinc-400 bg-zinc-900/50 p-3 rounded-lg">
                                                  {ep.description}
                                                </div>
                                              )}
                                            </div>
                                            
                                            <div className="flex justify-center">
                                              {renderLinks(ep.links, false, `S${season.seasonNumber} E${ep.episodeNumber}`)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )});
                    } catch (e) {
                      console.error("Error parsing series seasons:", e);
                      return <p className="text-red-500">Error loading seasons</p>;
                    }
                  })()}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <AlertModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Content"
        message="Are you sure you want to delete this content? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      {linkPopup && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeLinkPopup}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeLinkPopup}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <h3 className="text-xl font-bold mb-2">Play Content</h3>
            <p className="text-zinc-400 mb-6">How would you like to open "{linkPopup.name}"?</p>
            <div className="flex flex-col gap-3">
              {!(linkPopup.isZip || linkPopup.name.toLowerCase().includes('zip') || linkPopup.url.toLowerCase().includes('.zip')) ? (
                <>
                  <button
                    onClick={() => handlePlayExternal('generic')}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5" /> Play in Video Player
                  </button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handlePlayExternal('mx')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
                        <rect width="24" height="24" rx="6" fill="white" fillOpacity="0.2"/>
                        <path d="M16.5 12L9 16.5V7.5L16.5 12Z" fill="currentColor"/>
                      </svg>
                      MX Player
                    </button>
                    <button
                      onClick={() => handlePlayExternal('vlc')}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
                        <path d="M12 2L5 22H19L12 2Z" fill="currentColor"/>
                        <path d="M6.5 17H17.5" stroke="#ea580c" strokeWidth="2.5"/>
                        <path d="M9 10H15" stroke="#ea580c" strokeWidth="2.5"/>
                      </svg>
                      VLC Player
                    </button>
                  </div>
                </>
              ) : null}

              <button
                onClick={handleReportLink}
                disabled={isReporting}
                className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-500 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
                {isReporting ? 'Sending...' : 'Report Link (if not Working)'}
              </button>

              <button
                onClick={() => handlePlayExternal('download')}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Copy className="w-5 h-5" /> Copy Link
              </button>

              <button
                onClick={handlePlayDirectly}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}
      {isPosterExpanded && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={closePosterPopup}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex justify-center">
            <button
              onClick={closePosterPopup}
              className="absolute -top-12 right-0 text-zinc-400 hover:text-white transition-colors bg-black/50 p-2 rounded-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <LazyLoadImage 
              src={mergedContent.posterUrl || 'https://picsum.photos/seed/movie/400/600'} 
              alt={mergedContent.title} 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
              referrerPolicy="no-referrer" 
              onClick={(e) => e.stopPropagation()}
              wrapperClassName="max-w-full max-h-[90vh]"
            />
          </div>
        </div>
      )}
      <AnimatePresence>
        {isTrailerPopupOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[60] p-4"
            onClick={() => setIsTrailerPopupOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10" 
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setIsTrailerPopupOpen(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors bg-black/50 hover:bg-black/80 p-2 rounded-full z-10 backdrop-blur-sm"
              >
                <X className="w-6 h-6" />
              </button>
              {getYouTubeEmbedUrl(mergedContent.trailerUrl!) ? (
                <iframe
                  src={`${getYouTubeEmbedUrl(mergedContent.trailerUrl!)}?autoplay=1`}
                  title="Trailer"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white gap-4 bg-zinc-900">
                  <Play className="w-16 h-16 opacity-50" />
                  <p>This trailer cannot be played directly here.</p>
                  <a href={mergedContent.trailerUrl} target="_blank" rel="noreferrer" className="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 rounded-xl font-bold transition-colors">
                    Open in New Tab
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmModal
        isOpen={showLoginPrompt}
        title="Sign in required"
        message="Please sign in or log in to access links and watch this content."
        onConfirm={() => navigate('/login', { state: { from: location.pathname } })}
        onCancel={() => setShowLoginPrompt(false)}
        confirmText="Log In"
        cancelText="Cancel"
      />
      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
      />

      {isMediaModalOpen && mergedContent && (
        <MediaModal
          isOpen={isMediaModalOpen}
          onClose={() => setIsMediaModalOpen(false)}
          onApply={async (data) => {
            try {
              const contentRef = doc(db, 'content', mergedContent.id);
              const updateData: any = { ...data };
              
              // Handle seasons if they are in the data
              if (data.seasons && Array.isArray(data.seasons)) {
                const currentSeasons = JSON.parse(mergedContent.seasons || '[]');
                
                data.seasons.forEach((fetchedSeason: any) => {
                  const existingSeasonIndex = currentSeasons.findIndex((s: any) => s.seasonNumber === fetchedSeason.seasonNumber);
                  
                  if (existingSeasonIndex !== -1) {
                    const existingSeason = currentSeasons[existingSeasonIndex];
                    if (fetchedSeason.seasonYear) existingSeason.year = fetchedSeason.seasonYear;
                    
                    fetchedSeason.episodes.forEach((fetchedEp: any) => {
                      const existingEpIndex = existingSeason.episodes.findIndex((ep: any) => ep.episodeNumber === fetchedEp.episodeNumber);
                      if (existingEpIndex !== -1) {
                        existingSeason.episodes[existingEpIndex] = {
                          ...existingSeason.episodes[existingEpIndex],
                          title: fetchedEp.title || existingSeason.episodes[existingEpIndex].title,
                          description: fetchedEp.description || existingSeason.episodes[existingEpIndex].description,
                          duration: fetchedEp.duration || existingSeason.episodes[existingEpIndex].duration,
                        };
                      } else {
                        existingSeason.episodes.push({
                          id: Math.random().toString(36).substr(2, 9),
                          episodeNumber: fetchedEp.episodeNumber,
                          title: fetchedEp.title || `Episode ${fetchedEp.episodeNumber}`,
                          description: fetchedEp.description || '',
                          duration: fetchedEp.duration || '',
                          links: [{ id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }],
                        });
                      }
                    });
                    existingSeason.episodes.sort((a: any, b: any) => a.episodeNumber - b.episodeNumber);
                  } else {
                    currentSeasons.push({
                      id: Math.random().toString(36).substr(2, 9),
                      seasonNumber: fetchedSeason.seasonNumber,
                      year: fetchedSeason.seasonYear,
                      zipLinks: [
                        { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
                      ],
                      mkvLinks: [
                        { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
                        { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
                      ],
                      episodes: fetchedSeason.episodes.map((ep: any) => ({
                        id: Math.random().toString(36).substr(2, 9),
                        episodeNumber: ep.episodeNumber,
                        title: ep.title || `Episode ${ep.episodeNumber}`,
                        description: ep.description || '',
                        duration: ep.duration || '',
                        links: [{ id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }],
                      })).sort((a: any, b: any) => a.episodeNumber - b.episodeNumber)
                    });
                  }
                });
                updateData.seasons = JSON.stringify(currentSeasons.sort((a: any, b: any) => a.seasonNumber - b.seasonNumber));
              }

              await updateDoc(contentRef, updateData);
              setIsMediaModalOpen(false);
              setAlertConfig({ isOpen: true, title: 'Success', message: 'Content updated successfully' });
            } catch (error) {
              console.error("Error updating content:", error);
              setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update content' });
            }
          }}
          initialImdbId={mergedContent.imdbLink?.match(/tt\d+/)?.[0] || ''}
          initialTitle={mergedContent.title}
          initialYear={mergedContent.year?.toString() || ''}
        />
      )}
    </div>
  );
}
