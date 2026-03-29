import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Content, Season, QualityLinks, LinkDef } from '../../types';
import { AlertTriangle, Edit2, ExternalLink, RefreshCw, X, Save, CheckCircle2, Filter, ArrowUpDown, Search, Trash2, Plus } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { scannerService, ErrorLinkInfo, ScanState } from '../../services/ScannerService';
import { LinkCheckerModal } from '../../components/LinkCheckerModal';

export default function ErrorLinks() {
  const [contentList, setContentList] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Client-side/Deep Scan State
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'completed' | 'error'>('idle');
  const [scannedCount, setScannedCount] = useState(0);
  const [totalLinks, setTotalLinks] = useState(0);
  const [errorLinks, setErrorLinks] = useState<ErrorLinkInfo[]>([]);

  // Background Scan State
  const [bgScanning, setBgScanning] = useState(false);
  const [bgScanStatus, setBgScanStatus] = useState<'idle' | 'scanning' | 'completed' | 'error'>('idle');
  const [bgScannedCount, setBgScannedCount] = useState(0);
  const [bgTotalLinks, setBgTotalLinks] = useState(0);
  const [bgErrorLinks, setBgErrorLinks] = useState<ErrorLinkInfo[]>([]);

  const [isLinkCheckerModalOpen, setIsLinkCheckerModalOpen] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [modalAutoStart, setModalAutoStart] = useState(false);
  const [modalTitle, setModalTitle] = useState('Link Checker');

  const [editingLink, setEditingLink] = useState<ErrorLinkInfo | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editUnit, setEditUnit] = useState<'MB' | 'GB'>('MB');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const [filterErrorType, setFilterErrorType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'error'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [isAddLinksModalOpen, setIsAddLinksModalOpen] = useState(false);
  const [addLinksContent, setAddLinksContent] = useState<Content | null>(null);
  const [addLinksInput, setAddLinksInput] = useState('');
  const [addingLinks, setAddingLinks] = useState(false);

  const activeErrorLinks = bgScanning ? bgErrorLinks : errorLinks;
  const activeScannedCount = bgScanning ? bgScannedCount : scannedCount;
  const activeTotalLinks = bgScanning ? bgTotalLinks : totalLinks;
  const activeScanStatus = bgScanning ? bgScanStatus : scanStatus;
  const isAnyScanning = scanning || bgScanning;

  const uniqueErrorTypes = Array.from(new Set(activeErrorLinks.map(link => link.errorDetail))).sort();

  const filteredAndSortedLinks = [...activeErrorLinks]
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

    const unsubScan = onSnapshot(doc(db, 'scans', 'current'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as ScanState;
        setScanStatus(data.status);
        setScanning(data.status === 'scanning');
        setScannedCount(data.scannedCount);
        setTotalLinks(data.totalLinks);
        setErrorLinks(data.errorLinks || []);
      }
    });

    const unsubBgScan = onSnapshot(doc(db, 'scans', 'background'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as ScanState;
        setBgScanStatus(data.status);
        setBgScanning(data.status === 'scanning');
        setBgScannedCount(data.scannedCount);
        setBgTotalLinks(data.totalLinks);
        setBgErrorLinks(data.errorLinks || []);
      }
    });

    return () => {
      unsubContent();
      unsubScan();
      unsubBgScan();
    };
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

  const getAllLinksToScan = (): { info: ErrorLinkInfo, url: string }[] => {
    let allLinksToScan: { info: ErrorLinkInfo, url: string }[] = [];

    contentList.forEach(content => {
      if (content.type === 'movie') {
        if (content.movieLinks) {
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
        }
        if (content.fullSeasonZip) {
          const links = parseLinks(content.fullSeasonZip);
          links.forEach((link, idx) => {
            allLinksToScan.push({
              info: {
                contentId: content.id,
                contentTitle: content.title,
                contentType: 'movie',
                location: 'Full Season ZIP',
                link,
                linkIndex: idx,
                listType: 'zip',
                errorDetail: ''
              },
              url: link.url || ''
            });
          });
        }
        if (content.fullSeasonMkv) {
          const links = parseLinks(content.fullSeasonMkv);
          links.forEach((link, idx) => {
            allLinksToScan.push({
              info: {
                contentId: content.id,
                contentTitle: content.title,
                contentType: 'movie',
                location: 'Full Season MKV',
                link,
                linkIndex: idx,
                listType: 'mkv',
                errorDetail: ''
              },
              url: link.url || ''
            });
          });
        }
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
    return allLinksToScan;
  };

  const scanLinks = async () => {
    if (scanning) return;
    const allLinksToScan = getAllLinksToScan();
    if (allLinksToScan.length === 0) return;
    
    setScanning(true);
    setScanStatus('scanning');
    setScannedCount(0);
    setTotalLinks(allLinksToScan.length);
    setErrorLinks([]);
    
    try {
      await scannerService.startScan(allLinksToScan, false, (count, total, errors) => {
        setScannedCount(count);
        setTotalLinks(total);
        setErrorLinks(errors);
      });
      setScanStatus('completed');
    } catch (e) {
      console.error("Error starting scan:", e);
      setScanStatus('error');
    } finally {
      setScanning(false);
    }
  };

  const startBackgroundScan = async () => {
    if (bgScanning) return;
    const allLinksToScan = getAllLinksToScan();
    if (allLinksToScan.length === 0) return;
    
    setBgScanning(true);
    try {
      await scannerService.startBackgroundScan(allLinksToScan);
    } catch (e) {
      alert("Failed to start background scan.");
      setBgScanning(false);
    }
  };

  const handleDeleteLink = async (info: ErrorLinkInfo) => {
    if (!window.confirm(`Are you sure you want to delete this link: ${info.link.name}?`)) return;
    
    const content = contentList.find(c => c.id === info.contentId);
    if (!content) return;

    try {
      const updatedContent = { ...content };
      if (info.contentType === 'movie') {
        if (info.listType === 'movie') {
          const links = parseLinks(content.movieLinks);
          links.splice(info.linkIndex, 1);
          updatedContent.movieLinks = JSON.stringify(links);
        } else if (info.listType === 'zip') {
          const links = parseLinks(content.fullSeasonZip);
          links.splice(info.linkIndex, 1);
          updatedContent.fullSeasonZip = JSON.stringify(links);
        } else if (info.listType === 'mkv') {
          const links = parseLinks(content.fullSeasonMkv);
          links.splice(info.linkIndex, 1);
          updatedContent.fullSeasonMkv = JSON.stringify(links);
        }
      } else if (content.type === 'series' && content.seasons) {
        try {
          const seasons: Season[] = JSON.parse(content.seasons);
          const sIdx = info.seasonIndex!;
          if (seasons[sIdx]) {
            if (info.listType === 'zip') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].zipLinks));
              links.splice(info.linkIndex, 1);
              seasons[sIdx].zipLinks = links;
            } else if (info.listType === 'mkv') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].mkvLinks || []));
              links.splice(info.linkIndex, 1);
              seasons[sIdx].mkvLinks = links;
            } else if (info.listType === 'episode') {
              const eIdx = info.episodeIndex!;
              if (seasons[sIdx].episodes && seasons[sIdx].episodes[eIdx]) {
                const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
                links.splice(info.linkIndex, 1);
                seasons[sIdx].episodes[eIdx].links = links;
              }
            }
            updatedContent.seasons = JSON.stringify(seasons);
          }
        } catch (e) {
          console.error("Error parsing seasons for delete", e);
        }
      }

      await updateDoc(doc(db, 'content', content.id), updatedContent);
      
      // Update local error links state to remove the deleted link
      if (bgScanning) {
        setBgErrorLinks(prev => prev.filter(l => !(l.contentId === info.contentId && l.link.url === info.link.url)));
      } else {
        setErrorLinks(prev => prev.filter(l => !(l.contentId === info.contentId && l.link.url === info.link.url)));
      }
    } catch (error) {
      console.error("Error deleting link:", error);
      alert("Failed to delete link.");
    }
  };

  const sortLinksBySize = (links: QualityLinks) => {
    return [...links].sort((a, b) => {
      const sizeA = parseFloat(a.size || '0') * (a.unit === 'GB' ? 1000 : 1);
      const sizeB = parseFloat(b.size || '0') * (b.unit === 'GB' ? 1000 : 1);
      return sizeB - sizeA; // Descending
    });
  };

  const handleAddLinks = async () => {
    if (!addLinksContent || !addLinksInput.trim()) return;
    setAddingLinks(true);
    try {
      const newLinks = parseLinks(addLinksInput);
      const updatedContent = { ...addLinksContent };
      
      if (updatedContent.type === 'movie') {
        const existing = parseLinks(updatedContent.movieLinks);
        updatedContent.movieLinks = JSON.stringify(sortLinksBySize([...existing, ...newLinks]));
      } else if (updatedContent.type === 'series' && updatedContent.seasons) {
        try {
          const seasons: Season[] = JSON.parse(updatedContent.seasons);
          if (seasons.length > 0 && seasons[0].episodes && seasons[0].episodes.length > 0) {
            const existing = parseLinks(JSON.stringify(seasons[0].episodes[0].links));
            seasons[0].episodes[0].links = sortLinksBySize([...existing, ...newLinks]);
            updatedContent.seasons = JSON.stringify(seasons);
          }
        } catch (e) {
          console.error("Error parsing seasons for add links", e);
        }
      }

      await updateDoc(doc(db, 'content', updatedContent.id), updatedContent);
      setIsAddLinksModalOpen(false);
      setAddLinksInput('');
    } catch (error) {
      console.error("Error adding links:", error);
      alert("Failed to add links.");
    } finally {
      setAddingLinks(false);
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
    if (!url) return;
    try {
      const res = await fetch("/api/check-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fileSize) {
          let sizeInBytes = data.fileSize;
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
      console.error("Failed to check link info", e);
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
        if (links[editingLink.linkIndex]) {
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          updateData.movieLinks = JSON.stringify(links);
        }
      } else if (editingLink.listType === 'zip' && content.type === 'movie') {
        const links = parseLinks(content.fullSeasonZip);
        if (links[editingLink.linkIndex]) {
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          updateData.fullSeasonZip = JSON.stringify(links);
        }
      } else if (editingLink.listType === 'mkv' && content.type === 'movie') {
        const links = parseLinks(content.fullSeasonMkv);
        if (links[editingLink.linkIndex]) {
          links[editingLink.linkIndex] = {
            ...links[editingLink.linkIndex],
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          };
          updateData.fullSeasonMkv = JSON.stringify(links);
        }
      } else if (content.type === 'series' && content.seasons) {
        try {
          const seasons: Season[] = JSON.parse(content.seasons);
          const sIdx = editingLink.seasonIndex!;
          
          if (seasons[sIdx]) {
            if (editingLink.listType === 'zip') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].zipLinks));
              if (links[editingLink.linkIndex]) {
                links[editingLink.linkIndex] = {
                  ...links[editingLink.linkIndex],
                  url: editUrl,
                  size: editSize,
                  unit: editUnit,
                  name: editName
                };
                seasons[sIdx].zipLinks = links;
              }
            } else if (editingLink.listType === 'mkv') {
              const links = parseLinks(JSON.stringify(seasons[sIdx].mkvLinks || []));
              if (links[editingLink.linkIndex]) {
                links[editingLink.linkIndex] = {
                  ...links[editingLink.linkIndex],
                  url: editUrl,
                  size: editSize,
                  unit: editUnit,
                  name: editName
                };
                seasons[sIdx].mkvLinks = links;
              }
            } else if (editingLink.listType === 'episode') {
              const eIdx = editingLink.episodeIndex!;
              if (seasons[sIdx].episodes && seasons[sIdx].episodes[eIdx]) {
                const links = parseLinks(JSON.stringify(seasons[sIdx].episodes[eIdx].links));
                if (links[editingLink.linkIndex]) {
                  links[editingLink.linkIndex] = {
                    ...links[editingLink.linkIndex],
                    url: editUrl,
                    size: editSize,
                    unit: editUnit,
                    name: editName
                  };
                  seasons[sIdx].episodes[eIdx].links = links;
                }
              }
            }
            updateData.seasons = JSON.stringify(seasons);
          }
        } catch (e) {
          console.error("Error parsing seasons for update", e);
          throw new Error("Invalid seasons data format");
        }
      }

      await updateDoc(doc(db, 'content', editingLink.contentId), updateData);
      
      // Update error list
      const setErrorList = bgScanning ? setBgErrorLinks : setErrorLinks;
      setErrorList(prev => {
        const filtered = prev.filter(item => 
          !(item.contentId === editingLink.contentId && 
            item.listType === editingLink.listType && 
            item.linkIndex === editingLink.linkIndex &&
            item.seasonIndex === editingLink.seasonIndex &&
            item.episodeIndex === editingLink.episodeIndex)
        );
        
        const updatedLink: ErrorLinkInfo = {
          ...editingLink,
          link: {
            ...editingLink.link,
            url: editUrl,
            size: editSize,
            unit: editUnit,
            name: editName
          }
        };
        
        return [...filtered, updatedLink];
      });

      // Update scans/current or scans/background in Firestore
      const scanDocRef = bgScanning ? doc(db, 'scans', 'background') : doc(db, 'scans', 'current');
      const scanDoc = await getDoc(scanDocRef);
      if (scanDoc.exists()) {
        const scanData = scanDoc.data() as ScanState;
        const updatedErrorLinks = scanData.errorLinks.map(item => {
          if (item.contentId === editingLink.contentId && 
              item.listType === editingLink.listType && 
              item.linkIndex === editingLink.linkIndex &&
              item.seasonIndex === editingLink.seasonIndex &&
              item.episodeIndex === editingLink.episodeIndex) {
            return {
              ...item,
              link: {
                ...item.link,
                url: editUrl,
                size: editSize,
                unit: editUnit,
                name: editName
              }
            };
          }
          return item;
        });
        await updateDoc(scanDocRef, { errorLinks: updatedErrorLinks });
      }
      
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
          <p className="text-zinc-400 mt-1">Deep Scan using multiple algorithms to find broken links.</p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {/* Line 1: Main Scan Buttons */}
          <div className="flex items-center gap-2">
            {scanStatus === 'completed' && (
              <span className="text-emerald-500 text-sm font-medium flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Deep Scan complete
              </span>
            )}
            {scanStatus === 'error' && (
              <span className="text-red-500 text-sm font-medium flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Deep Scan failed
              </span>
            )}
            <button
              onClick={scanLinks}
              disabled={scanning || loading}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Scanning ({scannedCount}/{totalLinks})
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  {scanStatus === 'idle' ? 'Start Deep Scan' : 'Restart Deep Scan'}
                </>
              )}
            </button>
            <button
              onClick={startBackgroundScan}
              disabled={bgScanning || loading}
              className="bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              {bgScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Scanning Background ({bgScannedCount}/{bgTotalLinks})
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  {bgScanStatus === 'idle' ? 'Server-Side Scan' : 'Restart Server Scan'}
                </>
              )}
            </button>
          </div>

          {/* Line 2: Manual/Rescan Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (scanning) return;
                const filteredLinks = filteredAndSortedLinks.map(link => ({ info: link, url: link.link.url }));
                if (filteredLinks.length === 0) return;
                
                setScanning(true);
                setScanStatus('scanning');
                setScannedCount(0);
                setTotalLinks(filteredLinks.length);
                setErrorLinks([]);
                
                try {
                  await scannerService.startScan(filteredLinks, false, (count, total, errors) => {
                    setScannedCount(count);
                    setTotalLinks(total);
                    setErrorLinks(errors);
                  });
                  setScanStatus('completed');
                } catch (e) {
                  console.error("Error starting scan:", e);
                  setScanStatus('error');
                } finally {
                  setScanning(false);
                }
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" />
              Rescan Filtered
            </button>
            <button
              onClick={() => {
                setModalInput('');
                setModalAutoStart(false);
                setModalTitle('Manual Link Checker');
                setIsLinkCheckerModalOpen(true);
              }}
              className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              Manual Check
            </button>
          </div>

          {/* Line 3: Stop/Cancel Buttons */}
          <div className="flex items-center gap-2">
            {scanning && (
              <button
                onClick={() => {
                  console.log("Stop button clicked");
                  scannerService.stopScan();
                }}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                Stop Scan
              </button>
            )}
          </div>
        </div>
      </div>

      <LinkCheckerModal 
        isOpen={isLinkCheckerModalOpen} 
        onClose={() => setIsLinkCheckerModalOpen(false)} 
        initialInput={modalInput}
        autoStart={modalAutoStart}
        title={modalTitle}
      />

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
                      <td className="px-6 py-4">
                        <div className="text-red-400 font-medium">{info.errorDetail}</div>
                        {info.fetchedSize && (
                          <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Server reports: {info.fetchedSize} {info.fetchedUnit}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const content = contentList.find(c => c.id === info.contentId);
                              if (content) {
                                setAddLinksContent(content);
                                setIsAddLinksModalOpen(true);
                              }
                            }}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5 rounded-lg transition-colors"
                            title="Add Links"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditClick(info)}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLink(info)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-1.5 rounded-lg transition-colors"
                            title="Delete Link"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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

      {/* Add Links Modal */}
      {isAddLinksModalOpen && addLinksContent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Add Links to {addLinksContent.title}</h2>
              <button onClick={() => setIsAddLinksModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Paste Links (JSON or Name:URL format)</label>
                <textarea
                  value={addLinksInput}
                  onChange={(e) => setAddLinksInput(e.target.value)}
                  placeholder='[{"name":"720p","url":"..."},...]'
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 h-40 font-mono text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsAddLinksModalOpen(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLinks}
                  disabled={addingLinks || !addLinksInput.trim()}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {addingLinks ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {addingLinks ? 'Adding...' : 'Add Links'}
                </button>
              </div>
            </div>
          </div>
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
                  {editingLink.fetchedSize && (
                    <button
                      onClick={() => {
                        setEditSize(editingLink.fetchedSize!);
                        setEditUnit(editingLink.fetchedUnit!);
                      }}
                      className="text-[10px] text-emerald-500 hover:text-emerald-400 mt-1 font-medium flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Apply server size ({editingLink.fetchedSize} {editingLink.fetchedUnit})
                    </button>
                  )}
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Unit</label>
                  <div className="flex bg-zinc-950 border border-zinc-800 rounded-xl p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditUnit('MB')}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editUnit === 'MB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      MB
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditUnit('GB')}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editUnit === 'GB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      GB
                    </button>
                  </div>
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
