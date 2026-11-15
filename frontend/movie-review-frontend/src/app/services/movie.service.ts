import { API_URL } from '../config';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Movie, MovieResponse, MovieFormData } from '../models/movie.model';

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  private apiUrl = `${API_URL}/movies`;

  constructor(private http: HttpClient) {}

  getMovies(params?: {
    search?: string;
    genre?: string;
    language?: string;
    keyword?: string;
    year?: number;
    minRating?: number;
    sort?: string;
    page?: number;
    limit?: number;
  }): Observable<MovieResponse> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.genre) httpParams = httpParams.set('genre', params.genre);
      if (params.language) httpParams = httpParams.set('language', params.language);
      if (params.keyword) httpParams = httpParams.set('keyword', params.keyword);
      if (params.year) httpParams = httpParams.set('year', params.year.toString());
      if (params.minRating) httpParams = httpParams.set('minRating', params.minRating.toString());
      if (params.sort) httpParams = httpParams.set('sort', params.sort);
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
    }
    return this.http.get<MovieResponse>(this.apiUrl, { params: httpParams });
  }

  getMovie(id: string): Observable<Movie> {
    return this.http.get<Movie>(`${this.apiUrl}/${id}`);
  }

  createMovie(movie: MovieFormData): Observable<Movie> {
    return this.http.post<Movie>(this.apiUrl, movie);
  }

  updateMovie(id: string, movie: Partial<MovieFormData>): Observable<Movie> {
    return this.http.put<Movie>(`${this.apiUrl}/${id}`, movie);
  }

  deleteMovie(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getGenres(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/genres/list`);
  }
}
