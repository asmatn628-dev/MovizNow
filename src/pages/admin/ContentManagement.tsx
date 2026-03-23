import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { Content, Genre, Language, Quality, QualityLinks, Season, Episode, LinkDef } from '../../types';
import { Plus, Edit2, Trash2, Share2, Film, Tv, X, Save, Upload, Search, Eye, EyeOff, ArrowUp, ArrowDown, Copy, ClipboardPaste, GripVertical, Bell } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';

export default function ContentManagement() {
  const [contentList, setContentList] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });

  // Form State
  const [type, setType] = useState<'movie' | 'series'>('movie');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [trailerUrl, setTrailerUrl] = useState('');
  const [sampleUrl, setSampleUrl] = useState('');
  const [imdbLink, setImdbLink] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string>('');
  const [cast, setCast] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  
  // Movie specific
  const [movieLinks, setMovieLinks] = useState<QualityLinks>([]);
  
  // Series specific
  const [seasons, setSeasons] = useState<Season[]>([]);

  // Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'series'>('all');
  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [filterQuality, setFilterQuality] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [filterDateAdded, setFilterDateAdded] = useState<'newest' | 'oldest'>('newest');
  const [selectedContent, setSelectedContent] = useState<string[]>([]);

  const [genreSearchTerm, setGenreSearchTerm] = useState('');
  const [languageSearchTerm, setLanguageSearchTerm] = useState('');

  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [imdbCardData, setImdbCardData] = useState<{
    title: string;
    year: number;
    description: string;
    cast: string;
    posterUrl: string;
    type: 'movie' | 'series';
    genres?: string;
    rating?: string;
    releaseDate?: string;
    runtime?: string;
  } | null>(null);
  const [fetchingImdb, setFetchingImdb] = useState(false);
  const [isAutoFillModalOpen, setIsAutoFillModalOpen] = useState(false);
  const [autoFillText, setAutoFillText] = useState('');
  const [imdbSeasonsPopup, setImdbSeasonsPopup] = useState<{ isOpen: boolean; seasons: any[]; show: any; epData: any[] } | null>(null);
  const [selectedImdbSeasons, setSelectedImdbSeasons] = useState<number[]>([]);
  const [shareSeasonModal, setShareSeasonModal] = useState<{ isOpen: boolean; content: Content | null; seasons: Season[] }>({ isOpen: false, content: null, seasons: [] });
  const [notificationModal, setNotificationModal] = useState<{ isOpen: boolean; content: Content | null; status: 'idle' | 'sending' | 'success' | 'error' }>({ isOpen: false, content: null, status: 'idle' });
  const [selectedShareSeasons, setSelectedShareSeasons] = useState<number[]>([]);

  useEffect(() => {
    const unsubContent = onSnapshot(collection(db, 'content'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
      setContentList(data);
      setLoading(false);
    }, (error) => {
      console.error("Content snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'content');
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
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quality));
      setQualities(data.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return a.name.localeCompare(b.name);
      }));
    }, (error) => {
      console.error("Qualities snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'qualities');
    });
    return () => { unsubContent(); unsubGenres(); unsubLangs(); unsubQualities(); };
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && contentList.length > 0) {
      const content = contentList.find(c => c.id === editId);
      if (content) {
        handleEdit(content);
        // Clear the param so it doesn't reopen on refresh if we close it
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, contentList]);

  const resetForm = () => {
    setType('movie');
    setStatus('published');
    setTitle('');
    setDescription('');
    setPosterUrl('');
    setTrailerUrl('');
    setSampleUrl('');
    setImdbLink('');
    setSelectedGenres([]);
    setSelectedLanguages([]);
    setSelectedQuality('');
    setCast('');
    setYear(new Date().getFullYear());
    setMovieLinks([
      { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'MB' },
      { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
      { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
    ]);
    setSeasons([]);
    setEditingId(null);
  };

  const parseLinks = (linksStr: string | undefined): QualityLinks => {
    if (!linksStr) return [];
    try {
      const parsed = JSON.parse(linksStr);
      if (Array.isArray(parsed)) return parsed;
      // Convert old format
      if (typeof parsed === 'object') {
        return Object.entries(parsed).map(([name, link]: [string, any]) => ({
          id: Math.random().toString(36).substr(2, 9),
          name,
          url: link?.url || '',
          size: link?.size || '',
          unit: 'MB' as 'MB' | 'GB'
        })).filter(l => l.url);
      }
    } catch (e) {
      console.error("Error parsing links", e);
    }
    return [];
  };

  const handleEdit = (content: Content) => {
    setType(content.type);
    setStatus(content.status || 'published');
    setTitle(content.title);
    setDescription(content.description);
    setPosterUrl(content.posterUrl);
    setTrailerUrl(content.trailerUrl);
    setSampleUrl(content.sampleUrl || '');
    setImdbLink(content.imdbLink || '');
    setSelectedGenres(content.genreIds || []);
    setSelectedLanguages(content.languageIds || []);
    setSelectedQuality(content.qualityId || '');
    setCast((content.cast || []).join(', '));
    setYear(content.year);
    
    if (content.type === 'movie') {
      setMovieLinks(parseLinks(content.movieLinks));
    } else {
      setMovieLinks([]);
    }
    
    if (content.type === 'series' && content.seasons) {
      try {
        const parsedSeasons = JSON.parse(content.seasons);
        const normalizedSeasons = parsedSeasons.map((s: any) => ({
          ...s,
          zipLinks: parseLinks(JSON.stringify(s.zipLinks)),
          episodes: s.episodes.map((ep: any) => ({
            ...ep,
            links: parseLinks(JSON.stringify(ep.links))
          }))
        }));
        setSeasons(normalizedSeasons);
      } catch (e) {
        setSeasons([]);
      }
    } else {
      setSeasons([]);
    }
    
    setEditingId(content.id);
    setIsModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 900;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPosterUrl(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Sort seasons and episodes before saving
      const sortedSeasons = [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber).map(s => ({
        ...s,
        episodes: [...s.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
      }));

      const data: Partial<Content> = {
        type,
        status,
        title,
        description,
        posterUrl,
        trailerUrl,
        sampleUrl,
        imdbLink,
        genreIds: selectedGenres,
        languageIds: selectedLanguages,
        qualityId: selectedQuality,
        cast: cast.split(',').map(c => c.trim()).filter(Boolean),
        year,
        updatedAt: new Date().toISOString(),
      };

      if (type === 'movie') {
        data.movieLinks = JSON.stringify(movieLinks);
        data.seasons = JSON.stringify([]);
      } else {
        data.seasons = JSON.stringify(sortedSeasons);
        data.movieLinks = JSON.stringify([]);
      }

      const currentEditingId = editingId;
      setIsModalOpen(false);
      resetForm();

      if (currentEditingId) {
        updateDoc(doc(db, 'content', currentEditingId), data).catch(error => {
          console.error('Error saving content:', error);
          setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to save content' });
        });
      } else {
        data.createdAt = new Date().toISOString();
        addDoc(collection(db, 'content'), data).catch(error => {
          console.error('Error saving content:', error);
          setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to save content' });
        });
      }
    } catch (error) {
      console.error('Error saving content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to save content' });
    }
  };

  const processImdbSeasons = (epData: any[], selectedSeasons?: number[]) => {
    const seasonsMap = new Map<number, any[]>();
    epData.forEach((ep: any) => {
      if (selectedSeasons && !selectedSeasons.includes(ep.season)) return;
      if (!seasonsMap.has(ep.season)) seasonsMap.set(ep.season, []);
      seasonsMap.get(ep.season)!.push(ep);
    });
    
    setSeasons(prevSeasons => {
      const newSeasons = prevSeasons.map(s => ({ ...s, episodes: [...s.episodes] }));
      seasonsMap.forEach((eps, seasonNum) => {
        let seasonIndex = newSeasons.findIndex(s => s.seasonNumber === seasonNum);
        if (seasonIndex === -1) {
          newSeasons.push({
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: seasonNum,
            year: undefined,
            episodes: [],
            zipLinks: [
              { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
            ],
            mkvLinks: [
              { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
            ]
          });
          seasonIndex = newSeasons.length - 1;
        }
        
        const currentSeason = newSeasons[seasonIndex];
        const newEpisodes = currentSeason.episodes;
        
        eps.forEach(ep => {
          const epIndex = newEpisodes.findIndex(e => e.episodeNumber === ep.number);
          if (epIndex === -1) {
            newEpisodes.push({
              id: Math.random().toString(36).substr(2, 9),
              episodeNumber: ep.number,
              title: ep.name,
              links: [
                { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }
              ]
            });
          } else {
            newEpisodes[epIndex].title = ep.name;
          }
          
          if (ep.number === 1 && ep.airdate) {
              currentSeason.year = parseInt(ep.airdate.substring(0, 4));
          } else if (!currentSeason.year && ep.airdate) {
              currentSeason.year = parseInt(ep.airdate.substring(0, 4));
          }
        });
        
        currentSeason.episodes = newEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      });
      return newSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
    });
  };

  const fetchImdbData = async (link: string) => {
    const ttMatch = link.match(/tt\d+/);
    if (!ttMatch) return;
    const ttId = ttMatch[0];
    
    try {
      setFetchingImdb(true);
      setImdbCardData(null);
      
      let fetchedData: any = {
        title: '',
        year: new Date().getFullYear(),
        description: '',
        cast: '',
        posterUrl: '',
        type: 'movie' as 'movie' | 'series',
        rating: '',
        genres: '',
        releaseDate: '',
        runtime: ''
      };

      // Try TVMaze first (great for series)
      const tvmazeRes = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${ttId}`);
      if (tvmazeRes.ok) {
        const show = await tvmazeRes.json();
        fetchedData.title = show.name;
        fetchedData.description = show.summary?.replace(/<[^>]*>?/gm, '') || '';
        if (show.image?.original) fetchedData.posterUrl = show.image.original;
        if (show.premiered) {
          fetchedData.year = parseInt(show.premiered.substring(0, 4));
          fetchedData.releaseDate = show.premiered;
        }
        if (show.runtime) fetchedData.runtime = `${show.runtime} min`;
        if (show.genres) fetchedData.genres = show.genres.join(', ');
        if (show.rating?.average) fetchedData.rating = `${show.rating.average}/10`;
        fetchedData.type = 'series';
        
        // Fetch cast
        try {
          const castRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/cast`);
          if (castRes.ok) {
            const castData = await castRes.json();
            fetchedData.cast = castData.slice(0, 5).map((c: any) => c.person.name).join(', ');
          } else {
            console.error("TVMaze cast fetch failed", castRes.status, castRes.statusText);
          }
        } catch (e) {
          console.error("TVMaze cast fetch error", e);
        }
        
        // Fetch episodes
        try {
          const epRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/episodes`);
          if (epRes.ok) {
            const epData = await epRes.json();
            const seasonsMap = new Map<number, any[]>();
            epData.forEach((ep: any) => {
              if (!seasonsMap.has(ep.season)) seasonsMap.set(ep.season, []);
              seasonsMap.get(ep.season)!.push(ep);
            });
            
            const availableSeasons = Array.from(seasonsMap.keys()).sort((a, b) => a - b);
            
            if (availableSeasons.length > 1) {
              setSelectedImdbSeasons(availableSeasons);
              setImdbSeasonsPopup({
                isOpen: true,
                seasons: availableSeasons,
                show: show,
                epData: epData
              });
              setFetchingImdb(false);
            } else {
              processImdbSeasons(epData);
            }
          } else {
            console.error("TVMaze episodes fetch failed", epRes.status, epRes.statusText);
          }
        } catch (e) {
          console.error("TVMaze episodes fetch error", e);
        }
      } else {
        console.error("TVMaze lookup failed", tvmazeRes.status, tvmazeRes.statusText);
      }
      
      // Fallback for movies or if TVMaze fails
      try {
        const suggestRes = await fetch(`/api/imdb/suggestion/${ttId}`);
        if (suggestRes.ok) {
          const suggestData = await suggestRes.json();
          const item = suggestData.d?.[0];
          if (item) {
            fetchedData.title = item.l || fetchedData.title;
            fetchedData.year = item.y || fetchedData.year;
            fetchedData.cast = item.s || fetchedData.cast;
            if (item.i?.imageUrl) fetchedData.posterUrl = item.i.imageUrl;
            fetchedData.type = item.q === 'TV series' ? 'series' : 'movie';
          }
        } else {
          console.error("IMDb suggestion fetch failed", suggestRes.status, suggestRes.statusText);
        }
      } catch (e) {
        console.error("IMDb suggestion fetch error", e);
      }
      
      try {
        const proxyUrl = `/api/imdb/title/${ttId}`;
        let pageRes = await fetch(proxyUrl);
        let html = '';
        
        if (pageRes.ok) {
          html = await pageRes.text();
        }
        
        if (html) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          let newDesc = fetchedData.description;
          const descEl = doc.querySelector('[data-testid="plot-xl"]') || 
                         doc.querySelector('[data-testid="plot-l"]') ||
                         doc.querySelector('[data-testid="plot-xs"]') ||
                         doc.querySelector('.ipc-html-content-inner-div');
          
          if (descEl && (!fetchedData.description || fetchedData.description.length < 50)) {
            newDesc = descEl.textContent?.trim() || fetchedData.description;
          }
          
          const ratingEl = doc.querySelector('[data-testid="hero-rating-bar__aggregate-rating__score"] span');
          if (ratingEl && !fetchedData.rating) {
            fetchedData.rating = `${ratingEl.textContent}/10`;
          }

          const genresEls = doc.querySelectorAll('[data-testid="genres"] a, .ipc-chip-list__scroller a');
          if (genresEls.length > 0 && !fetchedData.genres) {
            const genresArr: string[] = [];
            genresEls.forEach(el => {
              if (el.textContent) genresArr.push(el.textContent.trim());
            });
            fetchedData.genres = [...new Set(genresArr)].join(', ');
          }

          const metadataItems = doc.querySelectorAll('[data-testid="hero-title-block__metadata"] li');
          if (metadataItems.length > 0) {
            metadataItems.forEach(item => {
              const text = item.textContent || '';
              if (text.includes('h') && text.includes('m')) {
                if (!fetchedData.runtime) fetchedData.runtime = text.trim();
              } else if (text.match(/^\d{4}$/)) {
                if (!fetchedData.year) fetchedData.year = parseInt(text);
              }
            });
          }

          const releaseDateEl = doc.querySelector('[data-testid="title-details-releasedate"] a');
          if (releaseDateEl && !fetchedData.releaseDate) {
            fetchedData.releaseDate = releaseDateEl.textContent?.trim().split(' (')[0] || '';
          }

          fetchedData.description = newDesc;
        } else {
          console.error("IMDb proxy fetch failed", pageRes.status, pageRes.statusText);
        }
      } catch (e) {
        console.error("IMDb proxy fetch error", e);
      }

      setImdbCardData(fetchedData);
      
    } catch (error) {
      console.error("Error fetching IMDb data:", error);
    } finally {
      setFetchingImdb(false);
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const currentDeleteId = deleteId;
    setDeleteId(null);
    deleteDoc(doc(db, 'content', currentDeleteId)).catch(error => {
      console.error('Error deleting content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete content' });
    });
  };

  const handleSendNotification = async () => {
    if (!notificationModal.content) return;
    
    setNotificationModal(prev => ({ ...prev, status: 'sending' }));
    
    try {
      const content = notificationModal.content;
      const notification = {
        title: `🎬 New ${content.type === 'movie' ? 'Movie' : 'Series'} Added: ${content.title}`,
        body: content.description.substring(0, 100) + (content.description.length > 100 ? '...' : ''),
        contentId: content.id,
        posterUrl: content.posterUrl,
        type: content.type,
        createdAt: new Date().toISOString(),
        createdBy: 'admin' // In a real app, this would be the admin's UID
      };

      await addDoc(collection(db, 'notifications'), notification);
      
      setNotificationModal(prev => ({ ...prev, status: 'success' }));
      
      // Close modal after 2 seconds on success
      setTimeout(() => {
        setNotificationModal({ isOpen: false, content: null, status: 'idle' });
      }, 2000);
      
    } catch (error) {
      console.error('Error sending notification:', error);
      setNotificationModal(prev => ({ ...prev, status: 'error' }));
    }
  };

  const getSizeInMB = (sizeStr: string, unit: string) => {
    const size = parseFloat(sizeStr) || 0;
    return unit === 'GB' ? size * 1024 : size;
  };

  const handleShare = (content: Content) => {
    if (content.type === 'series' && content.seasons) {
      try {
        const parsedSeasons: Season[] = JSON.parse(content.seasons);
        if (parsedSeasons.length > 1) {
          setShareSeasonModal({ isOpen: true, content, seasons: parsedSeasons });
          setSelectedShareSeasons(parsedSeasons.map(s => s.seasonNumber));
          return;
        }
      } catch (e) {
        console.error("Error parsing seasons for share:", e);
        setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to parse content data.' });
        return;
      }
    }
    executeShare(content);
  };

  const executeShare = async (content: Content, selectedSeasonNumbers?: number[]) => {
    let text = `🎬 *${content.title}${content.year ? ` (${content.year})` : ''}*\n\n`;
    
    const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
    if (contentGenres) text += `🎭 Genres: ${contentGenres}\n`;
    
    const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
    if (contentLangs) text += `🗣️ Languages: ${contentLangs}\n`;

    const contentQuality = qualities.find(q => q.id === content.qualityId)?.name;
    if (contentQuality) text += `🖨️ Print Quality: ${contentQuality}\n`;
    if (content.sampleUrl) text += `📽️ Sample: ${content.sampleUrl}\n\n`;
    else text += `\n`;

    if (content.type === 'movie' && content.movieLinks) {
      const links: QualityLinks = parseLinks(content.movieLinks);
      const sortedLinks = [...links].sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
      
      const zipLinks = sortedLinks.filter(l => l.name.toLowerCase().includes('zip'));
      const mkvLinks = sortedLinks.filter(l => l.name.toLowerCase().includes('mkv'));
      const otherLinks = sortedLinks.filter(l => !l.name.toLowerCase().includes('zip') && !l.name.toLowerCase().includes('mkv'));

      text += `📥 *Download Links:*\n`;
      if (zipLinks.length > 0) {
        text += `\n📦 *ZIP Files:*\n`;
        zipLinks.forEach(l => { if (l.url) text += `▪️ ${l.name} (${l.size}${l.unit}): ${l.url}\n`; });
      }
      if (mkvLinks.length > 0) {
        text += `\n🎞️ *MKV Files:*\n`;
        mkvLinks.forEach(l => { if (l.url) text += `▪️ ${l.name} (${l.size}${l.unit}): ${l.url}\n`; });
      }
      if (otherLinks.length > 0) {
        if (zipLinks.length > 0 || mkvLinks.length > 0) text += `\n📄 *Other Files:*\n`;
        otherLinks.forEach(l => { if (l.url) text += `▪️ ${l.name} (${l.size}${l.unit}): ${l.url}\n`; });
      }
    } else if (content.type === 'series' && content.seasons) {
      const parsedSeasons: Season[] = JSON.parse(content.seasons);
      const seasonsToShare = selectedSeasonNumbers 
        ? parsedSeasons.filter(s => selectedSeasonNumbers.includes(s.seasonNumber))
        : parsedSeasons;

      seasonsToShare.forEach(season => {
        text += `\n📺 *Season ${season.seasonNumber}${season.year ? ` (${season.year})` : content.year ? ` (${content.year})` : ''}*\n`;
        const zipLinks = parseLinks(JSON.stringify(season.zipLinks)).sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
        const mkvLinks = parseLinks(JSON.stringify(season.mkvLinks || [])).sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
        
        if (zipLinks.length > 0) {
          text += `📦 *Full Season ZIP:*\n`;
          zipLinks.forEach((link) => {
            if (link && link.url) {
              text += `  ▪️ ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
            }
          });
        }
        if (mkvLinks.length > 0) {
          text += `\n🎞️ *Full Season MKV:*\n`;
          mkvLinks.forEach((link) => {
            if (link && link.url) {
              text += `  ▪️ ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
            }
          });
        }
        if (season.episodes && season.episodes.length > 0) {
          text += `\n🎬 *Episodes:*\n`;
          season.episodes.forEach(ep => {
            text += `  E${ep.episodeNumber}: ${ep.title}\n`;
            const epLinks = parseLinks(JSON.stringify(ep.links)).sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
            epLinks.forEach((link) => {
              if (link && link.url) {
                text += `    - ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
              }
            });
          });
        }
      });
    }

    text += `\n🍿 Enjoy watching on MovizNow!\n📞 WhatsApp: 03363284466`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: content.title,
          text: text,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const encodedText = encodeURIComponent(text);
          window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        }
      }
    } else {
      const encodedText = encodeURIComponent(text);
      window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    }
  };

  const handleCopyData = async (content: Content) => {
    if (!content.posterUrl) {
      setAlertConfig({ isOpen: true, title: 'Poster Required', message: 'Cannot copy data because poster URL is missing.' });
      return;
    }

    let text = `🎬 *${content.title}${content.year ? ` (${content.year})` : ''}*\n\n`;
    text += `Type: ${content.type.charAt(0).toUpperCase() + content.type.slice(1)}\n`;
    
    const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
    if (contentGenres) text += `🎭 Genres: ${contentGenres}\n`;
    
    const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
    if (contentLangs) text += `🗣️ Languages: ${contentLangs}\n`;

    const contentQuality = qualities.find(q => q.id === content.qualityId)?.name;
    if (contentQuality) text += `🖨️ Print Quality: ${contentQuality}\n`;

    if (content.imdbLink) text += `⭐ IMDb: ${content.imdbLink}\n`;
    if (content.trailerUrl) text += `🎥 Trailer: ${content.trailerUrl}\n`;
    if (content.sampleUrl) text += `📽️ Sample: ${content.sampleUrl}\n`;
    if (content.posterUrl) text += `🖼️ Poster: ${content.posterUrl}\n`;
    if (content.cast && content.cast.length > 0) text += `👥 Cast: ${content.cast.join(', ')}\n`;
    if (content.description) text += `📝 Description: ${content.description}\n\n`;

    if (content.type === 'movie' && content.movieLinks) {
      const links: QualityLinks = parseLinks(content.movieLinks);
      text += `📥 *Download Links:*\n`;
      links.forEach(l => {
        if (l.url) text += `▪️ ${l.name} (${l.size}${l.unit}): ${l.url}\n`;
      });
    } else if (content.type === 'series' && content.seasons) {
      try {
        const parsedSeasons: Season[] = JSON.parse(content.seasons);
        parsedSeasons.forEach(season => {
          text += `\n📺 *Season ${season.seasonNumber}${season.year ? ` (${season.year})` : content.year ? ` (${content.year})` : ''}*\n`;
          const zipLinks = parseLinks(JSON.stringify(season.zipLinks));
          const mkvLinks = parseLinks(JSON.stringify(season.mkvLinks || []));
          
          if (zipLinks.length > 0) {
            text += `📦 *Full Season ZIP:*\n`;
            zipLinks.forEach((link) => {
              if (link && link.url) text += `  ▪️ ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
            });
          }
          if (mkvLinks.length > 0) {
            text += `\n🎞️ *Full Season MKV:*\n`;
            mkvLinks.forEach((link) => {
              if (link && link.url) text += `  ▪️ ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
            });
          }
          if (season.episodes && season.episodes.length > 0) {
            text += `\n🎬 *Episodes:*\n`;
            season.episodes.forEach(ep => {
              text += `  E${ep.episodeNumber}: ${ep.title}\n`;
              const epLinks = parseLinks(JSON.stringify(ep.links));
              epLinks.forEach((link) => {
                if (link && link.url) text += `    - ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
              });
            });
          }
        });
      } catch (e) {
        console.error("Error parsing seasons for copy:", e);
        text += `\n⚠️ Error parsing season data.\n`;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setAlertConfig({ isOpen: true, title: 'Success', message: 'All data copied to clipboard!' });
    } catch (err) {
      console.error('Error copying data:', err);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to copy data' });
    }
  };

  const handleAutoFill = () => {
    if (!autoFillText) return;

    const lines = autoFillText.split('\n');
    let newTitle = '';
    let newYear = year;
    let newType: 'movie' | 'series' = type;
    let newDescription = '';
    let newCast = '';
    let newImdb = '';
    let newTrailer = '';
    let newSample = '';
    let newPoster = '';
    let newGenreIds: string[] = [];
    let newLanguageIds: string[] = [];
    let newQualityId = '';
    let newMovieLinks: QualityLinks = [];
    let newSeasons: Season[] = [];

    const findGenreId = (name: string) => genres.find(g => g.name.toLowerCase() === name.toLowerCase())?.id;
    const findLanguageId = (name: string) => languages.find(l => l.name.toLowerCase() === name.toLowerCase())?.id;
    const findQualityId = (name: string) => qualities.find(q => q.name.toLowerCase() === name.toLowerCase())?.id;

    let currentSeason: Season | null = null;
    let currentEpisode: Episode | null = null;
    let linkSection: 'movie' | 'zip' | 'mkv' | 'episode' | null = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Title and Year: 🎬 *Title (Year)* or Title (Year)
      const titleYearMatch = trimmed.match(/🎬?\s*\*?([^(]+)\s*\((\d{4})\)\*?/);
      if (titleYearMatch) {
        newTitle = titleYearMatch[1].trim();
        newYear = parseInt(titleYearMatch[2]);
      }

      // Type
      if (trimmed.toLowerCase().includes('type: movie')) newType = 'movie';
      if (trimmed.toLowerCase().includes('type: series')) newType = 'series';

      // Genres
      if (trimmed.includes('🎭 Genres:')) {
        const genreNames = trimmed.split('🎭 Genres:')[1].split(',').map(s => s.trim());
        newGenreIds = genreNames.map(findGenreId).filter(Boolean) as string[];
      }

      // Languages
      if (trimmed.includes('🗣️ Languages:')) {
        const langNames = trimmed.split('🗣️ Languages:')[1].split(',').map(s => s.trim());
        newLanguageIds = langNames.map(findLanguageId).filter(Boolean) as string[];
      }

      // Quality
      if (trimmed.includes('📺 Quality:')) {
        const qName = trimmed.split('📺 Quality:')[1].trim();
        newQualityId = findQualityId(qName) || '';
      }

      // IMDb
      if (trimmed.includes('IMDb:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newImdb = match[0];
      }

      // Trailer
      if (trimmed.includes('Trailer:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newTrailer = match[0];
      }

      // Sample
      if (trimmed.includes('Sample:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newSample = match[0];
      }

      // Poster
      if (trimmed.includes('Poster:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newPoster = match[0];
      }

      // Cast
      if (trimmed.includes('👥 Cast:')) {
        newCast = trimmed.split('👥 Cast:')[1].trim();
      }

      // Description
      if (trimmed.includes('📝 Description:')) {
        newDescription = trimmed.split('📝 Description:')[1].trim();
      }

      // Links Detection
      if (trimmed.includes('Download Links:')) {
        linkSection = 'movie';
        newType = 'movie';
      }
      if (trimmed.includes('Full Season ZIP:')) {
        linkSection = 'zip';
        newType = 'series';
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
      }
      if (trimmed.includes('Full Season MKV:')) {
        linkSection = 'mkv';
        newType = 'series';
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
      }
      if (trimmed.includes('Episodes:')) {
        linkSection = 'episode';
        newType = 'series';
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
      }

      // Season Detection: 📺 *Season X (Year)*
      const seasonMatch = trimmed.match(/📺?\s*\*?Season\s*(\d+)/i);
      if (seasonMatch) {
        newType = 'series';
        const sNum = parseInt(seasonMatch[1]);
        currentSeason = {
          id: Math.random().toString(36).substr(2, 9),
          seasonNumber: sNum,
          zipLinks: [],
          mkvLinks: [],
          episodes: []
        };
        newSeasons.push(currentSeason);
      }

      // Episode Detection: E1: Title or - E1: Title
      const epMatch = trimmed.match(/E(\d+):\s*(.*)/i);
      if (epMatch) {
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
        const epNum = parseInt(epMatch[1]);
        currentEpisode = {
          id: Math.random().toString(36).substr(2, 9),
          episodeNumber: epNum,
          title: epMatch[2].trim(),
          links: []
        };
        currentSeason.episodes.push(currentEpisode);
        linkSection = 'episode';
      }

      // Link Parsing
      // Skip metadata lines that might contain URLs to avoid adding them as download links
      if (trimmed.startsWith('IMDb:') || trimmed.startsWith('Trailer:') || trimmed.startsWith('Sample:') || trimmed.startsWith('Poster:')) {
        return;
      }

      const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && linkSection) {
        let url = urlMatch[1];
        
        // Auto-convert /api/file/ to /u/ and /api/list/ to /l/
        if (url.includes('/api/file/')) {
          url = url.replace('/api/file/', '/u/');
        } else if (url.includes('/api/list/')) {
          url = url.replace('/api/list/', '/l/');
        }
        
        const sizeMatch = trimmed.match(/([\d.]+)\s*(MB|GB)/i);
        const size = sizeMatch ? sizeMatch[1] : '';
        const unit = sizeMatch ? sizeMatch[2].toUpperCase() as 'MB' | 'GB' : 'MB';
        
        let name = '';
        if (sizeMatch) {
          name = trimmed.substring(0, sizeMatch.index)
            .replace(/^[▪️\-*•\s]+/, '')
            .replace(/[\[\]():]/g, '')
            .replace(/[\-*\s]+$/, '')
            .trim();
        } else {
          name = trimmed.substring(0, urlMatch.index)
            .replace(/^[▪️\-*•\s]+/, '')
            .replace(/[\[\]():]/g, '')
            .replace(/[\-*\s]+$/, '')
            .trim();
        }
        
        if (!name || name.toLowerCase() === 'download' || name.toLowerCase() === 'link') {
          let count = 1;
          if (linkSection === 'movie') count = newMovieLinks.length + 1;
          else if (linkSection === 'zip' && currentSeason) count = currentSeason.zipLinks.length + 1;
          else if (linkSection === 'mkv' && currentSeason) count = (currentSeason.mkvLinks?.length || 0) + 1;
          else if (linkSection === 'episode' && currentEpisode) count = currentEpisode.links.length + 1;
          name = `Link ${count}`;
        }

        const link: LinkDef = {
          id: Math.random().toString(36).substr(2, 9),
          name,
          size,
          unit,
          url
        };

        if (linkSection === 'movie') {
          newMovieLinks.push(link);
        } else if (linkSection === 'zip' && currentSeason) {
          currentSeason.zipLinks.push(link);
        } else if (linkSection === 'mkv' && currentSeason) {
          if (!currentSeason.mkvLinks) currentSeason.mkvLinks = [];
          currentSeason.mkvLinks.push(link);
        } else if (linkSection === 'episode' && currentEpisode) {
          currentEpisode.links.push(link);
        }
      }
    });

    if (newTitle) setTitle(newTitle);
    if (newYear) setYear(newYear);
    setType(newType);
    if (newDescription) setDescription(newDescription);
    if (newCast) setCast(newCast);
    if (newImdb) setImdbLink(newImdb);
    if (newTrailer) setTrailerUrl(newTrailer);
    if (newSample) setSampleUrl(newSample);
    if (newPoster) setPosterUrl(newPoster);
    if (newGenreIds.length > 0) setSelectedGenres(newGenreIds);
    if (newLanguageIds.length > 0) setSelectedLanguages(newLanguageIds);
    if (newQualityId) setSelectedQuality(newQualityId);
    if (newMovieLinks.length > 0) setMovieLinks(newMovieLinks);
    if (newSeasons.length > 0) setSeasons(newSeasons);

    setIsAutoFillModalOpen(false);
    setAutoFillText('');
    setAlertConfig({ isOpen: true, title: 'Success', message: 'Data auto-filled successfully!' });
  };

  const renderQualityInputs = (
    links: QualityLinks, 
    onChange: React.Dispatch<React.SetStateAction<QualityLinks>>,
    droppableId: string
  ) => {
    const handleUrlBlur = async (url: string, idx: number) => {
      const match = url.match(/pixeldrain\.(com|dev)\/(u|api\/file)\/([a-zA-Z0-9]+)/);
      if (match) {
        const id = match[3];
        try {
          const res = await fetch(`https://pixeldrain.com/api/file/${id}/info`);
          if (res.ok) {
            const data = await res.json();
            if (data.size) {
              let sizeInBytes = data.size;
              let size = 0;
              let unit: 'MB' | 'GB' = 'MB';
              
              if (sizeInBytes >= 1000 * 1000 * 1000) {
                size = sizeInBytes / (1000 * 1000 * 1000);
                unit = 'GB';
              } else {
                size = sizeInBytes / (1000 * 1000);
                unit = 'MB';
              }
              
              onChange(prevLinks => {
                const newLinks = [...prevLinks];
                if (newLinks[idx]) {
                  newLinks[idx] = {
                    ...newLinks[idx],
                    size: size.toFixed(2).replace(/\.00$/, ''),
                    unit: unit
                  };
                }
                return newLinks;
              });
            }
          }
        } catch (e) {
          console.error("Failed to fetch PixelDrain info", e);
        }
      }
    };

    const onDragEnd = (result: DropResult) => {
      if (!result.destination) return;
      const items = Array.from(links);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);
      onChange(items);
    };

    return (
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={droppableId}>
          {(provided) => (
            <div 
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-3"
            >
              {links.map((link, idx) => (
                <Draggable key={link.id} draggableId={link.id} index={idx}>
                  {(provided, snapshot) => (
                    <div 
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`flex flex-col gap-2 bg-zinc-900 p-3 rounded-xl border ${snapshot.isDragging ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 z-50' : 'border-zinc-800'} transition-all`}
                    >
                        {/* 1st line: Name field */}
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Name (e.g. 1080p, WEB-DL)"
                            value={link.name}
                            onChange={(e) => {
                              onChange(prev => {
                                const newLinks = [...prev];
                                newLinks[idx] = { ...newLinks[idx], name: e.target.value };
                                return newLinks;
                              });
                            }}
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        {/* 2nd line: Size, Unit, Delete, Drag and drop */}
                        <div className="flex gap-2 items-center">
                          <div className="flex gap-2 items-center shrink-0">
                            <input
                              type="number"
                              placeholder="Size"
                              value={link.size}
                              onChange={(e) => {
                                onChange(prev => {
                                  const newLinks = [...prev];
                                  newLinks[idx] = { ...newLinks[idx], size: e.target.value };
                                  return newLinks;
                                });
                              }}
                              className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-emerald-500"
                            />
                            <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onChange(prev => {
                                    const newLinks = [...prev];
                                    newLinks[idx] = { ...newLinks[idx], unit: 'MB' };
                                    return newLinks;
                                  });
                                }}
                                className={`px-2 py-1 rounded-md text-xs font-bold transition-all ${link.unit === 'MB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                MB
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onChange(prev => {
                                    const newLinks = [...prev];
                                    newLinks[idx] = { ...newLinks[idx], unit: 'GB' };
                                    return newLinks;
                                  });
                                }}
                                className={`px-2 py-1 rounded-md text-xs font-bold transition-all ${link.unit === 'GB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                              >
                                GB
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onChange(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 ml-auto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div {...provided.dragHandleProps} className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="URL"
                          value={link.url}
                          onChange={(e) => {
                            onChange(prev => {
                              const newLinks = [...prev];
                              newLinks[idx] = { ...newLinks[idx], url: e.target.value };
                              return newLinks;
                            });
                          }}
                          onBlur={(e) => handleUrlBlur(e.target.value, idx)}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              <button
                type="button"
                onClick={() => {
                  onChange(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: '', url: '', size: '', unit: 'MB' }]);
                }}
                className="w-full py-2 border-2 border-dashed border-zinc-800 rounded-lg text-zinc-500 hover:text-emerald-500 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add New Link
              </button>
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );
  };

  const uniqueYears = useMemo(() => {
    const years = new Set(contentList.map(c => c.year));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [contentList]);

  const filteredContent = useMemo(() => {
    let result = contentList;
    if (filterType !== 'all') {
      result = result.filter(c => c.type === filterType);
    }
    if (filterGenre !== 'all') {
      result = result.filter(c => c.genreIds?.includes(filterGenre));
    }
    if (filterLanguage !== 'all') {
      result = result.filter(c => c.languageIds?.includes(filterLanguage));
    }
    if (filterQuality !== 'all') {
      result = result.filter(c => c.qualityId === filterQuality);
    }
    if (filterYear !== 'all') {
      result = result.filter(c => c.year === parseInt(filterYear));
    }
    if (filterStatus !== 'all') {
      result = result.filter(c => (c.status || 'published') === filterStatus);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(c => c.title.toLowerCase().includes(lower));
    }
    
    result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return filterDateAdded === 'newest' ? timeB - timeA : timeA - timeB;
    });
    
    return result;
  }, [contentList, searchTerm, filterType, filterGenre, filterLanguage, filterQuality, filterYear, filterStatus, filterDateAdded]);

  const filteredGenres = useMemo(() => {
    if (!genreSearchTerm) return genres;
    const lower = genreSearchTerm.toLowerCase();
    return genres.filter(g => g.name.toLowerCase().includes(lower));
  }, [genres, genreSearchTerm]);

  const filteredLanguages = useMemo(() => {
    if (!languageSearchTerm) return languages;
    const lower = languageSearchTerm.toLowerCase();
    return languages.filter(l => l.name.toLowerCase().includes(lower));
  }, [languages, languageSearchTerm]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedContent(filteredContent.map(c => c.id));
    } else {
      setSelectedContent([]);
    }
  };

  const handleSelectContent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedContent(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleBulkStatusChange = (status: 'published' | 'draft') => {
    if (!window.confirm(`Are you sure you want to change the status of ${selectedContent.length} items to ${status}?`)) return;
    
    const currentSelected = [...selectedContent];
    setSelectedContent([]);
    
    const batch = writeBatch(db);
    currentSelected.forEach(id => {
      const contentRef = doc(db, 'content', id);
      batch.update(contentRef, { status });
    });
    batch.commit().catch(error => {
      console.error('Error updating content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update content' });
    });
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedContent.length} items? This action cannot be undone.`)) return;
    
    const currentSelected = [...selectedContent];
    setSelectedContent([]);
    
    const batch = writeBatch(db);
    currentSelected.forEach(id => {
      const contentRef = doc(db, 'content', id);
      batch.delete(contentRef);
    });
    batch.commit().catch(error => {
      console.error('Error deleting content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete content' });
    });
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">Movies & Series</h1>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search content..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {selectedContent.length > 0 && (
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
                <span className="text-sm text-zinc-400">{selectedContent.length} selected</span>
                <select
                  onChange={(e) => {
                    if (e.target.value === 'delete') {
                      handleBulkDelete();
                    } else if (e.target.value) {
                      handleBulkStatusChange(e.target.value as any);
                    }
                    e.target.value = '';
                  }}
                  className="bg-transparent border-none text-sm focus:outline-none text-emerald-500 font-medium cursor-pointer"
                >
                  <option value="">Bulk Actions</option>
                  <option value="published">Publish</option>
                  <option value="draft">Draft</option>
                  <option value="delete">Delete</option>
                </select>
              </div>
            )}
            <button
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              Add Content
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500">
            <option value="all">All Types</option>
            <option value="movie">Movies</option>
            <option value="series">Series</option>
          </select>
          <select value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500">
            <option value="all">All Genres</option>
            {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500">
            <option value="all">All Languages</option>
            {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={filterQuality} onChange={(e) => setFilterQuality(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500">
            <option value="all">All Qualities</option>
            {qualities.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500">
            <option value="all">All Years</option>
            {uniqueYears.map(y => <option key={y} value={y.toString()}>{y}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500">
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <select value={filterDateAdded} onChange={(e) => setFilterDateAdded(e.target.value as any)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-emerald-500">
            <option value="newest">Newest Added</option>
            <option value="oldest">Oldest Added</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={selectedContent.length === filteredContent.length && filteredContent.length > 0}
            onChange={handleSelectAll}
            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
          />
          <span className="text-sm text-zinc-400">Select All</span>
        </div>
        <div className="text-sm text-zinc-400">
          {filteredContent.length} items found
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="text-center py-20 text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-xl">No content found matching your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
          {filteredContent.map((content) => (
            <div key={content.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col group relative">
              <div className="absolute top-2 left-2 z-10">
                <input 
                  type="checkbox" 
                  checked={selectedContent.includes(content.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleSelectContent(content.id, e as any);
                  }}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                />
              </div>
              <div className="relative aspect-[2/3]">
                <Link to={`/movie/${content.id}`} className="block w-full h-full">
                  <img src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'} alt={content.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </Link>
                <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
                  <div className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    {content.type}
                  </div>
                  {content.status === 'draft' && (
                    <div className="bg-yellow-500/90 text-black backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />
                      Draft
                    </div>
                  )}
                </div>
              </div>
              <div className="p-2 md:p-3 flex-1 flex flex-col">
                <h3 className="font-bold text-sm md:text-base mb-0.5 line-clamp-1" title={content.title}>{content.title}</h3>
                <p className="text-zinc-400 text-xs mb-2">{content.year}</p>
                
                <div className="mt-auto flex items-center justify-between pt-2 border-t border-zinc-800/50">
                  <div className="flex gap-1">
                    <button onClick={() => handleShare(content)} className="text-emerald-500 hover:text-emerald-400 p-1.5 transition-colors" title="Share to WhatsApp">
                      <Share2 className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button onClick={() => setNotificationModal({ isOpen: true, content, status: 'idle' })} className="text-blue-500 hover:text-blue-400 p-1.5 transition-colors" title="Send Notification">
                      <Bell className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button onClick={() => handleCopyData(content)} className="text-zinc-400 hover:text-white p-1.5 transition-colors" title="Copy Data">
                      <Copy className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(content)} className="text-zinc-400 hover:text-white p-1.5 transition-colors">
                      <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button onClick={() => setDeleteId(content.id)} className="text-red-500 hover:text-red-400 p-1.5 transition-colors">
                      <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl my-8 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold">{editingId ? 'Edit Content' : 'Add Content'}</h2>
                <button
                  type="button"
                  onClick={() => setIsAutoFillModalOpen(true)}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-emerald-500/20"
                >
                  <ClipboardPaste className="w-4 h-4" /> Auto-Fill from Text
                </button>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-white p-2">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form id="content-form" onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Type</label>
                      <div className="flex gap-2">
                        <label className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${type === 'movie' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>
                          <input type="radio" name="type" value="movie" checked={type === 'movie'} onChange={() => setType('movie')} className="hidden" />
                          <Film className="w-4 h-4" /> Movie
                        </label>
                        <label className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${type === 'series' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>
                          <input type="radio" name="type" value="series" checked={type === 'series'} onChange={() => setType('series')} className="hidden" />
                          <Tv className="w-4 h-4" /> Series
                        </label>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Status</label>
                      <div className="flex gap-2">
                        <label className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${status === 'published' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>
                          <input type="radio" name="status" value="published" checked={status === 'published'} onChange={() => setStatus('published')} className="hidden" />
                          <Eye className="w-4 h-4" /> Pub
                        </label>
                        <label className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${status === 'draft' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>
                          <input type="radio" name="status" value="draft" checked={status === 'draft'} onChange={() => setStatus('draft')} className="hidden" />
                          <EyeOff className="w-4 h-4" /> Draft
                        </label>
                      </div>
                    </div>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
                      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Release Year</label>
                      <input type="number" value={year || ''} onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
                    <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Poster (URL or Upload)</label>
                    <div className="flex gap-2">
                      <input type="text" placeholder="https://..." value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                      <label className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white px-3 rounded-lg cursor-pointer transition-colors">
                        <Upload className="w-4 h-4" />
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                    </div>
                    {posterUrl && (
                      <div className="mt-1 text-[10px] text-emerald-500 truncate">
                        {posterUrl.startsWith('data:image') ? 'Image uploaded successfully' : 'Using image URL'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Trailer URL (YouTube)</label>
                    <input type="url" value={trailerUrl} onChange={(e) => setTrailerUrl(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Sample URL (Optional)</label>
                    <input type="url" value={sampleUrl} onChange={(e) => setSampleUrl(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" placeholder="Sample video link" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">IMDb Link (Optional)</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input 
                          type="url" 
                          value={imdbLink} 
                          onChange={(e) => setImdbLink(e.target.value)} 
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" 
                          placeholder="https://www.imdb.com/title/..." 
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchImdbData(imdbLink)}
                        disabled={fetchingImdb || !imdbLink.includes('imdb.com/title/tt')}
                        className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center min-w-[80px]"
                      >
                        {fetchingImdb ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                        ) : (
                          'Fetch'
                        )}
                      </button>
                    </div>
                  </div>

                  {imdbCardData && (
                    <div className="md:col-span-2 bg-zinc-950 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                      <div className="w-full sm:w-32 aspect-[2/3] rounded-lg overflow-hidden flex-shrink-0">
                        {imdbCardData.posterUrl && imdbCardData.posterUrl.trim() !== "" && (
                          <img src={imdbCardData.posterUrl} alt={imdbCardData.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        )}
                      </div>
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4 className="text-lg font-bold text-emerald-500">{imdbCardData.title} ({imdbCardData.year})</h4>
                          <button 
                            type="button"
                            onClick={() => setImdbCardData(null)}
                            className="text-zinc-500 hover:text-white"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-3">
                          {imdbCardData.rating && (
                            <span className="bg-yellow-500/20 text-yellow-500 text-[10px] px-2 py-0.5 rounded border border-yellow-500/30 font-bold">
                              ⭐ {imdbCardData.rating}
                            </span>
                          )}
                          {imdbCardData.runtime && (
                            <span className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded border border-zinc-700">
                              🕒 {imdbCardData.runtime}
                            </span>
                          )}
                          {imdbCardData.genres && (
                            <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded border border-emerald-500/20">
                              {imdbCardData.genres}
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-3 mb-4">
                          {imdbCardData.description && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-zinc-500 uppercase">Description</span>
                                <button 
                                  type="button"
                                  onClick={() => setDescription(imdbCardData.description)}
                                  className="text-[10px] text-emerald-500 hover:underline"
                                >
                                  Apply Description
                                </button>
                              </div>
                              <p className="text-sm text-zinc-400 line-clamp-2">{imdbCardData.description}</p>
                            </div>
                          )}
                          
                          {imdbCardData.cast && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-zinc-500 uppercase">Cast</span>
                                <button 
                                  type="button"
                                  onClick={() => setCast(imdbCardData.cast)}
                                  className="text-[10px] text-emerald-500 hover:underline"
                                >
                                  Apply Cast
                                </button>
                              </div>
                              <p className="text-xs text-zinc-500 truncate">{imdbCardData.cast}</p>
                            </div>
                          )}
                        </div>

                        <div className="mt-auto flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTitle(imdbCardData.title);
                              setYear(imdbCardData.year);
                              setPosterUrl(imdbCardData.posterUrl);
                              setType(imdbCardData.type);
                              setImdbCardData(null);
                            }}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                          >
                            Apply Basic Info
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDescription(imdbCardData.description);
                              setCast(imdbCardData.cast);
                              setImdbCardData(null);
                            }}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                          >
                            Apply Desc & Cast
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTitle(imdbCardData.title);
                              setYear(imdbCardData.year);
                              setPosterUrl(imdbCardData.posterUrl);
                              setType(imdbCardData.type);
                              setDescription(imdbCardData.description);
                              setCast(imdbCardData.cast);
                              setImdbCardData(null);
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                          >
                            Apply All
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Print Quality</label>
                    <div className="flex flex-wrap gap-2">
                      {qualities.map(q => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setSelectedQuality(q.id)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                            selectedQuality === q.id
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                          }`}
                        >
                          {q.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Cast (comma separated)</label>
                    <input type="text" value={cast} onChange={(e) => setCast(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Genres</label>
                    <div className="flex flex-wrap gap-2">
                      {genres.map(g => {
                        const isSelected = selectedGenres.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedGenres(selectedGenres.filter(id => id !== g.id));
                              } else {
                                setSelectedGenres([...selectedGenres, g.id]);
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                              isSelected 
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' 
                                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Languages</label>
                    <div className="flex flex-wrap gap-2">
                      {languages.map(l => {
                        const isSelected = selectedLanguages.includes(l.id);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedLanguages(selectedLanguages.filter(id => id !== l.id));
                              } else {
                                setSelectedLanguages([...selectedLanguages, l.id]);
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                              isSelected 
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' 
                                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                          >
                            {l.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <hr className="border-zinc-800" />

                {type === 'movie' ? (
                  <div>
                    <h3 className="text-lg font-bold mb-4">Movie Links</h3>
                    {renderQualityInputs(movieLinks, setMovieLinks, 'movie-links')}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold">Seasons</h3>
                      <button
                        type="button"
                        onClick={() => setSeasons([...seasons, { 
                          id: Date.now().toString(), 
                          seasonNumber: seasons.length + 1, 
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
                          episodes: [] 
                        }])}
                        className="text-emerald-500 hover:text-emerald-400 text-sm font-medium flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" /> Add Season
                      </button>
                    </div>
                    
                    <div className="space-y-6">
                      {seasons.map((season, sIdx) => (
                        <div key={season.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold">Season</h4>
                                <input
                                  type="number"
                                  value={season.seasonNumber}
                                  onChange={(e) => {
                                    const newSeasons = [...seasons];
                                    newSeasons[sIdx].seasonNumber = parseInt(e.target.value) || 0;
                                    setSeasons(newSeasons);
                                  }}
                                  className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-center"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-zinc-400">Year</h4>
                                <input
                                  type="number"
                                  value={season.year || ''}
                                  onChange={(e) => {
                                    const newSeasons = [...seasons];
                                    newSeasons[sIdx].year = parseInt(e.target.value) || undefined;
                                    setSeasons(newSeasons);
                                  }}
                                  placeholder="YYYY"
                                  className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-center"
                                />
                              </div>
                            </div>
                            <button type="button" onClick={() => setSeasons(seasons.filter((_, i) => i !== sIdx))} className="text-red-500 hover:text-red-400 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="mb-6">
                            <h5 className="text-sm font-medium text-zinc-400 mb-2">Season ZIP Links</h5>
                            {renderQualityInputs(season.zipLinks, (updater) => {
                              setSeasons(prev => {
                                const newSeasons = [...prev];
                                const currentLinks = newSeasons[sIdx].zipLinks;
                                newSeasons[sIdx].zipLinks = typeof updater === 'function' ? updater(currentLinks) : updater;
                                return newSeasons;
                              });
                            }, `season-zip-${sIdx}`)}
                          </div>

                          <div className="mb-6">
                            <h5 className="text-sm font-medium text-zinc-400 mb-2">Season MKV Links</h5>
                            {renderQualityInputs(season.mkvLinks || [], (updater) => {
                              setSeasons(prev => {
                                const newSeasons = [...prev];
                                const currentLinks = newSeasons[sIdx].mkvLinks || [];
                                newSeasons[sIdx].mkvLinks = typeof updater === 'function' ? updater(currentLinks) : updater;
                                return newSeasons;
                              });
                            }, `season-mkv-${sIdx}`)}
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="text-sm font-medium text-zinc-400">Episodes</h5>
                              <button
                                type="button"
                                onClick={() => {
                                  const newSeasons = [...seasons];
                                  newSeasons[sIdx].episodes.push({
                                    id: Date.now().toString(),
                                    episodeNumber: newSeasons[sIdx].episodes.length + 1,
                                    title: `Episode ${newSeasons[sIdx].episodes.length + 1}`,
                                    links: [
                                      { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }
                                    ]
                                  });
                                  setSeasons(newSeasons);
                                }}
                                className="text-emerald-500 hover:text-emerald-400 text-xs font-medium flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Add Episode
                              </button>
                            </div>
                            
                            <div className="space-y-4">
                              {season.episodes.map((ep, eIdx) => (
                                <div key={ep.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                                  <div className="flex gap-4 mb-4">
                                    <input
                                      type="number"
                                      value={ep.episodeNumber}
                                      onChange={(e) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].episodeNumber = parseInt(e.target.value) || 0;
                                        setSeasons(newSeasons);
                                      }}
                                      className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                                      placeholder="Ep #"
                                    />
                                    <input
                                      type="text"
                                      value={ep.title}
                                      onChange={(e) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].title = e.target.value;
                                        setSeasons(newSeasons);
                                      }}
                                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                                      placeholder="Episode Title"
                                    />
                                    <button type="button" onClick={() => {
                                      const newSeasons = [...seasons];
                                      newSeasons[sIdx].episodes = newSeasons[sIdx].episodes.filter((_, i) => i !== eIdx);
                                      setSeasons(newSeasons);
                                    }} className="text-red-500 hover:text-red-400 p-2">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div className="mb-4">
                                    <h6 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Episode Links</h6>
                                    {renderQualityInputs(ep.links, (updater) => {
                                      setSeasons(prev => {
                                        const newSeasons = [...prev];
                                        const currentLinks = newSeasons[sIdx].episodes[eIdx].links;
                                        newSeasons[sIdx].episodes[eIdx].links = typeof updater === 'function' ? updater(currentLinks) : updater;
                                        return newSeasons;
                                      });
                                    }, `episode-links-${sIdx}-${eIdx}`)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="p-6 border-t border-zinc-800 flex justify-end gap-4 sticky bottom-0 bg-zinc-900 z-10 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="content-form"
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
              >
                <Save className="w-5 h-5" />
                Save Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Fill Modal */}
      {isAutoFillModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div>
                <h3 className="text-xl font-bold text-white">Auto-Fill from Text</h3>
                <p className="text-sm text-zinc-400 mt-1">Paste WhatsApp or copied data to automatically populate fields</p>
              </div>
              <button 
                onClick={() => setIsAutoFillModalOpen(false)}
                className="text-zinc-400 hover:text-white p-2 hover:bg-zinc-800 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              <textarea
                value={autoFillText}
                onChange={(e) => setAutoFillText(e.target.value)}
                placeholder="Paste your movie/series data here..."
                className="w-full h-64 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-none font-mono text-sm"
              />
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleAutoFill}
                  disabled={!autoFillText.trim()}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <ClipboardPaste className="w-5 h-5" /> Process & Auto-Fill
                </button>
                <button
                  onClick={() => {
                    setAutoFillText('');
                    setIsAutoFillModalOpen(false);
                  }}
                  className="px-8 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Content"
        message="Are you sure you want to delete this content? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <AlertModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />

      {imdbSeasonsPopup && imdbSeasonsPopup.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
            <button
              onClick={() => setImdbSeasonsPopup(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold mb-2">Select Seasons</h3>
            <p className="text-zinc-400 mb-6">Choose which seasons to fetch for "{imdbSeasonsPopup.show.name}"</p>
            
            <div className="max-h-60 overflow-y-auto space-y-2 mb-6 pr-2 custom-scrollbar">
              {imdbSeasonsPopup.seasons.map(season => (
                <label key={season} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/50 cursor-pointer border border-zinc-800/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedImdbSeasons.includes(season)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedImdbSeasons(prev => [...prev, season]);
                      } else {
                        setSelectedImdbSeasons(prev => prev.filter(s => s !== season));
                      }
                    }}
                    className="w-5 h-5 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950"
                  />
                  <span className="font-medium">Season {season}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedImdbSeasons(imdbSeasonsPopup.seasons);
                }}
                className="flex-1 py-2 px-4 rounded-xl font-medium bg-zinc-800 hover:bg-zinc-700 text-white transition-colors text-sm"
              >
                Select All
              </button>
              <button
                onClick={() => {
                  setSelectedImdbSeasons([]);
                }}
                className="flex-1 py-2 px-4 rounded-xl font-medium bg-zinc-800 hover:bg-zinc-700 text-white transition-colors text-sm"
              >
                Deselect All
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setImdbSeasonsPopup(null)}
                className="px-6 py-2 rounded-xl font-medium hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  processImdbSeasons(imdbSeasonsPopup.epData, selectedImdbSeasons);
                  setImdbSeasonsPopup(null);
                }}
                disabled={selectedImdbSeasons.length === 0}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-bold transition-colors"
              >
                Fetch Selected
              </button>
            </div>
          </div>
        </div>
      )}
      {shareSeasonModal.isOpen && shareSeasonModal.content && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
            <button
              onClick={() => setShareSeasonModal({ ...shareSeasonModal, isOpen: false })}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold mb-2">Share Series</h3>
            <p className="text-zinc-400 mb-6">Select which seasons of "{shareSeasonModal.content.title}" you want to share on WhatsApp.</p>
            
            <div className="max-h-60 overflow-y-auto space-y-2 mb-6 pr-2 custom-scrollbar">
              <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedShareSeasons.length === shareSeasonModal.seasons.length ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-800/50'}`}>
                <input
                  type="checkbox"
                  checked={selectedShareSeasons.length === shareSeasonModal.seasons.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedShareSeasons(shareSeasonModal.seasons.map(s => s.seasonNumber));
                    } else {
                      setSelectedShareSeasons([]);
                    }
                  }}
                  className="w-5 h-5 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950"
                />
                <span className="font-medium">All Seasons</span>
              </label>
              <div className="h-px bg-zinc-800 my-2" />
              {shareSeasonModal.seasons.map(season => (
                <label key={season.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedShareSeasons.includes(season.seasonNumber) ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-800/50'}`}>
                  <input
                    type="checkbox"
                    checked={selectedShareSeasons.includes(season.seasonNumber)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedShareSeasons(prev => [...prev, season.seasonNumber]);
                      } else {
                        setSelectedShareSeasons(prev => prev.filter(s => s !== season.seasonNumber));
                      }
                    }}
                    className="w-5 h-5 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950"
                  />
                  <span className="font-medium">Season {season.seasonNumber}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShareSeasonModal({ ...shareSeasonModal, isOpen: false })}
                className="px-6 py-2 rounded-xl font-medium hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (shareSeasonModal.content) {
                    executeShare(shareSeasonModal.content, selectedShareSeasons);
                    setShareSeasonModal({ ...shareSeasonModal, isOpen: false });
                  }
                }}
                disabled={selectedShareSeasons.length === 0}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" /> Share ({selectedShareSeasons.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notificationModal.isOpen && notificationModal.content && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-800 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Bell className="w-6 h-6 text-blue-500" />
              Send Notification
            </h2>
            
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 mb-6 flex gap-4">
              {notificationModal.content.posterUrl && (
                <img 
                  src={notificationModal.content.posterUrl} 
                  alt="Poster" 
                  className="w-16 h-24 object-cover rounded-md shrink-0"
                  referrerPolicy="no-referrer"
                />
              )}
              <div>
                <h3 className="font-bold text-white mb-1">🎬 New {notificationModal.content.type === 'movie' ? 'Movie' : 'Series'} Added</h3>
                <p className="text-sm text-zinc-400 line-clamp-2">{notificationModal.content.title}</p>
              </div>
            </div>

            {notificationModal.status === 'idle' && (
              <p className="text-zinc-400 mb-6">
                This will send a push notification to all users about this new content. Do you want to proceed?
              </p>
            )}

            {notificationModal.status === 'sending' && (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-blue-500 font-medium">Sending notification...</p>
              </div>
            )}

            {notificationModal.status === 'success' && (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <p className="text-emerald-500 font-medium">Notification successfully pushed!</p>
              </div>
            )}

            {notificationModal.status === 'error' && (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                  <X className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-red-500 font-medium">Error sending notification.</p>
              </div>
            )}

            {notificationModal.status === 'idle' && (
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setNotificationModal({ isOpen: false, content: null, status: 'idle' })}
                  className="px-6 py-2 rounded-xl font-medium hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendNotification}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2"
                >
                  <Bell className="w-4 h-4" /> Send Now
                </button>
              </div>
            )}
            
            {notificationModal.status === 'error' && (
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setNotificationModal({ isOpen: false, content: null, status: 'idle' })}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-xl font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
