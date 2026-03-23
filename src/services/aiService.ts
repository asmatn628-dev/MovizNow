import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

export interface MovieAiData {
  imdbId?: string;
  rating?: string;
  releaseDate?: string;
  duration?: string;
  cast?: string;
  description?: string;
  posterUrl?: string;
  title?: string;
  year?: string;
}

export class AiService {
  private static instance: AiService;
  private ai: GoogleGenAI;

  private constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  public static getInstance(): AiService {
    if (!AiService.instance) {
      AiService.instance = new AiService();
    }
    return AiService.instance;
  }

  /**
   * Fetches accurate movie/series data using the fastest and most accurate Gemini model.
   * Uses Google Search grounding for real-time accuracy.
   */
  public async fetchMovieData(title: string, year: string, type: 'movie' | 'series', currentImdbId?: string | null): Promise<MovieAiData | null> {
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Search for the official IMDb details for the ${type} "${title}" (${year}). 
        Current IMDb ID provided: ${currentImdbId || 'None'}.
        If the provided ID is missing or seems incorrect for this title, find the correct official IMDb 'tt' ID.
        Return the data in JSON format including:
        - imdbId: The official IMDb ID (e.g., tt0111161)
        - rating: The current IMDb rating (e.g., 9.3/10)
        - releaseDate: The official release date
        - duration: The runtime in minutes
        - cast: Top 5 lead actors
        - description: A concise synopsis
        - posterUrl: A direct link to a high-quality official poster (prefer IMDb or TMDB CDN links).
        - title: The official title
        - year: The release year`,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }, // Use thinking for accuracy
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              imdbId: { type: Type.STRING, description: "Official IMDb tt ID" },
              rating: { type: Type.STRING, description: "IMDb rating" },
              releaseDate: { type: Type.STRING, description: "Release date" },
              duration: { type: Type.STRING, description: "Runtime" },
              cast: { type: Type.STRING, description: "Top cast members" },
              description: { type: Type.STRING, description: "Synopsis" },
              posterUrl: { type: Type.STRING, description: "High quality poster URL" },
              title: { type: Type.STRING, description: "Official title" },
              year: { type: Type.STRING, description: "Release year" }
            }
          }
        }
      });
      return JSON.parse(response.text);
    } catch (error) {
      console.error("AI Service Error:", error);
      return null;
    }
  }

  /**
   * Fetches comprehensive movie/series data with streaming support.
   */
  public async fetchMovieDataStream(prompt: string, schema: any) {
    return this.ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
  }

  /**
   * General purpose AI chat for the app.
   */
  public async chat(message: string, systemInstruction?: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: message,
        config: {
          systemInstruction: systemInstruction || "You are a helpful assistant for a movie streaming platform.",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } // Low thinking for fast chat
        }
      });
      return response.text;
    } catch (error) {
      console.error("AI Chat Error:", error);
      return "I'm sorry, I'm having trouble processing your request right now.";
    }
  }
}

export const aiService = AiService.getInstance();
