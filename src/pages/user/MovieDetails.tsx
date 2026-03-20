import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, collection, deleteDoc } from 'firebase/firestore';
import { Content, Genre, Language, QualityLinks, Season, Quality } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Film, ArrowLeft, Play, Clock, Heart, MessageCircle, AlertCircle, Download, Share2, Chrome, Copy, Youtube, X, Edit2, Trash2, Settings } from 'lucide-react';
import { logEvent } from '../../services/analytics';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import AlertModal from '../../components/AlertModal';
import { fetchContentDataWithAI } from '../../services/geminiService';
import ConfirmModal from '../../components/ConfirmModal';
import { motion, AnimatePresence } from 'motion/react';
import { formatContentTitle } from '../../utils/contentUtils';

export default function MovieDetails() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [content, setContent] = useState<Content | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [linkPopup, setLinkPopup] = useState<{ isOpen: boolean; url: string; name: string; id: string; isZip?: boolean } | null>(null);
  const [isPosterExpanded, setIsPosterExpanded] = useState(false);
  const [isTrailerPopupOpen, setIsTrailerPopupOpen] = useState(false);
  const [imdbData, setImdbData] = useState<any>(null);
  const [fetchingImdb, setFetchingImdb] = useState(false);
  const hasLoggedView = useRef(false);
  const navigate = useNavigate();

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
    if (content?.title) {
      const fetchImdb = async () => {
        setFetchingImdb(true);
        try {
          const data = await fetchContentDataWithAI(content.title);
          if (data) {
            setImdbData({
              title: data.title,
              year: data.year,
              description: data.description,
              cast: data.cast.join(', '),
              posterUrl: data.posterUrl,
              rating: 'N/A' // AI service doesn't return rating
            });
          }
        } catch (error) {
          console.error("Error fetching data with AI:", error);
        } finally {
          setFetchingImdb(false);
        }
      };
      fetchImdb();
    }
  }, [content?.title]);

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
    const userRef = doc(db, 'users', profile.uid);
    if (profile.watchLater?.includes(content.id)) {
      await updateDoc(userRef, { watchLater: arrayRemove(content.id) });
    } else {
      await updateDoc(userRef, { watchLater: arrayUnion(content.id) });
    }
  };

  const toggleFavorite = async () => {
    if (!profile) return;
    const userRef = doc(db, 'users', profile.uid);
    if (profile.favorites?.includes(content.id)) {
      await updateDoc(userRef, { favorites: arrayRemove(content.id) });
    } else {
      await updateDoc(userRef, { favorites: arrayUnion(content.id) });
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
    if (!canPlay) {
      if (isPending) setAlertConfig({ isOpen: true, title: 'Account Pending', message: 'Your account is pending admin approval. Please contact admin to activate your account.' });
      else if (isExpired) setAlertConfig({ isOpen: true, title: 'Membership Expired', message: 'Your membership has expired. Please renew to continue watching.' });
      else if ((isTemp || isSelectedContent) && !isAssigned) setAlertConfig({ isOpen: true, title: 'Access Denied', message: 'You do not have permission to watch this content.' });
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
      // Fallback to original URL if shortening fails
    }

    const shareData = {
      title: `${formatContentTitle(content)} (${content.year})`,
      text: `🎬 *${formatContentTitle(content)} (${content.year})*\n\n` +
            `🗣️ *Language:* ${contentLangs || 'N/A'}\n` +
            `🎭 *Genre:* ${contentGenres || 'N/A'}\n` +
            `🖨️ *Print Quality:* ${qualities.find(q => q.id === content.qualityId)?.name || 'N/A'}\n` +
            (profile?.phone ? `📱 *WhatsApp:* ${profile.phone}\n\n` : '\n') +
            `Watch it here:`,
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
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      {/* Hero Section */}
      <div className="relative h-[60vh] md:h-[70vh] w-full">
        <div className="absolute inset-0">
          <img src={content.posterUrl || 'https://picsum.photos/seed/movie/1920/1080'} alt={content.title} className="w-full h-full object-cover opacity-30" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
        </div>
        
        <div className="absolute top-0 left-0 w-full p-4 z-[100] pointer-events-none">
          <button 
            onClick={() => navigate('/')} 
            className="inline-flex items-center gap-2 text-zinc-300 hover:text-white bg-black/40 backdrop-blur-md px-4 py-2 rounded-full transition-colors pointer-events-auto cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
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
                  <span className="bg-zinc-800 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-zinc-700">
                    {qualities.find(q => q.id === content.qualityId)?.name}
                  </span>
                )}
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">{formatContentTitle(content)}</h1>
              
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-300 mb-6">
                {contentGenres && <span>{contentGenres}</span>}
                {contentGenres && contentLangs && <span>•</span>}
                {contentLangs && <span>{contentLangs}</span>}
              </div>

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
                  className={`p-4 rounded-xl border transition-colors ${profile?.watchLater?.includes(content.id) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300'}`}
                  title="Watch Later"
                >
                  <Clock className="w-5 h-5" />
                </button>
                
                <button
                  onClick={toggleFavorite}
                  className={`p-4 rounded-xl border transition-colors ${profile?.favorites?.includes(content.id) ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300'}`}
                  title="Favorite"
                >
                  <Heart className={`w-5 h-5 ${profile?.favorites?.includes(content.id) ? 'fill-current' : ''}`} />
                </button>

                <button
                  onClick={handleShare}
                  className="p-4 rounded-xl border bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors"
                  title="Share"
                >
                  <Share2 className="w-5 h-5" />
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
        {!canPlay && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-2xl mb-12 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-lg mb-1">Access Restricted</h3>
              <p className="text-red-400 mb-4">
                {isPending ? 'Your account is pending admin approval.' : 
                 isExpired ? 'Your membership has expired.' : 
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
            {fetchingImdb ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
              </div>
            ) : imdbData ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8">
                {imdbData.posterUrl && imdbData.posterUrl.trim() !== "" && (
                  <img src={imdbData.posterUrl} alt="IMDb Poster" className="w-32 md:w-48 mx-auto md:mx-0 rounded-xl shadow-lg object-cover" referrerPolicy="no-referrer" />
                )}
                <div className="flex-1 space-y-4">
                  <h2 className="text-3xl font-bold text-yellow-500">
                    {imdbData.title} {imdbData.year ? `(${imdbData.year})` : ''}
                  </h2>
                  
                  <div className="flex flex-wrap gap-4 text-sm font-medium text-yellow-500/80">
                    {imdbData.releaseDate && <span>Release: {imdbData.releaseDate}</span>}
                    {imdbData.duration && <span>Duration: {imdbData.duration}</span>}
                    {imdbData.rating && <span>IMDb Rating: ⭐ {imdbData.rating}</span>}
                  </div>
                  
                  {(imdbData.description || content.description) && (
                    <div>
                      <h3 className="text-lg font-bold text-yellow-500 mb-2">Synopsis</h3>
                      <p className="text-zinc-300 leading-relaxed">{imdbData.description || content.description}</p>
                    </div>
                  )}
                  
                  {(imdbData.cast || (content.cast && content.cast.length > 0)) && (
                    <div>
                      <h3 className="text-lg font-bold text-yellow-500 mb-2">Cast</h3>
                      <div className="flex flex-wrap gap-2">
                        {(imdbData.cast ? imdbData.cast.split(',').map(c => c.trim()) : content.cast).map((actor, idx) => (
                          <span key={idx} className="bg-zinc-800/80 border border-zinc-700 px-3 py-1.5 rounded-full text-sm text-zinc-300">
                            {actor}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <section>
                  <h2 className="text-2xl font-bold mb-4">Synopsis</h2>
                  <p className="text-zinc-300 text-lg leading-relaxed">{content.description}</p>
                </section>

                {content.cast && content.cast.length > 0 && (
                  <section>
                    <h2 className="text-2xl font-bold mb-4">Cast</h2>
                    <div className="flex flex-wrap gap-2">
                      {content.cast.map((actor, idx) => (
                        <span key={idx} className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-full text-sm">
                          {actor}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* Links Section */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Download & Play</h2>
              
              {content.type === 'movie' && content.movieLinks && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h3 className="font-bold mb-4 text-zinc-400">Movie Links</h3>
                  {renderLinks(JSON.parse(content.movieLinks))}
                </div>
              )}

              {content.type === 'series' && content.seasons && (
                <div className="space-y-6">
                  {JSON.parse(content.seasons)
                    .filter((season: Season) => hasFullAccess || allowedSeasons.includes(season.id))
                    .map((season: Season) => (
                    <div key={season.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                      <div className="bg-zinc-950/50 p-6 border-b border-zinc-800">
                        <h3 className="text-xl font-bold">Season {season.seasonNumber}</h3>
                      </div>
                      
                      <div className="p-6 space-y-8">
                        {(() => {
                          const zipLinks = season.zipLinks || [];
                          const mkvLinks = season.mkvLinks || [];
                          const otherLinks = (season as any).otherLinks || []; // Fallback if any
                          
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
                                <div key={ep.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                  <div>
                                    <span className="text-emerald-500 font-bold mr-3">E{ep.episodeNumber}</span>
                                    <span className="font-medium">{ep.title}</span>
                                  </div>
                                  {renderLinks(ep.links)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
    </div>
  );
}
