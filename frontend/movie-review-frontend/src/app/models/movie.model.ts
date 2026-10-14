export interface Movie {
  _id: string;
  title: string;
  description: string;
  genre: string[];
  releaseYear: number;
  director: string;
  cast: string[];
  poster: string;
  backdrop?: string;
  trailer?: string;
  duration?: number;
  averageRating: number;
  reviewCount: number;
  totalReviews?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MovieResponse {
  movies: Movie[];
  total: number;
  page: number;
  pages: number;
}

export interface MovieFormData {
  title: string;
  description: string;
  genre: string[];
  releaseYear: number;
  director: string;
  cast: string[];
  poster: string;
  backdrop?: string;
  trailer?: string;
  duration?: number;
}
