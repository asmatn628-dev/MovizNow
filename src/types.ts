export type Role = 'admin' | 'user' | 'temporary' | 'selected_content' | 'data_editor' | 'trial';
export type Status = 'pending' | 'active' | 'expired';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: Role;
  status: Status;
  phone?: string;
  expiryDate?: string; // ISO string
  assignedContent?: string[]; // Content IDs
  watchLater?: string[];
  favorites?: string[];
  createdAt: string;
  sessionsCount?: number;
  timeSpent?: number; // in minutes
  lastNotificationCheck?: string; // ISO string
  permissions?: string[]; // Specific management access
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  contentId: string;
  posterUrl?: string;
  type?: 'movie' | 'series';
  createdAt: string;
  createdBy: string;
}

export interface AnalyticsEvent {
  id: string;
  type: 'session_start' | 'content_click' | 'link_click' | 'time_spent';
  userId: string;
  timestamp: string; // ISO string
  contentId?: string;
  contentTitle?: string;
  linkId?: string;
  linkName?: string;
  duration?: number; // for session end
  playerType?: string;
}

export interface Genre {
  id: string;
  name: string;
  order?: number;
}

export interface Language {
  id: string;
  name: string;
  order?: number;
}

export interface Quality {
  id: string;
  name: string;
  order?: number;
}

export interface LinkDef {
  id: string;
  name: string;
  url: string;
  size: string;
  unit: 'MB' | 'GB';
}

export type QualityLinks = LinkDef[];

export interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  links: QualityLinks;
}

export interface Season {
  id: string;
  seasonNumber: number;
  year?: number;
  zipLinks: QualityLinks;
  mkvLinks?: QualityLinks;
  episodes: Episode[];
}

export interface Income {
  id: string;
  userId?: string;
  userName?: string;
  amount: number;
  description: string;
  date: string; // ISO string
}

export interface Content {
  id: string;
  type: 'movie' | 'series';
  title: string;
  description: string;
  posterUrl: string;
  trailerUrl: string;
  genreIds: string[];
  languageIds: string[];
  qualityId?: string; // Added qualityId
  sampleUrl?: string; // Added sampleUrl
  imdbLink?: string; // Added imdbLink
  cast: string[];
  year: number;
  createdAt: string;
  updatedAt: string;
  status?: 'draft' | 'published';
  movieLinks?: string; // JSON stringified QualityLinks
  seasons?: string; // JSON stringified Season[]
}
