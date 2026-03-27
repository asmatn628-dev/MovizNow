import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface LinkCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LinkCheckerModal: React.FC<LinkCheckerModalProps> = ({ isOpen, onClose }) => {
  const [urls, setUrls] = useState('');
  const [results, setResults] = useState<React.ReactNode>(<p>No links checked yet.</p>);
  const [isChecking, setIsChecking] = useState(false);
  const [useCorsProxy, setUseCorsProxy] = useState(false);

  const isPixelDrainLink = (url: string) => /pixeldrain\.(com|dev)/i.test(url);

  const extractPixelDrainId = (url: string) => {
    const patterns = [
      /pixeldrain\.(com|dev)\/u\/([a-zA-Z0-9]+)/,
      /pixeldrain\.(com|dev)\/api\/file\/([a-zA-Z0-9]+)/,
      /pixeldrain\.(com|dev)\/l\/([a-zA-Z0-9]+)/,
      /pixeldrain\.(com|dev)\/f\/([a-zA-Z0-9]+)/,
      /^([a-zA-Z0-9]+)$/
    ];
    for (let pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[match.length - 1];
    }
    return null;
  };

  const interpretPixelDrainError = (data: any) => {
    if (!data) return "Unknown error";
    const error = data.error || data.message || "";
    if (typeof error === 'string') {
      const lowerError = error.toLowerCase();
      if (lowerError.includes('file_removed') || lowerError.includes('deleted') || lowerError.includes('expired')) {
        return "❌ File removed (deleted/expired).";
      }
      if (lowerError.includes('copyright') || lowerError.includes('dmca') || lowerError.includes('legal') || lowerError.includes('takedown')) {
        return "⚠️ File removed for legal reasons (DMCA/Copyright).";
      }
      if (lowerError.includes('private')) {
        return "🔒 File is private and cannot be accessed.";
      }
      if (lowerError.includes('not found')) {
        return "❌ File not found (ID invalid or removed).";
      }
      return `❌ Error: ${error}`;
    }
    return "❌ File not available (no details).";
  };

  const checkPixelDrainLink = async (url: string) => {
    const id = extractPixelDrainId(url);
    if (!id) return { url, status: 'error', reason: 'Invalid PixelDrain URL or ID' };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`https://pixeldrain.com/api/file/${id}/info`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.success === false || data.error) return { url, status: 'error', reason: interpretPixelDrainError(data) };
        if (data.name) {
          const sizeMB = data.size ? (data.size / 1024 / 1024).toFixed(2) : 'unknown';
          return { url, status: 'working', reason: `✅ Working – ${data.name} (${sizeMB} MB)` };
        }
        return { url, status: 'error', reason: 'File info missing (maybe private or deleted)' };
      }
      if (response.status === 404) return { url, status: 'error', reason: '❌ File not found (404).' };
      if (response.status === 403) return { url, status: 'error', reason: '⛔ Access forbidden (403).' };
      if (response.status === 429) return { url, status: 'error', reason: '⚠️ Rate limited (429).' };
      return { url, status: 'error', reason: `HTTP ${response.status} – Unexpected server response.` };
    } catch (err: any) {
      return { url, status: 'error', reason: `🌐 Network error: ${err.message}` };
    }
  };

  const fetchWithFallback = async (url: string) => {
    let targetUrl = useCorsProxy ? `https://cors-anywhere.herokuapp.com/${url}` : url;

    // First try HEAD
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      response = await fetch(targetUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (err) {
      throw err;
    }

    // If HEAD succeeded with 2xx, return that response
    if (response.ok) {
      return { response, methodUsed: 'HEAD' };
    }
    // If HEAD returned 403 or 405 (Method Not Allowed), try GET with Range
    if (response.status === 403 || response.status === 405) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const rangeResponse = await fetch(targetUrl, {
          method: 'GET',
          headers: { 'Range': 'bytes=0-0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        // If the server returns 200 (ignoring Range), we still have headers.
        // We must abort the body stream immediately to avoid downloading the whole file.
        if (rangeResponse.body) {
          (rangeResponse.body as any).cancel(); // Abort download
        }

        // Accept 206 (Partial Content) or 200 (Full, but we've cancelled)
        if (rangeResponse.ok || rangeResponse.status === 206) {
          return { response: rangeResponse, methodUsed: 'GET_RANGE' };
        } else {
          return { response: rangeResponse, methodUsed: 'GET_RANGE_FAILED' };
        }
      } catch (err) {
        throw err;
      }
    }
    // Otherwise, return the original HEAD response (which is error)
    return { response, methodUsed: 'HEAD' };
  };

  const checkGenericLink = async (url: string) => {
    try {
      const { response, methodUsed } = await fetchWithFallback(url);
      if (response.ok || response.status === 206) {
        // Extract filename
        let filename = '';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.includes('filename=')) {
          const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match && match[1]) {
            filename = match[1].replace(/['"]/g, '');
          }
        }
        if (!filename) {
          const urlParts = url.split('/');
          filename = decodeURIComponent(urlParts[urlParts.length - 1]) || 'file';
        }
        const contentType = response.headers.get('Content-Type') || 'unknown';
        const contentLength = response.headers.get('Content-Length');
        const size = contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(2) + ' MB' : 'unknown size';
        let methodInfo = methodUsed === 'HEAD' ? '' : ' (via range request)';
        return {
          url,
          status: 'working',
          reason: `✅ Working – ${filename} (${size}, ${contentType})${methodInfo}`
        };
      } else {
        let reason = `HTTP ${response.status}`;
        if (response.status === 403) reason += ' – Forbidden (server may block HEAD requests)';
        else if (response.status === 404) reason += ' – Not found';
        else if (response.status === 405) reason += ' – Method Not Allowed';
        return { url, status: 'error', reason };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { url, status: 'error', reason: '⏱️ Timeout (10s). The server did not respond in time.' };
      }
      if (err.message.includes('Failed to fetch')) {
        return { url, status: 'error', reason: useCorsProxy ? '🌐 Proxy failed – the proxy service may be down or rate-limited.' : '🌐 CORS error – server blocks cross-origin requests. Try enabling the proxy.' };
      }
      return { url, status: 'error', reason: `🌐 ${err.message}` };
    }
  };

  const checkAllLinks = async () => {
    const urlList = urls.trim().split(/\r?\n/).filter(u => u.trim().length > 0);
    if (urlList.length === 0) return;
    setIsChecking(true);
    setResults(<div className="text-center font-bold p-2 bg-[#2d2d3a] rounded-lg mb-2">Checking {urlList.length} link(s)...</div>);
    const resultsArr = [];
    for (const url of urlList) {
      const startTime = Date.now();
      const result = await (isPixelDrainLink(url) ? checkPixelDrainLink(url) : checkGenericLink(url));
      resultsArr.push(result);
      const workingCount = resultsArr.filter(r => r.status === 'working').length;
      const errorCount = resultsArr.length - workingCount;
      setResults(
        <div>
          <div className="text-center font-bold p-2 bg-[#2d2d3a] rounded-lg mb-2">
            ✅ {workingCount} working &nbsp;|&nbsp; ❌ {errorCount} broken
          </div>
          {resultsArr.map((r, i) => (
            <div key={i} className={`p-2 mb-1 rounded font-mono text-xs border-l-4 ${r.status === 'working' ? 'bg-[#1e3a2f] text-[#a5d6a5] border-[#4caf50]' : 'bg-[#3a2a2a] text-[#ffab91] border-[#f44336]'}`}>
              <strong>{r.url}</strong><br/>➡️ {r.reason}
            </div>
          ))}
        </div>
      );
      // Ensure at least 3 seconds have passed since the start of this check
      const elapsed = Date.now() - startTime;
      const delayNeeded = Math.max(0, 3000 - elapsed);
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    setIsChecking(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="bg-[#1e1e2f] text-[#e0e0e0] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto relative shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-[#333]">
        <button onClick={onClose} className="absolute right-4 top-4 text-[#aaa] hover:text-white">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold mb-4">🔗 Link Checker</h2>
        <p className="mb-4 text-sm text-[#aaa]">Paste one or more file links (one per line). Supports any direct download link and special PixelDrain detection.</p>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          className="w-full p-3 bg-[#2d2d3a] text-[#e0e0e0] border border-[#444] rounded-lg font-mono text-sm h-40 mb-4 focus:outline-none focus:border-[#01b4e4]"
          placeholder="https://example.com/file.zip&#10;https://pixeldrain.com/u/abc123"
        />
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="useCorsProxy"
            checked={useCorsProxy}
            onChange={(e) => setUseCorsProxy(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="useCorsProxy" className="text-sm text-[#aaa]">Use CORS proxy (for generic links)</label>
        </div>
        <div className="flex gap-3 mb-4">
          <button onClick={checkAllLinks} disabled={isChecking} className="bg-[#01b4e4] text-white px-5 py-2 rounded-lg font-bold hover:bg-[#0096c7] disabled:bg-[#555]">
            {isChecking ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2"/>Checking...</> : '🔍 Check Links'}
          </button>
          <button onClick={() => { setUrls(''); setResults(<p>No links checked yet.</p>); }} className="bg-[#6c757d] text-white px-5 py-2 rounded-lg font-bold hover:bg-[#5a6268]">
            🗑️ Clear
          </button>
        </div>
        <div className="border-t border-[#444] pt-4">{results}</div>
        <div className="text-xs text-[#aaa] mt-4">
          💡 For generic links, a HEAD request is used. Some servers may block CORS. For PixelDrain links, we use the official API.
        </div>
      </div>
    </div>
  );
};
