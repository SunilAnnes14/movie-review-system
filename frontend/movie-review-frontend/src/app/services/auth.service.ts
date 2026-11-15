import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { User, AuthResponse, LoginCredentials, RegisterData } from '../models/user.model';
import { API_URL } from '../config';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${API_URL}/auth`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadUser();
    if (this.isLoggedIn) this.refresh();
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

  /** Re-sync the cached user (preferences, privacy) with the server. */
  refresh(): void {
    this.getProfile().subscribe({
      next: (u) => this.storeUser(u),
      error: (err) => { if (err.status === 401) this.logout(); }
    });
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

  updateProfile(data: Partial<User> & { password?: string }): Observable<AuthResponse> {
    return this.http.put<AuthResponse>(`${this.apiUrl}/profile`, data).pipe(
      tap(response => this.handleAuth(response))
    );
  }

  updatePreferences(data: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/preferences`, data).pipe(
      tap(user => this.storeUser(user))
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

  private storeUser(u: User): void {
    const { token, reviewCount, watchlistCount, ...user } = u as any;
    const merged = { ...(this.currentUser || {}), ...user } as User;
    localStorage.setItem('user', JSON.stringify(merged));
    this.currentUserSubject.next(merged);
  }

  private handleAuth(response: AuthResponse): void {
    localStorage.setItem('token', response.token);
    this.storeUser(response);
  }
}
