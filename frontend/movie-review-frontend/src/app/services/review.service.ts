import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Review, ReviewFormData } from '../models/review.model';

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private apiUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

  getMovieReviews(movieId: string): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiUrl}/movies/${movieId}/reviews`);
  }

  createReview(movieId: string, data: ReviewFormData): Observable<Review> {
    return this.http.post<Review>(`${this.apiUrl}/movies/${movieId}/reviews`, data);
  }

  updateReview(reviewId: string, data: ReviewFormData): Observable<Review> {
    return this.http.put<Review>(`${this.apiUrl}/reviews/${reviewId}`, data);
  }

  deleteReview(reviewId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/reviews/${reviewId}`);
  }

  getMyReviews(): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiUrl}/reviews/my`);
  }

  getAllReviews(): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiUrl}/reviews`);
  }
}
