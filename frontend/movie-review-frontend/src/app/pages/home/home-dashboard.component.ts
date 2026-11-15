import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of, catchError } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { WatchlistService } from '../../services/watchlist.service';
import { ReviewService } from '../../services/review.service';
import { PosterTileComponent } from '../../shared/poster-tile.component';
import { EventDatePipe, TimeAgoPipe } from '../../shared/pipes';

/** Signed-in home: the CineVault journey, today's picks and what's coming up. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-home-dashboard',
  standalone: true,
  imports: [RouterLink, PosterTileComponent, EventDatePipe, TimeAgoPipe],
  template: `
  <section class="v2-page dash">
    <div class="row between wrap">
      <div>
        <p class="v2-eyebrow">{{ greeting }}</p>
        <h1 class="v2-title">Welcome back, {{ firstName }}.</h1>
        <p class="v2-subtitle">Where movies bring people together.</p>
      </div>
      <div class="row">
        <a routerLink="/ai" [queryParams]="{ tool: 'bot' }" class="btn btn-secondary">🤖 Ask CineBot</a>
        <a routerLink="/discover" class="btn btn-primary">Discover</a>
      </div>
    </div>

    @if (stepsDone < steps.length) {
      <div class="panel journey mt-3">
        <div class="row between"><h3 style="margin:0">Your CineVault journey</h3><span class="text-xs text-muted">{{ stepsDone }}/{{ steps.length }} complete</span></div>
        <div class="bar mt-1"><span [style.width.%]="stepsDone / steps.length * 100"></span></div>
        <div class="steps mt-2">
          @for (s of steps; track s.label) {
            <a class="step" [class.done]="s.done" [routerLink]="s.link" [queryParams]="s.query || {}">
              <span class="check">{{ s.done ? '✓' : '' }}</span><span>{{ s.label }}</span>
            </a>
          }
        </div>
      </div>
    }

    <div class="grid-main mt-3">
      <div>
        <div class="section-head" style="margin-top:0"><h2>✨ Picked for you</h2><a routerLink="/ai" [queryParams]="{ tool: 'match' }">CineMatch →</a></div>
        @if (!recs) { <div class="poster-row">@for (i of [1,2,3,4,5]; track i) { <div class="skeleton" style="aspect-ratio:2/3"></div> }</div> }
        @else if (recs.length) {
          <div class="poster-row">@for (r of recs; track r.movie._id) { <cv-poster [movie]="r.movie" [badge]="r.match + '%'" [sub]="r.reasons[0]?.value || ''" /> }</div>
        } @else { <p class="text-muted text-sm">Add movies from Discover to get recommendations.</p> }
      </div>
      <div class="stack">
        <div class="panel panel-tight">
          <div class="row between"><strong>📅 Next movie night</strong><a routerLink="/events" class="link">All</a></div>
          @if (nextEvent) {
            <a class="row mt-1" [routerLink]="['/events', nextEvent._id]">
              <div class="mini" [style.background-image]="nextEvent.movie?.poster ? 'url(' + nextEvent.movie.poster + ')' : ''"></div>
              <div class="grow"><div class="title text-sm">{{ nextEvent.title }}</div><div class="text-xs text-secondary">{{ nextEvent.startsAt | eventDate:'short' }} · {{ nextEvent.startsAt | timeAgo }}</div><div class="text-xs text-muted">{{ nextEvent.counts.going }} going · {{ nextEvent.circle?.name }}</div></div>
            </a>
          } @else { <p class="text-xs text-muted mt-1">Nothing planned. Close a poll to plan one.</p> }
        </div>
        <div class="panel panel-tight">
          <div class="row between"><strong>🗳️ Open polls</strong><a routerLink="/polls" class="link">Vote</a></div>
          @for (p of openPolls.slice(0, 3); track p._id) {
            <a class="list-row" [routerLink]="['/circles', p.circle?._id]" [queryParams]="{ tab: 'polls' }"><span class="grow text-sm truncate">{{ p.question }}</span>@if (!p.myVotes.length) { <span class="pill pill-gold">vote</span> }</a>
          } @empty { <p class="text-xs text-muted mt-1">No open polls in your circles.</p> }
        </div>
      </div>
    </div>
  </section>
  `,
  styles: [`
    .dash { padding-bottom: 8px; }
    .wrap { flex-wrap: wrap; gap: 14px; align-items: flex-end; }
    .steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
    .step { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color); font-size: .85rem; color: var(--text-secondary); }
    .step:hover { border-color: rgba(212,166,74,.45); color: var(--text-primary); }
    .step .check { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--border-hover); display: grid; place-items: center; font-size: .7rem; flex-shrink: 0; }
    .step.done { opacity: .6; } .step.done .check { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
    .grid-main { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; }
    .mini { width: 40px; height: 60px; border-radius: 5px; background: var(--bg-tertiary) center/cover; flex-shrink: 0; }
    @media (max-width: 960px) { .grid-main { grid-template-columns: minmax(0, 1fr); } }
  `]
})
export class HomeDashboardComponent implements OnInit {
  recs: any[] | null = null;
  nextEvent: any = null;
  openPolls: any[] = [];
  steps: { label: string; link: string; query?: any; done: boolean }[] = [];

  constructor(private api: ApiService, private auth: AuthService, private vault: WatchlistService, private reviews: ReviewService) {}

  get firstName(): string { return (this.auth.currentUser?.name || '').split(' ')[0]; }
  get greeting(): string { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  get stepsDone(): number { return this.steps.filter(s => s.done).length; }

  ngOnInit(): void {
    this.api.cinematch({ limit: 10 }).subscribe({ next: (r: any) => (this.recs = r.items), error: () => (this.recs = []) });
    const safe = <T>(o: any, fallback: T) => o.pipe(catchError(() => of(fallback)));
    forkJoin({
      events: safe(this.api.events({ when: 'upcoming' }), [] as any[]),
      polls: safe(this.api.polls({ status: 'open' }), [] as any[]),
      vault: safe(this.vault.getWatchlist(), [] as any[]),
      reviews: safe(this.reviews.getMyReviews(), [] as any[]),
      friends: safe(this.api.friends(), [] as any[]),
      circles: safe(this.api.myCircles(), [] as any[]),
      dna: safe(this.api.cinesense(), null)
    }).subscribe((d: any) => {
      this.nextEvent = d.events.find((e: any) => !e.isPast && e.status === 'scheduled') || null;
      this.openPolls = d.polls;
      const u = this.auth.currentUser;
      this.steps = [
        { label: 'Pick your favourite genres', link: '/welcome', done: !!u?.favoriteGenres?.length },
        { label: 'Add movies to your vault', link: '/discover', done: d.vault.length > 0 },
        { label: 'Rate & review a movie', link: '/vault', done: d.reviews.length > 0 },
        { label: 'See your Movie DNA', link: '/ai', query: { tool: 'dna' }, done: (d.dna?.profile?.dataPoints || 0) > 0 },
        { label: 'Add a friend', link: '/people', done: d.friends.length > 0 },
        { label: 'Join or create a CineCircle', link: '/circles', done: d.circles.some((c: any) => c.membership?.status === 'active') },
        { label: 'Vote in a CinePoll', link: '/polls', done: d.polls.some((p: any) => p.myVotes.length) || d.events.length > 0 },
        { label: 'Plan a movie night', link: '/events', done: d.events.length > 0 }
      ];
    });
  }
}
