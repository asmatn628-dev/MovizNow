import React, { useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialImdbId?: string;
  initialTitle?: string;
  initialYear?: string;
  onApply?: (data: any) => void;
}

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '19daa310';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com/';

export async function findTMDBByImdb(imdbID: string) {
  const url = `${TMDB_BASE}/find/${imdbID}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.movie_results && data.movie_results.length > 0) return { item: data.movie_results[0], type: 'movie' };
  if (data.tv_results && data.tv_results.length > 0) return { item: data.tv_results[0], type: 'tv' };
  return null;
}

export async function searchTMDBByTitle(searchTitle: string, searchYear: string) {
  let movieUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchTitle)}`;
  if (searchYear) movieUrl += `&year=${searchYear}`;
  let movieRes = await fetch(movieUrl);
  let movieData = await movieRes.json();
  if (movieData.results && movieData.results.length > 0) {
    return { item: movieData.results[0], type: 'movie' };
  }
  let tvUrl = `${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchTitle)}`;
  if (searchYear) tvUrl += `&first_air_date_year=${searchYear}`;
  let tvRes = await fetch(tvUrl);
  let tvData = await tvRes.json();
  if (tvData.results && tvData.results.length > 0) {
    return { item: tvData.results[0], type: 'tv' };
  }
  return null;
}

export async function fetchTMDBDetails(tmdbId: string, type: string) {
  const url = `${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids,content_ratings`;
  const res = await fetch(url);
  return await res.json();
}

export async function fetchSeriesSeasons(tmdbId: string) {
  const url = `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.seasons) return [];

  const seasons = [];
  for (const season of data.seasons) {
    if (season.season_number === 0) continue;
    const seasonUrl = `${TMDB_BASE}/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_API_KEY}`;
    const seasonRes = await fetch(seasonUrl);
    const seasonData = await seasonRes.json();
    seasons.push({
      season: season.season_number,
      name: season.name,
      year: season.air_date ? season.air_date.split('-')[0] : 'N/A',
      episodes: seasonData.episodes || []
    });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return seasons;
}

export async function fetchIMDbRating(imdbID: string) {
  if (!imdbID) return null;
  const url = `${OMDB_BASE}?i=${imdbID}&apikey=${OMDB_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Response === 'True') {
    return {
      rating: data.imdbRating,
      votes: data.imdbVotes,
    };
  }
  return null;
}

export const MediaModal: React.FC<MediaModalProps> = ({ isOpen, onClose, initialImdbId = '', initialTitle = '', initialYear = '', onApply }) => {
  const [imdbId, setImdbId] = useState(initialImdbId);
  const [title, setTitle] = useState(initialTitle);
  const [year, setYear] = useState(initialYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedData, setFetchedData] = useState<any>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('mediaModal_selectedFields');
    return saved ? JSON.parse(saved) : {};
  });
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>(() => {
    const saved = localStorage.getItem('mediaModal_selectedSeasons');
    return saved ? JSON.parse(saved) : [];
  });
  const [includeEpisodeDescriptions, setIncludeEpisodeDescriptions] = useState(() => {
    const saved = localStorage.getItem('mediaModal_includeEpisodeDescriptions');
    return saved ? JSON.parse(saved) : true;
  });

  React.useEffect(() => {
    localStorage.setItem('mediaModal_includeEpisodeDescriptions', JSON.stringify(includeEpisodeDescriptions));
  }, [includeEpisodeDescriptions]);

  React.useEffect(() => {
    if (Object.keys(selectedFields).length > 0) {
      localStorage.setItem('mediaModal_selectedFields', JSON.stringify(selectedFields));
    }
  }, [selectedFields]);

  React.useEffect(() => {
    if (selectedSeasons.length > 0) {
      localStorage.setItem('mediaModal_selectedSeasons', JSON.stringify(selectedSeasons));
    }
  }, [selectedSeasons]);

  React.useEffect(() => {
    if (isOpen) {
      setImdbId(initialImdbId);
      setTitle(initialTitle);
      setYear(initialYear);
      setFetchedData(null);
      setError(null);
      
      if (initialImdbId || initialTitle) {
        handleFetchWithParams(initialImdbId, initialTitle, initialYear);
      }
    }
  }, [isOpen, initialImdbId, initialTitle, initialYear]);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function findTMDBByImdb(imdbID: string) {
    const url = `${TMDB_BASE}/find/${imdbID}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.movie_results && data.movie_results.length > 0) return { item: data.movie_results[0], type: 'movie' };
    if (data.tv_results && data.tv_results.length > 0) return { item: data.tv_results[0], type: 'tv' };
    return null;
  }

  async function searchTMDBByTitle(searchTitle: string, searchYear: string) {
    let movieUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchTitle)}`;
    if (searchYear) movieUrl += `&year=${searchYear}`;
    let movieRes = await fetch(movieUrl);
    let movieData = await movieRes.json();
    if (movieData.results && movieData.results.length > 0) {
      return { item: movieData.results[0], type: 'movie' };
    }
    let tvUrl = `${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchTitle)}`;
    if (searchYear) tvUrl += `&first_air_date_year=${searchYear}`;
    let tvRes = await fetch(tvUrl);
    let tvData = await tvRes.json();
    if (tvData.results && tvData.results.length > 0) {
      return { item: tvData.results[0], type: 'tv' };
    }
    return null;
  }

  async function fetchTMDBDetails(tmdbId: string, type: string) {
    const url = `${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids,content_ratings,videos`;
    const res = await fetch(url);
    return await res.json();
  }

  async function fetchSeriesSeasons(tmdbId: string) {
    const url = `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.seasons) return [];

    const seasons = [];
    for (const season of data.seasons) {
      if (season.season_number === 0) continue;
      const seasonUrl = `${TMDB_BASE}/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_API_KEY}`;
      const seasonRes = await fetch(seasonUrl);
      const seasonData = await seasonRes.json();
      seasons.push({
        season: season.season_number,
        name: season.name,
        year: season.air_date ? season.air_date.split('-')[0] : 'N/A',
        episodes: seasonData.episodes || []
      });
      await delay(100);
    }
    return seasons;
  }

  async function fetchIMDbRating(imdbID: string) {
    if (!imdbID) return null;
    const url = `${OMDB_BASE}?i=${imdbID}&apikey=${OMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response === 'True') {
      return {
        rating: data.imdbRating,
        votes: data.imdbVotes,
      };
    }
    return null;
  }

  const handleFetchWithParams = async (searchImdbId: string, searchTitle: string, searchYear: string) => {
    setLoading(true);
    setError(null);
    setFetchedData(null);

    try {
      let tmdbItem = null;
      let type = null;

      if (searchImdbId.trim()) {
        const match = searchImdbId.trim().match(/tt\d+/);
        const imdbID = match ? match[0] : searchImdbId.trim();
        const found = await findTMDBByImdb(imdbID);
        if (found) {
          tmdbItem = found.item;
          type = found.type;
        } else {
          throw new Error(`No TMDB entry found for IMDb ID: ${imdbID}`);
        }
      } else if (searchTitle.trim()) {
        const found = await searchTMDBByTitle(searchTitle.trim(), searchYear.trim());
        if (found) {
          tmdbItem = found.item;
          type = found.type;
        } else {
          throw new Error('No movie or series found with that title/year.');
        }
      } else {
        throw new Error('Please provide either an IMDb ID or a title.');
      }

      const details = await fetchTMDBDetails(tmdbItem.id, type);
      let imdbRatingData = null;
      if (details.external_ids && details.external_ids.imdb_id) {
        imdbRatingData = await fetchIMDbRating(details.external_ids.imdb_id);
      }

      let seasonsData: any = null;
      if (type === 'tv') {
        seasonsData = await fetchSeriesSeasons(tmdbItem.id);
      }

      const parsedData: any = {
        title: details.title || details.name,
        type: type === 'tv' ? 'series' : 'movie',
        description: details.overview,
        year: (details.release_date || details.first_air_date || '').split('-')[0],
        releaseDate: details.release_date || details.first_air_date,
        posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : '',
        runtime: details.runtime ? `${details.runtime} min` : (details.episode_run_time && details.episode_run_time.length > 0 ? `${details.episode_run_time[0]} min/episode` : ''),
        cast: details.credits?.cast?.slice(0, 5).map((a: any) => a.name).join(', ') || '',
        imdbLink: details.external_ids?.imdb_id ? `https://www.imdb.com/title/${details.external_ids.imdb_id}` : '',
        imdbRating: imdbRatingData?.rating && imdbRatingData.rating !== 'N/A' ? `${imdbRatingData.rating}/10` : '',
        genres: details.genres?.map((g: any) => g.name) || [],
        trailerUrl: details.videos?.results?.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer')?.key 
          ? `https://www.youtube.com/watch?v=${details.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer').key}` 
          : '',
        seasons: seasonsData
      };

      setFetchedData(parsedData);

      // Fetch YouTube title if trailerUrl exists
      if (parsedData.trailerUrl) {
        try {
          const res = await fetch(`https://www.youtube.com/oembed?url=${parsedData.trailerUrl}&format=json`);
          if (res.ok) {
            const ytData = await res.json();
            if (ytData.title) {
              setFetchedData(prev => prev ? { ...prev, trailerTitle: ytData.title } : null);
            }
          }
        } catch (e) {
          console.error("Error fetching YouTube title in modal:", e);
        }
      }
      
      // Select all fields by default if not already set
      const allFields: Record<string, boolean> = {};
      Object.keys(parsedData).forEach(k => {
        if (k !== 'seasons' && parsedData[k] && (Array.isArray(parsedData[k]) ? parsedData[k].length > 0 : true)) {
          allFields[k] = true;
        }
      });
      
      setSelectedFields(prev => {
        if (Object.keys(prev).length === 0) return allFields;
        return prev;
      });
      
      if (seasonsData) {
        setSelectedSeasons(prev => {
          if (prev.length === 0) return seasonsData.map((s: any) => s.season);
          return prev;
        });
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!fetchedData || !onApply) return;
    
    const dataToApply: any = {};
    Object.keys(selectedFields).forEach(key => {
      if (selectedFields[key]) {
        dataToApply[key] = fetchedData[key];
        // If trailerUrl is selected, also include trailerTitle
        if (key === 'trailerUrl' && fetchedData.trailerTitle) {
          dataToApply.trailerTitle = fetchedData.trailerTitle;
        }
      }
    });

    if (fetchedData.seasons && selectedSeasons.length > 0) {
      dataToApply.seasons = fetchedData.seasons.filter((s: any) => selectedSeasons.includes(s.season)).map((s: any) => ({
        id: `s${s.season}`,
        seasonNumber: s.season,
        title: s.name,
        seasonYear: s.year !== 'N/A' ? parseInt(s.year) : undefined,
        episodes: s.episodes.map((e: any) => ({
          id: `e${e.episode_number}`,
          episodeNumber: e.episode_number,
          title: e.name,
          description: includeEpisodeDescriptions ? (e.overview || '') : '',
          duration: e.runtime ? `${e.runtime}m` : '',
          videoUrl: ''
        }))
      }));
    }

    onApply(dataToApply);
    onClose();
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Master Fetch</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex flex-wrap gap-3 items-center">
            <input type="text" value={imdbId} onChange={e => setImdbId(e.target.value)} placeholder="IMDb ID (e.g., tt21842982)" className="flex-1 min-w-[140px] p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            <span className="text-zinc-500 font-medium text-sm">OR</span>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Movie/Series title" className="flex-1 min-w-[140px] p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            <input type="text" value={year} onChange={e => setYear(e.target.value)} placeholder="Year" className="w-24 p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white" />
            <button 
              onClick={() => handleFetchWithParams(imdbId, title, year)} 
              disabled={loading}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Fetch
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg mb-4">
              {error}
            </div>
          )}

          {!fetchedData && !loading && !error && (
            <div className="text-center text-zinc-500 py-10">
              Enter an IMDb ID or Title + Year to fetch data.
            </div>
          )}

          {fetchedData && (
            <div className="space-y-6">
              <div className="flex gap-6">
                {fetchedData.posterUrl && (
                  <div className="w-32 shrink-0">
                    <img src={fetchedData.posterUrl} alt="Poster" className="w-full rounded-lg shadow-lg" />
                    <label className="flex items-center gap-2 mt-2 text-sm text-zinc-300 cursor-pointer">
                      <input type="checkbox" checked={!!selectedFields.posterUrl} onChange={() => toggleField('posterUrl')} className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500" />
                      Include Poster
                    </label>
                  </div>
                )}
                <div className="flex-1 space-y-4">
                  {[
                    { key: 'title', label: 'Title', value: fetchedData.title },
                    { key: 'type', label: 'Type', value: fetchedData.type },
                    { key: 'year', label: 'Year', value: fetchedData.year },
                    { key: 'releaseDate', label: 'Release Date', value: fetchedData.releaseDate },
                    { key: 'runtime', label: 'Runtime', value: fetchedData.runtime },
                    { key: 'imdbRating', label: 'IMDb Rating', value: fetchedData.imdbRating },
                    { key: 'imdbLink', label: 'IMDb Link', value: fetchedData.imdbLink },
                    { key: 'trailerUrl', label: 'Trailer URL', value: fetchedData.trailerUrl },
                  ].map(field => field.value ? (
                    <div key={field.key} className="flex items-start gap-3">
                      <input 
                        type="checkbox" 
                        checked={!!selectedFields[field.key]} 
                        onChange={() => toggleField(field.key)}
                        className="mt-1 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs text-zinc-500 font-medium uppercase">{field.label}</div>
                        <div className="text-sm text-white break-all">{field.value}</div>
                        {field.key === 'trailerUrl' && fetchedData.trailerTitle && (
                          <div className="text-xs text-emerald-500 mt-1 font-medium">
                            Title: {fetchedData.trailerTitle}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null)}
                </div>
              </div>

              {fetchedData.description && (
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={!!selectedFields.description} 
                    onChange={() => toggleField('description')}
                    className="mt-1 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs text-zinc-500 font-medium uppercase">Synopsis</div>
                    <div className="text-sm text-zinc-300">{fetchedData.description}</div>
                  </div>
                </div>
              )}

              {fetchedData.cast && fetchedData.cast.length > 0 && (
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={!!selectedFields.cast} 
                    onChange={() => toggleField('cast')}
                    className="mt-1 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs text-zinc-500 font-medium uppercase">Cast</div>
                    <div className="text-sm text-zinc-300">{fetchedData.cast}</div>
                  </div>
                </div>
              )}

              {fetchedData.genres && fetchedData.genres.length > 0 && (
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={!!selectedFields.genres} 
                    onChange={() => toggleField('genres')}
                    className="mt-1 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs text-zinc-500 font-medium uppercase">Genres</div>
                    <div className="text-sm text-zinc-300">{fetchedData.genres.join(', ')}</div>
                  </div>
                </div>
              )}

              {fetchedData.seasons && fetchedData.seasons.length > 0 && (
                <div className="border-t border-zinc-800 pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-white">Select Seasons:</h4>
                    <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-300 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={includeEpisodeDescriptions}
                        onChange={(e) => setIncludeEpisodeDescriptions(e.target.checked)}
                        className="rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      Include Episode Descriptions
                    </label>
                  </div>
                  <div className="space-y-3">
                    {fetchedData.seasons.map((s: any) => (
                      <div key={s.season} className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/30">
                        <label className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-900/50 transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedSeasons.includes(s.season)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedSeasons([...selectedSeasons, s.season]);
                              else setSelectedSeasons(selectedSeasons.filter(sn => sn !== s.season));
                            }}
                            className="rounded bg-zinc-900 border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                          />
                          <div className="font-medium text-white">Season {s.season}</div>
                          <div className="text-xs text-zinc-500 ml-auto">
                            {s.year !== 'N/A' ? `${s.year} • ` : ''}
                            {s.episodes?.length || 0} Episodes
                          </div>
                        </label>
                        
                        {selectedSeasons.includes(s.season) && s.episodes && (
                          <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50">
                            <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                              {s.episodes.map((ep: any) => (
                                <div key={ep.episode_number} className="text-sm flex gap-3 p-2 rounded-lg bg-zinc-900/50">
                                  <div className="text-zinc-500 font-mono w-6 shrink-0">{ep.episode_number}.</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-zinc-200 font-medium truncate">{ep.name}</div>
                                    {ep.overview && <div className="text-xs text-zinc-500 line-clamp-1 mt-0.5">{ep.overview}</div>}
                                  </div>
                                  {ep.runtime && <div className="text-xs text-zinc-600 shrink-0">{ep.runtime}m</div>}
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
          )}
        </div>

        {fetchedData && onApply && (
          <div className="p-4 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-950/50">
            <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-medium">Cancel</button>
            <button 
              onClick={handleApply}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700"
            >
              Apply Selected Data
            </button>
          </div>
        )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
