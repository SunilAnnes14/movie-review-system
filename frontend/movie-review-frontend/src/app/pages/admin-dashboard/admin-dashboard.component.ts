import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MovieService } from '../../services/movie.service';
import { ReviewService } from '../../services/review.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { Movie } from '../../models/movie.model';
import { Review } from '../../models/review.model';
import { User } from '../../models/user.model';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit {
  activeTab: 'movies' | 'reviews' | 'users' = 'movies';

  // Stats
  stats = {
    totalMovies: 0,
    totalUsers: 0,
    totalReviews: 0,
    averageRating: 0
  };

  // Movies
  movies: Movie[] = [];
  loadingMovies = true;
  movieSearch = '';
  filteredMovies: Movie[] = [];

  // Reviews
  reviews: Review[] = [];
  loadingReviews = false;
  reviewSearch = '';
  filteredReviews: Review[] = [];

  // Users
  users: User[] = [];
  loadingUsers = false;
  userSearch = '';
  filteredUsers: User[] = [];

  message = '';
  messageType: 'success' | 'error' | 'info' = 'info';

  constructor(
    private movieService: MovieService,
    private reviewService: ReviewService,
    private userService: UserService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadMovies();
  }

  loadStats(): void {
    this.userService.getDashboardStats().subscribe({
      next: (data) => {
        this.stats = data;
      },
      error: () => {}
    });
  }

  loadMovies(): void {
    this.loadingMovies = true;
    this.movieService.getMovies({ limit: 100 }).subscribe({
      next: (res) => {
        this.movies = res.movies;
        this.filterMovies();
        this.loadingMovies = false;
      },
      error: () => {
        this.showMessage('Failed to load movies', 'error');
        this.loadingMovies = false;
      }
    });
  }

  loadReviews(): void {
    this.loadingReviews = true;
    this.reviewService.getAllReviews().subscribe({
      next: (data) => {
        this.reviews = data;
        this.filterReviews();
        this.loadingReviews = false;
      },
      error: () => {
        this.showMessage('Failed to load reviews', 'error');
        this.loadingReviews = false;
      }
    });
  }

  loadUsers(): void {
    this.loadingUsers = true;
    this.userService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.filterUsers();
        this.loadingUsers = false;
      },
      error: () => {
        this.showMessage('Failed to load users', 'error');
        this.loadingUsers = false;
      }
    });
  }

  switchTab(tab: 'movies' | 'reviews' | 'users'): void {
    this.activeTab = tab;
    if (tab === 'reviews' && this.reviews.length === 0) {
      this.loadReviews();
    } else if (tab === 'users' && this.users.length === 0) {
      this.loadUsers();
    }
  }

  filterMovies(): void {
    const q = this.movieSearch.toLowerCase().trim();
    if (!q) {
      this.filteredMovies = [...this.movies];
    } else {
      this.filteredMovies = this.movies.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.director.toLowerCase().includes(q) ||
        m.genre.some(g => g.toLowerCase().includes(q))
      );
    }
  }

  filterReviews(): void {
    const q = this.reviewSearch.toLowerCase().trim();
    if (!q) {
      this.filteredReviews = [...this.reviews];
    } else {
      this.filteredReviews = this.reviews.filter(r =>
        (r.comment && r.comment.toLowerCase().includes(q)) ||
        (r.userId?.name && r.userId.name.toLowerCase().includes(q)) ||
        (r.movieId?.title && r.movieId.title.toLowerCase().includes(q))
      );
    }
  }

  filterUsers(): void {
    const q = this.userSearch.toLowerCase().trim();
    if (!q) {
      this.filteredUsers = [...this.users];
    } else {
      this.filteredUsers = this.users.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    }
  }

  deleteMovie(id: string, title: string): void {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      return;
    }

    this.movieService.deleteMovie(id).subscribe({
      next: () => {
        this.movies = this.movies.filter(m => m._id !== id);
        this.filterMovies();
        this.loadStats();
        this.showMessage(`"${title}" deleted successfully`, 'success');
      },
      error: () => {
        this.showMessage('Failed to delete movie', 'error');
      }
    });
  }

  deleteReview(id: string): void {
    if (!confirm('Are you sure you want to delete this review?')) {
      return;
    }

    this.reviewService.deleteReview(id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter(r => r._id !== id);
        this.filterReviews();
        this.loadStats();
        this.showMessage('Review deleted successfully', 'success');
      },
      error: () => {
        this.showMessage('Failed to delete review', 'error');
      }
    });
  }

  toggleUserRole(user: User): void {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const actionText = newRole === 'admin' ? 'promote this user to Admin' : 'demote this Admin to regular User';
    if (!confirm(`Are you sure you want to ${actionText}?`)) {
      return;
    }

    this.userService.updateUser(user._id, { role: newRole }).subscribe({
      next: (updated) => {
        user.role = updated.role;
        this.showMessage(`User role updated to ${updated.role}`, 'success');
      },
      error: (err) => {
        this.showMessage(err.error?.message || 'Failed to update user role', 'error');
      }
    });
  }

  deleteUser(user: User): void {
    if (!confirm(`Are you sure you want to delete account for "${user.name}" (${user.email})?`)) {
      return;
    }

    this.userService.deleteUser(user._id).subscribe({
      next: () => {
        this.users = this.users.filter(u => u._id !== user._id);
        this.filterUsers();
        this.loadStats();
        this.showMessage(`User "${user.name}" deleted successfully`, 'success');
      },
      error: (err) => {
        this.showMessage(err.error?.message || 'Failed to delete user', 'error');
      }
    });
  }

  showMessage(msg: string, type: 'success' | 'error' | 'info'): void {
    this.message = msg;
    this.messageType = type;
    setTimeout(() => {
      this.message = '';
    }, 4000);
  }
}
