import React, { useState } from 'react';
import { X, Search, Check, Loader2 } from 'lucide-react';

interface IMDbMasterFetchModalProps {
  isOpen: boolean;
  onClose: () => void;
  imdbLink: string;
  onApply: (data: any) => void;
}

export default function IMDbMasterFetchModal({ isOpen, onClose, imdbLink, onApply }: IMDbMasterFetchModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);

  const fetchImdbData = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      // 1. Try TVMaze
      const response = await fetch(`/api/imdb-fetch?url=${encodeURIComponent(imdbLink)}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
        if (result.episodes) {
          const seasons = Array.from(new Set(result.episodes.map((ep: any) => ep.season)));
          setSelectedSeasons(seasons as number[]);
        }
        return;
      }

      // 2. If TVMaze fails, try scraping IMDb
      const match = imdbLink.match(/tt\d+/);
      if (!match) throw new Error("Invalid IMDb URL");
      const ttId = match[0];
      
      const imdbResponse = await fetch(`/api/imdb/title/${ttId}`);
      if (!imdbResponse.ok) throw new Error("Failed to fetch data from IMDb.");
      const html = await imdbResponse.text();

      // 3. Parse with AI
      const prompt = `Parse this IMDb page HTML and return a JSON object with: title, description, posterUrl, year, cast (array), genres (array).
      HTML: ${html.substring(0, 5000)}`; // Limit HTML size for AI
      const aiResult = await aiService.chat(prompt, "You are a helpful assistant that parses HTML and returns JSON.");
      const parsedData = JSON.parse(aiResult || "{}");
      
      // 4. Fetch trailer
      const ytResponse = await fetch(`/api/youtube/search?q=${encodeURIComponent(parsedData.title + " " + (parsedData.year || "") + " trailer")}`);
      if (ytResponse.ok) {
        const ytData = await ytResponse.json();
        parsedData.trailerUrl = ytData.url;
        parsedData.trailerTitle = ytData.title;
      }
      
      setData(parsedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">IMDb Master Fetch</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          {!data && (
            <div className="flex flex-col items-center gap-4 py-10">
              <button 
                onClick={fetchImdbData}
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Fetch Data
              </button>
              {error && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}

          {data && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {data.image?.original && <img src={data.image.original} alt={data.name} className="w-32 h-48 object-cover rounded" />}
                <div>
                  <h3 className="text-xl font-bold text-white">{data.name}</h3>
                  <p className="text-sm text-zinc-400 mt-2">{data.summary?.replace(/<[^>]*>/g, '')}</p>
                </div>
              </div>
              
              {data.episodes && (
                <div>
                  <h4 className="font-semibold text-white mb-2">Select Seasons:</h4>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(data.episodes.map((ep: any) => ep.season))).map((s: any) => (
                      <label key={s} className="flex items-center gap-2 bg-zinc-800 px-3 py-1 rounded text-sm text-zinc-300 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedSeasons.includes(s)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedSeasons([...selectedSeasons, s]);
                            else setSelectedSeasons(selectedSeasons.filter(sn => sn !== s));
                          }}
                        />
                        Season {s}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
          <button 
            onClick={() => {
              if (data) {
                // Map data to structure
                const mapped = {
                    title: data.name,
                    description: data.summary?.replace(/<[^>]*>/g, ''),
                    genres: data.genres,
                    posterUrl: data.image?.original || data.posterUrl,
                    imdbLink: imdbLink,
                    trailerUrl: data.trailerUrl,
                    seasons: data.episodes ? data.episodes.filter((ep: any) => selectedSeasons.includes(ep.season)).reduce((acc: any[], ep: any) => {
                        const seasonNum = ep.season;
                        let season = acc.find(s => s.seasonNumber === seasonNum);
                        if (!season) {
                          season = { seasonNumber: seasonNum, episodes: [] };
                          acc.push(season);
                        }
                        season.episodes.push({
                          episodeNumber: ep.number,
                          title: ep.name,
                          description: ep.summary?.replace(/<[^>]*>/g, ''),
                          duration: ep.runtime ? `${ep.runtime}m` : ''
                        });
                        return acc;
                      }, []) : []
                };
                onApply(mapped);
                onClose();
              }
            }}
            disabled={!data}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            Apply Data
          </button>
        </div>
      </div>
    </div>
  );
}
