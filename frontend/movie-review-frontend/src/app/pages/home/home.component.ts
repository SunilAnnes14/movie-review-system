import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MovieService } from '../../services/movie.service';
import { Movie } from '../../models/movie.model';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.Default,
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  featuredMovie: Movie | null = null;
  trendingMovies: Movie[] = [];
  topRatedMovies: Movie[] = [];
  recentMovies: Movie[] = [];
  loading = true;

  genres = [
    { name: 'Action', icon: '💥', color: '#ef4444' },
    { name: 'Drama', icon: '🎭', color: '#8b5cf6' },
    { name: 'Comedy', icon: '😂', color: '#f59e0b' },
    { name: 'Sci-Fi', icon: '🚀', color: '#3b82f6' },
    { name: 'Horror', icon: '👻', color: '#10b981' },
    { name: 'Romance', icon: '💕', color: '#ec4899' },
    { name: 'Thriller', icon: '🔪', color: '#f97316' },
    { name: 'Animation', icon: '✨', color: '#06b6d4' }
  ];

  constructor(private movieService: MovieService) {}

  ngOnInit(): void {
    this.loadMovies();
  }

  loadMovies(): void {
    this.loading = true;

    // Load trending (most reviewed)
    this.movieService.getMovies({ sort: 'reviews', limit: 8 }).subscribe({
      next: (res) => {
        this.trendingMovies = res.movies;
        if (res.movies.length > 0) {
          this.featuredMovie = res.movies[0];
        }
      }
    });

    // Load top rated
    this.movieService.getMovies({ sort: 'rating', limit: 8 }).subscribe({
      next: (res) => {
        this.topRatedMovies = res.movies;
      }
    });

    // Load recent
    this.movieService.getMovies({ limit: 8 }).subscribe({
      next: (res) => {
        this.recentMovies = res.movies;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  getStars(rating: number): string[] {
    const stars: string[] = [];
    const fullStars = Math.floor(rating);
    const hasHalf = rating - fullStars >= 0.5;
    for (let i = 0; i < fullStars; i++) stars.push('full');
    if (hasHalf) stars.push('half');
    while (stars.length < 5) stars.push('empty');
    return stars;
  }

  getPosterUrl(movie: Movie): string {
    return movie.poster || 'https://via.placeholder.com/300x450/1a1a1a/333?text=' + encodeURIComponent(movie.title);
  }
}
