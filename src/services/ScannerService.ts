import { aiService } from './aiService';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';

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

  private async analyzeErrorWithAI(url: string, status: number, data: any): Promise<string> {
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

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const prompt = `
        Analyze this Pixeldrain API response and determine the exact reason why the link is unavailable or problematic.
        URL: ${url}
        HTTP Status: ${status}
        API Response Body: ${JSON.stringify(data)}
        
        Provide a short, clear, and professional error message (max 50 characters).
        If it's a copyright/legal issue or unavailable for legal reasons, say "Unavailable from Server".
        If it's deleted by user, say "Deleted by uploader".
        If it's expired, say "Link Expired".
        If it's a 404, say "File Not Found".
        If it's a 403, say "Access Forbidden (Check Manually)".
        If it's a 410, say "File Gone/Deleted".
        If it's a 451, say "Unavailable from Server".
        
        Just return the error message text, nothing else.
      `;

      const result = await aiService.chat(prompt, "You are a technical support expert. Return ONLY the error message.");

      return result.trim() || getFallbackError(status, data);
    } catch (e: any) {
      if (e?.message?.includes('429') || e?.message?.includes('quota')) {
        return getFallbackError(status, data);
      }
      return getFallbackError(status, data);
    }
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
          const aiError = await this.analyzeErrorWithAI(url, res.status, data);
          return { error: aiError };
        }

        try {
          const headRes = await fetch(`https://pixeldrain.com/api/file/${id}`, { method: 'HEAD' });
          // Explicitly handle 451
          if (headRes.status === 451) return { error: "Unavailable from Server" };
          
          if (!headRes.ok && headRes.status !== 405 && headRes.status !== 403) { 
            const aiError = await this.analyzeErrorWithAI(`https://pixeldrain.com/api/file/${id}`, headRes.status, null);
            return { error: aiError };
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
          const aiError = await this.analyzeErrorWithAI(url, res.status, data);
          return { error: aiError };
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
    console.log("startServerSideScan called");
    try {
      const response = await fetch('/api/scan-links', {
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
      if (!response.ok) throw new Error("Failed to start server-side scan");
      console.log("Server-side scan started successfully");
    } catch (error) {
      console.error("Error starting server-side scan:", error);
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

  public async startScan(allLinksToScan: { info: ErrorLinkInfo, url: string }[]) {
    console.log("startScan called, current isScanning:", this.isScanning);
    if (this.isScanning) return;
    
    const scanDocRef = doc(db, 'scans', 'current');
    
    // Check if a scan is already running in Firestore
    try {
      const scanDoc = await getDoc(scanDocRef);
      if (scanDoc.exists() && scanDoc.data().status === 'scanning') {
        // Check if the scan is "stale" (not updated in the last 5 minutes)
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

    const batchSize = 3;
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
        const results = await Promise.all(
          batch.map(async (item) => {
            let result = await this.checkPixeldrainLink(item.url);
            let error = result.error;
            
            if (!error && (!item.info.link.size || !item.info.link.unit)) {
              error = "Missing size or unit";
            }

            if (!error && item.info.link.size && item.info.link.unit && result.size && result.unit) {
              const stored = `${item.info.link.size}${item.info.link.unit}`;
              const server = `${result.size}${result.unit}`;
              if (stored !== server) error = `Size mismatch`;
            }
            
            return { item, error, fetchedSize: result.size, fetchedUnit: result.unit };
          })
        );
        
        results.forEach(({ item, error, fetchedSize, fetchedUnit }) => {
          if (error) {
            item.info.errorDetail = error;
            item.info.fetchedSize = fetchedSize;
            item.info.fetchedUnit = fetchedUnit;
            foundErrors.push(item.info);
          }
        });
        
        const currentScanned = Math.min(i + batchSize, allLinksToScan.length);
        
        // Update Firestore
        await updateDoc(scanDocRef, this.sanitizeForFirestore({
          scannedCount: currentScanned,
          errorLinks: foundErrors,
          lastUpdated: serverTimestamp()
        }));

        if (i + batchSize < allLinksToScan.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
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
}

export const scannerService = ScannerService.getInstance();
