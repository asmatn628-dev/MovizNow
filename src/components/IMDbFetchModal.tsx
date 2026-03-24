import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatReleaseDate } from '../utils/contentUtils';

interface IMDbFetchModalProps {
  isOpen: boolean;
  onClose: () => void;
  imdbLink: string;
  availableGenres: { id: string, name: string }[];
  onApply: (data: any) => void;
}

export default function IMDbFetchModal({ isOpen, onClose, imdbLink, availableGenres, onApply }: IMDbFetchModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedData, setFetchedData] = useState<any>(null);
  
  // Selection state
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
    title: true,
    year: true,
    type: true,
    description: true,
    cast: true,
    genres: true,
    releaseDate: true,
    runtime: true,
    imdbLink: true,
    posterUrl: true,
    trailerUrl: true,
  });
  const [selectedSeasons, setSelectedSeasons] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setFetchedData(null);
      setError(null);
      if (imdbLink) {
        fetchDataWithIMDb();
      }
    }
  }, [isOpen, imdbLink]);

  const fetchDataWithIMDb = async () => {
    setLoading(true);
    setError(null);
    try {
      const ttMatch = imdbLink.match(/tt\d+/);
      const ttId = ttMatch ? ttMatch[0] : null;

      if (!ttId) {
        throw new Error("Invalid IMDb link. Could not extract ID.");
      }

      let data: any = {
        imdbLink,
        title: '',
        year: '',
        type: 'movie',
        description: '',
        cast: '',
        genres: [],
        releaseDate: '',
        runtime: '',
        rating: '',
        posterUrl: '',
        trailerUrl: '',
        seasons: []
      };

      // Try TVMaze
      try {
        const tvmazeRes = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${ttId}`);
        if (tvmazeRes.ok) {
          const show = await tvmazeRes.json();
          data.title = show.name || '';
          data.year = show.premiered ? parseInt(show.premiered.substring(0, 4)) : '';
          data.type = 'series';
          data.description = show.summary ? show.summary.replace(/<[^>]*>?/gm, '') : '';
          data.genres = show.genres || [];
          data.releaseDate = show.premiered || '';
          data.runtime = show.averageRuntime ? `00:${show.averageRuntime}` : '';
          if (show.image?.original) data.posterUrl = show.image.original;
          if (show.rating?.average) data.rating = `${show.rating.average}/10`;

          // Fetch episodes
          if (show.id) {
            const episodesRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/episodes`);
            if (episodesRes.ok) {
              const episodesData = await episodesRes.json();
              const seasonsMap: Record<number, any> = {};
              
              episodesData.forEach((ep: any) => {
                if (!seasonsMap[ep.season]) {
                  seasonsMap[ep.season] = {
                    seasonNumber: ep.season,
                    seasonYear: ep.airdate ? parseInt(ep.airdate.substring(0, 4)) : data.year,
                    episodes: []
                  };
                }
                seasonsMap[ep.season].episodes.push({
                  episodeNumber: ep.number,
                  title: ep.name,
                  description: ep.summary ? ep.summary.replace(/<[^>]*>?/gm, '') : '',
                  duration: ep.runtime ? `${ep.runtime}m` : ''
                });
              });
              
              data.seasons = Object.values(seasonsMap);
            }
          }
        }
      } catch (error) {
        console.error("TVMaze fetch error", error);
      }

      // Try to get data via proxy (IMDb page scrape)
      try {
        const proxyUrl = `/api/imdb/title/${ttId}`;
        let pageRes = await fetch(proxyUrl);
        if (pageRes.ok) {
          const html = await pageRes.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          // Try to get ld+json data
          const ldJsonEl = doc.querySelector('script[type="application/ld+json"]');
          if (ldJsonEl && ldJsonEl.textContent) {
            try {
              const ldData = JSON.parse(ldJsonEl.textContent);
              if (!data.title) data.title = ldData.name;
              if (!data.description) data.description = ldData.description;
              if (!data.posterUrl && ldData.image) {
                data.posterUrl = typeof ldData.image === 'string' ? ldData.image : ldData.image.url;
              }
              if (!data.rating && ldData.aggregateRating?.ratingValue) {
                data.rating = `${ldData.aggregateRating.ratingValue}/10`;
              }
              if (!data.releaseDate && ldData.datePublished) {
                data.releaseDate = ldData.datePublished;
                if (!data.year) data.year = parseInt(ldData.datePublished.substring(0, 4));
              }
              if (!data.genres || data.genres.length === 0) {
                if (Array.isArray(ldData.genre)) {
                  data.genres = ldData.genre;
                } else if (typeof ldData.genre === 'string') {
                  data.genres = [ldData.genre];
                }
              }
              if (!data.cast && ldData.actor) {
                const actors = Array.isArray(ldData.actor) ? ldData.actor : [ldData.actor];
                data.cast = actors.map((a: any) => a.name).join(', ');
              }
              if (!data.type) {
                data.type = ldData['@type'] === 'TVSeries' ? 'series' : 'movie';
              }
            } catch (e) {
              console.error("Error parsing ld+json", e);
            }
          }

          // Fallback DOM scraping if ld+json missed something
          if (!data.rating) {
            const ratingEl = doc.querySelector('[data-testid="hero-rating-bar__aggregate-rating__score"] span') || 
                           doc.querySelector('.AggregateRatingButton__RatingScore-sc-1ll29m0-1') ||
                           doc.querySelector('.ratingValue strong span');
            if (ratingEl && ratingEl.textContent?.trim()) {
              data.rating = `${ratingEl.textContent.trim()}/10`;
            }
          }
          if (!data.title) {
            const titleEl = doc.querySelector('h1[data-testid="hero__pageTitle"] span') ||
                           doc.querySelector('.TitleBlock__Title-sc-1nlhx7j-0') ||
                           doc.querySelector('.title_wrapper h1');
            if (titleEl && titleEl.textContent) {
              data.title = titleEl.textContent.trim();
            }
          }
          if (!data.posterUrl) {
            const imgEl = doc.querySelector('.ipc-poster__poster-image img') ||
                         doc.querySelector('.poster img') ||
                         doc.querySelector('meta[property="og:image"]');
            if (imgEl) {
              if (imgEl.tagName === 'META') {
                data.posterUrl = imgEl.getAttribute('content');
              } else {
                const src = imgEl.getAttribute('src');
                const srcset = imgEl.getAttribute('srcset');
                if (srcset) {
                  const parts = srcset.split(',');
                  const largest = parts[parts.length - 1].trim().split(' ')[0];
                  data.posterUrl = largest;
                } else if (src) {
                  data.posterUrl = src;
                }
              }
            }
          }
          if (!data.description) {
            const descEl = doc.querySelector('[data-testid="plot-l"]') ||
                          doc.querySelector('.summary_text') ||
                          doc.querySelector('meta[name="description"]');
            if (descEl) {
              if (descEl.tagName === 'META') {
                data.description = descEl.getAttribute('content');
              } else {
                data.description = descEl.textContent?.trim();
              }
            }
          }
        }
      } catch (error) {
        console.error("Proxy fetch error", error);
      }

      // Fallback to Suggestion API if poster or title still missing
      if (!data.posterUrl || !data.title) {
        try {
          const suggestRes = await fetch(`/api/imdb/suggestion/${ttId}`);
          if (suggestRes.ok) {
            const suggestData = await suggestRes.json();
            if (suggestData.d && suggestData.d.length > 0) {
              const item = suggestData.d.find((i: any) => i.id === ttId);
              if (item) {
                if (!data.title) data.title = item.l;
                if (!data.year) data.year = item.y;
                if (!data.posterUrl && item.i) {
                  data.posterUrl = item.i.imageUrl;
                }
                if (!data.cast && item.s) data.cast = item.s;
              }
            }
          }
        } catch (e) {
          console.error("Suggestion fallback error", e);
        }
      }

      // Fetch YouTube trailer if we have a title
      if (data.title) {
        try {
          const ytPromise = await fetch(`/api/youtube/search?q=${encodeURIComponent(data.title + " " + (data.year || "") + " trailer")}`);
          if (ytPromise.ok) {
            const ytData = await ytPromise.json();
            if (ytData.items && ytData.items.length > 0) {
              data.trailerUrl = `https://www.youtube.com/watch?v=${ytData.items[0].id.videoId}`;
            }
          }
        } catch (error) {
          console.error("YouTube fetch error", error);
        }
      }

      setFetchedData(data);
      
      // Initialize selected seasons
      if (data.seasons && data.seasons.length > 0) {
        const initialSeasons: Record<number, boolean> = {};
        data.seasons.forEach((s: any) => {
          initialSeasons[s.seasonNumber] = true;
        });
        setSelectedSeasons(initialSeasons);
      }
      
    } catch (err: any) {
      console.error("IMDb fetch error:", err);
      setError(err.message || "Failed to fetch data from IMDb algorithms.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!fetchedData) return;
    
    const dataToApply: any = {};
    
    Object.keys(selectedFields).forEach(key => {
      if (selectedFields[key] && fetchedData[key] !== undefined) {
        dataToApply[key] = fetchedData[key];
      }
    });

    if (fetchedData.type === 'series' && fetchedData.seasons) {
      const filteredSeasons = fetchedData.seasons.filter((s: any) => selectedSeasons[s.seasonNumber]);
      if (filteredSeasons.length > 0) {
        dataToApply.seasons = filteredSeasons;
      }
    }

    onApply(dataToApply);
    onClose();
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const toggleSeason = (seasonNum: number) => {
    setSelectedSeasons(prev => ({ ...prev, [seasonNum]: !prev[seasonNum] }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between p-6 border-b border-zinc-800 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-white">IMDb Master Fetch</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Powered by IMDb Algorithms
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
                <p>Gathering accurate data using IMDb algorithms...</p>
                <p className="text-xs mt-2 text-zinc-500">This may take a few moments to fetch episodes and details.</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-red-400">
                <AlertCircle className="w-12 h-12 mb-4" />
                <p>{error}</p>
                <button 
                  onClick={fetchDataWithIMDb}
                  className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : fetchedData ? (
              <div className="space-y-6">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-400 flex items-start gap-3">
                  <Check className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>Data found successfully! Select the fields you want to apply to your content.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Basic Info</h3>
                    
                    {['title', 'year', 'type', 'releaseDate', 'runtime'].map(field => (
                      fetchedData[field] && (
                        <label key={field} className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/50 cursor-pointer hover:border-zinc-700 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedFields[field]} 
                            onChange={() => toggleField(field)}
                            className="mt-1 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-zinc-500 capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}</div>
                            <div className="text-sm text-white truncate">
                              {field === 'releaseDate' ? formatReleaseDate(fetchedData[field]) : fetchedData[field]}
                            </div>
                          </div>
                        </label>
                      )
                    ))}
                    
                    {fetchedData.genres && (
                      <label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/50 cursor-pointer hover:border-zinc-700 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedFields.genres} 
                          onChange={() => toggleField('genres')}
                          className="mt-1 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-500">Genres</div>
                          <div className="text-sm text-white truncate">{Array.isArray(fetchedData.genres) ? fetchedData.genres.join(', ') : fetchedData.genres}</div>
                        </div>
                      </label>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Media & Details</h3>
                    
                    {['posterUrl', 'trailerUrl'].map(field => (
                      fetchedData[field] && (
                        <div key={field} className="space-y-2">
                          <label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/50 cursor-pointer hover:border-zinc-700 transition-colors">
                            <input 
                              type="checkbox" 
                              checked={selectedFields[field]} 
                              onChange={() => toggleField(field)}
                              className="mt-1 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-zinc-500 capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}</div>
                              <div className="text-sm text-emerald-500 truncate hover:underline" onClick={(e) => { e.preventDefault(); window.open(fetchedData[field], '_blank'); }}>
                                {fetchedData[field]}
                              </div>
                            </div>
                          </label>
                          
                          {field === 'trailerUrl' && selectedFields.trailerUrl && fetchedData.trailerTitle && (
                            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/50 flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center shrink-0">
                                <div className="w-4 h-4 bg-red-500 rounded-sm" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-zinc-500">YouTube Video Title</div>
                                <div className="text-sm text-white truncate font-medium">{fetchedData.trailerTitle}</div>
                              </div>
                            </div>
                          )}
                          
                          {field === 'posterUrl' && selectedFields.posterUrl && (
                            <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 mx-auto">
                              <img 
                                src={fetchedData.posterUrl} 
                                alt="Poster Preview" 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/error/200/300';
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )
                    ))}

                    {['description', 'cast'].map(field => (
                      fetchedData[field] && (
                        <label key={field} className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/50 cursor-pointer hover:border-zinc-700 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedFields[field]} 
                            onChange={() => toggleField(field)}
                            className="mt-1 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-zinc-500 capitalize">{field}</div>
                            <div className="text-sm text-white line-clamp-3">{fetchedData[field]}</div>
                          </div>
                        </label>
                      )
                    ))}
                  </div>
                </div>

                {fetchedData.type === 'series' && fetchedData.seasons && fetchedData.seasons.length > 0 && (
                  <div className="pt-6 border-t border-zinc-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Seasons & Episodes</h3>
                    <div className="space-y-3">
                      {fetchedData.seasons.map((season: any) => (
                        <div key={season.seasonNumber} className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/30">
                          <label className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-900/50 transition-colors">
                            <input 
                              type="checkbox" 
                              checked={!!selectedSeasons[season.seasonNumber]} 
                              onChange={() => toggleSeason(season.seasonNumber)}
                              className="rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500 bg-zinc-900"
                            />
                            <div className="font-medium text-white">Season {season.seasonNumber}</div>
                            <div className="text-xs text-zinc-500 ml-auto">{season.episodes?.length || 0} Episodes</div>
                          </label>
                          
                          {selectedSeasons[season.seasonNumber] && season.episodes && (
                            <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50">
                              <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                {season.episodes.map((ep: any) => (
                                  <div key={ep.episodeNumber} className="text-sm flex gap-3 p-2 rounded-lg bg-zinc-900/50">
                                    <div className="text-zinc-500 font-mono w-6 shrink-0">{ep.episodeNumber}.</div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-zinc-200 font-medium truncate">{ep.title}</div>
                                      {ep.description && <div className="text-xs text-zinc-500 line-clamp-1 mt-0.5">{ep.description}</div>}
                                    </div>
                                    {ep.duration && <div className="text-xs text-zinc-600 shrink-0">{ep.duration}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="p-6 border-t border-zinc-800 bg-zinc-950 shrink-0 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={loading || !fetchedData}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20"
            >
              Apply Selected Data
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
