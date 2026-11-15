import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { ToastService } from '../../services/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { EventDatePipe, LabelPipe, TimeAgoPipe } from '../../shared/pipes';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-event-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, AvatarComponent, EventDatePipe, LabelPipe, TimeAgoPipe],
  template: `
  @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }
  @if (error) { <div class="v2-page"><div class="state"><div class="icon">🔒</div><h3>{{ error }}</h3><a routerLink="/events" class="btn btn-secondary btn-sm">Back to CinePlan</a></div></div> }
  @if (e) {
    <div class="hero" [style.background-image]="(e.movie?.backdrop || e.movie?.poster) ? 'url(' + (e.movie?.backdrop || e.movie?.poster) + ')' : ''">
      <div class="hero-inner v2-page">
        <a routerLink="/events" class="text-sm text-secondary">← CinePlan</a>
        <div class="row mt-2" style="align-items:flex-end; gap: 24px">
          @if (e.movie?.poster) { <img class="poster" [src]="e.movie.poster" [alt]="e.movie.title" /> }
          <div class="grow">
            <p class="v2-eyebrow">{{ e.circle?.name }} · Movie night @if (e.status !== 'scheduled') { · {{ e.status }} }</p>
            <h1 class="v2-title">{{ e.title }}</h1>
            <p class="mt-1"><a class="text-accent" [routerLink]="['/movies', e.movie?._id]">🎬 {{ e.movie?.title }}</a> <span class="text-muted">({{ e.movie?.releaseYear }}) · {{ e.movie?.duration }} min</span></p>
            <p class="text-secondary">🕖 {{ e.startsAt | eventDate }} <span class="text-muted">({{ e.startsAt | timeAgo }})</span></p>
            @if (e.venue) { <p class="text-secondary">📍 {{ e.venue }}@if (e.address) { , {{ e.address }} }</p> }
            @if (e.poll) { <p class="text-xs text-muted mt-1">Chosen by the poll “{{ e.poll.question }}”</p> }
          </div>
        </div>
      </div>
    </div>

    <div class="v2-page" style="padding-top: 8px">
      <div class="grid-2">
        <div class="stack">
          @if (!e.isPast && e.status === 'scheduled') {
            <div class="panel">
              <h3>Are you going?</h3>
              <div class="row-wrap">
                @for (r of rsvps; track r.v) { <button class="chip" [class.active]="e.myRsvp === r.v" (click)="rsvp(r.v)">{{ r.icon }} {{ r.label }}</button> }
              </div>
              @if (e.bookingUrl) { <a class="btn btn-primary mt-2" [href]="e.bookingUrl" target="_blank" rel="noopener noreferrer">🎟️ Book tickets</a> }
            </div>
          }

          @if (e.description) { <div class="panel"><h3>Details</h3><p class="text-secondary" style="white-space:pre-line">{{ e.description }}</p></div> }

          <div class="panel">
            <h3>Guests</h3>
            <div class="stat-grid mb-2">
              <div class="stat"><div class="value text-accent">{{ e.counts.going }}</div><div class="label">Going</div></div>
              <div class="stat"><div class="value">{{ e.counts.maybe }}</div><div class="label">Maybe</div></div>
              <div class="stat"><div class="value">{{ e.counts.invited }}</div><div class="label">No reply</div></div>
            </div>
            @for (a of e.attendees; track a._id) {
              <div class="list-row"><cv-avatar [user]="a.user" size="sm" [showPresence]="true" /><span class="grow">{{ a.user?.name }}</span>
                <span class="pill" [class.pill-green]="a.rsvp === 'going'" [class.pill-gold]="a.rsvp === 'maybe'" [class.pill-red]="a.rsvp === 'not_going'">{{ a.rsvp | label }}</span></div>
            }
          </div>
        </div>

        <div class="stack">
          @if (!e.isPast && e.status === 'scheduled') {
            <div class="panel">
              <h3>Group availability</h3>
              <p class="text-xs text-muted mb-2">Can't make it? Suggest another date. Members mark when they're free and the organiser can adopt the best slot.</p>
              @for (p of e.proposals; track p._id) {
                <div class="list-row">
                  <div class="grow">
                    <div class="title text-sm">{{ p.startsAt | eventDate:'short' }}</div>
                    <div class="meta">by {{ p.proposedBy?.name }} · available: {{ names(p.available) }}</div>
                    <div class="bar mt-1"><span [style.width.%]="(p.availableCount / (e.attendees.length || 1)) * 100"></span></div>
                  </div>
                  <button class="btn btn-sm" [class.btn-primary]="p.iAmAvailable" [class.btn-secondary]="!p.iAmAvailable" (click)="toggleAvailability(p)">{{ p.iAmAvailable ? '✓ I can' : 'I can make it' }}</button>
                  @if (canManage) { <button class="btn btn-outline btn-sm" (click)="adopt(p)">Use this date</button> }
                </div>
              } @empty { <p class="text-muted text-sm">No alternative dates suggested.</p> }
              <div class="input-row mt-2">
                <input class="form-input" type="datetime-local" [(ngModel)]="proposal" [min]="minDate" />
                <button class="btn btn-secondary" [disabled]="!proposal" (click)="propose()">Suggest</button>
              </div>
            </div>
          }

          @if (e.isPast) {
            <div class="panel panel-gold">
              <h3>How was the movie night?</h3>
              <p class="text-xs text-muted mb-2">Feedback trains CinePulse to predict what your group will enjoy next.</p>
              <div class="row">
                @for (i of [1,2,3,4,5]; track i) { <button class="star-btn" [class.on]="i <= fbRating" (click)="fbRating = i">★</button> }
              </div>
              <textarea class="form-textarea mt-1" rows="2" [(ngModel)]="fbComment" maxlength="500" placeholder="Best part of the night?"></textarea>
              <button class="btn btn-primary btn-sm mt-1" [disabled]="!fbRating" (click)="sendFeedback()">Submit feedback</button>
              @if (e.avgFeedback) { <p class="text-sm mt-2">Group average: <strong class="text-accent">{{ e.avgFeedback }}★</strong> from {{ e.feedback.length }} member(s)</p> }
              <a class="link text-sm" [routerLink]="['/movies', e.movie?._id]">Write a full review of {{ e.movie?.title }} →</a>
            </div>
          }

          @if (canManage) {
            <div class="panel">
              <h3>Organiser tools</h3>
              <div class="row-wrap">
                @if (e.status === 'scheduled') { <button class="btn btn-outline btn-sm" (click)="setStatus('cancelled')">Cancel event</button> }
                @if (e.status === 'cancelled') { <button class="btn btn-outline btn-sm" (click)="setStatus('scheduled')">Reinstate</button> }
                <button class="btn btn-danger btn-sm" (click)="remove()">Delete</button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  }
  `,
  styles: [`
    .hero { background: linear-gradient(135deg, #2b2416, #0b0b0d) center/cover; position: relative; }
    .hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, var(--bg-primary) 5%, rgba(8,8,10,0.75) 60%, rgba(8,8,10,0.5)); }
    .hero-inner { position: relative; padding-bottom: 28px; }
    .poster { width: 150px; border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }
    .star-btn { background: none; font-size: 1.8rem; color: #3a3a40; padding: 0 2px; } .star-btn.on { color: var(--accent); }
    @media (max-width: 720px) { .poster { width: 96px; } }
  `]
})
export class EventDetailComponent implements OnInit, OnDestroy {
  e: any = null;
  loading = true;
  error = '';
  proposal = '';
  fbRating = 0;
  fbComment = '';
  minDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  rsvps = [{ v: 'going', label: 'Going', icon: '✅' }, { v: 'maybe', label: 'Maybe', icon: '🤔' }, { v: 'not_going', label: 'Not going', icon: '❌' }];
  private sub?: Subscription;
  private circleJoined = '';

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService, private auth: AuthService, private rt: RealtimeService, private toast: ToastService) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => this.load(p.get('id')!));
    this.sub = this.rt.on('event:update').subscribe(({ eventId }) => { if (eventId === this.e?._id) this.load(eventId, true); });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); if (this.circleJoined) this.rt.leaveCircle(this.circleJoined); }

  load(id: string, silent = false): void {
    if (!silent) this.loading = true;
    this.api.event(id).subscribe({
      next: e => {
        this.e = e; this.loading = false;
        const mine = e.feedback?.find((f: any) => f.user?._id === this.auth.currentUser?._id);
        if (mine && !silent) { this.fbRating = mine.rating; this.fbComment = mine.comment || ''; }
        if (e.circle?._id && this.circleJoined !== e.circle._id) { this.circleJoined = e.circle._id; this.rt.joinCircle(e.circle._id); }
      },
      error: err => { this.loading = false; this.error = err.error?.message || 'Event not found'; }
    });
  }

  get canManage(): boolean { return this.e?.creator?._id === this.auth.currentUser?._id; }
  names(users: any[]): string { return users.map(u => u.name).join(', ') || 'nobody yet'; }

  private apply(obs: any, msg?: string): void {
    obs.subscribe({ next: (e: any) => { this.e = e; if (msg) this.toast.success(msg); }, error: (err: any) => this.toast.error(err) });
  }
  rsvp(v: string): void { this.apply(this.api.rsvp(this.e._id, v)); }
  propose(): void { this.apply(this.api.proposeDate(this.e._id, new Date(this.proposal).toISOString()), 'Date suggested'); this.proposal = ''; }
  toggleAvailability(p: any): void { this.apply(this.api.toggleAvailability(this.e._id, p._id)); }
  adopt(p: any): void { if (confirm('Move the event to this date? Everyone will be notified.')) this.apply(this.api.adoptProposal(this.e._id, p._id), 'Event rescheduled'); }
  sendFeedback(): void { this.apply(this.api.eventFeedback(this.e._id, this.fbRating, this.fbComment), 'Thanks! CinePulse will learn from this.'); }
  setStatus(status: string): void { this.apply(this.api.updateEvent(this.e._id, { status }), 'Event updated'); }
  remove(): void {
    if (!confirm('Delete this event?')) return;
    this.api.deleteEvent(this.e._id).subscribe({ next: () => this.router.navigate(['/events']), error: err => this.toast.error(err) });
  }
}
