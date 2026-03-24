import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // IMDb Fetch Proxy
  app.get("/api/imdb-fetch", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') return res.status(400).json({ error: "IMDb URL required" });
      
      const match = url.match(/tt\d+/);
      if (!match) return res.status(400).json({ error: "Invalid IMDb URL" });
      const ttId = match[0];

      // Try TVMaze lookup
      console.log(`Fetching TVMaze for IMDb ID: ${ttId}`);
      const response = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${ttId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.error(`TVMaze lookup not found for ${ttId}`);
          return res.status(404).json({ error: "Content not found on TVMaze. Please try AI fetch." });
        }
        const errorText = await response.text();
        console.error(`TVMaze lookup failed for ${ttId}: ${response.status} - ${errorText}`);
        return res.status(response.status).json({ error: `Failed to fetch from TVMaze: ${response.statusText}` });
      }
      
      const showData = await response.json();
      
      // Fetch episodes
      console.log(`Fetching episodes for TVMaze ID: ${showData.id}`);
      const episodesResponse = await fetch(`https://api.tvmaze.com/shows/${showData.id}/episodes`);
      
      if (!episodesResponse.ok) {
        const errorText = await episodesResponse.text();
        console.error(`TVMaze episodes failed for ${showData.id}: ${episodesResponse.status} - ${errorText}`);
        return res.status(episodesResponse.status).json({ error: `Failed to fetch episodes from TVMaze: ${episodesResponse.statusText}` });
      }
      
      const episodes = await episodesResponse.json();

      res.json({
        ...showData,
        episodes
      });
    } catch (error) {
      console.error("IMDb Fetch Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // IMDb Suggestion Proxy
  app.get("/api/imdb/suggestion/:ttId", async (req, res) => {
    try {
      const { ttId } = req.params;
      const firstLetter = ttId.charAt(0).toLowerCase();
      
      const response = await fetch(`https://v3.sg.media-imdb.com/suggestion/${firstLetter}/${ttId}.json`);
      if (!response.ok) {
        // Fallback to 'x' if the first letter doesn't work (sometimes used for newer IDs)
        const fallbackResponse = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${ttId}.json`);
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

  // Helper to fetch movie details and generate OG tags
  const getOgTags = async (req: express.Request) => {
    const urlPath = req.originalUrl;
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    let title = "MovizNow";
    let description = "Your premium movie and series streaming platform";
    let image = `${baseUrl}/pwa-512x512.png`; // Use absolute URL for OG image
    
    const movieMatch = urlPath.match(/^\/movie\/([^/?]+)/);
    if (movieMatch) {
      const movieId = movieMatch[1];
      try {
        const { projectId, firestoreDatabaseId } = firebaseConfig;
        const dbId = firestoreDatabaseId || '(default)';
        const apiUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/content/${movieId}`;
        
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.fields) {
            const movieTitle = data.fields.title?.stringValue || "";
            const year = data.fields.year?.integerValue || data.fields.year?.stringValue || "";
            
            // Fetch genres if available
            let genreNames = "";
            if (data.fields.genreIds?.arrayValue?.values) {
              try {
                const genresUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/genres`;
                const genresResponse = await fetch(genresUrl);
                if (genresResponse.ok) {
                  const genresData = await genresResponse.json();
                  if (genresData.documents) {
                    const genreIds = data.fields.genreIds.arrayValue.values.map((v: any) => v.stringValue);
                    const matchedGenres = genresData.documents
                      .filter((doc: any) => genreIds.includes(doc.name.split('/').pop()))
                      .map((doc: any) => doc.fields.name?.stringValue)
                      .filter(Boolean);
                    if (matchedGenres.length > 0) {
                      genreNames = ` | ${matchedGenres.join(', ')}`;
                    }
                  }
                }
              } catch (e) {
                console.error("Error fetching genres for OG tags:", e);
              }
            }

            title = `${movieTitle} ${year ? `(${year})` : ''}${genreNames} - MovizNow`;
            
            description = data.fields.description?.stringValue || description;
            
            if (data.fields.posterUrl?.stringValue) {
              image = data.fields.posterUrl.stringValue;
              // Ensure image is absolute
              if (image.startsWith('/')) {
                image = `${baseUrl}${image}`;
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching movie for OG tags:", error);
      }
    }

    return `
      <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
      <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
      <meta property="og:image" content="${image}" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="${baseUrl}${urlPath}" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
      <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
      <meta name="twitter:image" content="${image}" />
    `;
  };

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom", // Change to custom to handle HTML manually
    });
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        
        const ogTags = await getOgTags(req);
        const html = template.replace('</head>', `${ogTags}</head>`);
        
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, '../dist');
    app.use(express.static(distPath, { index: false })); // Disable default index.html serving
    
    app.get('*', async (req, res) => {
      try {
        const templatePath = path.join(distPath, 'index.html');
        if (!fs.existsSync(templatePath)) {
          console.error(`Template not found at: ${templatePath}`);
          return res.status(404).send("Template not found. Make sure the app is built.");
        }
        let template = fs.readFileSync(templatePath, 'utf-8');
        
        const ogTags = await getOgTags(req);
        const html = template.replace('</head>', `${ogTags}</head>`);
        
        res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
      } catch (e) {
        console.error("Production Error:", e);
        res.status(500).end((e as Error).message);
      }
    });
  }

  // Only listen if not running as a Vercel function
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

// For Vercel serverless functions, we need to export the app
const appPromise = startServer();
export default async (req: express.Request, res: express.Response) => {
  const app = await appPromise;
  return app(req, res);
};
