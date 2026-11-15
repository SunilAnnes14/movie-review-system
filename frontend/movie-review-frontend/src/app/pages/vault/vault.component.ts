import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WatchlistService, VaultStatus } from '../../services/watchlist.service';
import { ApiService } from '../../services/api.service';
import { ReviewService } from '../../services/review.service';
import { ToastService } from '../../services/toast.service';
import { PosterTileComponent } from '../../shared/poster-tile.component';
import { MoviePickerComponent } from '../../shared/movie-picker.component';
import { VAULT_STATUSES } from '../../config';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-vault',
  standalone: true,
  imports: [RouterLink, FormsModule, PosterTileComponent, MoviePickerComponent],
  template: `
  <div class="v2-page">
    <div class="v2-header">
      <div>
        <p class="v2-eyebrow">My Vault</p>
        <h1 class="v2-title">Your personal film library</h1>
        <p class="v2-subtitle">Track what you want to watch, what you're watching and everything you've seen.</p>
      </div>
      <div class="stat-grid" style="min-width: 320px">
        <div class="stat"><div class="value">{{ count('watched') }}</div><div class="label">Watched</div></div>
        <div class="stat"><div class="value">{{ count('watching') }}</div><div class="label">Watching</div></div>
        <div class="stat"><div class="value">{{ count('want_to_watch') }}</div><div class="label">Want to watch</div></div>
      </div>
    </div>

    <div class="tabs">
      @for (s of statuses; track s.value) {
        <button class="tab" [class.active]="tab === s.value" (click)="tab = s.value">{{ s.icon }} {{ s.label }}<span class="count">{{ count(s.value) }}</span></button>
      }
      <button class="tab" [class.active]="tab === 'favorites'" (click)="tab = 'favorites'">♥ Favourites<span class="count">{{ favorites.length }}</span></button>
      <button class="tab" [class.active]="tab === 'collections'" (click)="tab = 'collections'">📚 Collections<span class="count">{{ collections.length }}</span></button>
      <button class="tab" [class.active]="tab === 'reviews'" (click)="tab = 'reviews'">⭐ Reviews<span class="count">{{ reviews.length }}</span></button>
    </div>

    @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }

    @if (!loading && isStatusTab) {
      @if (!filtered.length) {
        <div class="state">
          <div class="icon">🎬</div>
          <h3>Nothing here yet</h3>
          <p>Discover movies and add them to your vault. Marking movies as watched powers your Movie DNA and recommendations.</p>
          <a routerLink="/discover" class="btn btn-primary">Discover movies</a>
        </div>
      }
      <div class="poster-grid">
        @for (e of filtered; track e._id) {
          <cv-poster [movie]="e.movieId" [badge]="e.favorite ? '♥' : ''">
            <div class="row mt-1">
              <select class="form-select vault-select" [ngModel]="e.status" (ngModelChange)="setStatus(e, $event)">
                @for (s of statuses; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
              </select>
              <button class="btn btn-secondary btn-sm" [title]="e.favorite ? 'Unfavourite' : 'Favourite'" (click)="toggleFavorite(e)">{{ e.favorite ? '♥' : '♡' }}</button>
              <button class="btn btn-danger btn-sm" title="Remove" (click)="remove(e)">✕</button>
            </div>
          </cv-poster>
        }
      </div>
    }

    @if (!loading && tab === 'favorites') {
      @if (!favorites.length) { <div class="state"><div class="icon">♡</div><h3>No favourites yet</h3><p>Tap the heart on any movie in your vault.</p></div> }
      <div class="poster-grid">
        @for (e of favorites; track e._id) { <cv-poster [movie]="e.movieId" badge="♥" /> }
      </div>
    }

    @if (!loading && tab === 'collections') {
      <div class="panel mb-3">
        <h3>New collection</h3>
        <div class="grid-2">
          <input class="form-input" placeholder="Name, e.g. Mind-bending Sci-Fi" [(ngModel)]="newName" maxlength="100" />
          <input class="form-input" placeholder="Description (optional)" [(ngModel)]="newDescription" maxlength="500" />
        </div>
        <div class="row between mt-2">
          <div class="row">
            <select class="form-select" [(ngModel)]="newVisibility" style="width:auto">
              <option value="public">Public</option><option value="friends">Friends only</option><option value="private">Private</option>
            </select>
            <label class="switch text-sm"><input type="checkbox" [(ngModel)]="shareNew" [disabled]="newVisibility === 'private'" /> Share to CineFeed</label>
          </div>
          <button class="btn btn-primary" [disabled]="!newName.trim()" (click)="createCollection()">Create</button>
        </div>
      </div>

      @for (c of collections; track c._id) {
        <div class="panel mb-2">
          <div class="row between">
            <div>
              <h3 style="margin:0">{{ c.name }} <span class="pill">{{ c.visibility }}</span></h3>
              @if (c.description) { <p class="text-secondary text-sm">{{ c.description }}</p> }
            </div>
            <div class="row">
              <button class="btn btn-secondary btn-sm" (click)="pickerFor = c">+ Add movie</button>
              <button class="btn btn-danger btn-sm" (click)="deleteCollection(c)">Delete</button>
            </div>
          </div>
          <div class="poster-row mt-2">
            @for (m of c.movies; track m._id) {
              <cv-poster [movie]="m"><button class="btn btn-outline btn-sm mt-1" (click)="removeFromCollection(c, m)">Remove</button></cv-poster>
            } @empty { <p class="text-muted text-sm">Empty collection — add some movies.</p> }
          </div>
        </div>
      } @empty {
        <div class="state"><div class="icon">📚</div><p>Curate themed lists and share them with friends.</p></div>
      }
    }

    @if (!loading && tab === 'reviews') {
      <div class="row between mb-2"><p class="text-secondary text-sm">Your ratings and reviews.</p><a routerLink="/my-reviews" class="link">Manage reviews →</a></div>
      <div class="poster-grid">
        @for (r of reviews; track r._id) { @if (r.movieId) { <cv-poster [movie]="r.movieId" [badge]="'★ ' + r.rating" /> } }
      </div>
      @if (!reviews.length) { <div class="state"><div class="icon">⭐</div><p>Rate a movie you've seen to start your review diary.</p></div> }
    }

    @if (pickerFor) {
      <cv-movie-picker [title]="'Add to ' + pickerFor.name" [selectedIds]="collectionMovieIds(pickerFor)" (picked)="addToCollection(pickerFor, $event)" (close)="pickerFor = null" />
    }
  </div>
  `,
  styles: [`.vault-select { padding: 5px 8px; font-size: 0.75rem; flex: 1; min-width: 0; }`]
})
export class VaultComponent implements OnInit {
  statuses = VAULT_STATUSES;
  tab: string = 'want_to_watch';
  entries: any[] = [];
  collections: any[] = [];
  reviews: any[] = [];
  loading = true;
  newName = ''; newDescription = ''; newVisibility = 'public'; shareNew = true;
  pickerFor: any = null;

  constructor(private vault: WatchlistService, private api: ApiService, private reviewService: ReviewService, private toast: ToastService) {}

  ngOnInit(): void {
    this.vault.getWatchlist().subscribe({
      next: list => {
        this.entries = list.filter(e => e.movieId);
        this.loading = false;
        if (!this.count('want_to_watch') && this.count('watched')) this.tab = 'watched';
      },
      error: e => { this.loading = false; this.toast.error(e); }
    });
    this.api.myCollections().subscribe({ next: c => (this.collections = c), error: () => {} });
    this.reviewService.getMyReviews().subscribe({ next: r => (this.reviews = r), error: () => {} });
  }

  get isStatusTab(): boolean { return ['want_to_watch', 'watching', 'watched'].includes(this.tab); }
  get filtered(): any[] { return this.entries.filter(e => e.status === this.tab); }
  get favorites(): any[] { return this.entries.filter(e => e.favorite); }
  count(s: string): number { return this.entries.filter(e => e.status === s).length; }

  setStatus(e: any, status: VaultStatus): void {
    const prev = e.status;
    e.status = status;
    this.vault.setStatus(e.movieId._id, status).subscribe({
      next: () => this.toast.success(`${e.movieId.title}: ${this.statuses.find(s => s.value === status)?.label}`, status === 'watched' ? 'Rate it to improve your recommendations.' : undefined),
      error: err => { e.status = prev; this.toast.error(err); }
    });
  }

  toggleFavorite(e: any): void {
    e.favorite = !e.favorite;
    this.vault.setFavorite(e.movieId._id, e.favorite).subscribe({ error: err => { e.favorite = !e.favorite; this.toast.error(err); } });
  }

  remove(e: any): void {
    if (!confirm(`Remove ${e.movieId.title} from your vault?`)) return;
    this.vault.removeFromWatchlist(e.movieId._id).subscribe({ next: () => (this.entries = this.entries.filter(x => x !== e)), error: err => this.toast.error(err) });
  }

  createCollection(): void {
    this.api.createCollection({ name: this.newName, description: this.newDescription, visibility: this.newVisibility, share: this.shareNew && this.newVisibility !== 'private' }).subscribe({
      next: (c: any) => { this.collections = [{ ...c, movies: [] }, ...this.collections]; this.newName = ''; this.newDescription = ''; this.pickerFor = this.collections[0]; },
      error: e => this.toast.error(e)
    });
  }

  collectionMovieIds(c: any): string[] { return (c.movies || []).map((m: any) => m._id); }

  addToCollection(c: any, movie: any): void {
    this.api.addToCollection(c._id, movie._id).subscribe({ next: (u: any) => (c.movies = u.movies), error: e => this.toast.error(e) });
  }

  removeFromCollection(c: any, m: any): void {
    this.api.removeFromCollection(c._id, m._id).subscribe({ next: (u: any) => (c.movies = u.movies), error: e => this.toast.error(e) });
  }

  deleteCollection(c: any): void {
    if (!confirm(`Delete collection “${c.name}”?`)) return;
    this.api.deleteCollection(c._id).subscribe({ next: () => (this.collections = this.collections.filter(x => x !== c)), error: e => this.toast.error(e) });
  }
}
