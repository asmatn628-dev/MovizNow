import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface MovieData {
  title: string;
  year: number;
  description: string;
  cast: string[];
  posterUrl: string;
  type: 'movie' | 'series';
  genres: string[];
}

export const fetchContentDataWithAI = async (query: string): Promise<MovieData | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Fetch detailed information about the movie or series: "${query}". Provide the title, release year, a short description, main cast members, a poster image URL, type (movie or series), and genres.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            year: { type: Type.INTEGER },
            description: { type: Type.STRING },
            cast: { type: Type.ARRAY, items: { type: Type.STRING } },
            posterUrl: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["movie", "series"] },
            genres: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "year", "description", "cast", "posterUrl", "type", "genres"]
        },
      },
    });

    if (!response.text) return null;
    return JSON.parse(response.text) as MovieData;
  } catch (error) {
    console.error("Error fetching content data with AI:", error);
    return null;
  }
};
