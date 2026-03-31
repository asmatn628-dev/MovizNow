import { db } from '../firebase';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ErrorLinkInfo, ScanState } from '../types';

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

  public async checkPixeldrainLink(url: string, contentTitle?: string): Promise<{ error: string | null; size?: string; unit?: 'MB' | 'GB' }> {
    if (!url || url.trim() === '') return { error: "Empty link" };
    
    const fileMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/);
    const listMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:l|api\/list)\/([a-zA-Z0-9]+)/);
    
    let error: string | null = null;
    let sizeStr: string | undefined;
    let unitStr: 'MB' | 'GB' | undefined;

    if (fileMatch) {
      const id = fileMatch[1];
      try {
        const res = await fetch(`https://pixeldrain.com/api/file/${id}/info`);
        if (res.status === 451) return { error: "Unavailable from Server" };

        let data;
        try { data = await res.json(); } catch (e) {}

        if (!res.ok || (data && data.success === false)) {
          const errorDetail = await this.analyzeErrorDetail(url, res.status, data);
          return { error: errorDetail };
        }

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
          sizeStr = size.toFixed(2).replace(/\.00$/, '');
          unitStr = unit;

          // New validations
          if (sizeInBytes < 20 * 1000 * 1000) {
            error = "Size less than 20MB";
          } else if (!data.name || data.name.trim() === '') {
            error = "Missing filename";
          } else {
            const fileName = data.name.toLowerCase();
            const hasQuality = /\b(2160p|4k|1440p|1080p|720p|480p|360p|540p)\b/i.test(fileName);
            const hasLanguage = /\b(hindi|english|urdu|tamil|telugu|punjabi|marathi|bengali|gujarati|kannada|malayalam|odia|assamese|spanish|french|german|italian|japanese|korean|chinese|arabic|russian|portuguese|dutch|turkish|vietnamese|thai|indonesian|malay|filipino|persian|polish|ukrainian|greek|hebrew|swedish|danish|norwegian|finnish|czech|hungarian|romanian|bulgarian|serbian|croatian|slovak|slovenian|lithuanian|latvian|estonian|icelandic|irish|welsh|scottish gaelic|basque|catalan|galician|afrikaans|swahili|zulu|xhosa|amharic|somali|yoruba|igbo|hausa|nepali|sinhala|burmese|khmer|lao|tibetan|mongolian|uzbek|kazakh|kyrgyz|tajik|turkmen|azerbaijani|armenian|georgian|pashto|kurdish|sindhi|kashmiri|dual[ ._-]?audio)\b/i.test(fileName);
            
            if (!hasQuality) error = "Missing Quality in filename";
            else if (!hasLanguage) error = "Missing Language in filename";
            else if (contentTitle) {
              const titleWords = contentTitle.toLowerCase().split(/[\s\.\-_]+/).filter(w => w.length > 2);
              const foundTitle = titleWords.some(word => fileName.includes(word));
              if (!foundTitle) error = "Filename mismatch with Title";
            }
          }
        } else {
          error = "Unavailable from Server";
        }
      } catch (e) {
        error = "Unavailable from Server";
      }
    } else if (listMatch) {
      const id = listMatch[1];
      try {
        const res = await fetch(`https://pixeldrain.com/api/list/${id}`);
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
          sizeStr = size.toFixed(2).replace(/\.00$/, '');
          unitStr = unit;

          if (sizeInBytes < 20 * 1000 * 1000) {
            error = "Size less than 20MB";
          }
        } else {
          error = "Unavailable from Server";
        }
      } catch (e) {
        error = "Unavailable from Server";
      }
    } else {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (res.status === 451) return { error: "Unavailable from Server" };
        if (!res.ok && res.status !== 403) {
          error = `HTTP ${res.status}`;
        }
      } catch (e) {
        try {
          const res = await fetch(url);
          if (res.status === 451) return { error: "Unavailable from Server" };
          if (!res.ok && res.status !== 403) error = `HTTP ${res.status}`;
        } catch (err) {}
      }
    }
    return { error, size: sizeStr, unit: unitStr };
  }
}

export const scannerService = ScannerService.getInstance();
