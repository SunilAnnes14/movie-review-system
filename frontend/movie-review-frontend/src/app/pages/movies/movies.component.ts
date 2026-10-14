import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MovieService } from '../../services/movie.service';
import { WatchlistService } from '../../services/watchlist.service';
import { AuthService } from '../../services/auth.service';
import { Movie } from '../../models/movie.model';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-movies',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './movies.component.html',
  styleUrl: './movies.component.css'
})
export class MoviesComponent implements OnInit {
  movies: Movie[] = [];
  loading = true;
  totalPages = 1;
  currentPage = 1;

  searchQuery = '';
  selectedGenre = '';
  selectedYear = '';
  selectedSort = '';
  selectedRating = '';

  genres: string[] = [];
  years: number[] = [];
  message = '';

  constructor(
    private movieService: MovieService,
    private watchlistService: WatchlistService,
    public authService: AuthService,
    private route: ActivatedRoute
  ) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1970; y--) {
      this.years.push(y);
    }
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['genre']) this.selectedGenre = params['genre'];
      if (params['sort']) this.selectedSort = params['sort'];
      this.loadGenres();
      this.loadMovies();
    });
  }

  loadGenres(): void {
    this.movieService.getGenres().subscribe({
      next: (genres) => this.genres = genres
    });
  }

  loadMovies(): void {
    this.loading = true;
    const params: any = {
      page: this.currentPage,
      limit: 12
    };
    if (this.searchQuery) params.search = this.searchQuery;
    if (this.selectedGenre) params.genre = this.selectedGenre;
    if (this.selectedYear) params.year = parseInt(this.selectedYear);
    if (this.selectedSort) params.sort = this.selectedSort;
    if (this.selectedRating) params.minRating = parseFloat(this.selectedRating);

    this.movieService.getMovies(params).subscribe({
      next: (res) => {
        this.movies = res.movies;
        this.totalPages = res.pages;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadMovies();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadMovies();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedGenre = '';
    this.selectedYear = '';
    this.selectedSort = '';
    this.selectedRating = '';
    this.currentPage = 1;
    this.loadMovies();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadMovies();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  addToWatchlist(movieId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.authService.isLoggedIn) {
      this.message = 'Please login to add movies to your watchlist';
      setTimeout(() => this.message = '', 3000);
      return;
    }
    this.watchlistService.addToWatchlist(movieId).subscribe({
      next: () => {
        this.message = 'Added to watchlist!';
        setTimeout(() => this.message = '', 3000);
      },
      error: (err) => {
        this.message = err.error?.message || 'Failed to add to watchlist';
        setTimeout(() => this.message = '', 3000);
      }
    });
  }

  getStarDisplay(rating: number): string {
    return rating > 0 ? rating.toFixed(1) : 'N/A';
  }

  getPosterUrl(movie: Movie): string {
    return movie.poster || 'https://via.placeholder.com/300x450/1a1a1a/333?text=' + encodeURIComponent(movie.title);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedGenre || this.selectedYear || this.selectedSort || this.selectedRating);
  }
}
