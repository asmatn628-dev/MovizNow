import { LinkCheckResult } from '../components/LinkCheckerModal';

export async function serverCheckLink(url: string): Promise<LinkCheckResult> {
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
    qualityLabel: data?.qualityLabel,
    audioLabel: data?.audioLabel,
    codecLabel: data?.codecLabel,
    subtitleLabel: data?.subtitleLabel,
    printQualityLabel: data?.printQualityLabel,
    season: data?.season,
    episode: data?.episode,
    isFullSeasonMKV: !!data?.isFullSeasonMKV,
    isFullSeasonZIP: !!data?.isFullSeasonZIP,
    mismatchWarnings: data?.mismatchWarnings,
    confidenceScore: data?.confidenceScore,
  };
}
