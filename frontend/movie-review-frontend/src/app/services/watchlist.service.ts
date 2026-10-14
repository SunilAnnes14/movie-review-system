import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  private apiUrl = 'http://localhost:5000/api/watchlist';

  constructor(private http: HttpClient) {}

  getWatchlist(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  addToWatchlist(movieId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${movieId}`, {});
  }

  removeFromWatchlist(movieId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${movieId}`);
  }

  checkWatchlist(movieId: string): Observable<{ inWatchlist: boolean }> {
    return this.http.get<{ inWatchlist: boolean }>(`${this.apiUrl}/check/${movieId}`);
  }
}
