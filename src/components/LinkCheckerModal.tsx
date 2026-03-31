import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Link as LinkIcon,
  ClipboardPaste,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Copy,
  Trash2,
  FileDown,
  ChevronDown,
  ChevronUp,
  Siren,
  Plus,
  X
} from "lucide-react";
import { QualityLinks, Language, Quality } from '../types';

export type StatusLabel =
  | "WORKING"
  | "BROKEN"
  | "PROTECTED"
  | "REDIRECT"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "MISSING_METADATA";

export type LinkCheckResult = {
  url: string;
  ok: boolean;
  status?: number;
  statusLabel?: StatusLabel;
  message?: string;
  finalUrl?: string;
  contentType?: string;
  isDirectDownload?: boolean;
  fileName?: string;
  fileSize?: number;
  fileSizeText?: string;
  host?: string;
  source?: string;
  qualityLabel?: string;
  audioLabel?: string;
  codecLabel?: string;
  subtitleLabel?: string;
  printQualityLabel?: string;
  season?: number;
  episode?: number;
  isFullSeasonMKV?: boolean;
  isFullSeasonZIP?: boolean;
  mismatchWarnings?: string[];
  confidenceScore?: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  initialInput?: string;
  autoStart?: boolean;
  onAddLinks?: (
    links: QualityLinks,
    metadata?: {
      languages: string[];
      printQuality?: string;
      subtitles?: boolean;
      type?: "movie" | "series";
      season?: number;
      episode?: number;
    }
  ) => void;
  onResults?: (results: LinkCheckResult[]) => void;
  languages?: Language[];
  qualities?: Quality[];
};

const badgeMap: Record<StatusLabel, string> = {
  WORKING: "bg-emerald-500/15 text-emerald-400 border-emerald-800/80",
  REDIRECT: "bg-cyan-500/15 text-cyan-400 border-cyan-800/80",
  PROTECTED: "bg-yellow-500/15 text-yellow-400 border-yellow-800/80",
  BROKEN: "bg-red-500/15 text-red-400 border-red-800/80",
  UNAVAILABLE: "bg-orange-500/15 text-orange-400 border-orange-800/80",
  UNKNOWN: "bg-zinc-500/15 text-zinc-300 border-zinc-700",
  MISSING_METADATA: "bg-pink-500/15 text-pink-400 border-pink-800/80",
};

function normalizeUrl(input: string) {
  let trimmed = input.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  // Pixeldrain conversion
  if (trimmed.includes("pixeldrain.com/") || trimmed.includes("pixeldrain.dev/")) {
    // Remove ?download
    trimmed = trimmed.replace(/\?download$/i, "");
    
    // Convert /api/file/ to /u/
    trimmed = trimmed.replace(/\/api\/file\//i, "/u/");
    
    // Ensure it uses pixeldrain.dev
    trimmed = trimmed.replace(/pixeldrain\.com\//i, "pixeldrain.dev/");
  }

  // Auto-convert pixeldrain /api/list/ to /l/
  if (trimmed.includes("pixeldrain.com/api/list/") || trimmed.includes("pixeldrain.dev/api/list/")) {
    trimmed = trimmed.replace(/\/api\/list\//i, "/l/");
  }

  return trimmed;
}

function splitLinks(text: string) {
  const matches = text.match(/https?:\/\/[^\s)\]}>"']+/g) || [];
  return [...new Set(matches.map((s) => s.trim()))];
}

function guessLinkType(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("pixeldrain.com") || lower.includes("pixeldrain.dev")) return "Pixeldrain";
  if (lower.includes("raj.lat") || lower.includes("hub.")) return "Direct download gate";
  if (/\.(zip|rar|7z|tar|gz|mp4|mkv|avi|mov|pdf|docx?|xlsx?|pptx?|apk|exe|srt|ass|mp3|wav|png|jpe?g|webp)(\?|#|$)/i.test(lower)) {
    return "Direct file";
  }
  return "General link";
}

function normalizeCodec(v?: string) {
  if (!v) return undefined;
  const s = v.toUpperCase().replace(/\./g, "").replace(/\s+/g, "");
  if (s === "H265" || s === "X265" || s === "HEVC") return "HEVC";
  return undefined;
}

function formatQuality(q?: string) {
  if (!q) return undefined;
  const lower = q.toLowerCase();
  if (lower === '4k') return '4K';
  return lower;
}

function normalizePrintQuality(v?: string, fileName?: string) {
  if (!v && !fileName) return undefined;
  
  // If filename contains HD, it's WEB-DL
  if (fileName && /\bHD\b/i.test(fileName)) {
    return "WEB-DL";
  }

  if (!v) return undefined;
  const s = v.toUpperCase().replace(/[\s\.\-_]+/g, "");
  if (s.includes("WEBDL")) return "WEB-DL";
  if (s.includes("WEBRIP")) return "WEBRip";
  if (s.includes("HDRIP")) return "HDRip";
  if (s.includes("BLURAY")) return "BluRay";
  if (s.includes("HQHDTC")) return "HQ HDTC";
  if (s.includes("HDTC")) return "HDTC";
  if (s.includes("HDCAM")) return "HDCAM";
  if (s.includes("DVDRIP")) return "DVDRip";
  if (s.includes("BRRIP")) return "BRRip";
  return s;
}

function detectMetadataForLink(text: string, url: string, languages?: Language[], qualities?: Quality[]) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.includes(url));
  const windowLines = [
    lines[idx - 3] || "",
    lines[idx - 2] || "",
    lines[idx - 1] || "",
    lines[idx] || "",
    lines[idx + 1] || "",
    lines[idx + 2] || "",
    lines[idx + 3] || "",
  ].join(" ");

  const lower = windowLines.toLowerCase();

  const qualityMatch = lower.match(/\b(2160p|4k|1440p|1080p|720p|480p|360p|540p)\b/i)?.[1];
  const quality = formatQuality(qualityMatch);

  const codec = normalizeCodec(
    lower.match(/\b(x265|x264|h\.265|h\.264|hevc|av1)\b/i)?.[1]
  );

  const audio = (() => {
    const foundLangs = [] as string[];
    
    const langShortCodes: Record<string, string[]> = {
      'Hindi': ['hin', 'hi'],
      'English': ['eng', 'en'],
      'Punjabi': ['pun', 'pa'],
      'Tamil': ['tam', 'ta'],
      'Telugu': ['tel', 'te'],
      'Urdu': ['urd', 'ur'],
      'Marathi': ['mar', 'mr'],
      'Bengali': ['ben', 'bn'],
      'Gujarati': ['guj', 'gu'],
      'Kannada': ['kan', 'kn'],
      'Malayalam': ['mal', 'ml'],
      'Odia': ['odi', 'or'],
      'Assamese': ['asm', 'as'],
      'Spanish': ['spa', 'es'],
      'French': ['fre', 'fra', 'fr'],
      'German': ['ger', 'deu', 'de'],
      'Italian': ['ita', 'it'],
      'Japanese': ['jpn', 'ja'],
      'Korean': ['kor', 'ko'],
      'Chinese': ['chi', 'zho', 'zh'],
      'Arabic': ['ara', 'ar'],
      'Russian': ['rus', 'ru'],
      'Portuguese': ['por', 'pt'],
      'Dutch': ['dut', 'nld', 'nl'],
      'Turkish': ['tur', 'tr'],
      'Vietnamese': ['vie', 'vi'],
      'Thai': ['tha', 'th'],
      'Indonesian': ['ind', 'id'],
      'Malay': ['may', 'msa', 'ms'],
      'Filipino': ['fil', 'tl'],
      'Persian': ['per', 'fas', 'fa'],
      'Polish': ['pol', 'pl'],
      'Ukrainian': ['ukr', 'uk'],
      'Greek': ['gre', 'ell', 'el'],
      'Hebrew': ['heb', 'he'],
      'Swedish': ['swe', 'sv'],
      'Danish': ['dan', 'da'],
      'Norwegian': ['nor', 'no'],
      'Finnish': ['fin', 'fi'],
      'Czech': ['cze', 'ces', 'cs'],
      'Hungarian': ['hun', 'hu'],
      'Romanian': ['rum', 'ron', 'ro'],
      'Bulgarian': ['bul', 'bg'],
      'Serbian': ['srp', 'sr'],
      'Croatian': ['hrv', 'hr'],
      'Slovak': ['slo', 'slk', 'sk'],
      'Slovenian': ['slv', 'sl'],
      'Lithuanian': ['lit', 'lt'],
      'Latvian': ['lav', 'lv'],
      'Estonian': ['est', 'et'],
      'Icelandic': ['ice', 'isl', 'is'],
      'Irish': ['gle', 'ga'],
      'Welsh': ['wel', 'cym', 'cy'],
      'Scottish Gaelic': ['gla', 'gd'],
      'Basque': ['baq', 'eus', 'eu'],
      'Catalan': ['cat', 'ca'],
      'Galician': ['glg', 'gl'],
      'Afrikaans': ['afr', 'af'],
      'Swahili': ['swa', 'sw'],
      'Zulu': ['zul', 'zu'],
      'Xhosa': ['xho', 'xh'],
      'Amharic': ['amh', 'am'],
      'Somali': ['som', 'so'],
      'Yoruba': ['yor', 'yo'],
      'Igbo': ['ibo', 'ig'],
      'Hausa': ['hau', 'ha'],
      'Nepali': ['nep', 'ne'],
      'Sinhala': ['sin', 'si'],
      'Burmese': ['bur', 'mya', 'my'],
      'Khmer': ['khm', 'km'],
      'Lao': ['lao', 'lo'],
      'Tibetan': ['tib', 'bod', 'bo'],
      'Mongolian': ['mon', 'mn'],
      'Uzbek': ['uzb', 'uz'],
      'Kazakh': ['kaz', 'kk'],
      'Kyrgyz': ['kir', 'ky'],
      'Tajik': ['tgk', 'tg'],
      'Turkmen': ['tuk', 'tk'],
      'Azerbaijani': ['aze', 'az'],
      'Armenian': ['arm', 'hye', 'hy'],
      'Georgian': ['geo', 'kat', 'ka'],
      'Pashto': ['pus', 'ps'],
      'Kurdish': ['kur', 'ku'],
      'Sindhi': ['snd', 'sd'],
      'Kashmiri': ['kas', 'ks'],
    };

    const checkLang = (langName: string) => {
      const normalizedLower = lower.replace(/[\.\-\s_]+/g, "");
      const normalizedLang = langName.replace(/[\.\-\s_]+/g, "").toLowerCase();
      if (normalizedLower.includes(normalizedLang)) {
        foundLangs.push(langName);
      } else {
        const codes = langShortCodes[langName] || [];
        for (const code of codes) {
          const codeRegex = new RegExp(`\\b${code}\\b`, 'i');
          if (codeRegex.test(lower)) {
            foundLangs.push(langName);
            break;
          }
        }
      }
    };

    if (languages && languages.length > 0) {
      languages.forEach(lang => checkLang(lang.name));
    } else {
      const defaultLangs = ['Hindi', 'English', 'Urdu', 'Tamil', 'Telugu', 'Punjabi'];
      defaultLangs.forEach(lang => checkLang(lang));
    }
    
    if (/dual audio/i.test(lower)) {
      if (foundLangs.length > 0) {
        if (foundLangs.length === 1 && !foundLangs.includes('English')) {
          foundLangs.push('English');
        }
        return foundLangs.join(" / ");
      } else {
        return "Hindi / English";
      }
    }
    
    return foundLangs.length ? foundLangs.join(" / ") : undefined;
  })();

  const subtitle = /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(lower) ? "Subtitles" : undefined;

  let printQuality = normalizePrintQuality(
    lower.match(/\b(web[ -]?dl|web[ -]?rip|hdrip|blu[ -]?ray|hq[ - ]?hdtc|hdtc|hdcam|dvdrip|brrip)\b/i)?.[1],
    undefined // We don't have filename here yet
  );

  if (!printQuality && qualities && qualities.length > 0) {
    const normalizedLower = lower.replace(/[\.\-\s_]+/g, "");
    const sortedQualities = [...qualities].sort((a, b) => b.name.length - a.name.length);
    for (const q of sortedQualities) {
      const normalizedQ = q.name.replace(/[\.\-\s_]+/g, "").toLowerCase();
      if (normalizedQ && normalizedLower.includes(normalizedQ)) {
        printQuality = q.name;
        break;
      }
    }
  }

  const result = {
    qualityLabel: quality,
    codecLabel: codec,
    audioLabel: audio,
    subtitleLabel: subtitle,
    printQualityLabel: printQuality,
    season: undefined as number | undefined,
    episode: undefined as number | undefined,
    isFullSeasonMKV: false,
    isFullSeasonZIP: false,
  };

  const combinedMatch = lower.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i);
  if (combinedMatch) {
    result.season = parseInt(combinedMatch[1]);
    result.episode = parseInt(combinedMatch[2]);
  } else {
    const seriesMatch = lower.match(/\b(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
    if (seriesMatch) {
      result.season = parseInt(seriesMatch[2] || seriesMatch[3]);
      const episodeMatch = lower.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
      if (episodeMatch) {
        result.episode = parseInt(episodeMatch[1] || episodeMatch[2]);
      } else {
        // Full season detection
        if (lower.includes(".mkv")) result.isFullSeasonMKV = true;
        if (lower.includes(".zip")) result.isFullSeasonZIP = true;
      }
    }
  }

  return result;
}

function detectFromFilename(fileName?: string, finalUrl?: string, languages?: Language[], qualities?: Quality[]) {
  const source = `${fileName || ""} ${finalUrl || ""}`.toLowerCase();
  
  const qualityMatch = source.match(/\b(2160p|4k|1440p|1080p|720p|480p|360p|540p)\b/i)?.[1];
  const quality = formatQuality(qualityMatch);

  const codec = normalizeCodec(source.match(/\b(x265|x264|h\.265|h\.264|hevc|av1)\b/i)?.[1]);
  
  const audio = (() => {
    const foundLangs = [] as string[];
    
    const langShortCodes: Record<string, string[]> = {
      'Hindi': ['hin', 'hi'],
      'English': ['eng', 'en'],
      'Punjabi': ['pun', 'pa'],
      'Tamil': ['tam', 'ta'],
      'Telugu': ['tel', 'te'],
      'Urdu': ['urd', 'ur'],
      'Marathi': ['mar', 'mr'],
      'Bengali': ['ben', 'bn'],
      'Gujarati': ['guj', 'gu'],
      'Kannada': ['kan', 'kn'],
      'Malayalam': ['mal', 'ml'],
      'Odia': ['odi', 'or'],
      'Assamese': ['asm', 'as'],
      'Spanish': ['spa', 'es'],
      'French': ['fre', 'fra', 'fr'],
      'German': ['ger', 'deu', 'de'],
      'Italian': ['ita', 'it'],
      'Japanese': ['jpn', 'ja'],
      'Korean': ['kor', 'ko'],
      'Chinese': ['chi', 'zho', 'zh'],
      'Arabic': ['ara', 'ar'],
      'Russian': ['rus', 'ru'],
      'Portuguese': ['por', 'pt'],
      'Dutch': ['dut', 'nld', 'nl'],
      'Turkish': ['tur', 'tr'],
      'Vietnamese': ['vie', 'vi'],
      'Thai': ['tha', 'th'],
      'Indonesian': ['ind', 'id'],
      'Malay': ['may', 'msa', 'ms'],
      'Filipino': ['fil', 'tl'],
      'Persian': ['per', 'fas', 'fa'],
      'Polish': ['pol', 'pl'],
      'Ukrainian': ['ukr', 'uk'],
      'Greek': ['gre', 'ell', 'el'],
      'Hebrew': ['heb', 'he'],
      'Swedish': ['swe', 'sv'],
      'Danish': ['dan', 'da'],
      'Norwegian': ['nor', 'no'],
      'Finnish': ['fin', 'fi'],
      'Czech': ['cze', 'ces', 'cs'],
      'Hungarian': ['hun', 'hu'],
      'Romanian': ['rum', 'ron', 'ro'],
      'Bulgarian': ['bul', 'bg'],
      'Serbian': ['srp', 'sr'],
      'Croatian': ['hrv', 'hr'],
      'Slovak': ['slo', 'slk', 'sk'],
      'Slovenian': ['slv', 'sl'],
      'Lithuanian': ['lit', 'lt'],
      'Latvian': ['lav', 'lv'],
      'Estonian': ['est', 'et'],
      'Icelandic': ['ice', 'isl', 'is'],
      'Irish': ['gle', 'ga'],
      'Welsh': ['wel', 'cym', 'cy'],
      'Scottish Gaelic': ['gla', 'gd'],
      'Basque': ['baq', 'eus', 'eu'],
      'Catalan': ['cat', 'ca'],
      'Galician': ['glg', 'gl'],
      'Afrikaans': ['afr', 'af'],
      'Swahili': ['swa', 'sw'],
      'Zulu': ['zul', 'zu'],
      'Xhosa': ['xho', 'xh'],
      'Amharic': ['amh', 'am'],
      'Somali': ['som', 'so'],
      'Yoruba': ['yor', 'yo'],
      'Igbo': ['ibo', 'ig'],
      'Hausa': ['hau', 'ha'],
      'Nepali': ['nep', 'ne'],
      'Sinhala': ['sin', 'si'],
      'Burmese': ['bur', 'mya', 'my'],
      'Khmer': ['khm', 'km'],
      'Lao': ['lao', 'lo'],
      'Tibetan': ['tib', 'bod', 'bo'],
      'Mongolian': ['mon', 'mn'],
      'Uzbek': ['uzb', 'uz'],
      'Kazakh': ['kaz', 'kk'],
      'Kyrgyz': ['kir', 'ky'],
      'Tajik': ['tgk', 'tg'],
      'Turkmen': ['tuk', 'tk'],
      'Azerbaijani': ['aze', 'az'],
      'Armenian': ['arm', 'hye', 'hy'],
      'Georgian': ['geo', 'kat', 'ka'],
      'Pashto': ['pus', 'ps'],
      'Kurdish': ['kur', 'ku'],
      'Sindhi': ['snd', 'sd'],
      'Kashmiri': ['kas', 'ks'],
    };

    const checkLang = (langName: string) => {
      const normalizedLower = source.replace(/[\.\-\s_]+/g, "");
      const normalizedLang = langName.replace(/[\.\-\s_]+/g, "").toLowerCase();
      if (normalizedLower.includes(normalizedLang)) {
        foundLangs.push(langName);
      } else {
        const codes = langShortCodes[langName] || [];
        for (const code of codes) {
          const codeRegex = new RegExp(`\\b${code}\\b`, 'i');
          if (codeRegex.test(source)) {
            foundLangs.push(langName);
            break;
          }
        }
      }
    };

    if (languages && languages.length > 0) {
      languages.forEach(lang => checkLang(lang.name));
    } else {
      const defaultLangs = ['Hindi', 'English', 'Urdu', 'Tamil', 'Telugu', 'Punjabi'];
      defaultLangs.forEach(lang => checkLang(lang));
    }
    
    if (/dual[ ._-]?audio/i.test(source)) {
      if (foundLangs.length > 0) {
        if (foundLangs.length === 1 && !foundLangs.includes('English')) {
          foundLangs.push('English');
        }
        return foundLangs.join(" / ");
      } else {
        return "Hindi / English";
      }
    }
    
    return foundLangs.length ? foundLangs.join(" / ") : undefined;
  })();

  const subtitle = /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source) ? "Subtitles" : undefined;
  
  let printQuality = normalizePrintQuality(source.match(/\b(web[ -]?dl|web[ -]?rip|hdrip|blu[ -]?ray|hq[ - ]?hdtc|hdtc|hdcam|dvdrip|brrip)\b/i)?.[1], fileName);

  if (!printQuality && qualities && qualities.length > 0) {
    qualities.forEach(q => {
      const escaped = q.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(source)) printQuality = q.name;
    });
  }

  const result = {
    qualityLabel: quality,
    codecLabel: codec,
    audioLabel: audio,
    subtitleLabel: subtitle,
    printQualityLabel: printQuality,
    season: undefined as number | undefined,
    episode: undefined as number | undefined,
    isFullSeasonMKV: false,
    isFullSeasonZIP: false,
  };

  const combinedMatch = source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i);
  if (combinedMatch) {
    result.season = parseInt(combinedMatch[1]);
    result.episode = parseInt(combinedMatch[2]);
  } else {
    const seriesMatch = source.match(/\b(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
    if (seriesMatch) {
      result.season = parseInt(seriesMatch[2] || seriesMatch[3]);
      const episodeMatch = source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
      if (episodeMatch) {
        result.episode = parseInt(episodeMatch[1] || episodeMatch[2]);
      } else {
        // Full season detection
        if (source.includes(".mkv")) result.isFullSeasonMKV = true;
        if (source.includes(".zip")) result.isFullSeasonZIP = true;
      }
    }
  }

  return result;
}

function buildMismatchWarnings(result: LinkCheckResult, all: LinkCheckResult[], languages?: Language[], qualities?: Quality[]) {
  const warnings: string[] = [];
  const fileMeta = detectFromFilename(result.fileName, result.finalUrl, languages, qualities);

  if (result.qualityLabel && fileMeta.qualityLabel && result.qualityLabel !== fileMeta.qualityLabel) {
    warnings.push(`Post says ${result.qualityLabel}, file suggests ${fileMeta.qualityLabel}`);
  }

  const postCodec = normalizeCodec(result.codecLabel);
  const fileCodec = normalizeCodec(fileMeta.codecLabel);
  if (postCodec && fileCodec && postCodec !== fileCodec) {
    warnings.push(`Post says ${postCodec}, file suggests ${fileCodec}`);
  }

  if (result.printQualityLabel && fileMeta.printQualityLabel && result.printQualityLabel !== fileMeta.printQualityLabel) {
    warnings.push(`Post says ${result.printQualityLabel}, file suggests ${fileMeta.printQualityLabel}`);
  }

  if (result.audioLabel && fileMeta.audioLabel) {
    const a = result.audioLabel.toLowerCase();
    const b = fileMeta.audioLabel.toLowerCase();
    if (a !== b && !(a.includes("dual") && b.includes("dual"))) {
      warnings.push(`Post says ${result.audioLabel}, file suggests ${fileMeta.audioLabel}`);
    }
  }

  if (result.subtitleLabel && !fileMeta.subtitleLabel && result.fileName) {
    warnings.push("Post says subtitles, but filename does not suggest subtitles");
  }

  const duplicates = all.filter((x) => x.url === result.url);
  const duplicateQualities = [...new Set(duplicates.map((d) => d.qualityLabel).filter(Boolean))];
  if (duplicateQualities.length > 1) {
    warnings.push(`Same link reused for multiple qualities: ${duplicateQualities.join(", ")}`);
  }

  const sameFile = all.filter((x) => x.fileName && result.fileName && x.fileName === result.fileName);
  const sameFileQualities = [...new Set(sameFile.map((d) => d.qualityLabel).filter(Boolean))];
  if (sameFile.length > 1 && sameFileQualities.length > 1) {
    warnings.push(`Same file name reused across qualities: ${sameFileQualities.join(", ")}`);
  }

  if (result.fileSize && result.qualityLabel) {
    const mb = result.fileSize / (1000 * 1000);
    const gb = mb / 1000;
    if (mb < 20) warnings.push("File size is suspiciously small (< 20MB)");
    if (result.qualityLabel === "1080P" && gb < 0.5) warnings.push("Suspiciously small for 1080p");
    if (result.qualityLabel === "720P" && gb < 0.25) warnings.push("Suspiciously small for 720p");
    if (result.qualityLabel === "480P" && gb > 3.5) warnings.push("Suspiciously large for 480p");
    if ((result.qualityLabel === "2160P" || result.qualityLabel === "4K") && gb < 1.2) warnings.push("Suspiciously small for 4K");
  }

  return [...new Set(warnings)];
}

async function serverCheckLink(url: string): Promise<LinkCheckResult> {
  const response = await fetch("/api/check-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const data = await response.json().catch(() => ({}));

  return {
    url,
    ok: !!data?.ok,
    status: data?.status,
    statusLabel: data?.statusLabel || (data?.ok ? "WORKING" : "UNKNOWN"),
    message: data?.message,
    finalUrl: data?.finalUrl,
    contentType: data?.contentType,
    isDirectDownload: !!data?.isDirectDownload,
    fileName: data?.fileName,
    fileSize: data?.fileSize,
    fileSizeText: data?.fileSizeText,
    host: data?.host,
    source: data?.source,
  };
}

export const LinkCheckerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  title = "Link Checker",
  initialInput = "",
  autoStart = false,
  onAddLinks,
  onResults,
  languages = [],
  qualities = [],
}) => {
  const [input, setInput] = useState(initialInput);
  const [autoExtract, setAutoExtract] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LinkCheckResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Update input when initialInput changes
  React.useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
    }
  }, [initialInput]);

  // Auto-start check if requested
  React.useEffect(() => {
    if (isOpen && autoStart && initialInput && results.length === 0 && !loading) {
      handleCheck();
    }
  }, [isOpen, autoStart, initialInput]);

  // Auto-paste from clipboard when modal opens
  React.useEffect(() => {
    if (isOpen) {
      pasteFromClipboard(true);
    }
  }, [isOpen]);

  // Auto-paste from clipboard when window gains focus
  React.useEffect(() => {
    const handleFocus = () => {
      if (isOpen) {
        pasteFromClipboard(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isOpen]);

  // Periodic clipboard check while modal is open
  React.useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      pasteFromClipboard(true);
    }, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [isOpen]);

  const links = useMemo(() => {
    if (!autoExtract) {
      return input.split(/\r?\n/).map((s) => normalizeUrl(s)).filter(Boolean);
    }
    return splitLinks(input).map(normalizeUrl).filter(Boolean);
  }, [input, autoExtract]);

  const extractedMeta = useMemo(() => {
    const map: Record<string, {
      qualityLabel?: string;
      codecLabel?: string;
      audioLabel?: string;
      subtitleLabel?: string;
      printQualityLabel?: string;
      season?: number;
      episode?: number;
      isFullSeasonMKV?: boolean;
      isFullSeasonZIP?: boolean;
    }> = {};
    for (const link of links) {
      map[link] = detectMetadataForLink(input, link, languages, qualities);
    }
    return map;
  }, [input, links, languages, qualities]);

  const firstType = useMemo(() => (links[0] ? guessLinkType(links[0]) : "General link"), [links]);

  const toggleExpand = (url: string) => {
    setExpanded((prev) => ({ ...prev, [url]: !prev[url] }));
  };

  const toggleSelect = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUrls.size === results.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(results.map((r) => r.url)));
    }
  };

  const handleCheck = async (onlyUrls?: string[]) => {
    const urls = (onlyUrls || links).filter(Boolean);
    setError(null);

    if (!urls.length) {
      setError("Please paste at least one valid link first.");
      return;
    }

    for (const u of urls) {
      try {
        new URL(u);
      } catch {
        setError(`Invalid URL: ${u}`);
        return;
      }
    }

    setLoading(true);
    try {
      const concurrency = 10;
      const allResults: LinkCheckResult[] = [];
      const queue = [...urls];
      let activeCount = 0;
      let completedCount = 0;

      const processNext = async (): Promise<void> => {
        if (queue.length === 0) return;
        
        activeCount++;
        const u = queue.shift()!;
        
        try {
          let base: any = null;
          let finalUrlToUse = u;
          
          // Check if URL has a token parameter
          if (u.includes('?token=') || u.includes('&token=')) {
            const urlObj = new URL(u);
            const token = urlObj.searchParams.get('token');
            if (token) {
              urlObj.searchParams.delete('token');
              const urlWithoutToken = urlObj.toString();
              
              try {
                // Try without token first
                base = await serverCheckLink(urlWithoutToken);
                if (base.ok) {
                  finalUrlToUse = urlWithoutToken;
                } else {
                  // If it fails, try with token
                  base = await serverCheckLink(u);
                }
              } catch (e) {
                // If it throws, try with token
                base = await serverCheckLink(u);
              }
            } else {
              base = await serverCheckLink(u);
            }
          } else {
            base = await serverCheckLink(u);
          }

          const postMeta = extractedMeta[u] || {};
          const fileMeta = detectFromFilename(base.fileName, base.finalUrl, languages, qualities);
          const hasFileName = !!base.fileName;

          const result: LinkCheckResult = {
            ...base,
            url: finalUrlToUse, // Override the URL with the working one (without token if possible)
            qualityLabel: fileMeta.qualityLabel || postMeta.qualityLabel,
            codecLabel: fileMeta.codecLabel || (hasFileName ? undefined : postMeta.codecLabel),
            audioLabel: fileMeta.audioLabel || (hasFileName ? undefined : postMeta.audioLabel),
            subtitleLabel: fileMeta.subtitleLabel || (hasFileName ? undefined : postMeta.subtitleLabel),
            printQualityLabel: fileMeta.printQualityLabel || postMeta.printQualityLabel,
            season: fileMeta.season || postMeta.season,
            episode: fileMeta.episode || postMeta.episode,
            isFullSeasonMKV: fileMeta.isFullSeasonMKV || postMeta.isFullSeasonMKV,
            isFullSeasonZIP: fileMeta.isFullSeasonZIP || postMeta.isFullSeasonZIP,
          };

          if (result.ok && (!result.fileName || !result.qualityLabel || !result.audioLabel)) {
            result.statusLabel = "MISSING_METADATA";
          }
          
          if (result.ok && result.fileSize && result.fileSize < 20 * 1000 * 1000) {
            result.statusLabel = "BROKEN";
            result.message = "File size too small (< 20MB)";
          }

          // Filename validation
          if (result.ok && result.fileName) {
            const fileName = result.fileName.toLowerCase();
            const hasQuality = /\b(2160p|4k|1440p|1080p|720p|480p|360p|540p)\b/i.test(fileName);
            const hasLanguage = /\b(hindi|english|urdu|tamil|telugu|punjabi|marathi|bengali|gujarati|kannada|malayalam|odia|assamese|spanish|french|german|italian|japanese|korean|chinese|arabic|russian|portuguese|dutch|turkish|vietnamese|thai|indonesian|malay|filipino|persian|polish|ukrainian|greek|hebrew|swedish|danish|norwegian|finnish|czech|hungarian|romanian|bulgarian|serbian|croatian|slovak|slovenian|lithuanian|latvian|estonian|icelandic|irish|welsh|scottish gaelic|basque|catalan|galician|afrikaans|swahili|zulu|xhosa|amharic|somali|yoruba|igbo|hausa|nepali|sinhala|burmese|khmer|lao|tibetan|mongolian|uzbek|kazakh|kyrgyz|tajik|turkmen|azerbaijani|armenian|georgian|pashto|kurdish|sindhi|kashmiri|dual[ ._-]?audio)\b/i.test(fileName);
            
            if (!hasQuality && result.statusLabel === "WORKING") {
              result.statusLabel = "MISSING_METADATA";
              result.message = "Missing Quality in filename";
            } else if (!hasLanguage && result.statusLabel === "WORKING") {
              result.statusLabel = "MISSING_METADATA";
              result.message = "Missing Language in filename";
            }
          }

          allResults.push(result);
          completedCount++;

          if (result.statusLabel === "WORKING") {
            setSelectedUrls((prev) => new Set(prev).add(result.url));
          }

          // Update results incrementally for better UX
          if (onlyUrls?.length) {
            setResults((prev) => {
              const keep = prev.filter((r) => !onlyUrls.includes(r.url));
              const merged = [...keep, ...allResults];
              return merged.map((r) => ({
                ...r,
                mismatchWarnings: buildMismatchWarnings(r, merged, languages, qualities),
                confidenceScore: Math.max(0, 100 - (buildMismatchWarnings(r, merged, languages, qualities).length * 18)),
              }));
            });
          } else {
            setResults(allResults.map(r => ({
              ...r,
              mismatchWarnings: buildMismatchWarnings(r, allResults, languages, qualities),
              confidenceScore: Math.max(0, 100 - (buildMismatchWarnings(r, allResults, languages, qualities).length * 18)),
            })));
          }
        } catch (e) {
          console.error(`Error checking link ${u}:`, e);
        } finally {
          activeCount--;
          await processNext();
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => processNext());
      await Promise.all(workers);
      
      if (onResults) {
        onResults(allResults);
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error while checking links.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddLinks = () => {
    if (!onAddLinks || results.length === 0) return;
    
    const workingResults = results.filter(r => selectedUrls.has(r.url) && r.statusLabel === "WORKING");
    if (workingResults.length === 0) return;

    // Collect metadata to pass back
    const detectedLangs = new Set<string>();
    let detectedPrintQuality: string | undefined;
    let detectedSubtitles = false;
    let detectedType: "movie" | "series" = "movie";
    let detectedSeason: number | undefined;
    let detectedEpisode: number | undefined;

    workingResults.forEach(r => {
      const source = `${r.fileName || ""} ${r.finalUrl || ""} ${input}`.toLowerCase();
      
      if (r.audioLabel) {
        r.audioLabel.split(" / ").forEach(l => detectedLangs.add(l));
      }
      if (r.printQualityLabel && !detectedPrintQuality) {
        detectedPrintQuality = r.printQualityLabel;
      }
      if (r.subtitleLabel || /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source)) {
        detectedSubtitles = true;
      }

      // Detect Series vs Movie
      const combinedMatch = source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i);
      if (combinedMatch) {
        detectedType = "series";
        detectedSeason = parseInt(combinedMatch[1]);
        detectedEpisode = parseInt(combinedMatch[2]);
      } else {
        const seriesMatch = source.match(/\b(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
        if (seriesMatch) {
          detectedType = "series";
          detectedSeason = parseInt(seriesMatch[2] || seriesMatch[3]);
          
          const episodeMatch = source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
          if (episodeMatch) {
            detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
          }
        }
      }
    });

    const qualityLinks: QualityLinks = workingResults.map(r => {
      // Use detected quality or fallback
      const quality = r.qualityLabel || '720p';

      // Build a descriptive name
      let finalName = quality;
      
      if (r.codecLabel === "HEVC") finalName += ` HEVC`;
      if (r.audioLabel && r.audioLabel.includes('Dual') && r.codecLabel !== "HEVC") finalName += ' Dual';

      // Determine size and unit
      let sizeStr = '';
      let unit: 'MB' | 'GB' = 'MB';
      
      if (r.fileSize) {
        const sizeMB = r.fileSize / (1000 * 1000);
        if (sizeMB >= 1000) {
          sizeStr = (sizeMB / 1000).toFixed(2);
          unit = 'GB';
        } else {
          sizeStr = sizeMB.toFixed(2).replace(/\.00$/, '');
          unit = 'MB';
        }
      }

      return {
        id: Math.random().toString(36).substr(2, 9),
        name: finalName,
        url: r.finalUrl || r.url,
        size: sizeStr,
        unit: unit,
        season: r.season,
        episode: r.episode,
        isFullSeasonMKV: r.isFullSeasonMKV,
        isFullSeasonZIP: r.isFullSeasonZIP,
      };
    });
    
    onAddLinks(qualityLinks, {
      languages: Array.from(detectedLangs),
      printQuality: detectedPrintQuality,
      subtitles: detectedSubtitles,
      type: detectedType,
      season: detectedSeason,
      episode: detectedEpisode,
    });
    onClose();
  };

  const pasteFromClipboard = async (isAuto = false) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const newLinks = splitLinks(text).map(normalizeUrl).filter(Boolean);
      if (newLinks.length === 0) return;

      let addedAny = false;
      const newlyAddedUrls: string[] = [];

      setInput((prev) => {
        const existingLinks = splitLinks(prev).map(normalizeUrl).filter(Boolean);
        const uniqueNewLinks = newLinks.filter(l => !existingLinks.includes(l));
        
        if (uniqueNewLinks.length === 0) return prev;
        
        addedAny = true;
        newlyAddedUrls.push(...uniqueNewLinks);
        const separator = prev.trim() ? '\n' : '';
        return prev + separator + uniqueNewLinks.join('\n');
      });

      if (addedAny && isAuto && results.length > 0 && !loading) {
        // Automatically check the newly added links if we already have results
        handleCheck(newlyAddedUrls);
      }
      
      if (!isAuto) setError(null);
    } catch (e) {
      if (!isAuto) setError("Clipboard access denied. Please paste manually.");
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      pasteFromClipboard(true);
    }
  }, [isOpen]);

  const reset = () => {
    setInput("");
    setResults([]);
    setError(null);
    setExpanded({});
  };

  const retryFailed = () => {
    const failed = results.filter((r) => !r.ok).map((r) => r.url);
    if (failed.length) handleCheck(failed);
  };

  const copyResults = async () => {
    const text = JSON.stringify(results, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy results.");
    }
  };

  const summary = useMemo(() => {
    const working = results.filter((r) => r.statusLabel === "WORKING").length;
    const broken = results.filter((r) => r.statusLabel === "BROKEN").length;
    const protectedCount = results.filter((r) => r.statusLabel === "PROTECTED").length;
    const redirect = results.filter((r) => r.statusLabel === "REDIRECT").length;
    const unavailable = results.filter((r) => r.statusLabel === "UNAVAILABLE").length;
    const unknown = results.filter((r) => r.statusLabel === "UNKNOWN").length;
    const mismatches = results.filter((r) => (r.mismatchWarnings?.length || 0) > 0).length;
    const missingMetadata = results.filter((r) => r.statusLabel === "MISSING_METADATA").length;
    return { working, broken, protectedCount, redirect, unavailable, unknown, mismatches, missingMetadata };
  }, [results]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.18 }} className="w-full max-w-5xl max-h-[95vh] overflow-y-auto custom-scrollbar">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
              <div className="p-5 md:p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-2.5"><LinkIcon className="h-5 w-5 text-cyan-400" /></div>
                    <div>
                      <h2 className="text-xl font-semibold leading-none text-white">{title}</h2>
                      <p className="text-sm text-zinc-400 mt-1">Check Pixeldrain, direct file links, protected download gateways, and movie post mismatches.</p>
                    </div>
                  </div>
                  <button onClick={onClose} className="rounded-full px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white transition">Close</button>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                  <label className="text-sm font-medium text-zinc-200">Paste one or multiple links / full movie post</label>
                  <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste links or a full movie post here..." rows={6} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-cyan-500" />

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                      <input type="checkbox" checked={autoExtract} onChange={(e) => setAutoExtract(e.target.checked)} className="h-4 w-4 rounded border-zinc-700 bg-zinc-950" />
                      Auto extract links from full post/message
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => pasteFromClipboard(false)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 gap-2 transition-colors"><ClipboardPaste className="h-4 w-4" />Paste</button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
                    <span>Detected type: <strong className="text-zinc-200">{firstType}</strong> • <strong className="text-zinc-200">{links.length}</strong> link(s) found</span>
                    <span className="flex items-center gap-2 text-emerald-400"><ShieldCheck className="h-4 w-4" />Checks only when manually used</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleCheck()} disabled={loading} className="inline-flex items-center justify-center rounded-2xl gap-2 bg-cyan-500 px-4 py-2 text-sm font-bold text-black hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{loading ? "Checking..." : `Check ${links.length || ""} Link${links.length > 1 ? "s" : ""}`}</button>
                  <button onClick={retryFailed} className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 gap-2 disabled:opacity-50 transition-colors" disabled={loading || !results.some((r) => !r.ok)}><RefreshCw className="h-4 w-4" /> Retry Failed</button>
                  <button onClick={copyResults} className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 gap-2 disabled:opacity-50 transition-colors" disabled={!results.length}><Copy className="h-4 w-4" /> Copy Results</button>
                  <button onClick={reset} className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 gap-2 transition-colors"><Trash2 className="h-4 w-4" /> Reset</button>
                  
                  {!!results.length && (
                    <button onClick={toggleSelectAll} className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 gap-2 transition-colors">
                      {selectedUrls.size === results.length ? "Deselect All" : "Select All"}
                    </button>
                  )}

                  {onAddLinks && results.some(r => r.statusLabel === "WORKING") && !loading && (
                    <button onClick={handleAddLinks} className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 gap-2 ml-auto transition-colors">
                      <Plus className="h-4 w-4" />
                      Add {selectedUrls.size} Selected Link(s)
                    </button>
                  )}
                </div>

                {error ? <div className="rounded-2xl border border-red-900/70 bg-red-950/40 p-4 text-red-300 text-sm flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5" /><span>{error}</span></div> : null}

                {!!results.length && (
                  <div className="grid grid-cols-2 md:grid-cols-8 gap-3">
                    {[
                      ["Working", summary.working, "text-emerald-400"],
                      ["Broken", summary.broken, "text-red-400"],
                      ["Protected", summary.protectedCount, "text-yellow-400"],
                      ["Redirect", summary.redirect, "text-cyan-400"],
                      ["Unavailable", summary.unavailable, "text-orange-400"],
                      ["Unknown", summary.unknown, "text-zinc-300"],
                      ["Mismatches", summary.mismatches, "text-pink-400"],
                      ["Missing Meta", summary.missingMetadata, "text-pink-400"]
                    ].map(([label, count, color]) => (
                      <div key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                        <div className={`text-sm ${color}`}>{label}</div>
                        <div className="text-2xl font-semibold text-white mt-1">{count}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 max-h-[500px] overflow-auto pr-1">
                  {results.map((result) => {
                    const statusLabel = result.statusLabel || (result.ok ? "WORKING" : "UNKNOWN");
                    const openRow = !!expanded[result.url];
                    
                    // Calculate final name for display
                    let finalName = result.qualityLabel || '720p';
                    if (result.codecLabel === "HEVC") finalName += " HEVC";
                    if (result.audioLabel && result.audioLabel.includes("Dual") && result.codecLabel !== "HEVC") finalName += " Dual";

                    return (
                      <div key={`${result.url}-${result.qualityLabel || "na"}`} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                        <div className="p-4 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 flex items-start gap-3">
                              <div className="mt-1">
                                <input type="checkbox" checked={selectedUrls.has(result.url)} onChange={() => toggleSelect(result.url)} className="h-5 w-5 rounded border-zinc-700 bg-zinc-950" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <XCircle className="h-5 w-5 text-red-400" />}
                                  <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeMap[statusLabel]}`}>{statusLabel}</div>
                                  {result.ok && (
                                    <div className="inline-flex rounded-full border border-cyan-800 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-400">
                                      Name: {finalName}
                                    </div>
                                  )}
                                  {result.isDirectDownload ? <div className="inline-flex rounded-full border border-blue-800 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400"><FileDown className="h-3.5 w-3.5 mr-1" /> Direct Download</div> : null}
                                  {(result.mismatchWarnings?.length || 0) > 0 ? <div className="inline-flex rounded-full border border-pink-800 bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-400"><Siren className="h-3.5 w-3.5 mr-1" /> Mismatch</div> : null}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {result.qualityLabel ? <span className="rounded-full border border-fuchsia-800 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-300">{result.qualityLabel}</span> : null}
                                  {result.printQualityLabel ? <span className="rounded-full border border-rose-800 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300">{result.printQualityLabel}</span> : null}
                                  {result.codecLabel ? <span className="rounded-full border border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300">{result.codecLabel}</span> : null}
                                  {result.audioLabel ? <span className="rounded-full border border-emerald-800 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">{result.audioLabel}</span> : null}
                                  {result.subtitleLabel ? <span className="rounded-full border border-amber-800 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">{result.subtitleLabel}</span> : null}
                                  {result.season ? <span className="rounded-full border border-blue-800 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-300">Season {result.season}</span> : null}
                                  {result.episode ? <span className="rounded-full border border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-300">Episode {result.episode}</span> : null}
                                  {result.isFullSeasonMKV ? <span className="rounded-full border border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-300">Full Season MKV</span> : null}
                                  {result.isFullSeasonZIP ? <span className="rounded-full border border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-300">Full Season ZIP</span> : null}
                                </div>
                                <div className="mt-2 break-all text-sm text-zinc-200">{result.url}</div>
                                <p className="text-sm text-zinc-400 mt-1">{result.message || (result.ok ? "The link is reachable." : "The link could not be verified.")}</p>
                              </div>
                            </div>
                            <button onClick={() => toggleExpand(result.url)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 gap-2 self-start transition-colors">Details {openRow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                          </div>
                          {openRow ? (
                            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                              {typeof result.status !== "undefined" ? <div>Status: {result.status}</div> : null}
                              {result.host ? <div>Host: {result.host}</div> : null}
                              {result.contentType ? <div>Content-Type: {result.contentType}</div> : null}
                              {result.source ? <div>Method: {result.source}</div> : null}
                              {result.fileName ? <div>File Name: {result.fileName}</div> : null}
                              {result.fileSizeText ? <div>File Size: {result.fileSizeText}</div> : null}
                              {result.qualityLabel ? <div>Quality: {result.qualityLabel}</div> : null}
                              {result.printQualityLabel ? <div>Print Quality: {result.printQualityLabel}</div> : null}
                              {result.codecLabel ? <div>Codec: {result.codecLabel}</div> : null}
                              {result.audioLabel ? <div>Audio: {result.audioLabel}</div> : null}
                              {result.subtitleLabel ? <div>Subtitles: {result.subtitleLabel}</div> : null}
                              {result.season ? <div>Season: {result.season}</div> : null}
                              {result.episode ? <div>Episode: {result.episode}</div> : null}
                              {result.isFullSeasonMKV ? <div>Full Season MKV: Yes</div> : null}
                              {result.isFullSeasonZIP ? <div>Full Season ZIP: Yes</div> : null}
                              {typeof result.confidenceScore === "number" ? <div>Confidence: {result.confidenceScore}%</div> : null}
                              {result.finalUrl ? <div className="sm:col-span-2 break-all text-zinc-300">Final URL: {result.finalUrl}</div> : null}
                              {(result.mismatchWarnings?.length || 0) > 0 ? (
                                <div className="sm:col-span-2 rounded-xl border border-pink-900/70 bg-pink-950/30 p-3 text-pink-300">
                                  <div className="font-semibold mb-2">Mismatch Warnings</div>
                                  <ul className="list-disc pl-5 space-y-1">{result.mismatchWarnings?.map((w, i) => <li key={i}>{w}</li>)}</ul>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

