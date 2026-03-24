import { Type } from "@google/genai";
import { aiService } from './aiService';

export interface MovieMetadata {
  title: string;
  year: number;
  rating: string;
  description: string;
  cast: string;
  posterUrl: string;
  genres: string;
  releaseDate: string;
  duration: string;
  type: 'movie' | 'series';
}

export async function fetchMovieMetadata(title: string, year?: number, imdbLink?: string): Promise<MovieMetadata | null> {
  const prompt = `Fetch accurate metadata for the movie or TV show: "${title}" ${year ? `(${year})` : ''}. 
  ${imdbLink ? `IMDb Link: ${imdbLink}` : ''}
  
  CRITICAL: You MUST find the EXACT IMDb rating (e.g., "8.5/10").
  Also fetch:
  - Accurate title and year
  - High-resolution poster URL (from reliable sources like IMDb or TMDB)
  - Full cast (comma separated)
  - Plot description
  - Release date (DD-MM-YYYY)
  - Runtime/Duration (e.g., "1h 45m" or "45m")
  - Content type ('movie' or 'series')
  - Genres (comma separated)
  
  Use Google Search to ensure the data is up-to-date and accurate.`;

  try {
    const response = await aiService.ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            year: { type: Type.INTEGER },
            rating: { type: Type.STRING },
            description: { type: Type.STRING },
            cast: { type: Type.STRING },
            posterUrl: { type: Type.STRING },
            genres: { type: Type.STRING },
            releaseDate: { type: Type.STRING, description: "DD-MM-YYYY" },
            duration: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['movie', 'series'] }
          },
          required: ["title", "rating", "description", "posterUrl"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text || '{}') as MovieMetadata;
    }
    return null;
  } catch (error) {
    console.error("Error fetching movie metadata with Gemini:", error);
    return null;
  }
}
