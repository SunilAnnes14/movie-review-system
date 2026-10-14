import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MovieService } from '../../services/movie.service';
import { ReviewService } from '../../services/review.service';
import { WatchlistService } from '../../services/watchlist.service';
import { AuthService } from '../../services/auth.service';
import { Movie } from '../../models/movie.model';
import { Review } from '../../models/review.model';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-movie-details',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './movie-details.component.html',
  styleUrl: './movie-details.component.css'
})
export class MovieDetailsComponent implements OnInit {
  movie: Movie | null = null;
  reviews: Review[] = [];
  loading = true;
  inWatchlist = false;
  message = '';
  messageType = '';

  // Trailer modal
  showTrailerModal = false;
  safeTrailerUrl: SafeResourceUrl | null = null;

  // Review form
  reviewRating = 0;
  reviewComment = '';
  hoverRating = 0;
  submitting = false;
  hasReviewed = false;

  // Edit review
  editingReviewId: string | null = null;
  editRating = 0;
  editComment = '';
  editHoverRating = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private movieService: MovieService,
    private reviewService: ReviewService,
    private watchlistService: WatchlistService,
    public authService: AuthService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      this.loadMovie(id);
      this.loadReviews(id);
      if (this.authService.isLoggedIn) {
        this.checkWatchlist(id);
      }
    });
  }

  loadMovie(id: string): void {
    this.loading = true;
    this.movieService.getMovie(id).subscribe({
      next: (movie) => {
        this.movie = movie;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.router.navigate(['/404']);
      }
    });
  }

  loadReviews(id: string): void {
    this.reviewService.getMovieReviews(id).subscribe({
      next: (reviews) => {
        this.reviews = reviews;
        if (this.authService.currentUser) {
          this.hasReviewed = reviews.some(r => r.userId?._id === this.authService.currentUser?._id);
        }
      }
    });
  }

  checkWatchlist(movieId: string): void {
    this.watchlistService.checkWatchlist(movieId).subscribe({
      next: (res) => this.inWatchlist = res.inWatchlist
    });
  }

  toggleWatchlist(): void {
    if (!this.authService.isLoggedIn || !this.movie) return;

    if (this.inWatchlist) {
      this.watchlistService.removeFromWatchlist(this.movie._id).subscribe({
        next: () => {
          this.inWatchlist = false;
          this.showMessage('Removed from watchlist', 'success');
        },
        error: (err) => this.showMessage(err.error?.message || 'Error', 'error')
      });
    } else {
      this.watchlistService.addToWatchlist(this.movie._id).subscribe({
        next: () => {
          this.inWatchlist = true;
          this.showMessage('Added to watchlist!', 'success');
        },
        error: (err) => this.showMessage(err.error?.message || 'Error', 'error')
      });
    }
  }

  openTrailer(): void {
    if (!this.movie?.trailer) return;
    let embedUrl = this.movie.trailer;

    if (embedUrl.includes('youtube.com/watch?v=')) {
      const videoId = embedUrl.split('v=')[1]?.split('&')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    } else if (embedUrl.includes('youtu.be/')) {
      const videoId = embedUrl.split('youtu.be/')[1]?.split('?')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }

    this.safeTrailerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.showTrailerModal = true;
  }

  closeTrailer(): void {
    this.showTrailerModal = false;
    this.safeTrailerUrl = null;
  }

  setRating(rating: number): void {
    this.reviewRating = rating;
  }

  submitReview(): void {
    if (!this.movie || this.reviewRating === 0 || !this.reviewComment.trim()) return;
    this.submitting = true;

    this.reviewService.createReview(this.movie._id, {
      rating: this.reviewRating,
      comment: this.reviewComment
    }).subscribe({
      next: () => {
        this.showMessage('Review submitted successfully!', 'success');
        this.reviewRating = 0;
        this.reviewComment = '';
        this.hasReviewed = true;
        this.submitting = false;
        this.loadReviews(this.movie!._id);
        this.loadMovie(this.movie!._id);
      },
      error: (err) => {
        this.showMessage(err.error?.message || 'Failed to submit review', 'error');
        this.submitting = false;
      }
    });
  }

  startEdit(review: Review): void {
    this.editingReviewId = review._id;
    this.editRating = review.rating;
    this.editComment = review.comment;
  }

  cancelEdit(): void {
    this.editingReviewId = null;
  }

  saveEdit(reviewId: string): void {
    this.reviewService.updateReview(reviewId, {
      rating: this.editRating,
      comment: this.editComment
    }).subscribe({
      next: () => {
        this.showMessage('Review updated!', 'success');
        this.editingReviewId = null;
        this.loadReviews(this.movie!._id);
        this.loadMovie(this.movie!._id);
      },
      error: (err) => this.showMessage(err.error?.message || 'Failed to update', 'error')
    });
  }

  deleteReview(reviewId: string): void {
    if (!confirm('Are you sure you want to delete this review?')) return;
    this.reviewService.deleteReview(reviewId).subscribe({
      next: () => {
        this.showMessage('Review deleted', 'success');
        this.hasReviewed = false;
        this.loadReviews(this.movie!._id);
        this.loadMovie(this.movie!._id);
      },
      error: (err) => this.showMessage(err.error?.message || 'Failed to delete', 'error')
    });
  }

  isReviewOwner(review: Review): boolean {
    return this.authService.currentUser?._id === review.userId?._id;
  }

  canDeleteReview(review: Review): boolean {
    return this.isReviewOwner(review) || this.authService.isAdmin;
  }

  getStars(rating: number): string[] {
    const stars: string[] = [];
    const full = Math.floor(rating);
    const hasHalf = rating - full >= 0.5;
    for (let i = 0; i < full; i++) stars.push('full');
    if (hasHalf) stars.push('half');
    while (stars.length < 5) stars.push('empty');
    return stars;
  }

  getPosterUrl(): string {
    if (!this.movie) return '';
    return this.movie.poster || 'assets/default-poster.jpg';
  }

  getBackdropUrl(): string {
    if (!this.movie) return '';
    return this.movie.backdrop || this.movie.poster || '';
  }

  formatDuration(duration: number | undefined): string {
    if (!duration) return '120m';
    const hrs = Math.floor(duration / 60);
    const mins = duration % 60;
    if (hrs === 0) return `${mins}m`;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  private showMessage(msg: string, type: string): void {
    this.message = msg;
    this.messageType = type;
    setTimeout(() => this.message = '', 4000);
  }
}
