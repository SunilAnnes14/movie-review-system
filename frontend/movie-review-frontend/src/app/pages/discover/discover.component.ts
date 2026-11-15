import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, catchError } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { MovieService } from '../../services/movie.service';
import { AuthService } from '../../services/auth.service';
import { WatchlistService } from '../../services/watchlist.service';
import { ToastService } from '../../services/toast.service';
import { PosterTileComponent } from '../../shared/poster-tile.component';
import { AvatarComponent } from '../../shared/avatar.component';
import { SpoilerTextComponent } from '../../shared/spoiler-text.component';
import { TimeAgoPipe, LabelPipe } from '../../shared/pipes';
import { GENRES } from '../../config';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-discover',
  standalone: true,
  imports: [RouterLink, FormsModule, PosterTileComponent, AvatarComponent, SpoilerTextComponent, TimeAgoPipe],
  template: `
  <div class="v2-page">
    <div class="v2-header">
      <div>
        <p class="v2-eyebrow">CineDiscover</p>
        <h1 class="v2-title">Find your next favourite film</h1>
        <p class="v2-subtitle">Trending titles, what your friends are watching and the conversations your communities are having.</p>
      </div>
    </div>

    <form class="input-row" (ngSubmit)="runSearch()" style="max-width: 640px">
      <input class="form-input" name="q" [(ngModel)]="query" placeholder="Search the catalog{{ tmdb ? ' and TMDB' : '' }}…" />
      <button class="btn btn-primary">Search</button>
    </form>
    @if (tmdb === false) {
      <p class="text-muted text-xs mt-1">TMDB isn't configured on this server, so search covers the CineVault catalog only.</p>
    }

    @if (searching) { <div class="loading-container"><div class="spinner"></div></div> }
    @if (results) {
      <div class="section-head"><h2>Results for “{{ lastQuery }}”</h2><a class="link" (click)="clearSearch()">Clear</a></div>
      @if (!results.length) { <div class="state"><div class="icon">🔍</div><h3>No movies found</h3><p>Try a different title or a director's name.</p></div> }
      <div class="poster-grid">
        @for (m of results; track m._id || m.tmdbId) {
          <cv-poster [movie]="m" [linkable]="!!m._id" [badge]="m._id ? '' : 'TMDB'">
            @if (auth.isLoggedIn) {
              <div class="row mt-1">
                @if (m._id) {
                  <button class="btn btn-secondary btn-sm grow" (click)="addToVault(m); $event.stopPropagation()">{{ vault.statusByMovie.has(m._id) ? '✓ In vault' : '+ Vault' }}</button>
                } @else {
                  <button class="btn btn-outline btn-sm grow" [disabled]="m.importing" (click)="importMovie(m); $event.stopPropagation()">{{ m.importing ? 'Adding…' : '+ Add to CineVault' }}</button>
                }
              </div>
            }
          </cv-poster>
        }
      </div>
    }

    @if (!results) {
      <div class="section-head"><h2>Trending {{ trendingSource === 'tmdb' ? 'this week' : 'on CineVault' }}</h2></div>
      @if (loadingTrending) { <div class="poster-row">@for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton" style="aspect-ratio:2/3"></div> }</div> }
      <div class="poster-row">
        @for (m of trending; track m._id || m.tmdbId) {
          <cv-poster [movie]="m" [linkable]="!!m._id" (pick)="!m._id && auth.isLoggedIn && importMovie(m, true)" [badge]="m._id ? '' : 'TMDB'" />
        }
      </div>

      @if (tamil.length) {
        <div class="section-head"><h2>🎞️ Tamil cinema</h2><a routerLink="/movies" [queryParams]="{ language: 'ta' }">See all →</a></div>
        <div class="poster-row">
          @for (m of tamil; track m._id) { <cv-poster [movie]="m" [sub]="m.director" /> }
        </div>
      }

      @if (classics.length) {
        <div class="section-head"><h2>🏆 All-time greats</h2><a routerLink="/movies" [queryParams]="{ sort: 'year' }">Browse catalog →</a></div>
        <div class="poster-row">
          @for (m of classics; track m._id) { <cv-poster [movie]="m" [sub]="m.director" /> }
        </div>
      }

      @if (tmdb) {
        <div class="section-head"><h2>Browse by genre</h2></div>
        <div class="row-wrap">
          @for (g of genres; track g) { <span class="chip" [class.active]="genre === g" (click)="browseGenre(g)">{{ g }}</span> }
        </div>
        @if (genreMovies.length) {
          <div class="poster-row mt-2">
            @for (m of genreMovies; track m.tmdbId) { <cv-poster [movie]="m" [linkable]="!!m._id" (pick)="!m._id && importMovie(m, true)" /> }
          </div>
        }
      }

      @if (auth.isLoggedIn) {
        @if (loadingSocial) { <div class="loading-container"><div class="spinner"></div><p class="loading-text">Gathering your community…</p></div> }
        @if (social) {
          @if (social.recommended?.length) {
            <div class="section-head"><h2>✨ Recommended for you</h2><a routerLink="/ai" [queryParams]="{ tool: 'match' }">Why these? →</a></div>
            <div class="poster-row">
              @for (r of social.recommended; track r.movie._id) { <cv-poster [movie]="r.movie" [badge]="r.match + '% match'" [sub]="r.reasons[0]?.type === 'similar' ? 'like ' + r.reasons[0].value : ''" /> }
            </div>
          }

          <div class="grid-2 mt-3">
            <div class="panel">
              <h3>👥 Friends are watching</h3>
              @for (f of social.friendsWatching; track $index) {
                <div class="list-row">
                  <cv-avatar [user]="f.user" size="sm" />
                  <div class="grow">
                    <div class="text-sm"><a [routerLink]="['/u', f.user._id]"><strong>{{ f.user.name }}</strong></a> {{ f.status === 'watched' ? 'watched' : 'is watching' }} <a [routerLink]="['/movies', f.movie._id]" class="text-accent">{{ f.movie.title }}</a></div>
                    <div class="meta">{{ f.at | timeAgo }}</div>
                  </div>
                </div>
              } @empty {
                <div class="state"><p>When friends mark movies as watched, they appear here.</p><a routerLink="/people" class="btn btn-secondary btn-sm">Find friends</a></div>
              }
            </div>
            <div class="panel">
              <h3>🔥 Most discussed</h3>
              @for (d of social.mostDiscussed; track d.movie._id) {
                <div class="list-row">
                  <div class="mini" [style.background-image]="'url(' + d.movie.poster + ')'"></div>
                  <a class="grow title" [routerLink]="['/movies', d.movie._id]">{{ d.movie.title }}</a>
                  <span class="pill">{{ d.mentions }} mentions</span>
                </div>
              } @empty { <div class="state"><p>No discussions yet. Share a movie in CineChat or CineFeed to start one.</p></div> }
            </div>
          </div>

          @if (social.popularReviews?.length) {
            <div class="section-head"><h2>Popular reviews</h2></div>
            <div class="grid-auto">
              @for (r of social.popularReviews; track r._id) {
                <div class="panel panel-tight hover-lift">
                  <div class="row">
                    <cv-avatar [user]="r.user" size="sm" />
                    <div class="grow"><strong class="text-sm">{{ r.user?.name }}</strong> <span class="text-muted text-xs">on</span> <a class="text-sm text-accent" [routerLink]="['/movies', r.movie._id]">{{ r.movie.title }}</a></div>
                    <span class="pill pill-gold">★ {{ r.rating }}</span>
                  </div>
                  <p class="text-sm text-secondary mt-1 clamp-3"><cv-spoiler-text [text]="r.comment" [sentences]="r.spoilerSentences" [spoiler]="r.containsSpoilers" [movieId]="r.movie._id" /></p>
                </div>
              }
            </div>
          }

          <div class="grid-2 mt-3">
            <div class="panel">
              <h3>🗳️ Popular polls</h3>
              @for (p of social.popularPolls; track p._id) {
                <a class="list-row" [routerLink]="['/circles', p.circle._id]" [queryParams]="{ tab: 'polls' }">
                  <div class="grow"><div class="title">{{ p.question }}</div><div class="meta">{{ p.circle.name }} · {{ p.totalVotes }} votes</div></div>
                  <div class="avatar-stack">@for (o of p.options.slice(0,3); track $index) { <span class="mini" [style.background-image]="'url(' + o.poster + ')'"></span> }</div>
                </a>
              } @empty { <p class="text-muted text-sm">No open public polls right now.</p> }
            </div>
            <div class="panel">
              <h3>🎞️ Similar movie enthusiasts</h3>
              @for (s of social.similarUsers; track s.user._id) {
                <a class="list-row" [routerLink]="['/u', s.user._id]">
                  <cv-avatar [user]="s.user" size="sm" />
                  <div class="grow title">{{ s.user.name }}</div>
                  <span class="pill pill-gold">{{ s.tasteMatch }}% taste match</span>
                </a>
              } @empty { <p class="text-muted text-sm">Rate more movies to find people with your taste.</p> }
            </div>
          </div>

          @if (social.popularCircles?.length) {
            <div class="section-head"><h2>Popular CineCircles</h2><a routerLink="/circles">All circles →</a></div>
            <div class="grid-auto">
              @for (c of social.popularCircles; track c._id) {
                <a class="panel panel-tight hover-lift circle-card" [routerLink]="['/circles', c._id]">
                  <div class="cover" [style.background-image]="c.coverImage ? 'url(' + c.coverImage + ')' : ''"></div>
                  <strong>{{ c.name }}</strong>
                  <p class="text-muted text-xs clamp-2">{{ c.description || 'A movie community' }}</p>
                  <span class="pill mt-1">{{ c.memberCount }} members</span>
                </a>
              }
            </div>
          }
        }
      } @else {
        <div class="panel panel-gold mt-3 row between">
          <div><h3>Join the community</h3><p class="text-secondary text-sm">Sign in to see friends' activity, CineCircles and personalised recommendations.</p></div>
          <a routerLink="/register" class="btn btn-primary">Create account</a>
        </div>
      }
    }
  </div>
  `,
  styles: [`
    .mini { width: 32px; height: 46px; border-radius: 4px; background: var(--bg-tertiary) center/cover; flex-shrink: 0; border: 1px solid var(--border-color); }
    .avatar-stack .mini { margin-left: -10px; } .avatar-stack .mini:first-child { margin-left: 0; }
    .circle-card .cover { height: 90px; border-radius: var(--radius-md); background: linear-gradient(135deg, #2a2418, #121215) center/cover; margin-bottom: 10px; }
  `]
})
export class DiscoverComponent implements OnInit {
  query = '';
  lastQuery = '';
  results: any[] | null = null;
  searching = false;
  trending: any[] = [];
  trendingSource = 'local';
  loadingTrending = true;
  social: any = null;
  loadingSocial = false;
  tmdb: boolean | null = null;
  genres = GENRES.filter(g => g !== 'Documentary');
  genre = '';
  genreMovies: any[] = [];
  tamil: any[] = [];
  classics: any[] = [];

  constructor(private api: ApiService, private movies: MovieService, public auth: AuthService, public vault: WatchlistService, private toast: ToastService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    // Know whether TMDB is configured BEFORE running any search from the URL,
    // so an unconfigured server is never asked for TMDB results.
    this.api.tmdbStatus().subscribe({
      next: s => { this.tmdb = s.configured; this.watchQuery(); },
      error: () => { this.tmdb = false; this.watchQuery(); }
    });
    this.movies.getMovies({ language: 'ta', sort: 'year', limit: 20 }).subscribe({ next: r => (this.tamil = r.movies), error: () => {} });
    this.loadClassics();
    this.api.trending().subscribe({ next: r => { this.trending = r.items; this.trendingSource = r.source; this.loadingTrending = false; }, error: () => (this.loadingTrending = false) });
    if (this.auth.isLoggedIn) {
      this.loadingSocial = true;
      this.api.discover().subscribe({ next: s => { this.social = s; this.loadingSocial = false; }, error: e => { this.loadingSocial = false; this.toast.error(e); } });
    }
  }

  private watchQuery(): void {
    this.route.queryParamMap.subscribe(p => {
      const q = p.get('q');
      if (q) { this.query = q; this.search(q); }
    });
  }

  /** Movies tagged as IMDb top-rated classics */
  private loadClassics(): void {
    this.movies.getMovies({ keyword: 'imdb top', sort: 'rating', limit: 20 }).subscribe({ next: r => (this.classics = r.movies), error: () => {} });
  }

  runSearch(): void {
    if (this.query.trim().length < 2) return;
    this.router.navigate([], { queryParams: { q: this.query.trim() } });
  }

  clearSearch(): void { this.results = null; this.query = ''; this.router.navigate([], { queryParams: {} }); }

  search(q: string): void {
    this.searching = true;
    this.lastQuery = q;
    forkJoin({
      local: this.movies.getMovies({ search: q, limit: 24 }).pipe(catchError(() => of({ movies: [] } as any))),
      remote: this.tmdb === true ? this.api.tmdbSearch(q).pipe(catchError(() => of({ results: [] } as any))) : of({ results: [] } as any)
    }).subscribe(({ local, remote }) => {
      const seen = new Set(local.movies.map((m: any) => m.tmdbId).filter(Boolean));
      this.results = [...local.movies, ...remote.results.filter((r: any) => !r._id && !seen.has(r.tmdbId))];
      this.searching = false;
    });
  }

  browseGenre(g: string): void {
    this.genre = g;
    this.api.tmdbGenre(g).subscribe({ next: r => (this.genreMovies = r), error: e => this.toast.error(e) });
  }

  importMovie(m: any, open = false): void {
    m.importing = true;
    this.api.importMovie(m.tmdbId).subscribe({
      next: (movie: any) => {
        m._id = movie._id; m.importing = false;
        this.toast.success(`${movie.title} added to CineVault`);
        if (open) this.router.navigate(['/movies', movie._id]);
      },
      error: e => { m.importing = false; this.toast.error(e); }
    });
  }

  addToVault(m: any): void {
    if (this.vault.statusByMovie.has(m._id)) { this.router.navigate(['/movies', m._id]); return; }
    this.vault.addToWatchlist(m._id).subscribe({ next: () => this.toast.success(`${m.title} added to your vault`), error: e => this.toast.error(e) });
  }
}
