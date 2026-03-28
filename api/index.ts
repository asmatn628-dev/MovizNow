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
          return res.status(404).json({ error: "Content not found on TVMaze. Please try manual entry or Master Fetch." });
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

  // TinyURL Proxy
  app.get("/api/tinyurl", async (req, res) => {
    try {
      const { url, alias } = req.query;
      if (!url || typeof url !== 'string') return res.status(400).json({ error: "URL required" });
      
      let fetchUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
      if (alias && typeof alias === 'string') {
        fetchUrl += `&alias=${encodeURIComponent(alias)}`;
      }
      
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to create TinyURL" });
      }
      
      const shortUrl = await response.text();
      res.send(shortUrl);
    } catch (error) {
      console.error("TinyURL Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Server-side Link Scanner
  app.post("/api/scan-links", async (req, res) => {
    try {
      const { links } = req.body;
      if (!links || !Array.isArray(links)) return res.status(400).json({ error: "Links array required" });

      console.log(`Starting server-side scan for ${links.length} links`);
      
      const results = await Promise.all(links.map(async (link) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          let fetchUrl = link.url;
          // If it's a pixeldrain link, use the API for faster checking
          const pdMatch = fetchUrl.match(/pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/);
          if (pdMatch) {
            fetchUrl = `https://pixeldrain.com/api/file/${pdMatch[1]}/info`;
          }
          
          const response = await fetch(fetchUrl, { 
            method: pdMatch ? 'GET' : 'HEAD',
            signal: controller.signal 
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            return { ...link, errorDetail: `HTTP ${response.status}` };
          }
          return { ...link, errorDetail: null };
        } catch (e: any) {
          if (e.name === 'AbortError') {
            return { ...link, errorDetail: 'Timeout' };
          }
          return { ...link, errorDetail: 'Network error' };
        }
      }));

      res.json({ results });
    } catch (error) {
      console.error("Scan Links Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  function formatBytes(bytes?: number) {
    if (!bytes || Number.isNaN(bytes)) return undefined;
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
  }

  // Advanced Link Checker API
  app.post("/api/check-link", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ ok: false, statusLabel: "BROKEN", message: "Missing URL" });
      }

      let parsed: URL;
      try { parsed = new URL(url); } catch {
        return res.status(400).json({ ok: false, statusLabel: "BROKEN", message: "Invalid URL" });
      }

      const host = parsed.hostname.replace(/^www\./, "");
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      };

      // PIXELDRAIN SPECIAL CHECK
      if (host.includes("pixeldrain.com") || host.includes("pixeldrain.dev")) {
        const match = parsed.pathname.match(/\/u\/([^/?#]+)/);
        if (match?.[1]) {
          const fileId = match[1];
          try {
            const infoRes = await fetch(
              `https://pixeldrain.com/api/file/${fileId}/info`,
              { method: "GET", headers: { ...headers, Accept: "application/json,text/plain,*/*" } }
            );

            if (infoRes.status === 404) {
              return res.json({ ok: false, status: 404, statusLabel: "BROKEN", message: "Pixeldrain file not found or deleted", finalUrl: url, source: "pixeldrain-api", host });
            }

            if (infoRes.status === 429) {
              return res.json({ ok: false, status: 429, statusLabel: "UNAVAILABLE", message: "Pixeldrain temporarily unavailable or rate-limited", finalUrl: url, source: "pixeldrain-api", host });
            }

            if (infoRes.ok) {
              const data: any = await infoRes.json();

              const dlRes = await fetch(
                `https://pixeldrain.com/api/file/${fileId}`,
                { method: "GET", headers: { ...headers, Range: "bytes=0-0" }, redirect: "manual" }
              ).catch(() => null);

              const contentType = dlRes?.headers.get("content-type") || "pixeldrain/file";
              const disposition = dlRes?.headers.get("content-disposition") || "";
              const contentLength = dlRes?.headers.get("content-length");
              const fileSize = typeof data?.size === "number" ? data.size : contentLength ? Number(contentLength) : undefined;
              const fileSizeText = formatBytes(fileSize);
              const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
              const fileName = data?.name || (fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : undefined);

              if (!dlRes) {
                return res.json({ ok: false, statusLabel: "UNAVAILABLE", message: "Pixeldrain metadata exists but file is temporarily unavailable.", finalUrl: url, contentType, isDirectDownload: false, fileName, fileSize, fileSizeText, source: "pixeldrain-download-probe", host });
              }

              if (dlRes.status === 403 || dlRes.status === 451) {
                return res.json({ ok: false, status: dlRes.status, statusLabel: "UNAVAILABLE", message: "Pixeldrain file exists but is not available for download right now.", finalUrl: url, contentType, isDirectDownload: false, fileName, fileSize, fileSizeText, source: "pixeldrain-download-probe", host });
              }

              if (dlRes.ok || dlRes.status === 206 || dlRes.status === 302) {
                return res.json({ ok: true, status: dlRes.status || 200, statusLabel: "WORKING", message: fileName ? `Pixeldrain file available: ${fileName}` : "Pixeldrain file is available", finalUrl: url, contentType, isDirectDownload: true, fileName, fileSize, fileSizeText, source: "pixeldrain-api+download-probe", host });
              }

              return res.json({ ok: false, status: dlRes.status, statusLabel: "UNAVAILABLE", message: "Pixeldrain file metadata exists, but download appears unavailable.", finalUrl: url, contentType, isDirectDownload: false, fileName, fileSize, fileSizeText, source: "pixeldrain-api+download-probe", host });
            }
          } catch {
            return res.json({ ok: false, statusLabel: "UNAVAILABLE", message: "Pixeldrain could not be verified right now.", finalUrl: url, source: "pixeldrain-api", host });
          }
        }
      }

      // RAJ / GATE CHECK
      if (host === "hub.raj.lat" || host.endsWith(".raj.lat")) {
        try {
          const fetchRes = await fetch(url, { method: "GET", headers, redirect: "manual" });
          const location = fetchRes.headers.get("location") || undefined;
          const contentType = fetchRes.headers.get("content-type") || undefined;
          const disposition = fetchRes.headers.get("content-disposition") || "";
          const contentLength = fetchRes.headers.get("content-length");
          const fileSize = contentLength ? Number(contentLength) : undefined;
          const fileSizeText = formatBytes(fileSize);
          const isAttachment = /attachment/i.test(disposition);
          const isFileType = !!contentType && !/text\/html|application\/json/i.test(contentType);
          const isPartial = fetchRes.status === 206;
          const isDirectDownload = isAttachment || isFileType || isPartial;
          const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
          const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : undefined;

          if (isDirectDownload && (fetchRes.ok || isPartial)) {
            return res.json({ ok: true, status: fetchRes.status, statusLabel: "WORKING", message: "Valid direct file / download link detected.", finalUrl: url, contentType, isDirectDownload: true, fileName, fileSize, fileSizeText, source: "download-detect", host });
          }

          if (fetchRes.status >= 300 && fetchRes.status < 400) {
            return res.json({ ok: true, status: fetchRes.status, statusLabel: "REDIRECT", message: "Protected redirect link is alive", finalUrl: location || url, contentType, source: "redirect-probe", host });
          }

          const html = await fetchRes.text().catch(() => "");
          const lower = html.toLowerCase();
          if (lower.includes("not found") || lower.includes("invalid link") || lower.includes("link expired") || lower.includes("expired") || lower.includes("404")) {
            return res.json({ ok: false, status: fetchRes.status || 404, statusLabel: "BROKEN", message: "Protected link exists but target appears invalid or expired", finalUrl: url, contentType, source: "html-scan", host });
          }
          if (lower.includes("cloudflare") || lower.includes("checking your browser") || lower.includes("captcha") || lower.includes("access denied") || lower.includes("forbidden")) {
            return res.json({ ok: true, status: fetchRes.status || 200, statusLabel: "PROTECTED", message: "Link is alive but protected by anti-bot or gateway", finalUrl: url, contentType, source: "protection-detect", host });
          }
          if (fetchRes.ok) {
            return res.json({ ok: true, status: fetchRes.status, statusLabel: "WORKING", message: "Protected landing page is reachable", finalUrl: url, contentType, source: "html-scan", host });
          }
        } catch {}
      }

      // GENERAL CHECK
      try {
        let res_fetch = await fetch(url, { method: "HEAD", headers, redirect: "follow" });
        if (!res_fetch.ok || res_fetch.status === 405) {
          res_fetch = await fetch(url, { method: "GET", headers: { ...headers, Range: "bytes=0-0" }, redirect: "follow" });
        }

        const contentType = res_fetch.headers.get("content-type") || undefined;
        const disposition = res_fetch.headers.get("content-disposition") || "";
        const contentLength = res_fetch.headers.get("content-length");
        const fileSize = contentLength ? Number(contentLength) : undefined;
        const fileSizeText = formatBytes(fileSize);
        const isAttachment = /attachment/i.test(disposition);
        const isFileType = !!contentType && !/text\/html|application\/json/i.test(contentType);
        const isPartial = res_fetch.status === 206;
        const isDirectDownload = isAttachment || isFileType || isPartial;
        const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
        const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : undefined;

        if (res_fetch.ok || res_fetch.status === 206) {
          return res.json({ ok: true, status: res_fetch.status, statusLabel: "WORKING", message: isDirectDownload ? "Valid direct file / download link detected." : "Link is reachable", finalUrl: res_fetch.url, contentType, isDirectDownload, fileName, fileSize, fileSizeText, source: "general-check", host });
        }

        return res.json({ ok: false, status: res_fetch.status, statusLabel: "BROKEN", message: `HTTP ${res_fetch.status}`, finalUrl: res_fetch.url || url, contentType, source: "general-check", host });
      } catch {
        return res.json({ ok: false, statusLabel: "UNKNOWN", message: "Could not verify this host", finalUrl: url, source: "general-check", host });
      }
    } catch (error) {
      console.error("Check Link Error:", error);
      res.status(500).json({ ok: false, statusLabel: "UNKNOWN", message: "Unexpected server error" });
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
