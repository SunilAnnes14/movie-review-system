export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  token?: string;
  reviewCount?: number;
  watchlistCount?: number;
}

export interface AuthResponse {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
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
