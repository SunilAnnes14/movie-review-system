import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_URL } from '../config';

export type VaultStatus = 'want_to_watch' | 'watching' | 'watched';

@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  private apiUrl = `${API_URL}/watchlist`;

  /** movieId -> status for movies in the signed-in user's vault (used by spoiler protection) */
  readonly statusByMovie = new Map<string, VaultStatus>();

  constructor(private http: HttpClient) {}

  getWatchlist(status?: VaultStatus): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl, { params: status ? { status } : {} }).pipe(
      tap(list => { if (!status) { this.statusByMovie.clear(); for (const e of list) if (e.movieId) this.statusByMovie.set(e.movieId._id, e.status); } })
    );
  }

  addToWatchlist(movieId: string, status: VaultStatus = 'want_to_watch'): Observable<any> {
    return this.http.post(`${this.apiUrl}/${movieId}`, { status }).pipe(tap(() => this.statusByMovie.set(movieId, status)));
  }

  setStatus(movieId: string, status: VaultStatus, favorite?: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${movieId}`, { status, favorite }).pipe(tap(() => this.statusByMovie.set(movieId, status)));
  }

  setFavorite(movieId: string, favorite: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/${movieId}`, { favorite });
  }

  removeFromWatchlist(movieId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${movieId}`).pipe(tap(() => this.statusByMovie.delete(movieId)));
  }

  checkWatchlist(movieId: string): Observable<{ inWatchlist: boolean; status: VaultStatus | null; favorite: boolean }> {
    return this.http.get<{ inWatchlist: boolean; status: VaultStatus | null; favorite: boolean }>(`${this.apiUrl}/check/${movieId}`);
  }

  hasWatched(movieId?: string): boolean {
    return !!movieId && this.statusByMovie.get(movieId) === 'watched';
  }
}
