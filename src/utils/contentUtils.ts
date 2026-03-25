import { Content, Season } from '../types';

export const formatContentTitle = (content: Content) => {
  if (content.type === 'movie' || !content.seasons) {
    return content.title;
  }

  try {
    const seasons: Season[] = JSON.parse(content.seasons);
    if (seasons.length === 0) return content.title;

    if (seasons.length === 1) {
      const season = seasons[0];
      const episodeCount = season.episodes.length;
      return `${content.title} (Season ${season.seasonNumber} Episode ${episodeCount})`;
    } else {
      const seasonNumbers = seasons
        .map(s => s.seasonNumber)
        .sort((a, b) => a - b)
        .join(',');
      return `${content.title} (Season ${seasonNumbers})`;
    }
  } catch (e) {
    return content.title;
  }
};

export const formatReleaseDate = (dateString?: string) => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    // Check if first part is a 4-digit year (YYYY-MM-DD)
    if (parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${day}-${month}-${year}`;
    }
  }
  return dateString;
};

export const formatRuntime = (runtime?: string) => {
  if (!runtime) return '';
  // Check if runtime is in H:MM or HH:MM format
  const timeMatch = runtime.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
  return runtime;
};
