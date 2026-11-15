import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Poster card used across Discover, Vault, CineMatch, polls and chat. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-poster',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="poster-tile" (click)="pick.emit(movie)">
      @if (linkable && movie?._id) {
        <a [routerLink]="['/movies', movie._id]">
          <div class="poster" [class.ph]="!poster" [style.background-image]="bg">@if (!poster) { <span class="ph-title">{{ movie?.title }}</span> }</div>
        </a>
      } @else {
        <div class="poster" [class.ph]="!poster" [style.background-image]="bg">@if (!poster) { <span class="ph-title">{{ movie?.title }}</span> }</div>
      }
      @if (poster) { <img class="probe" [src]="poster" alt="" (error)="failed = poster" /> }
      @if (badge) { <span class="badge-corner match-badge">{{ badge }}</span> }
      <div class="name clamp-2">{{ movie?.title }}</div>
      <div class="sub">
        {{ movie?.releaseYear || (movie?.releaseDate || '').slice(0, 4) }}
        @if (rating) { · ★ {{ rating }} }
        @if (sub) { · {{ sub }} }
      </div>
      <ng-content />
    </div>
  `,
  styles: ['.probe { display: none; }']
})
export class PosterTileComponent {
  @Input() movie: any;
  @Input() badge = '';
  @Input() sub = '';
  @Input() linkable = true;
  @Output() pick = new EventEmitter<any>();
  failed = ''; // poster URL that failed to load -> fall back to the typographic poster

  get poster(): string { const p = this.movie?.poster || ''; return p && p !== this.failed ? p : ''; }
  get bg(): string { return this.poster ? `url("${this.poster}")` : 'none'; }
  get rating(): string {
    const m = this.movie;
    if (m?.averageRating) return m.averageRating.toFixed(1);
    if (m?.tmdbRating) return (m.tmdbRating / 2).toFixed(1);
    return '';
  }
}
