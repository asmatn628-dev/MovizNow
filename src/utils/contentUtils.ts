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
