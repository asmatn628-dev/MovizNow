import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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
  | 'gemini-3-flash' 
  | 'gpt-5.2-thinking' 
  | 'claude-opus-4.6' 
  | 'openai-o4-mini' 
  | 'deepseek-r1' 
  | 'mistral-large-3' 
  | 'perplexity-ai';

export class AiService {
  private static instance: AiService;
  private ai: GoogleGenAI;
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private mistral: OpenAI | null = null;
  private deepseek: OpenAI | null = null;
  private perplexity: OpenAI | null = null;

  private constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, dangerouslyAllowBrowser: true });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });
    }

    if (process.env.MISTRAL_API_KEY) {
      this.mistral = new OpenAI({
        apiKey: process.env.MISTRAL_API_KEY,
        baseURL: "https://api.mistral.ai/v1",
        dangerouslyAllowBrowser: true
      });
    }

    if (process.env.DEEPSEEK_API_KEY) {
      this.deepseek = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: "https://api.deepseek.com",
        dangerouslyAllowBrowser: true
      });
    }

    if (process.env.PERPLEXITY_API_KEY) {
      this.perplexity = new OpenAI({
        apiKey: process.env.PERPLEXITY_API_KEY,
        baseURL: "https://api.perplexity.ai",
        dangerouslyAllowBrowser: true
      });
    }
  }

  public static getInstance(): AiService {
    if (!AiService.instance) {
      AiService.instance = new AiService();
    }
    return AiService.instance;
  }

  /**
   * Fetches accurate movie/series data using the selected AI model.
   * Defaults to Perplexity for speed/accuracy if available, then Gemini.
   */
  public async fetchMovieData(
    title: string, 
    year: string, 
    type: 'movie' | 'series', 
    currentImdbId?: string | null,
    modelId?: AiModelId
  ): Promise<MovieAiData | null> {
    // Determine the best model to use if not specified
    let effectiveModelId: AiModelId = modelId || 'gemini-3-flash';
    
    if (!modelId) {
      if (this.perplexity) effectiveModelId = 'perplexity-ai';
      else if (this.deepseek) effectiveModelId = 'deepseek-r1';
    }

    const prompt = `Search for the official IMDb details for the ${type} "${title}" (${year}). 
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
    - year: The release year`;

    try {
      switch (effectiveModelId) {
        case 'perplexity-ai':
          return await this.fetchWithPerplexity(title, year, type);
        case 'deepseek-r1':
          return await this.fetchWithDeepSeek(title, year, type);
        case 'gpt-5.2-thinking':
          return await this.fetchWithOpenAI(prompt, "gpt-5.2-thinking");
        case 'openai-o4-mini':
          return await this.fetchWithOpenAI(prompt, "o4-mini");
        case 'claude-opus-4.6':
          return await this.fetchWithClaude(prompt, "claude-4-6-opus");
        case 'mistral-large-3':
          return await this.fetchWithMistral(prompt, "mistral-large-latest");
        case 'gemini-3-flash':
        default:
          const response = await this.ai.models.generateContent({
            model: "gemini-3-flash-preview",
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
                  releaseDate: { type: Type.STRING },
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
      }
    } catch (error) {
      console.error(`AI Service Error (${effectiveModelId}):`, error);
      // Fallback to Gemini if other models fail
      if (effectiveModelId !== 'gemini-3-flash') {
        return this.fetchMovieData(title, year, type, currentImdbId, 'gemini-3-flash');
      }
      return null;
    }
  }

  private async fetchWithOpenAI(prompt: string, model: string): Promise<MovieAiData | null> {
    if (!this.openai) return null;
    const response = await this.openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content || "null");
  }

  private async fetchWithClaude(prompt: string, model: string): Promise<MovieAiData | null> {
    if (!this.anthropic) return null;
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt + "\nReturn ONLY valid JSON." }]
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text || "null");
  }

  private async fetchWithMistral(prompt: string, model: string): Promise<MovieAiData | null> {
    if (!this.mistral) return null;
    const response = await this.mistral.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content || "null");
  }

  public async fetchWithPerplexity(title: string, year: string, type: string): Promise<MovieAiData | null> {
    if (!this.perplexity) return null;
    try {
      const response = await this.perplexity.chat.completions.create({
        model: "sonar-reasoning-pro",
        messages: [
          {
            role: "system",
            content: "You are a movie database expert. Return ONLY a JSON object with movie details."
          },
          {
            role: "user",
            content: `Find accurate IMDb details for ${type} "${title}" (${year}). 
            Include: imdbId (ttXXXXXXX), rating, releaseDate, duration, cast, description, posterUrl, title, year.
            Ensure the posterUrl is a high-quality official link.`
          }
        ],
        response_format: { type: "json_object" }
      });
      return JSON.parse(response.choices[0].message.content || "null");
    } catch (error) {
      console.error("Perplexity Error:", error);
      return null;
    }
  }

  public async fetchWithDeepSeek(title: string, year: string, type: string): Promise<MovieAiData | null> {
    if (!this.deepseek) return null;
    try {
      const response = await this.deepseek.chat.completions.create({
        model: "deepseek-reasoner",
        messages: [
          {
            role: "system",
            content: "You are a movie database expert. Return ONLY a JSON object with movie details."
          },
          {
            role: "user",
            content: `Analyze and find accurate IMDb details for ${type} "${title}" (${year}). 
            Include: imdbId (ttXXXXXXX), rating, releaseDate, duration, cast, description, posterUrl, title, year.`
          }
        ],
        response_format: { type: "json_object" }
      });
      return JSON.parse(response.choices[0].message.content || "null");
    } catch (error) {
      console.error("DeepSeek Error:", error);
      return null;
    }
  }

  /**
   * Fetches comprehensive movie/series data with streaming support (Gemini only for now).
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
