import { Component, Input, OnChanges, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { CreateEventComponent } from '../../components/create-event.component';
import { EventDatePipe, LabelPipe, TimeAgoPipe } from '../../shared/pipes';

/** CinePlan list. Embedded in CineCircle with [circleId]. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-events',
  standalone: true,
  imports: [RouterLink, CreateEventComponent, EventDatePipe, LabelPipe, TimeAgoPipe],
  template: `
  <div [class.v2-page]="!circleId">
    @if (!circleId) {
      <div class="v2-header">
        <div>
          <p class="v2-eyebrow">CinePlan</p>
          <h1 class="v2-title">Movie nights</h1>
          <p class="v2-subtitle">Plans from all your circles. RSVP, suggest another date, grab the tickets.</p>
        </div>
        <button class="btn btn-primary" (click)="creating = true">+ Plan a movie night</button>
      </div>
    } @else {
      <div class="row between mb-2"><span class="text-secondary text-sm">Movie nights in this circle</span><button class="btn btn-primary btn-sm" (click)="creating = true">+ Plan</button></div>
    }

    <div class="tabs">
      <button class="tab" [class.active]="when === 'upcoming'" (click)="setWhen('upcoming')">Upcoming</button>
      <button class="tab" [class.active]="when === 'past'" (click)="setWhen('past')">Past</button>
    </div>
    @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }

    <div class="grid-auto">
      @for (e of events; track e._id) {
        <a class="event-card hover-lift" [routerLink]="['/events', e._id]">
          <div class="backdrop" [style.background-image]="(e.movie?.backdrop || e.movie?.poster) ? 'url(' + (e.movie?.backdrop || e.movie?.poster) + ')' : ''">
            <div class="date-badge"><span class="m">{{ month(e.startsAt) }}</span><span class="d">{{ day(e.startsAt) }}</span></div>
            @if (e.status === 'cancelled') { <span class="pill pill-red status">Cancelled</span> }
          </div>
          <div class="info">
            <strong class="truncate">{{ e.title }}</strong>
            <div class="text-xs text-secondary">{{ e.startsAt | eventDate:'short' }} · {{ e.startsAt | timeAgo }}</div>
            @if (e.venue) { <div class="text-xs text-muted truncate">📍 {{ e.venue }}</div> }
            <div class="row between mt-1">
              <span class="text-xs text-muted">{{ e.circle?.name }}</span>
              <span class="text-xs"><span class="text-accent">{{ e.counts.going }}</span> going · {{ e.counts.maybe }} maybe</span>
            </div>
            @if (e.myRsvp) { <span class="pill mt-1" [class.pill-green]="e.myRsvp === 'going'" [class.pill-gold]="e.myRsvp === 'invited'">You: {{ e.myRsvp | label }}</span> }
          </div>
        </a>
      }
    </div>
    @if (!loading && !events.length) {
      <div class="state"><div class="icon">📅</div><h3>No {{ when }} movie nights</h3><p>Close a CinePoll to pick a winner, or plan a night directly.</p></div>
    }
    @if (creating) { <cv-create-event [circleId]="circleId" (created)="router.navigate(['/events', $event._id])" (close)="creating = false" /> }
  </div>
  `,
  styles: [`
    .event-card { display: block; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-card); }
    .backdrop { height: 140px; background: linear-gradient(135deg, #2b2416, #111114) center/cover; position: relative; }
    .backdrop::after { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(10,10,12,0.9), transparent 60%); }
    .date-badge { position: absolute; left: 12px; bottom: 10px; z-index: 1; background: var(--accent-gradient); color: var(--on-accent); border-radius: 10px; padding: 4px 10px; text-align: center; line-height: 1.1; }
    .date-badge .m { display: block; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }
    .date-badge .d { display: block; font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; }
    .status { position: absolute; top: 10px; right: 10px; z-index: 1; }
    .info { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 2px; }
  `]
})
export class EventsComponent implements OnInit, OnChanges {
  @Input() circleId?: string;
  events: any[] = [];
  when = 'upcoming';
  loading = true;
  creating = false;

  constructor(private api: ApiService, private toast: ToastService, public router: Router) {}

  ngOnInit(): void { if (!this.circleId) this.load(); }
  ngOnChanges(): void { if (this.circleId) this.load(); }

  setWhen(w: string): void { this.when = w; this.load(); }
  load(): void {
    this.loading = true;
    this.api.events({ when: this.when, circle: this.circleId }).subscribe({
      next: e => { this.events = e; this.loading = false; },
      error: err => { this.loading = false; this.toast.error(err); }
    });
  }
  month(d: string): string { return new Date(d).toLocaleString('en-US', { month: 'short' }); }
  day(d: string): number { return new Date(d).getDate(); }
}
