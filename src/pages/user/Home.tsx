import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Content } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { Film, Search, Filter, MessageCircle, Clock, Heart, LogOut, User, Users, Lock, LayoutDashboard, X } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import ConfirmModal from '../../components/ConfirmModal';
import { formatContentTitle } from '../../utils/contentUtils';
import { LazyLoadImage } from 'react-lazy-load-image-component';

import { NotificationMenu } from '../../components/NotificationMenu';

export default function Home({ onOpenMediaModal }: { onOpenMediaModal: () => void }) {
  const { profile, logout } = useAuth();
  const { contentList, genres, languages, qualities, loading } = useContent();
  
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'year' | 'az'>('newest');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [showWhatsappPrompt, setShowWhatsappPrompt] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  const clearFilters = () => {
    setSort('newest');
    setSelectedType('');
    setSelectedGenre('');
    setSelectedLanguage('');
    setSelectedQuality('');
    setSelectedYear('');
    setSearch('');
  };

  useEffect(() => {
    if (profile && profile.phone === undefined && profile.role !== 'admin' && profile.role !== 'content_manager' && profile.role !== 'manager') {
      setShowWhatsappPrompt(true);
    }
  }, [profile]);

  const handleSaveWhatsapp = () => {
    if (!profile) return;
    setShowWhatsappPrompt(false);
    updateDoc(doc(db, 'users', profile.uid), {
      phone: whatsappNumber
    }).catch(error => console.error("Failed to save WhatsApp number", error));
  };

  const handleDismissWhatsapp = () => {
    if (!profile) return;
    setShowWhatsappPrompt(false);
    updateDoc(doc(db, 'users', profile.uid), {
      phone: '' // Save empty string to indicate dismissed
    }).catch(error => console.error("Failed to dismiss WhatsApp prompt", error));
  };

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem('homeScrollPosition', window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (contentList.length > 0) {
      const savedScrollPosition = sessionStorage.getItem('homeScrollPosition');
      if (savedScrollPosition) {
        setTimeout(() => window.scrollTo(0, parseInt(savedScrollPosition, 10)), 100);
      }
    }
  }, [contentList.length]);

  const uniqueYears = useMemo(() => {
    const years = new Set(contentList.map(c => Number(c.year)).filter(y => y > 0 && !isNaN(y)));
    return Array.from(years).sort((a, b) => b - a);
  }, [contentList]);

  const recentlyAddedContent = useMemo(() => {
    let result = [...contentList];
    if (profile?.role !== 'admin' && profile?.role !== 'content_manager' && profile?.role !== 'manager') {
      result = result.filter(c => {
        if (c.status === 'draft') return false;
        if (c.status === 'selected_content') {
          return profile?.assignedContent?.some(id => id === c.id || id.startsWith(`${c.id}:`));
        }
        return true;
      });
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
  }, [contentList, profile]);

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'admin': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'manager': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'content_manager': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'selected_content': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'temporary': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'trial': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'expired': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'suspended': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  const filteredAndSortedContent = useMemo(() => {
    let result = [...contentList];

    // Filter out drafts and selected_content for non-admins and non-editors
    if (profile?.role !== 'admin' && profile?.role !== 'content_manager' && profile?.role !== 'manager') {
      result = result.filter(c => {
        if (c.status === 'draft') return false;
        if (c.status === 'selected_content') {
          return profile?.assignedContent?.some(id => id === c.id || id.startsWith(`${c.id}:`));
        }
        return true;
      });
    }

    if (search) {
      result = result.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));
    }
    if (selectedType) {
      result = result.filter(c => c.type === selectedType);
    }
    if (selectedGenre) {
      result = result.filter(c => c.genreIds?.includes(selectedGenre));
    }
    if (selectedLanguage) {
      result = result.filter(c => c.languageIds?.includes(selectedLanguage));
    }
    if (selectedQuality) {
      result = result.filter(c => c.qualityId === selectedQuality);
    }
    if (selectedYear) {
      result = result.filter(c => c.year.toString() === selectedYear);
    }

    result.sort((a, b) => {
      // For temporary and selected_content users, prioritize assigned content
      if (profile?.role === 'temporary' || profile?.role === 'selected_content') {
        const aAssigned = profile.assignedContent?.some(id => id === a.id || id.startsWith(`${a.id}:`)) ? 1 : 0;
        const bAssigned = profile.assignedContent?.some(id => id === b.id || id.startsWith(`${b.id}:`)) ? 1 : 0;
        if (aAssigned !== bAssigned) return bAssigned - aAssigned;
      }

      if (sort === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sort === 'year') {
        return b.year - a.year;
      } else {
        return a.title.localeCompare(b.title);
      }
    });

    return result;
  }, [contentList, search, sort, selectedType, selectedGenre, selectedLanguage, selectedQuality, selectedYear, profile]);

  const totalPages = Math.ceil(filteredAndSortedContent.length / ITEMS_PER_PAGE);
  const paginatedContent = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedContent.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedContent, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, sort, selectedType, selectedGenre, selectedLanguage, selectedQuality, selectedYear]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold text-emerald-500 flex items-center gap-3">
            <LazyLoadImage src="/logo.svg?v=2" alt="MovizNow Logo" className="w-8 h-8" />
            <span className="tracking-tight">MovizNow</span>
          </Link>

          <div className={clsx("flex items-center", profile?.role === 'manager' ? "gap-0.5" : "gap-1.5")}>
            {profile && (
              <div className="hidden md:flex items-center gap-2 mr-2">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-white">{profile.displayName || 'User'}</span>
                    <div className="flex items-center gap-1">
                      <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border", getRoleColor(profile.role))}>
                        {profile.role === 'selected_content' ? 'Selected Content' : 
                         profile.role === 'content_manager' ? 'Content Manager' :
                         profile.role === 'user_manager' ? 'User Manager' :
                         profile.role === 'manager' ? 'Manager' :
                         profile.role.charAt(0).toUpperCase() + profile.role.slice(1).replace('_', ' ')}
                      </span>
                      {profile.role !== 'owner' && (
                        <span className={clsx("text-[10px] font-medium capitalize px-2 py-0.5 rounded-full border", getStatusColor(profile.status))}>
                          {profile.status}
                        </span>
                      )}
                    </div>
                  </div>
                  {profile.phone ? (
                    <span className="text-xs font-medium text-zinc-400">{profile.phone}</span>
                  ) : (
                    <button onClick={() => setShowWhatsappPrompt(true)} className="text-[10px] font-medium text-emerald-500 hover:underline mt-0.5">
                      + Add WhatsApp
                    </button>
                  )}
                </div>
                <div className="h-8 w-px bg-zinc-800"></div>
                <div className="flex flex-col items-start">
                  <span className="text-xs text-zinc-400">Expiry Date</span>
                  <span className="text-xs font-medium text-zinc-300">
                    {profile.role === 'owner' ? 'Lifetime' : profile.expiryDate ? (() => {
                      const expiry = new Date(profile.expiryDate);
                      const expiryEnd = new Date(expiry.getTime() + 24 * 60 * 60 * 1000);
                      const now = new Date();
                      const diffTime = expiryEnd.getTime() - now.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      const isExpiringSoon = diffDays > 0 && diffDays < 3;
                      const daysText = diffDays > 0 ? `${diffDays} days left` : 'Expired';
                      return (
                        <span className={clsx(isExpiringSoon && "text-red-500 font-bold")}>
                          {format(expiry, 'MMM dd, yyyy')} ({daysText})
                        </span>
                      );
                    })() : 'No Expiry'}
                  </span>
                </div>
                <a 
                  href="https://wa.me/923363284466" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded-lg text-sm font-medium transition-colors ml-1"
                >
                  <MessageCircle className="w-4 h-4" />
                  Support
                </a>
              </div>
            )}
            
            <Link to="/watch-later" className="text-zinc-400 hover:text-white transition-colors" title="Watch Later">
              <Clock className="w-5 h-5" />
            </Link>
            <Link to="/favorites" className="text-zinc-400 hover:text-white transition-colors" title="Favorites">
              <Heart className="w-5 h-5" />
            </Link>
            {(profile?.role === 'admin' || profile?.role === 'content_manager' || profile?.role === 'manager') && (
              <button onClick={onOpenMediaModal} className="text-zinc-400 hover:text-white transition-colors" title="Search Media">
                <Search className="w-5 h-5" />
              </button>
            )}
            <Link to="/requests" className="text-zinc-400 hover:text-white transition-colors" title="Movie Requests">
              <MessageCircle className="w-5 h-5" />
            </Link>
            {profile && <NotificationMenu profile={profile} />}
            {profile?.role === 'admin' && (
              <Link to="/admin" className="text-zinc-400 hover:text-white transition-colors" title="Admin Panel">
                <LayoutDashboard className="w-5 h-5" />
              </Link>
            )}
            {(profile?.role === 'manager' || profile?.role === 'content_manager') && (
              <Link to="/admin/content" className="text-zinc-400 hover:text-white transition-colors" title={profile?.role === 'manager' ? 'Content Management' : 'Content Manager'}>
                <Film className="w-5 h-5" />
              </Link>
            )}
            {(profile?.role === 'user_manager' || profile?.role === 'manager') && (
              <Link to="/admin/users" className="text-zinc-400 hover:text-white transition-colors" title={profile?.role === 'manager' ? 'User Management' : 'User Manager'}>
                <Users className="w-5 h-5" />
              </Link>
            )}
            <button onClick={() => setIsLogoutModalOpen(true)} className="text-zinc-400 hover:text-white transition-colors" title="Sign Out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile User Info Banner */}
      {profile && (
        <div className="md:hidden bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <span className="font-bold text-white">{profile.displayName || 'User'}</span>
              {profile.phone ? (
                <span className="text-xs font-medium text-zinc-400">{profile.phone}</span>
              ) : (
                <button onClick={() => setShowWhatsappPrompt(true)} className="text-[10px] font-medium text-emerald-500 hover:underline text-left mt-0.5">
                  + Add WhatsApp
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border", getRoleColor(profile.role))}>
                {profile.role === 'selected_content' ? 'Selected Content' : 
                 profile.role === 'content_manager' ? 'Content Manager' :
                 profile.role === 'user_manager' ? 'User Manager' :
                 profile.role === 'manager' ? 'Manager' :
                 profile.role.charAt(0).toUpperCase() + profile.role.slice(1).replace('_', ' ')}
              </span>
              {profile.role !== 'owner' && (
                <span className={clsx("text-[10px] font-medium capitalize px-2 py-0.5 rounded-full border", getStatusColor(profile.status))}>
                  {profile.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-xs">
              {profile.role === 'owner' ? 'Lifetime' : profile.expiryDate ? (() => {
                const expiry = new Date(profile.expiryDate);
                const expiryEnd = new Date(expiry.getTime() + 24 * 60 * 60 * 1000);
                const now = new Date();
                const diffTime = expiryEnd.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const isExpiringSoon = diffDays > 0 && diffDays < 3;
                const daysText = diffDays > 0 ? `${diffDays}d left` : 'Expired';
                return (
                  <span className={clsx(isExpiringSoon && "text-red-500 font-bold")}>
                    Exp: {format(expiry, 'MMM dd, yyyy')} ({daysText})
                  </span>
                );
              })() : 'No Expiry'}
            </span>
            <a 
              href="https://wa.me/923363284466" 
              target="_blank" 
              rel="noreferrer" 
              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded text-xs font-medium transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
              Support
            </a>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* Status Banner */}
        {profile?.status === 'pending' && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 p-4 rounded-2xl mb-8 flex items-center justify-between">
            <p>Your account is pending admin approval. You can browse, but cannot play content yet.</p>
            <a href="https://wa.me/923363284466" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-yellow-500/20 px-4 py-2 rounded-xl font-medium hover:bg-yellow-500/30 transition-colors">
              <MessageCircle className="w-4 h-4" /> Contact Admin
            </a>
          </div>
        )}
        {profile?.status === 'expired' && profile?.role === 'trial' && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl mb-8 flex items-center justify-between">
            <p>Your Free Trial is Expired. Contact admin and get your membership to enjoy watching.</p>
            <a href="https://wa.me/923363284466" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-red-500/20 px-4 py-2 rounded-xl font-medium hover:bg-red-500/30 transition-colors">
              <MessageCircle className="w-4 h-4" /> Contact Now
            </a>
          </div>
        )}
        {profile?.status === 'expired' && profile?.role !== 'trial' && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl mb-8 flex items-center justify-between">
            <p>Your membership has expired. Please renew to continue watching.</p>
            <a href="https://wa.me/923363284466" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-red-500/20 px-4 py-2 rounded-xl font-medium hover:bg-red-500/30 transition-colors">
              <MessageCircle className="w-4 h-4" /> Renew Now
            </a>
          </div>
        )}

        {/* Recently Added Section */}
        {!search && selectedType === '' && selectedGenre === '' && selectedLanguage === '' && selectedQuality === '' && selectedYear === '' && recentlyAddedContent.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Film className="w-5 h-5 text-emerald-500" />
              Recently Added
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
              {recentlyAddedContent.map((content) => {
                const isAssigned = (profile?.role === 'temporary' || profile?.role === 'selected_content') && profile?.assignedContent?.some(id => id === content.id || id.startsWith(`${content.id}:`));
                const isLocked = profile?.status !== 'active' || ((profile?.role === 'temporary' || profile?.role === 'selected_content') && !isAssigned);
                
                const contentQuality = qualities.find(q => q.id === content.qualityId)?.name;
                const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
                const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');

                return (
                  <Link
                    key={`recent-${content.id}`}
                    to={`/movie/${content.id}`}
                    className={`snap-start shrink-0 w-28 sm:w-36 group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden transition-transform hover:scale-105 hover:border-emerald-500/50`}
                  >
                    <div className="relative aspect-[2/3] w-full bg-zinc-800">
                      <LazyLoadImage
                        src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'}
                        alt={content.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        wrapperClassName="w-full h-full"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                      
                      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10">
                        <div className="bg-black/90 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">
                          {content.type}
                        </div>
                        {contentQuality && (
                          <div className="bg-emerald-500 text-black px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">
                            {contentQuality}
                          </div>
                        )}
                      </div>

                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                          <Lock className="w-8 h-8 text-red-500 drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
                        </div>
                      )}
                    </div>

                    <div className="p-2 flex-1 flex flex-col">
                      <h3 className="font-bold text-xs line-clamp-1 mb-1 group-hover:text-emerald-500 transition-colors">{formatContentTitle(content)}</h3>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400 mb-1">
                        <span>{content.year}</span>
                        {contentLangs && (
                          <>
                            <span>•</span>
                            <span className="line-clamp-1">{contentLangs}</span>
                          </>
                        )}
                      </div>
                      {contentGenres && (
                        <div className="text-[9px] text-zinc-500 line-clamp-1 mt-auto">
                          {contentGenres}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search movies & series..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-emerald-500"
            />
          </div>
          
          <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0 flex-nowrap">
            <button onClick={clearFilters} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1">
              <X className="w-3 h-3" />
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
            >
              <option value="newest">Recently Added</option>
              <option value="year">Release Year</option>
              <option value="az">A-Z</option>
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
            >
              <option value="">Types</option>
              <option value="movie">Movies</option>
              <option value="series">Series</option>
            </select>

            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
            >
              <option value="">Genres</option>
              {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
            >
              <option value="">Languages</option>
              {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>

            <select
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
            >
              <option value="">Qualities</option>
              {qualities.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500"
            >
              <option value="">Years</option>
              {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          </div>
        ) : filteredAndSortedContent.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">No content found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {paginatedContent.map((content) => {
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
                      {contentQuality && (
                        <div className={`absolute top-9 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          ['WEB-DL', 'WebRip', 'HDRip', 'BluRay'].some(hq => contentQuality.toUpperCase().includes(hq.toUpperCase()))
                            ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                            : 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                        }`}>
                          {contentQuality}
                        </div>
                      )}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-12 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCurrentPage(prev => Math.max(1, prev - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                      // Show limited page numbers for better UI
                      if (
                        page === 1 || 
                        page === totalPages || 
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => {
                              setCurrentPage(page);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={clsx(
                              "w-10 h-10 rounded-xl text-sm font-medium transition-colors",
                              currentPage === page 
                                ? "bg-emerald-500 text-white" 
                                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                            )}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === currentPage - 2 || 
                        page === currentPage + 2
                      ) {
                        return <span key={page} className="text-zinc-600 px-1">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => {
                      setCurrentPage(prev => Math.min(totalPages, prev + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedContent.length)} of {filteredAndSortedContent.length} contents
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 text-center text-zinc-500">
        <p>Need help or want to renew membership?</p>
        <a href="https://wa.me/923363284466" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-emerald-500 hover:text-emerald-400 mt-2 font-medium">
          <MessageCircle className="w-4 h-4" /> WhatsApp: 03363284466
        </a>
      </footer>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        onConfirm={logout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />

      {showWhatsappPrompt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2 text-center">Add WhatsApp Number</h3>
            <p className="text-zinc-400 mb-6 text-center text-sm">
              Please provide your WhatsApp number so we can contact you regarding your membership and updates.
            </p>
            <div className="space-y-4">
              <input
                type="tel"
                placeholder="e.g. +923001234567"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDismissWhatsapp}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveWhatsapp}
                  disabled={!whatsappNumber.trim()}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
