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
  seasons?: any[];
}

export type AiModelId = 
  | 'gemini-3.1-pro' 
  | 'gemini-3.1-flash-lite' 
  | 'gemini-3-flash';

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
   * Fetches accurate movie/series data using the selected Gemini model.
   */
  public async fetchMovieData(
    title: string, 
    year: string, 
    type: 'movie' | 'series', 
    currentImdbId?: string | null,
    modelId: AiModelId = 'gemini-3-flash'
  ): Promise<MovieAiData | null> {
    const prompt = `Search for the official IMDb details for the ${type} "${title}" (${year}). 
    Current IMDb ID provided: ${currentImdbId || 'None'}.
    If the provided ID is missing or seems incorrect for this title, find the correct official IMDb 'tt' ID.
    Return the data in JSON format including:
    - imdbId: The official IMDb ID (e.g., tt0111161)
    - rating: The current IMDb rating (e.g., 9.3/10)
    - releaseDate: The official release date in DD-MM-YYYY format
    - duration: The runtime in minutes
    - cast: Top 5 lead actors
    - description: A concise synopsis
    - posterUrl: A direct link to a high-quality official poster (prefer IMDb or TMDB CDN links).
    - title: The official title
    - year: The release year`;

    // Map internal IDs to full model names
    const modelMap: Record<AiModelId, string> = {
      'gemini-3.1-pro': 'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
      'gemini-3-flash': 'gemini-3-flash-preview'
    };

    try {
      const response = await this.ai.models.generateContent({
        model: modelMap[modelId],
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              imdbId: { type: Type.STRING },
              rating: { type: Type.STRING },
              releaseDate: { type: Type.STRING, description: "DD-MM-YYYY" },
              duration: { type: Type.STRING },
              cast: { type: Type.STRING },
              description: { type: Type.STRING },
              posterUrl: { type: Type.STRING },
              title: { type: Type.STRING },
              year: { type: Type.STRING }
            }
          }
        }
      });
      return JSON.parse(response.text);
    } catch (error) {
      console.error(`AI Service Error (${modelId}):`, error);
      // Fallback to Flash if Pro fails
      if (modelId !== 'gemini-3-flash') {
        return this.fetchMovieData(title, year, type, currentImdbId, 'gemini-3-flash');
      }
      return null;
    }
  }

  /**
   * Fetches comprehensive movie/series data with streaming support.
   */
  public async fetchMovieDataStream(prompt: string, schema: any, modelId: AiModelId = 'gemini-3-flash') {
    const modelMap: Record<AiModelId, string> = {
      'gemini-3.1-pro': 'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
      'gemini-3-flash': 'gemini-3-flash-preview'
    };

    return this.ai.models.generateContentStream({
      model: modelMap[modelId],
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
        model: "gemini-3.1-flash-lite-preview",
        contents: message,
        config: {
          systemInstruction: systemInstruction || "You are a helpful assistant for a movie streaming platform.",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
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
