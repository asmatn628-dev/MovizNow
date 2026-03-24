import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { db } from '../../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, collection, deleteDoc } from 'firebase/firestore';
import { Content, Genre, Language, QualityLinks, Season, Quality } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Film, ArrowLeft, Play, Clock, Heart, MessageCircle, AlertCircle, Download, Share2, Chrome, Copy, Youtube, X, Edit2, Trash2, Settings, Lock, ChevronDown, ChevronUp, Sparkles, Bot, Loader2 } from 'lucide-react';
import { logEvent } from '../../services/analytics';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import GeminiAssistantModal from '../../components/GeminiAssistantModal';
import { motion, AnimatePresence } from 'motion/react';
import { formatContentTitle, formatReleaseDate } from '../../utils/contentUtils';
import { fetchMovieMetadata } from '../../services/geminiMovieService';

export default function MovieDetails() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading: profileLoading } = useAuth();
  const [content, setContent] = useState<Content | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isWatchLaterLoading, setIsWatchLaterLoading] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [linkPopup, setLinkPopup] = useState<{ isOpen: boolean; url: string; name: string; id: string; isZip?: boolean } | null>(null);
  const [isPosterExpanded, setIsPosterExpanded] = useState(false);
  const [isTrailerPopupOpen, setIsTrailerPopupOpen] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<string, boolean>>({});
  const [imdbData, setImdbData] = useState<any>(null);
  const [fetchingImdb, setFetchingImdb] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');
  const hasLoggedView = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  const title = content ? `${formatContentTitle(content)} (${content.year}) - MovizNow` : 'MovizNow';
  const description = content?.description || 'Watch the latest movies and series on MovizNow.';
  const imageUrl = content?.posterUrl || 'https://Moviz-Now.vercel.app/logo.svg';
  const pageUrl = window.location.href;

  // Initialize IMDb data from content and cache
  useEffect(() => {
    if (content) {
      const ttMatch = content.imdbLink?.match(/tt\d+/);
      const ttId = ttMatch ? ttMatch[0] : null;
      const cacheKey = `imdb_${ttId || content.id}`;
      const cached = localStorage.getItem(cacheKey);
      
      const initialData = {
        title: content.title,
        year: content.year,
        description: content.description,
        cast: content.cast?.join(', '),
        posterUrl: content.posterUrl,
        genres: genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', '),
        releaseDate: content.releaseDate,
        duration: content.runtime,
        type: content.type
      };

      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // Only use cache if it's for the same content
          if (ttId && parsed.ttId === ttId) {
            setImdbData({ ...initialData, ...parsed });
            return;
          }
        } catch (e) {}
      }
      
      setImdbData(initialData);
    }
  }, [content, genres]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!id) return;
    const unsubContent = onSnapshot(doc(db, 'content', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Content;
        setContent(data);
        
        if (!hasLoggedView.current && profile?.uid) {
          hasLoggedView.current = true;
          logEvent('content_click', profile.uid, {
            contentId: data.id,
            contentTitle: data.title
          });
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("Content snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.GET, `content/${id}`);
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
    const unsubQualities = onSnapshot(collection(db, 'qualities'), (snapshot) => {
      setQualities(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quality)));
    }, (error) => {
      console.error("Qualities snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'qualities');
    });
    return () => { unsubContent(); unsubGenres(); unsubLangs(); unsubQualities(); };
  }, [id, profile?.uid]);

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

  useEffect(() => {
    if (content?.imdbLink || content?.title) {
      const fetchImdb = async () => {
        const ttMatch = content.imdbLink?.match(/tt\d+/);
        const ttId = ttMatch ? ttMatch[0] : null;

        // Check cache
        const cacheKey = `imdb_${ttId || content.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.isFetched && (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000)) {
              return; // Cache is fresh
            }
          } catch (e) {}
        }

        setFetchingImdb(true);
        setGeminiStatus('fetching');
        
        let data: any = { ttId, timestamp: Date.now() };
        let imdbSuccess = false;

        // Try legacy methods (IMDb algorithms) first
        if (ttId) {
          try {
            const tvmazeRes = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${ttId}`);
            if (tvmazeRes.ok) {
              const show = await tvmazeRes.json();
              if (show.rating?.average) data.rating = `${show.rating.average}/10`;
            }
          } catch (error) {}

          try {
            const proxyUrl = `/api/imdb/title/${ttId}`;
            let pageRes = await fetch(proxyUrl);
            if (pageRes.ok) {
              const html = await pageRes.text();
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');
              const ratingEl = doc.querySelector('[data-testid="hero-rating-bar__aggregate-rating__score"] span');
              if (ratingEl && ratingEl.textContent?.trim()) {
                data.rating = `${ratingEl.textContent.trim()}/10`;
              }
            }
          } catch (error) {}
          
          if (data.rating) {
            imdbSuccess = true;
          }
        }

        if (imdbSuccess) {
          const dataToSave = { ...data, isFetched: true, source: 'imdb' };
          setImdbData(prev => ({ ...prev, ...dataToSave }));
          localStorage.setItem(cacheKey, JSON.stringify(dataToSave));
          setGeminiStatus('idle');
          setFetchingImdb(false);
          return;
        }

        // Fallback to Gemini if IMDb algorithms failed to get the rating
        try {
          const geminiData = await fetchMovieMetadata(content.title, content.year, content.imdbLink);
          
          if (geminiData) {
            const dataToSave = {
              ...geminiData,
              ttId,
              timestamp: Date.now(),
              isFetched: true,
              source: 'ai'
            };
            setImdbData(prev => ({ ...prev, ...dataToSave }));
            localStorage.setItem(cacheKey, JSON.stringify(dataToSave));
            setGeminiStatus('success');
            setFetchingImdb(false);
            return;
          }
        } catch (error) {
          console.error("Gemini fetch failed", error);
        }

        // If both fail, just save what we have
        setImdbData(prev => ({ ...prev, ...data, isFetched: true, source: 'imdb' }));
        localStorage.setItem(cacheKey, JSON.stringify({ ...data, isFetched: true, source: 'imdb', timestamp: Date.now() }));
        setFetchingImdb(false);
        setGeminiStatus('error');
      };
      fetchImdb();
    }
  }, [content?.imdbLink, content?.title]);

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div></div>;
  }

  if (!content || (content.status === 'draft' && profile?.role !== 'admin' && profile?.role !== 'data_editor')) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Content not found</div>;
  }

  const isPending = profile?.status === 'pending';
  const isExpired = profile?.status === 'expired';
  const isTemp = profile?.role === 'temporary';
  const isSelectedContent = profile?.role === 'selected_content';
  const isAssigned = (isTemp || isSelectedContent) && (
    profile?.assignedContent?.includes(content.id) ||
    profile?.assignedContent?.some(id => id.startsWith(`${content.id}:`))
  );
  const canPlay = profile?.role === 'admin' || profile?.role === 'data_editor' || (profile?.status === 'active' && (!(isTemp || isSelectedContent) || isAssigned));

  const allowedSeasons = profile?.assignedContent?.filter(id => id.startsWith(`${content.id}:`)).map(id => id.split(':')[1]) || [];
  const hasFullAccess = profile?.role === 'admin' || profile?.role === 'data_editor' || (!(isTemp || isSelectedContent)) || profile?.assignedContent?.includes(content.id);

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

  const handlePlayClick = (url: string, linkName?: string, linkId?: string, isZip?: boolean) => {
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
    
    setLinkPopup({ isOpen: true, url, name: linkName || 'Unknown Link', id: linkId || 'unknown', isZip });
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

  const handlePlayExternal = (player: 'vlc' | 'mx' | 'generic' | 'download' | 'browser') => {
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
      navigator.clipboard.writeText(urlToPlay).then(() => {
        setAlertConfig({
          isOpen: true,
          title: 'Link Copied!',
          message: 'The video link has been copied to your clipboard. To bypass the hotlink protection, please open a new tab and paste the link into the address bar.'
        });
      }).catch(err => {
        console.error('Failed to copy', err);
        setAlertConfig({
          isOpen: true,
          title: 'Copy Failed',
          message: 'Could not copy link. Please copy it manually: ' + urlToPlay
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
    
    // Attempt to copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
    
    window.open(url, '_blank', 'noopener,noreferrer');
    
    closeLinkPopup();
  };

  const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
  const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');

  const renderLinks = (links: QualityLinks, isZip?: boolean) => {
    if (!Array.isArray(links)) return null;

    const getBytes = (size: string, unit: string) => {
      const val = parseFloat(size) || 0;
      return unit === 'GB' ? val * 1024 : val;
    };

    const sortedLinks = [...links].sort((a, b) => getBytes(a.size, a.unit) - getBytes(b.size, b.unit));

    return (
      <div className="flex flex-wrap gap-3">
        {sortedLinks.map((link) => {
          if (!link || !link.url) return null;
          return (
            <div key={link.id} className="flex flex-col sm:flex-row items-stretch sm:items-center bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700 flex-1 min-w-[200px] max-w-sm">
              <button
                onClick={() => handlePlayClick(link.url, link.name, link.id, isZip)}
                className="flex-1 flex items-center justify-center gap-2 hover:bg-zinc-700 text-white px-4 py-3 sm:py-2 text-sm font-medium transition-colors border-b sm:border-b-0 sm:border-r border-zinc-700"
                title="Play"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span className="truncate">Play {link.name}</span>
              </button>
              <button
                onClick={() => handlePlayClick(link.url, link.name, link.id, isZip)}
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
    
    // Try to shorten the URL
    try {
      const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(shareUrl)}`);
      if (response.ok) {
        const shortened = await response.text();
        if (shortened && shortened.startsWith('http')) {
          shareUrl = shortened;
        }
      }
    } catch (err) {
      console.error('Error shortening URL:', err);
    }

    const contentQuality = qualities.find(q => q.id === content.qualityId)?.name || 'N/A';
    
    let text = `🎬 *${formatContentTitle(content)} (${content.year})*\n\n` +
               `🗣️ *Language:* ${contentLangs || 'N/A'}\n` +
               `🎭 *Genre:* ${contentGenres || 'N/A'}\n` +
               `🖨️ *Print Quality:* ${contentQuality}\n`;

    text += (profile?.phone ? `\n📱 *WhatsApp:* ${profile.phone}\n\n` : '\n') +
            `Watch it here:`;

    const shareData = {
      title: `${formatContentTitle(content)} (${content.year})`,
      text: text,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
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
          <img src={content.posterUrl || 'https://picsum.photos/seed/movie/1920/1080'} alt={content.title} className="w-full h-full object-cover opacity-30" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
        </div>
        
        <div className="absolute top-0 left-0 w-full p-4 z-[100] pointer-events-none flex justify-between items-center">
          <button 
            onClick={() => navigate('/')} 
            className="inline-flex items-center gap-2 text-zinc-300 hover:text-white bg-black/40 backdrop-blur-md px-4 py-2 rounded-full transition-colors pointer-events-auto cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
          <div className="pointer-events-auto">
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center p-8 z-10 pt-20">
          <div className="max-w-7xl mx-auto flex flex-col items-center gap-8 text-center">
            <img 
              src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'} 
              alt={content.title} 
              className="w-32 md:w-64 rounded-2xl shadow-2xl cursor-pointer hover:scale-105 transition-transform" 
              referrerPolicy="no-referrer" 
              onClick={() => setIsPosterExpanded(true)}
            />
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  {content.type}
                </span>
                <span className="text-zinc-300 font-medium">{content.year}</span>
                {content.qualityId && (
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    (() => {
                      const qName = qualities.find(q => q.id === content.qualityId)?.name || '';
                      return ['WEB-DL', 'WebRip', 'HDRip', 'BluRay'].some(hq => qName.toUpperCase().includes(hq.toUpperCase()))
                        ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                        : 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]';
                    })()
                  }`}>
                    {qualities.find(q => q.id === content.qualityId)?.name}
                  </span>
                )}
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">{formatContentTitle(content)}</h1>
              
              <div className="flex flex-wrap items-center justify-center gap-4">
                {content.trailerUrl && (
                  <button 
                    onClick={() => setIsTrailerPopupOpen(true)}
                    className={`${getYouTubeEmbedUrl(content.trailerUrl) ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-500 hover:bg-emerald-600'} text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-colors`}
                  >
                    {getYouTubeEmbedUrl(content.trailerUrl) ? <Youtube className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    Watch Trailer
                  </button>
                )}
                {content.sampleUrl && (
                  <button 
                    onClick={() => handlePlayClick(content.sampleUrl!, 'Sample', 'sample')}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-colors border border-zinc-700"
                  >
                    <Play className="w-5 h-5" /> Sample
                  </button>
                )}
                {content.imdbLink && (
                  <a href={content.imdbLink} target="_blank" rel="noreferrer" className="bg-yellow-500 hover:bg-yellow-600 text-black px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-colors">
                    IMDb
                  </a>
                )}
                
                <button
                  onClick={toggleWatchLater}
                  disabled={isWatchLaterLoading}
                  className={`p-4 rounded-xl border transition-colors ${profile?.watchLater?.includes(content.id) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300'} ${isWatchLaterLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Watch Later"
                >
                  {isWatchLaterLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                </button>
                
                <button
                  onClick={toggleFavorite}
                  disabled={isFavoriteLoading}
                  className={`p-4 rounded-xl border transition-colors ${profile?.favorites?.includes(content.id) ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300'} ${isFavoriteLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Favorite"
                >
                  {isFavoriteLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={`w-5 h-5 ${profile?.favorites?.includes(content.id) ? 'fill-current' : ''}`} />}
                </button>

                <button
                  onClick={() => setIsGeminiModalOpen(true)}
                  className="p-4 rounded-xl border bg-emerald-500/20 border-emerald-500 text-emerald-500 hover:bg-emerald-500/30 transition-colors"
                  title="Gemini Assistant"
                >
                  <Bot className="w-5 h-5" />
                </button>

                <button
                  onClick={handleShare}
                  disabled={isShareLoading}
                  className={`p-4 rounded-xl border bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors ${isShareLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Share"
                >
                  {isShareLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                </button>

                {(profile?.role === 'admin' || profile?.role === 'data_editor') && (
                  <div className="flex gap-4">
                    <Link
                      to={`/admin/content?edit=${content.id}`}
                      className="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500 text-emerald-500 hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
                      title="Edit Content"
                    >
                      <Edit2 className="w-5 h-5" />
                      <span className="hidden sm:inline">Edit</span>
                    </Link>
                    <button
                      onClick={() => setDeleteId(content.id)}
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
        {profileLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          </div>
        ) : !profile ? (
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
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 relative overflow-hidden">
                  {fetchingImdb && (
                    <div className="absolute top-4 right-4 animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-cyan-500"></div>
                  )}
                  <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="text-3xl font-bold text-cyan-400 flex-1">
                        {imdbData.title} {imdbData.year ? `(${imdbData.year})` : ''}
                      </h3>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {!fetchingImdb && imdbData.isFetched && (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm whitespace-nowrap">
                            {imdbData.source === 'ai' ? (
                              <div className="flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3 text-emerald-500" />
                                <span className="text-[10px] font-bold text-emerald-500 tracking-wider uppercase leading-none">AI Fetched</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="bg-[#f5c518] text-black px-1 rounded-sm text-[10px] font-black tracking-tighter leading-none">IMDb</span>
                                <span className="text-[10px] font-bold text-zinc-400 tracking-wider uppercase leading-none">Fetched</span>
                              </div>
                            )}
                          </div>
                        )}
                        {imdbData.rating && imdbData.isFetched && (
                          <div className="bg-[#f5c518] text-black px-2 py-1 rounded flex items-center gap-1.5 font-black text-xs shadow-[0_0_15px_rgba(245,197,24,0.3)] whitespace-nowrap">
                            <span className="bg-black text-[#f5c518] px-1 rounded-sm text-[10px] tracking-tighter">IMDb</span>
                            <div className="flex items-center gap-0.5">
                              <span className="text-[10px]">⭐</span>
                              <span>{imdbData.rating.replace('/10', '')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm font-medium text-cyan-400/80">
                      {imdbData.releaseDate && (
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Release Date</span>
                          <span>{formatReleaseDate(imdbData.releaseDate)}</span>
                        </div>
                      )}
                      {imdbData.duration && content.type !== 'series' && (
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Runtime</span>
                          <span>{imdbData.duration}</span>
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
                    </div>
                    
                    {(imdbData.cast || (content.cast && content.cast.length > 0)) && (
                      <div className="pt-2">
                        <h4 className="text-sm font-bold text-cyan-400 mb-2 uppercase tracking-wider opacity-70">Cast</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {(imdbData.cast ? imdbData.cast.split(',').map(c => c.trim()) : content.cast).map((actor, idx) => (
                            <span key={idx} className="bg-cyan-500/5 border border-cyan-500/10 px-2 py-1 rounded-md text-[11px] text-zinc-400">
                              {actor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(imdbData.description || content.description) && (
                      <div className="pt-2">
                        <h4 className="text-sm font-bold text-cyan-400 mb-1 uppercase tracking-wider opacity-70">Synopsis</h4>
                        <p className="text-zinc-400 text-xs leading-relaxed">{imdbData.description || content.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-12">
                  <section className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-8">
                    <div className="flex flex-wrap gap-6 mb-8 text-sm font-medium text-cyan-400/80">
                      {content.year && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4 text-cyan-500" /> {content.year}</span>}
                      {content.runtime && content.type !== 'series' && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4 text-cyan-500" /> {content.runtime}</span>}
                      {content.releaseDate && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg"><Film className="w-4 h-4 text-cyan-500" /> {formatReleaseDate(content.releaseDate)}</span>}
                      {contentGenres && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg">Genre: {contentGenres}</span>}
                      {contentLangs && <span className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1.5 rounded-lg">Language: {contentLangs}</span>}
                      {content.qualityId && (
                        <span className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold ${
                          (() => {
                            const qName = qualities.find(q => q.id === content.qualityId)?.name || '';
                            return ['WEB-DL', 'WebRip', 'HDRip', 'BluRay'].some(hq => qName.toUpperCase().includes(hq.toUpperCase()))
                              ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                              : 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]';
                          })()
                        }`}>
                          Quality: {qualities.find(q => q.id === content.qualityId)?.name}
                        </span>
                      )}
                    </div>
                    
                    {content.cast && content.cast.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-cyan-400 mb-2 uppercase tracking-wider opacity-70">Cast</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {content.cast.map((actor, idx) => (
                            <span key={idx} className="bg-cyan-500/5 border border-cyan-500/10 px-2 py-1 rounded-md text-[11px] text-zinc-400">
                              {actor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <h3 className="text-sm font-bold mb-1 text-cyan-400 uppercase tracking-wider opacity-70">Synopsis</h3>
                    <p className="text-zinc-400 text-xs leading-relaxed">{content.description}</p>
                  </section>
                </div>
              )}
            </section>

            {/* Links Section */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Download & Play</h2>
              
              {content.type === 'movie' && content.movieLinks && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h3 className="font-bold mb-4 text-zinc-400">Movie Links</h3>
                  {(() => {
                    try {
                      return renderLinks(JSON.parse(content.movieLinks));
                    } catch (e) {
                      console.error("Error parsing movie links:", e);
                      return <p className="text-red-500">Error loading links</p>;
                    }
                  })()}
                </div>
              )}

              {content.type === 'series' && content.seasons && (
                <div className="space-y-6">
                  {(() => {
                    try {
                      const allSeasons = JSON.parse(content.seasons);
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
                        <div key={season.id} className={`bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden ${!isAccessible ? 'opacity-75' : ''}`}>
                          <div className="bg-zinc-950/50 p-6 border-b border-zinc-800 flex justify-between items-center">
                            <h3 className="text-xl font-bold">Season {season.seasonNumber}</h3>
                            {!isAccessible && (
                              <span className="bg-red-500/10 text-red-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                                <Lock className="w-4 h-4" /> Restricted
                              </span>
                            )}
                          </div>
                          
                          <div className="p-6 space-y-8">
                            {isAccessible ? (
                              <>
                                {(() => {
                                  const zipLinks = season.zipLinks || [];
                                  const mkvLinks = season.mkvLinks || [];
                                  
                                  return (
                                    <>
                                      {zipLinks.length > 0 && (
                                        <div>
                                          <h4 className="font-semibold text-zinc-400 mb-3 text-sm uppercase tracking-wider">Full Season Zip</h4>
                                          {renderLinks(zipLinks, true)}
                                        </div>
                                      )}
                                      {mkvLinks.length > 0 && (
                                        <div>
                                          <h4 className="font-semibold text-zinc-400 mb-3 text-sm uppercase tracking-wider">Full Season MKV</h4>
                                          {renderLinks(mkvLinks)}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}

                                {season.episodes && season.episodes.length > 0 && (
                                  <div>
                                    <h4 className="font-semibold text-zinc-400 mb-4 text-sm uppercase tracking-wider">Episodes</h4>
                                    <div className="space-y-4">
                                      {season.episodes.map(ep => (
                                        <div key={ep.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
                                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div>
                                              <span className="text-emerald-500 font-bold mr-3">E{ep.episodeNumber}</span>
                                              <span className="font-medium">{ep.title}</span>
                                              {ep.description && (
                                                <button
                                                  onClick={() => setExpandedEpisodes(prev => ({ ...prev, [ep.id]: !prev[ep.id] }))}
                                                  className="ml-3 text-xs text-zinc-400 hover:text-emerald-500 transition-colors"
                                                >
                                                  {expandedEpisodes[ep.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                              )}
                                              {ep.duration && (
                                                <span className="ml-3 text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                                                  {ep.duration}
                                                </span>
                                              )}
                                            </div>
                                            {renderLinks(ep.links)}
                                          </div>
                                          {ep.description && expandedEpisodes[ep.id] && (
                                            <div className="text-sm text-zinc-400 mt-2 bg-zinc-900/50 p-3 rounded-lg">
                                              {ep.description}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-center py-8 text-zinc-500">
                                <Lock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>You do not have access to this season.</p>
                              </div>
                            )}
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

      <GeminiAssistantModal 
        isOpen={isGeminiModalOpen} 
        onClose={() => setIsGeminiModalOpen(false)} 
        context={`${content.title} (${content.year}) - ${content.type}`}
      />

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
            <img 
              src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'} 
              alt={content.title} 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
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
              {getYouTubeEmbedUrl(content.trailerUrl!) ? (
                <iframe
                  src={`${getYouTubeEmbedUrl(content.trailerUrl!)}?autoplay=1`}
                  title="Trailer"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white gap-4 bg-zinc-900">
                  <Play className="w-16 h-16 opacity-50" />
                  <p>This trailer cannot be played directly here.</p>
                  <a href={content.trailerUrl} target="_blank" rel="noreferrer" className="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 rounded-xl font-bold transition-colors">
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
    </div>
  );
}
