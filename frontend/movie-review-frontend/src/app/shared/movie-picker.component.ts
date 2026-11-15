import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, catchError, forkJoin } from 'rxjs';
import { MovieService } from '../services/movie.service';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';

/**
 * Search the MoviQ catalog (and TMDB when configured) and pick a movie.
 * TMDB results are imported into the catalog on selection so every pick is a real Movie record.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-movie-picker',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <h2>{{ title }}</h2>
        <input class="form-input" placeholder="Search movies by title, director or cast…" [(ngModel)]="query" (ngModelChange)="search$.next($event)" autofocus />
        @if (loading) { <p class="text-muted text-sm mt-2">Searching…</p> }
        <div class="list mt-2" style="max-height: 50vh; overflow-y: auto">
          @for (m of results; track m._id || m.tmdbId) {
            <div class="list-row" style="cursor:pointer" (click)="choose(m)">
              <div class="mini-poster" [style.background]="m.poster ? 'url(' + m.poster + ') center/cover' : 'var(--bg-tertiary)'" style="width:38px;height:56px;border-radius:4px;flex-shrink:0"></div>
              <div class="grow">
                <div class="title truncate">{{ m.title }}</div>
                <div class="meta">{{ m.releaseYear || (m.releaseDate || '').slice(0,4) }} · {{ (m.genre || []).slice(0,3).join(', ') }}</div>
              </div>
              @if (!m._id) { <span class="pill pill-blue">TMDB</span> }
              @if (selectedIds.includes(m._id)) { <span class="pill pill-gold">Added</span> }
            </div>
          }
          @if (!loading && query.length > 1 && !results.length) { <p class="text-muted text-sm">No movies found.</p> }
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" (click)="close.emit()">Done</button></div>
      </div>
    </div>
  `
})
export class MoviePickerComponent implements OnInit {
  @Input() title = 'Choose a movie';
  @Input() selectedIds: string[] = [];
  @Output() picked = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  query = '';
  results: any[] = [];
  loading = false;
  search$ = new Subject<string>();
  private tmdbEnabled = false;

  constructor(private movies: MovieService, private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.api.tmdbStatus().subscribe({ next: s => (this.tmdbEnabled = s.configured), error: () => {} });
    this.movies.getMovies({ sort: 'rating', limit: 12 }).subscribe(r => (this.results = r.movies));
    this.search$.pipe(
      debounceTime(300), distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) return of(null);
        this.loading = true;
        return forkJoin({
          local: this.movies.getMovies({ search: q, limit: 10 }).pipe(catchError(() => of({ movies: [] } as any))),
          tmdb: this.tmdbEnabled ? this.api.tmdbSearch(q).pipe(catchError(() => of({ results: [] } as any))) : of({ results: [] } as any)
        });
      })
    ).subscribe(r => {
      this.loading = false;
      if (!r) return;
      const localTmdb = new Set(r.local.movies.map((m: any) => m.tmdbId).filter(Boolean));
      this.results = [...r.local.movies, ...r.tmdb.results.filter((t: any) => !t._id && !localTmdb.has(t.tmdbId)).slice(0, 8)];
    });
  }

  choose(m: any): void {
    if (m._id) { this.picked.emit(m); return; }
    this.api.importMovie(m.tmdbId).subscribe({
      next: (movie: any) => { m._id = movie._id; this.picked.emit(movie); },
      error: (e) => this.toast.error(e, 'Could not import from TMDB')
    });
  }
}
