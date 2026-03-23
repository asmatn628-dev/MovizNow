import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // IMDb Suggestion Proxy
  app.get("/api/imdb/suggestion/:ttId", async (req, res) => {
    try {
      const { ttId } = req.params;
      // Try 'x' prefix first, then 't' if needed, or just use 'x' as it's common for tt IDs
      const response = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${ttId}.json`);
      if (!response.ok) {
        const fallbackResponse = await fetch(`https://v3.sg.media-imdb.com/suggestion/t/${ttId}.json`);
        if (!fallbackResponse.ok) {
          return res.status(fallbackResponse.status).json({ error: "Failed to fetch from IMDb" });
        }
        const data = await fallbackResponse.json();
        return res.json(data);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("IMDb Suggestion Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // IMDb Title Page Proxy
  app.get("/api/imdb/title/:ttId", async (req, res) => {
    try {
      const { ttId } = req.params;
      const response = await fetch(`https://www.imdb.com/title/${ttId}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand)";v="24", "Google Chrome";v="122"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      if (!response.ok) {
        console.error(`IMDb Proxy: Failed to fetch ${ttId}, status: ${response.status}`);
        return res.status(response.status).json({ error: `Failed to fetch from IMDb: ${response.status}` });
      }
      const html = await response.text();
      res.send(html);
    } catch (error) {
      console.error("IMDb Title Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // YouTube Search Proxy
  app.get("/api/youtube/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.status(400).json({ error: "Query required" });
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q as string)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      const html = await response.text();
      // Extract the first video ID and title
      const match = html.match(/"videoId":"([^"]+)"/);
      const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}\]/);
      
      if (match && match[1]) {
        return res.json({ 
          videoId: match[1], 
          url: `https://www.youtube.com/watch?v=${match[1]}`,
          title: titleMatch ? titleMatch[1] : "YouTube Video"
        });
      }
      res.status(404).json({ error: "No video found" });
    } catch (error) {
      console.error("YouTube Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
