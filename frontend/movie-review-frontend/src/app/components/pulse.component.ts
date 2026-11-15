import { Component, Input, OnChanges, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { ColumnChartComponent } from '../shared/column-chart.component';
import { EventDatePipe } from '../shared/pipes';

/** CinePulse: group preference intelligence for a CineCircle. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-pulse',
  standalone: true,
  imports: [RouterLink, ColumnChartComponent, EventDatePipe],
  template: `
  @if (loading) { <div class="loading-container"><div class="spinner"></div><p class="loading-text">Reading the room…</p></div> }
  @if (error) { <div class="error-box">{{ error }}</div> }
  @if (d && !loading) {
    <div class="grid-2">
      <div class="panel panel-gold">
        <div class="v2-eyebrow">Recommended next category</div>
        @if (d.nextCategory) {
          <h3 class="headline">{{ d.nextCategory.statement }}</h3>
          <p class="text-xs text-muted">Confidence: <span class="pill" [class.pill-green]="d.confidence === 'high'" [class.pill-gold]="d.confidence === 'medium'">{{ d.confidence }}</span> · based on {{ d.observations }} observation(s)</p>
          <p class="text-xs text-muted mt-1">{{ d.nextCategory.caveat }}</p>
        } @else { <p class="text-secondary">Not enough data yet.</p> }
      </div>
      <div class="panel">
        <h3>Insights</h3>
        <ul class="insights">@for (i of d.insights; track $index) { <li>{{ i }}</li> }</ul>
      </div>
    </div>

    <div class="stat-grid mt-2">
      <div class="stat"><div class="value">{{ d.voting.polls }}</div><div class="label">Polls</div></div>
      <div class="stat"><div class="value">{{ d.voting.totalVotes }}</div><div class="label">Votes cast</div></div>
      <div class="stat"><div class="value">{{ d.voting.avgParticipation }}%</div><div class="label">Avg participation</div></div>
      <div class="stat"><div class="value">{{ d.voting.consensus ?? '—' }}{{ d.voting.consensus !== null ? '%' : '' }}</div><div class="label">Winner share</div></div>
      <div class="stat"><div class="value">{{ d.compatibility ?? '—' }}{{ d.compatibility !== null ? '%' : '' }}</div><div class="label">Taste compatibility</div></div>
    </div>

    <div class="grid-2 mt-2">
      <div class="panel">
        <h3>Group genre preference</h3>
        <p class="text-xs text-muted mb-2">Estimated share of group interest (Dirichlet-smoothed).</p>
        @for (g of d.genreTrends.slice(0, 8); track g.genre) {
          <div class="bar-row" [title]="g.genre + ': ' + g.share + '% (evidence ' + g.evidence + ')'"><span class="label">{{ g.genre }}</span><div class="bar"><span [style.width.%]="g.share / maxShare * 100"></span></div><span class="num">{{ g.share }}%</span></div>
        }
      </div>
      <div class="panel">
        <h3>Poll participation</h3>
        <p class="text-xs text-muted mb-2">Share of members who voted, last {{ participation.length }} polls.</p>
        @if (participation.length) { <cv-columns [data]="participation" unit="% voted" ariaLabel="Poll participation rate per poll" /> }
        @else { <p class="text-muted text-sm">No polls yet.</p> }
      </div>
    </div>

    <div class="grid-2 mt-2">
      <div class="panel">
        <h3>Most voted movies</h3>
        @for (m of d.popularMovies; track m.movie._id) {
          <a class="list-row" [routerLink]="['/movies', m.movie._id]">
            <div class="mini" [style.background-image]="m.movie.poster ? 'url(' + m.movie.poster + ')' : ''"></div>
            <div class="grow"><div class="title">{{ m.movie.title }}</div><div class="meta">{{ (m.movie.genre || []).join(', ') }}</div></div>
            <span class="pill">{{ m.votes }} votes</span>
          </a>
        } @empty { <p class="text-muted text-sm">Votes will show up here.</p> }
      </div>
      <div class="panel">
        <h3>Movie nights</h3>
        @for (n of d.movieNights; track n.eventId) {
          <a class="list-row" [routerLink]="['/events', n.eventId]">
            <div class="grow"><div class="title">{{ n.movie }}</div><div class="meta">{{ n.date | eventDate:'short' }} · {{ n.going }} going</div></div>
            @if (n.avgRating) { <span class="pill pill-gold">★ {{ n.avgRating }}</span> } @else { <span class="pill">no feedback</span> }
          </a>
        } @empty { <p class="text-muted text-sm">Plan a movie night with CinePlan.</p> }
      </div>
    </div>
    <p class="text-xs text-muted mt-2">{{ d.method }}</p>
  }
  `,
  styles: [`
    .headline { font-size: 1.35rem; margin: 6px 0 10px; }
    .insights { padding-left: 0; } .insights li { margin: 8px 0; font-size: .9rem; color: var(--text-secondary); } .insights li::before { content: '◆ '; color: var(--accent); font-size: .7rem; }
    .mini { width: 32px; height: 46px; border-radius: 4px; background: var(--bg-tertiary) center/cover; flex-shrink: 0; }
  `]
})
export class PulseComponent implements OnChanges {
  @Input({ required: true }) circleId!: string;
  d: any = null;
  loading = false;
  error = '';
  constructor(private api: ApiService) {}

  ngOnChanges(): void {
    this.loading = true; this.error = '';
    this.api.pulse(this.circleId).subscribe({
      next: d => { this.d = d; this.loading = false; },
      error: e => { this.loading = false; this.error = e.error?.message || 'Could not analyse this circle'; }
    });
  }
  get maxShare(): number { return Math.max(1, ...(this.d?.genreTrends || []).map((g: any) => g.share)); }
  get participation(): any[] {
    return (this.d?.voting.participation || []).map((p: any, i: number) => ({ label: p.question, short: `#${i + 1}`, value: p.rate, note: `${p.voters} voter(s)` }));
  }
}
