import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { User, AuthResponse, LoginCredentials, RegisterData } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:5000/api/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUser();
  }

  private loadUser(): void {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        this.currentUserSubject.next(user);
      } catch {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
  }

  register(data: RegisterData): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap(response => this.handleAuth(response))
    );
  }

  login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => this.handleAuth(response))
    );
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/profile`);
  }

  updateProfile(data: Partial<User>): Observable<AuthResponse> {
    return this.http.put<AuthResponse>(`${this.apiUrl}/profile`, data).pipe(
      tap(response => this.handleAuth(response))
    );
  }

  logout(): void {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    this.currentUserSubject.next(null);
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  get isAdmin(): boolean {
    return this.currentUserSubject.value?.role === 'admin';
  }

  get token(): string | null {
    return localStorage.getItem('token');
  }

  private handleAuth(response: AuthResponse): void {
    const user: User = {
      _id: response._id,
      name: response.name,
      email: response.email,
      role: response.role,
      createdAt: response.createdAt
    };
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', response.token);
    this.currentUserSubject.next(user);
  }
}
