import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { aiService, AiModelId } from '../services/aiService';
import { Type } from '@google/genai';
import { Sparkles, Brain, Search as SearchIcon, Zap, Bot, Database, Globe } from 'lucide-react';
import { formatReleaseDate } from '../utils/contentUtils';

interface AIFetchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTitle: string;
  initialYear: number | '';
  initialImdbLink?: string;
  availableGenres: { id: string, name: string }[];
  onApply: (data: any) => void;
}

export default function AIFetchModal({ isOpen, onClose, initialTitle, initialYear, initialImdbLink, availableGenres, onApply }: AIFetchModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedData, setFetchedData] = useState<any>(null);
  const [rawStreamText, setRawStreamText] = useState<string>('');
  
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
  const [includeEpisodeDescriptions, setIncludeEpisodeDescriptions] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setFetchedData(null);
      setRawStreamText('');
      setError(null);
      if (initialTitle || initialImdbLink) {
        fetchDataWithAI();
      }
    }
  }, [isOpen, initialTitle, initialYear, initialImdbLink]);

  const fetchDataWithAI = async () => {
    setLoading(true);
    setError(null);
    try {
      const genreNames = availableGenres.map(g => g.name).join(', ');
      
      const prompt = `Fetch accurate metadata for the movie or TV show titled "${initialTitle || 'Unknown'}" ${initialYear ? `(${initialYear})` : ''}. 
      ${initialImdbLink ? `IMDb Link: ${initialImdbLink}` : ''}
      CRITICAL: You MUST use Google Search to find the EXACT IMDb ID (ttXXXXXXX) and the most accurate high-resolution poster URL.
      Include the poster URL (a valid, high-resolution image link from a reliable source like IMDb, TMDB, or a major movie database. Do not use low-resolution thumbnails or temporary links. Prefer static image URLs). 
      EXACT IMDb link (e.g., https://www.imdb.com/title/tt1234567/), release date (YYYY-MM-DD), runtime in "hh:mm" format (e.g., "02:00" for 120 mins), cast (comma separated), and a plot description.
      Fetch the IMDb rating (e.g., "8.5/10").
      For genres, ONLY select from this exact list: [${genreNames}]. If a genre like "History" is requested but "Historical" is in the list, use "Historical". Match the meaning to the exact list provided.
      If it is a TV series, you MUST include a list of ALL seasons and ALL of their episodes. For EACH season, provide the release year. For EACH episode, provide the episode number, title, description, and the EXACT duration/runtime (e.g., "45m" or "00:45"). Do not skip any episodes.
      Ensure the data is highly accurate and corresponds exactly to the title/IMDb link provided. Double check the IMDb ID and poster URL accuracy.`;

      // Run AI fetch and YouTube trailer fetch in parallel
      const ytPromise = fetch(`/api/youtube/search?q=${encodeURIComponent(initialTitle + " " + (initialYear || "") + " trailer")}`).catch(() => null);
      
      const responseStream = await aiService.fetchMovieDataStream(prompt, {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          year: { type: Type.INTEGER },
          type: { type: Type.STRING, description: "Either 'movie' or 'series'" },
          description: { type: Type.STRING },
          cast: { type: Type.STRING, description: "Comma separated list of main actors" },
          genres: { type: Type.ARRAY, items: { type: Type.STRING } },
          releaseDate: { type: Type.STRING, description: "DD-MM-YYYY" },
          runtime: { type: Type.STRING, description: "Must be in hh:mm format" },
          imdbLink: { type: Type.STRING },
          rating: { type: Type.STRING, description: "IMDb rating like 8.5/10" },
          posterUrl: { type: Type.STRING },
          trailerUrl: { type: Type.STRING, description: "YouTube trailer URL if found" },
          seasons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                seasonNumber: { type: Type.INTEGER },
                seasonYear: { type: Type.INTEGER, description: "Release year of this season" },
                episodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      episodeNumber: { type: Type.INTEGER },
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      duration: { type: Type.STRING }
                    },
                    required: ["episodeNumber", "title", "duration"]
                  }
                }
              },
              required: ["seasonNumber", "episodes", "seasonYear"]
            }
          }
        },
        required: ["title", "type", "description"]
      }, 'gemini-3-flash');

      let fullText = '';
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        setRawStreamText(fullText);
        
        try {
          const lastBrace = fullText.lastIndexOf('}');
          if (lastBrace !== -1) {
            const partialJson = fullText.substring(0, lastBrace + 1);
            const partialData = JSON.parse(partialJson);
            setFetchedData(partialData);
          }
        } catch (e) {}
      }

      const ytRes = await ytPromise;
      if (fullText) {
        const data = JSON.parse(fullText);
        if (ytRes && ytRes.ok) {
          const ytData = await ytRes.json();
          if (ytData.url) {
            data.trailerUrl = ytData.url;
            data.trailerTitle = ytData.title;
          }
        }
        setFetchedData(data);
        if (data.seasons && Array.isArray(data.seasons)) {
          const initialSeasons: Record<number, boolean> = {};
          data.seasons.forEach((s: any) => {
            initialSeasons[s.seasonNumber] = true;
          });
          setSelectedSeasons(initialSeasons);
        }
      }
    } catch (err: any) {
      console.error("AI Fetch Error:", err);
      let message = err.message || "Failed to fetch data using AI.";
      try {
        const parsed = JSON.parse(message);
        if (parsed.error && parsed.error.message) {
          message = parsed.error.message;
        }
      } catch (e) {}
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!fetchedData) return;
    
    const dataToApply: any = {};
    
    // Apply basic fields
    Object.keys(selectedFields).forEach(key => {
      if (selectedFields[key] && fetchedData[key] !== undefined) {
        dataToApply[key] = fetchedData[key];
      }
    });

    // Apply seasons if it's a series
    if (fetchedData.type === 'series' && fetchedData.seasons) {
      const filteredSeasons = fetchedData.seasons.filter((s: any) => selectedSeasons[s.seasonNumber]).map((s: any) => ({
        ...s,
        episodes: s.episodes.map((ep: any) => ({
          ...ep,
          description: includeEpisodeDescriptions ? (ep.description || '') : ''
        }))
      }));
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

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
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
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h2 className="text-xl font-bold text-white">AI Master Fetch</h2>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Searching for "{initialTitle}" {initialYear ? `(${initialYear})` : ''}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-6 max-h-60 overflow-y-auto custom-scrollbar font-mono text-xs text-emerald-500/70 whitespace-pre-wrap text-left break-all">
                  {rawStreamText}
                </div>
                <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
                <p>Gathering accurate data using AI...</p>
                <p className="text-xs mt-2 text-zinc-500">This may take a few moments to fetch episodes and details.</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-red-400">
                <AlertCircle className="w-12 h-12 mb-4" />
                <p>{error}</p>
                <button 
                  onClick={fetchDataWithAI}
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
                    
                    {['title', 'year', 'type', 'releaseDate', 'runtime', 'imdbLink'].map(field => (
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
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Seasons & Episodes</h3>
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
