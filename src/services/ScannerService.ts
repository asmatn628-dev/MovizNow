import { db } from '../firebase';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { serverCheckLink } from './linkCheckerService';

export interface ErrorLinkInfo {
  contentId: string;
  contentTitle: string;
  contentType: 'movie' | 'series';
  location: string;
  link: any;
  linkIndex: number;
  seasonIndex?: number;
  episodeIndex?: number;
  listType?: 'movie' | 'zip' | 'mkv' | 'episode';
  errorDetail: string;
  fetchedSize?: string;
  fetchedUnit?: 'MB' | 'GB';
}

export interface ScanState {
  id: string;
  status: 'idle' | 'scanning' | 'completed' | 'error';
  scannedCount: number;
  totalLinks: number;
  errorLinks: ErrorLinkInfo[];
  lastUpdated: any;
  startedAt: any;
}

class ScannerService {
  private static instance: ScannerService;
  private isScanning: boolean = false;

  private constructor() {}

  public static getInstance(): ScannerService {
    if (!ScannerService.instance) {
      ScannerService.instance = new ScannerService();
    }
    return ScannerService.instance;
  }

  private async analyzeErrorDetail(url: string, status: number, data: any): Promise<string> {
    const getFallbackError = (status: number, data: any): string => {
      if (status === 404) return "File Not Found";
      if (status === 403) return "Access Forbidden (Check Manually)";
      if (status === 410) return "File Gone/Deleted";
      if (status === 451) return "Unavailable from Server";
      if (data && data.message) {
        if (data.message.toLowerCase().includes('copyright') || data.message.toLowerCase().includes('legal')) {
          return "Unavailable from Server";
        }
        if (data.message.toLowerCase().includes('deleted')) {
          return "Deleted by uploader";
        }
        if (data.message.toLowerCase().includes('expired')) {
          return "Link Expired";
        }
      }
      return `Error ${status}`;
    };

    return getFallbackError(status, data);
  }

  private async checkPixeldrainLink(url: string): Promise<{ error: string | null; size?: string; unit?: 'MB' | 'GB' }> {
    if (!url || url.trim() === '') return { error: "Empty link" };
    
    const fileMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/);
    const listMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:l|api\/list)\/([a-zA-Z0-9]+)/);
    
    if (fileMatch) {
      const id = fileMatch[1];
      try {
        const res = await fetch(`https://pixeldrain.com/api/file/${id}/info`);
        
        // Explicitly handle 451
        if (res.status === 451) return { error: "Unavailable from Server" };

        let data;
        try { data = await res.json(); } catch (e) {}

        if (!res.ok || (data && data.success === false)) {
          const errorDetail = await this.analyzeErrorDetail(url, res.status, data);
          return { error: errorDetail };
        }

        try {
          const headRes = await fetch(`https://pixeldrain.com/api/file/${id}`, { method: 'HEAD' });
          // Explicitly handle 451
          if (headRes.status === 451) return { error: "Unavailable from Server" };
          
          if (!headRes.ok && headRes.status !== 405 && headRes.status !== 403) { 
            const errorDetail = await this.analyzeErrorDetail(`https://pixeldrain.com/api/file/${id}`, headRes.status, null);
            return { error: errorDetail };
          }
        } catch (e) {}

        if (data && typeof data.size !== 'undefined') {
          const sizeInBytes = data.size;
          let size = 0;
          let unit: 'MB' | 'GB' = 'MB';
          if (sizeInBytes >= 1000 * 1000 * 1000) {
            size = sizeInBytes / (1000 * 1000 * 1000);
            unit = 'GB';
          } else {
            size = sizeInBytes / (1000 * 1000);
            unit = 'MB';
          }
          return { error: null, size: size.toFixed(2).replace(/\.00$/, ''), unit };
        }
        return { error: "Unavailable from Server" };
      } catch (e) {
        return { error: "Unavailable from Server" };
      }
    } else if (listMatch) {
      const id = listMatch[1];
      try {
        const res = await fetch(`https://pixeldrain.com/api/list/${id}`);
        
        // Explicitly handle 451
        if (res.status === 451) return { error: "Unavailable from Server" };

        let data;
        try { data = await res.json(); } catch (e) {}

        if (!res.ok || (data && data.success === false)) {
          const errorDetail = await this.analyzeErrorDetail(url, res.status, data);
          return { error: errorDetail };
        }

        if (data && data.files && data.files.length > 0) {
          const sizeInBytes = data.files.reduce((acc: number, f: any) => acc + (f.size || 0), 0);
          let size = 0;
          let unit: 'MB' | 'GB' = 'MB';
          if (sizeInBytes >= 1000 * 1000 * 1000) {
            size = sizeInBytes / (1000 * 1000 * 1000);
            unit = 'GB';
          } else {
            size = sizeInBytes / (1000 * 1000);
            unit = 'MB';
          }
          return { error: null, size: size.toFixed(2).replace(/\.00$/, ''), unit };
        }
        return { error: "Unavailable from Server" };
      } catch (e) {
        return { error: "Unavailable from Server" };
      }
    } else {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        // Explicitly handle 451
        if (res.status === 451) return { error: "Unavailable from Server" };
        
        // Ignore 403 for generic links as it's almost always a CORS/Bot protection false positive
        if (!res.ok && res.status !== 403) {
          return { error: `HTTP ${res.status}` };
        }
      } catch (e) {
        try {
          const res = await fetch(url);
          // Explicitly handle 451
          if (res.status === 451) return { error: "Unavailable from Server" };
          
          if (!res.ok && res.status !== 403) return { error: `HTTP ${res.status}` };
        } catch (err) {}
      }
    }
    return { error: null };
  }

  private sanitizeForFirestore(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(v => this.sanitizeForFirestore(v));
    } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => [k, this.sanitizeForFirestore(v)])
      );
    }
    return obj;
  }

  public async startServerSideScan(allLinksToScan: { info: ErrorLinkInfo, url: string }[]) {
    console.log("startServerSideScan called, current isScanning:", this.isScanning);
    if (this.isScanning) return;
    
    const scanDocRef = doc(db, 'scans', 'current');
    
    this.isScanning = true;
    console.log("isScanning set to true");

    await setDoc(scanDocRef, this.sanitizeForFirestore({
      id: 'current',
      status: 'scanning',
      scannedCount: 0,
      totalLinks: allLinksToScan.length,
      errorLinks: [],
      startedAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    }));

    const batchSize = 50;
    const foundErrors: ErrorLinkInfo[] = [];

    try {
      for (let i = 0; i < allLinksToScan.length; i += batchSize) {
        if (!this.isScanning) {
          console.log("Scan stopped by user.");
          await updateDoc(scanDocRef, {
            status: 'idle',
            lastUpdated: serverTimestamp()
          });
          return;
        }

        const batch = allLinksToScan.slice(i, i + batchSize);
        
        // Rate limiting: 5 links per second. Batch size is 50, so 10 seconds delay.
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const response = await fetch('/api/scan-links', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            links: batch.map(item => ({
              url: item.url,
              ...item.info
            }))
          }),
        });

        if (!response.ok) throw new Error("Failed to scan batch on server");
        
        const { results } = await response.json();
        
        results.forEach((result: any) => {
          if (result.errorDetail) {
            foundErrors.push({
              ...result,
              errorDetail: result.errorDetail
            });
          }
        });
        
        const currentScanned = Math.min(i + batchSize, allLinksToScan.length);
        
        // Update Firestore
        await updateDoc(scanDocRef, this.sanitizeForFirestore({
          scannedCount: currentScanned,
          errorLinks: foundErrors,
          lastUpdated: serverTimestamp()
        }));
      }

      await updateDoc(scanDocRef, {
        status: 'completed',
        lastUpdated: serverTimestamp()
      });
    } catch (error) {
      console.error("Error scanning links:", error);
      await updateDoc(scanDocRef, {
        status: 'error',
        lastUpdated: serverTimestamp()
      });
    } finally {
      this.isScanning = false;
      console.log("isScanning set to false in finally");
    }
  }

  public async startBackgroundScan(allLinksToScan: { info: ErrorLinkInfo, url: string }[]) {
    try {
      const response = await fetch('/api/start-background-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          links: allLinksToScan.map(item => ({
            url: item.url,
            ...item.info
          }))
        }),
      });

      if (!response.ok) throw new Error("Failed to start background scan");
      return await response.json();
    } catch (error) {
      console.error("Error starting background scan:", error);
      throw error;
    }
  }

  public async stopScan() {
    console.log("stopScan called, current isScanning:", this.isScanning);
    this.isScanning = false;
    
    // Immediately update Firestore to idle to reflect in UI
    try {
      const scanDocRef = doc(db, 'scans', 'current');
      await updateDoc(scanDocRef, {
        status: 'idle',
        lastUpdated: serverTimestamp()
      });
      console.log("Firestore status updated to idle");
    } catch (e) {
      console.error("Error updating Firestore status to idle", e);
    }
  }

  public async startScan(
    allLinksToScan: { info: ErrorLinkInfo, url: string }[], 
    useFirebase: boolean = true,
    onProgress?: (scannedCount: number, totalLinks: number, errorLinks: ErrorLinkInfo[]) => void
  ) {
    console.log("startScan called, current isScanning:", this.isScanning, "useFirebase:", useFirebase);
    if (this.isScanning) return;
    
    const scanDocRef = doc(db, 'scans', 'current');
    
    // Check if a scan is already running in Firestore
    if (useFirebase) {
      try {
        const scanDoc = await getDoc(scanDocRef);
        if (scanDoc.exists() && scanDoc.data().status === 'scanning') {
          const lastUpdated = scanDoc.data().lastUpdated?.toDate?.() || new Date(0);
          const now = new Date();
          const diffMinutes = (now.getTime() - lastUpdated.getTime()) / (1000 * 60);
          
          if (diffMinutes < 5) {
            console.log("A scan is already running and active.");
            return;
          }
          console.log("Found a stale scan, overriding...");
        }
      } catch (e) {
        console.error("Error checking scan status", e);
      }
    }

    this.isScanning = true;
    console.log("isScanning set to true");

    if (useFirebase) {
      await setDoc(scanDocRef, this.sanitizeForFirestore({
        id: 'current',
        status: 'scanning',
        scannedCount: 0,
        totalLinks: allLinksToScan.length,
        errorLinks: [],
        startedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }));
    }

    const concurrency = 5; // Reduced concurrency to help with rate limiting
    const foundErrors: ErrorLinkInfo[] = [];
    const queue = [...allLinksToScan];
    let scannedCount = 0;
    let lastScanTime = Date.now();

    const processNext = async (): Promise<void> => {
      if (queue.length === 0 || !this.isScanning) return;
      
      const item = queue.shift()!;
      
      // Rate limiting: 5 links per second = 1 link per 200ms
      const now = Date.now();
      const timeSinceLastScan = now - lastScanTime;
      if (timeSinceLastScan < 200) {
        await new Promise(resolve => setTimeout(resolve, 200 - timeSinceLastScan));
      }
      lastScanTime = Date.now();
      
      try {
        const result = await serverCheckLink(item.url);
        let error = result.ok ? null : (result.message || `Status ${result.status}`);
        const size = result.fileSizeText ? result.fileSizeText.split(' ')[0] : undefined;
        const unit = result.fileSizeText ? result.fileSizeText.split(' ')[1] : undefined;
        
        if (!error && (!item.info.link.size || !item.info.link.unit)) {
          error = "Missing size or unit";
        }

        if (!error && item.info.link.size && item.info.link.unit && size && unit) {
          const stored = `${item.info.link.size}${item.info.link.unit}`;
          const server = `${size}${unit}`;
          if (stored !== server) error = `Size mismatch`;
        }
        
        if (error) {
          item.info.errorDetail = error;
          item.info.fetchedSize = size;
          item.info.fetchedUnit = unit as 'MB' | 'GB';
          foundErrors.push(item.info);
        }

        scannedCount++;
        
        if (onProgress) {
          onProgress(scannedCount, allLinksToScan.length, foundErrors);
        }
        
        if (useFirebase) {
          // Update Firestore incrementally
          if (scannedCount % 20 === 0 || scannedCount === allLinksToScan.length) {
            await updateDoc(scanDocRef, this.sanitizeForFirestore({
              scannedCount: scannedCount,
              errorLinks: foundErrors,
              lastUpdated: serverTimestamp()
            }));
            // Add a small delay to prevent overwhelming the write stream
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (e) {
        console.error(`Error scanning link ${item.url}:`, e);
      } finally {
        await processNext();
      }
    };

    try {
      const workers = Array.from({ length: Math.min(concurrency, allLinksToScan.length) }, () => processNext());
      await Promise.all(workers);

      if (useFirebase) {
        await updateDoc(scanDocRef, {
          status: 'completed',
          lastUpdated: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error scanning links:", error);
      if (useFirebase) {
        await updateDoc(scanDocRef, {
          status: 'error',
          lastUpdated: serverTimestamp()
        });
      }
    } finally {
      this.isScanning = false;
      console.log("isScanning set to false in finally");
    }
  }
}

export const scannerService = ScannerService.getInstance();
