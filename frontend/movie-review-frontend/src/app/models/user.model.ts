export interface PrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  libraryVisibility: 'public' | 'friends' | 'private';
  allowHistoryForAI: boolean;
  allowReviewsForAI: boolean;
  spoilerShield: boolean;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  token?: string;
  reviewCount?: number;
  watchlistCount?: number;
  bio?: string;
  avatar?: string;
  onboarded?: boolean;
  favoriteGenres?: string[];
  favoriteDirectors?: string[];
  favoriteActors?: string[];
  favoriteMovies?: string[];
  privacy?: PrivacySettings;
}

export interface AuthResponse extends User {
  token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface UserCard {
  _id: string;
  name: string;
  avatar?: string;
  bio?: string;
  online?: boolean;
  lastSeen?: string;
}
