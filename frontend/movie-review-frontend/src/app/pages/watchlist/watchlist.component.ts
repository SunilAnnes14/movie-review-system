import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WatchlistService } from '../../services/watchlist.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-watchlist',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './watchlist.component.html',
  styleUrl: './watchlist.component.css'
})
export class WatchlistComponent implements OnInit {
  watchlist: any[] = [];
  loading = true;
  message = '';

  constructor(private watchlistService: WatchlistService) {}

  ngOnInit(): void {
    this.loadWatchlist();
  }

  loadWatchlist(): void {
    this.loading = true;
    this.watchlistService.getWatchlist().subscribe({
      next: (items) => {
        this.watchlist = items;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  removeFromWatchlist(movieId: string): void {
    this.watchlistService.removeFromWatchlist(movieId).subscribe({
      next: () => {
        this.watchlist = this.watchlist.filter(w => w.movieId?._id !== movieId);
        this.message = 'Removed from watchlist';
        setTimeout(() => this.message = '', 3000);
      },
      error: (err) => {
        this.message = err.error?.message || 'Failed to remove';
        setTimeout(() => this.message = '', 3000);
      }
    });
  }

  getPosterUrl(movie: any): string {
    return movie?.poster || 'https://via.placeholder.com/300x450/1a1a1a/333?text=Movie';
  }
}
