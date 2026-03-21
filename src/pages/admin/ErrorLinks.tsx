import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Content, Season, QualityLinks, LinkDef } from '../../types';
import { AlertTriangle, Edit2, ExternalLink, RefreshCw, X, Save, Trash2, CheckCircle2, Filter, ArrowUpDown } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { GoogleGenAI } from "@google/genai";

interface ErrorLinkInfo {
  contentId: string;
  contentTitle: string;
  contentType: 'movie' | 'series';
  location: string; // e.g., "Movie Links", "Season 1 ZIP", "Season 1 Episode 2"
  link: LinkDef;
  linkIndex: number;
  seasonIndex?: number;
  episodeIndex?: number;
  listType?: 'movie' | 'zip' | 'mkv' | 'episode';
  errorDetail: string;
}

export default function ErrorLinks() {
  const [contentList, setContentList] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'completed' | 'error'>('idle');
  const [errorLinks, setErrorLinks] = useState<ErrorLinkInfo[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalLinks, setTotalLinks] = useState(0);

  const analyzeErrorWithAI = async (url: string, status: number, data: any): Promise<string> => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
        Analyze this Pixeldrain API response and determine the exact reason why the link is unavailable or problematic.
        URL: ${url}
        HTTP Status: ${status}
        API Response Body: ${JSON.stringify(data)}
        
        Provide a short, clear, and professional error message (max 50 characters).
        If it's a copyright/legal issue, say "451 - Copyright/Legal Removal".
        If it's deleted by user, say "Deleted by uploader".
        If it's expired, say "Link Expired".
        If it's a 404, say "File Not Found".
        If it's a 403, say "Access Forbidden".
        If it's a 410, say "File Gone/Deleted".
        If it's a 451, say "Legal/Abuse Removal".
        
        Just return the error message text, nothing else.
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      return result.text.trim() || `Error ${status}`;
    } catch (e) {
      console.error("AI Analysis failed", e);
      return `Error ${status}`;
    }
  };
  
  const [editingLink, setEditingLink] = useState<ErrorLinkInfo | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editUnit, setEditUnit] = useState<'MB' | 'GB'>('MB');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const [filterErrorType, setFilterErrorType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'error'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const uniqueErrorTypes = Array.from(new Set(errorLinks.map(link => link.errorDetail))).sort();

  const filteredAndSortedLinks = [...errorLinks]
    .filter(link => filterErrorType === 'all' || link.errorDetail === filterErrorType)
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'title') {
        comparison = a.contentTitle.localeCompare(b.contentTitle);
      } else if (sortBy === 'error') {
        comparison = a.errorDetail.localeCompare(b.errorDetail);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  useEffect(() => {
    const unsubContent = onSnapshot(collection(db, 'content'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
      setContentList(data);
      setLoading(false);
    }, (error) => {
      console.error("Content snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'content');
    });
    return () => unsubContent();
  }, []);

  const parseLinks = (linksStr: string | undefined): QualityLinks => {
    if (!linksStr) return [];
    try {
      const parsed = JSON.parse(linksStr);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object') {
        return Object.entries(parsed).map(([name, link]: [string, any]) => ({
          id: Math.random().toString(36).substr(2, 9),
          name,
          url: link?.url || '',
          size: link?.size || '',
          unit: 'MB' as 'MB' | 'GB'
        })).filter(l => l.url);
      }
    } catch (e) {
      console.error("Error parsing links", e);
    }
    return [];
  };

  const checkPixeldrainLink = async (url: string): Promise<string | null> => {
    if (!url || url.trim() === '') return "Empty link";
    
    if (!url.includes('pixeldrain.com') && !url.includes('pixeldrain.dev')) {
      return null; // Not a Pixeldrain link, we can't check it, so assume OK unless size/unit missing
    }

    const fileMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/);
    const listMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:l|api\/list)\/([a-zA-Z0-9]+)/);
    
    if (fileMatch) {
      const id = fileMatch[1];
      try {
        const res = await fetch(`https://pixeldrain.com/api/file/${id}/info`);
        
        let data;
        try {
          data = await res.json();
        } catch (e) {}

        if (!res.ok || (data && data.success === false)) {
          return await analyzeErrorWithAI(url, res.status, data);
        }

        if (data && (typeof data.size === 'undefined' || data.size === 0)) {
          return "API didn't return file size";
        }
        return null; // No error
      } catch (e) {
        return "Network error checking link";
      }
    } else if (listMatch) {
      const id = listMatch[1];
      try {
        const res = await fetch(`https://pixeldrain.com/api/list/${id}`);
        
        let data;
        try {
          data = await res.json();
        } catch (e) {}

        if (!res.ok || (data && data.success === false)) {
          return await analyzeErrorWithAI(url, res.status, data);
        }

        if (data && (!data.files || data.files.length === 0)) {
          return "API didn't return file list";
        }
        return null; // No error
      } catch (e) {
        return "Network error checking link";
      }
    }
    
    return null;
  };

  const scanLinks = async () => {
    setScanning(true);
    setScanStatus('scanning');
    setErrorLinks([]);
    setScannedCount(0);
    
    let allLinksToScan: { info: ErrorLinkInfo, url: string }[] = [];

    contentList.forEach(content => {
      if (content.type === 'movie' && content.movieLinks) {
        const links = parseLinks(content.movieLinks);
        links.forEach((link, idx) => {
          allLinksToScan.push({
            info: {
              contentId: content.id,
              contentTitle: content.title,
              contentType: 'movie',
              location: 'Movie Links',
              link,
              linkIndex: idx,
              listType: 'movie',
              errorDetail: ''
            },
            url: link.url || ''
          });
        });
      } else if (content.type === 'series' && content.seasons) {
        try {
          const seasons: Season[] = JSON.parse(content.seasons);
          seasons.forEach((season, sIdx) => {
            const zipLinks = parseLinks(JSON.stringify(season.zipLinks));
            zipLinks.forEach((link, idx) => {
              allLinksToScan.push({
                info: {
                  contentId: content.id,
                  contentTitle: content.title,
                  contentType: 'series',
                  location: `Season ${season.seasonNumber} ZIP`,
                  link,
                  linkIndex: idx,
                  seasonIndex: sIdx,
                  listType: 'zip',
                  errorDetail: ''
                },
                url: link.url || ''
              });
            });

            const mkvLinks = parseLinks(JSON.stringify(season.mkvLinks || []));
            mkvLinks.forEach((link, idx) => {
              allLinksToScan.push({
                info: {
                  contentId: content.id,
                  contentTitle: content.title,
                  contentType: 'series',
                  location: `Season ${season.seasonNumber} MKV`,
                  link,
                  linkIndex: idx,
                  seasonIndex: sIdx,
                  listType: 'mkv',
                  errorDetail: ''
                },
                url: link.url || ''
              });
            });

            season.episodes?.forEach((ep, eIdx) => {
              const epLinks = parseLinks(JSON.stringify(ep.links));
              epLinks.forEach((link, idx) => {
                allLinksToScan.push({
                  info: {
                    contentId: content.id,
                    contentTitle: content.title,
                    contentType: 'series',
                    location: `S${season.seasonNumber} E${ep.episodeNumber}`,
                    link,
                    linkIndex: idx,
                    seasonIndex: sIdx,
                    episodeIndex: eIdx,
                    listType: 'episode',
                    errorDetail: ''
                  },
                  url: link.url || ''
                });
              });
            });
          });
        } catch (e) {
          console.error("Error parsing seasons for content", content.id);
        }
      }
    });

    setTotalLinks(allLinksToScan.length);
    
    if (allLinksToScan.length === 0) {
      setScanning(false);
      setScanStatus('completed');
      return;
    }
    
    // Process in batches to avoid overwhelming the browser/API
    const batchSize = 5;
    const foundErrors: ErrorLinkInfo[] = [];
    
    try {
      for (let i = 0; i < allLinksToScan.length; i += batchSize) {
        const batch = allLinksToScan.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (item) => {
            let error = await checkPixeldrainLink(item.url);
            
            // Also flag if size or unit is missing
            if (!error && (!item.info.link.size || !item.info.link.unit)) {
              error = "Missing size or unit";
            }
            
            return { item, error };
          })
        );
        
        results.forEach(({ item, error }) => {
          if (error) {
            item.info.errorDetail = error;
            foundErrors.push(item.info);
          }
        });
        
        setScannedCount(Math.min(i + batchSize, allLinksToScan.length));
        setErrorLinks([...foundErrors]); // Update UI progressively
      }
      setScanStatus('completed');
    } catch (error) {
      console.error("Error scanning links:", error);
      setScanStatus('error');
    } finally {
      setScanning(false);
    }
  };

  const handleEditClick = (info: ErrorLinkInfo) => {
    setEditingLink(info);
    setEditUrl(info.link.url);
    setEditSize(info.link.size);
    setEditUnit(info.link.unit || 'MB');
    setEditName(info.link.name);
  };

  const handleUrlBlur = async (url: string) => {
    const match = url.match(/pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/);
    if (match) {
      const id = match[1];
      try {
        const res = await fetch(`https://pixeldrain.com/api/file/${id}/info`);
        if (res.ok) {
          const data = await res.json();
          if (data.size) {
            let sizeInBytes = data.size;
            let size = 0;
            let unit: 'MB' | 'GB' = 'MB';
            
            if (sizeInBytes >= 1000 * 1000 * 1000) {
              size = sizeInBytes / (1000 * 1000 * 1000);
              unit = 'GB';
            } else {
              size = sizeInBytes / (1000 * 1000);
              unit = 'MB';
            }
            
            setEditSize(size.toFixed(2).replace(/\.00$/, ''));
            setEditUnit(unit);
          }
        }
      } catch (e) {
        console.error("Failed to fetch PixelDrain info", e);
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!editingLink) return;
    setSaving(true);
    
    try {
      const content = contentList.find(c => c.id === editingLink.contentId);
      if (!content) throw new Error("Content not found");

      const updateData: any = {};
      
      if (editingLink.listType === 'movie') {
        const links = parseLinks(content.movieLinks);
        links[editingLink.linkIndex] = {
          ...links[editingLink.linkIndex],
          url: editUrl,
          size: editSize,
          unit: editUnit,
          name: editName
        };
        updateData.movieLinks = JSON.stringify(links);
      } else if (content.type === 'series' && content.seasons) {
        const seasons: Season[] = JSON.parse(content.seasons);
        const sIdx = editingLink.seasonIndex!;
        
        if (editingLink.listType === 'zip') {
          const links = parseLinks(JSON.stringify(seasons[sIdx].zipLinks));
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          seasons[sIdx].zipLinks = links;
        } else if (editingLink.listType === 'mkv') {
          const links = parseLinks(JSON.stringify(seasons[sIdx].mkvLinks || []));
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          seasons[sIdx].mkvLinks = links;
        } else if (editingLink.listType === 'episode') {
          const eIdx = editingLink.episodeIndex!;
          const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          seasons[sIdx].episodes[eIdx].links = links;
        }
        updateData.seasons = JSON.stringify(seasons);
      }

      await updateDoc(doc(db, 'content', editingLink.contentId), updateData);
      
      // Remove from error list if fixed
      setErrorLinks(prev => prev.filter(item => 
        !(item.contentId === editingLink.contentId && 
          item.listType === editingLink.listType && 
          item.linkIndex === editingLink.linkIndex &&
          item.seasonIndex === editingLink.seasonIndex &&
          item.episodeIndex === editingLink.episodeIndex)
      ));
      
      setEditingLink(null);
    } catch (error) {
      console.error("Error updating link:", error);
      alert("Failed to update link");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
            Error Links
          </h1>
          <p className="text-zinc-400 mt-1">Scan and fix broken Pixeldrain links across all content.</p>
        </div>
        <div className="flex items-center gap-4">
          {scanStatus === 'completed' && (
            <span className="text-emerald-500 text-sm font-medium flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Scan complete
            </span>
          )}
          {scanStatus === 'error' && (
            <span className="text-red-500 text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Cannot scan
            </span>
          )}
          <button
            onClick={scanLinks}
            disabled={scanning || loading}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            {scanning ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Scanning ({scannedCount}/{totalLinks})
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                {scanStatus === 'idle' ? 'Scan Links' : 'Scan Again'}
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {errorLinks.length === 0 ? (
            <div className="text-center py-20 text-zinc-500">
              {scanning ? (
                <div className="flex flex-col items-center">
                  <RefreshCw className="w-12 h-12 animate-spin mb-4 text-emerald-500" />
                  <p className="text-xl">Scanning links... Please wait.</p>
                  <p className="text-sm mt-2">Checking {scannedCount} of {totalLinks} links</p>
                </div>
              ) : scanStatus === 'completed' ? (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="w-16 h-16 mb-4 text-emerald-500" />
                  <p className="text-xl text-white font-medium">All links are working perfectly!</p>
                  <p className="text-sm mt-2">We checked {totalLinks} Pixeldrain links and found no errors.</p>
                </div>
              ) : scanStatus === 'error' ? (
                <div className="flex flex-col items-center">
                  <AlertTriangle className="w-16 h-16 mb-4 text-red-500" />
                  <p className="text-xl text-white font-medium">Cannot scan links</p>
                  <p className="text-sm mt-2">There was a problem scanning the links. Please try again.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="w-16 h-16 mb-4 text-emerald-500/50" />
                  <p className="text-xl">No error links found.</p>
                  <p className="text-sm mt-2">Click "Scan Links" to check all Pixeldrain links.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-4 h-4 text-zinc-400" />
                  <select
                    value={filterErrorType}
                    onChange={(e) => setFilterErrorType(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
                  >
                    <option value="all">All Errors</option>
                    {uniqueErrorTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <ArrowUpDown className="w-4 h-4 text-zinc-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'title' | 'error')}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
                  >
                    <option value="title">Sort by Title</option>
                    <option value="error">Sort by Error Type</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white transition-colors"
                  >
                    {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-zinc-400">
                    <tr>
                      <th className="px-6 py-4 font-medium">Content</th>
                      <th className="px-6 py-4 font-medium">Location</th>
                      <th className="px-6 py-4 font-medium">Link Name</th>
                      <th className="px-6 py-4 font-medium">Error Detail</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {filteredAndSortedLinks.map((info, i) => (
                      <tr key={i} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{info.contentTitle}</div>
                        <div className="text-xs text-zinc-500 uppercase">{info.contentType}</div>
                      </td>
                      <td className="px-6 py-4 text-zinc-300">{info.location}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-300">{info.link.name}</span>
                          <span className="text-xs text-zinc-500">({info.link.size}{info.link.unit})</span>
                        </div>
                        <a href={info.link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 hover:underline flex items-center gap-1 mt-1 truncate max-w-[200px]">
                          {info.link.url} <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-6 py-4 text-red-400 font-medium">{info.errorDetail}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleEditClick(info)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ml-auto"
                        >
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingLink && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Edit Link</h2>
              <button onClick={() => setEditingLink(null)} className="text-zinc-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Content</label>
                <div className="text-white font-medium">{editingLink.contentTitle} <span className="text-zinc-500 text-sm">({editingLink.location})</span></div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">URL</label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  onBlur={(e) => handleUrlBlur(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-zinc-500">Paste a new Pixeldrain link to auto-fetch size.</p>
                  {editUrl.includes('/api/file/') && (
                    <button
                      onClick={() => setEditUrl(editUrl.replace('/api/file/', '/u/'))}
                      className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                    >
                      Convert to /u/ format
                    </button>
                  )}
                  {editUrl.includes('/api/list/') && (
                    <button
                      onClick={() => setEditUrl(editUrl.replace('/api/list/', '/l/'))}
                      className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                    >
                      Convert to /l/ format
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Size</label>
                  <input
                    type="number"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Unit</label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value as 'MB' | 'GB')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setEditingLink(null)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editUrl}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-6 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <><Save className="w-4 h-4" /> Save Changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
