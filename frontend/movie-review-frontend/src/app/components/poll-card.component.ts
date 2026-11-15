import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { RealtimeService } from '../services/realtime.service';
import { ToastService } from '../services/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { TimeAgoPipe } from '../shared/pipes';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-poll-card',
  standalone: true,
  imports: [RouterLink, AvatarComponent, TimeAgoPipe],
  template: `
  <div class="panel poll" [class.closed]="poll.status === 'closed'">
    <div class="row between">
      <div class="row">
        <cv-avatar [user]="poll.creator" size="sm" />
        <div>
          <div class="text-xs text-muted">{{ poll.creator?.name }}@if (showCircle && poll.circle) { · <a [routerLink]="['/circles', poll.circle._id]" [queryParams]="{ tab: 'polls' }" class="text-secondary">{{ poll.circle.name }}</a> } · {{ poll.createdAt | timeAgo }}</div>
        </div>
      </div>
      @if (poll.status === 'closed') { <span class="pill">Closed</span> }
      @else if (poll.expiresAt) { <span class="pill pill-gold">⏳ closes {{ poll.expiresAt | timeAgo }}</span> }
      @else { <span class="pill pill-green">Open</span> }
    </div>
    <h3 class="q">{{ poll.question }}</h3>
    <p class="text-xs text-muted mb-2">{{ poll.multipleChoice ? 'Choose any number of options' : 'Choose one option' }} · {{ poll.voterCount }} voter{{ poll.voterCount === 1 ? '' : 's' }} · {{ poll.totalVotes }} vote{{ poll.totalVotes === 1 ? '' : 's' }}</p>

    <div class="stack" style="gap:8px">
      @for (o of poll.options; track o._id) {
        <div class="poll-option" [class.chosen]="selected.has(o._id)" [class.winner]="poll.winner === o._id" (click)="toggle(o)">
          <span class="fill" [style.width.%]="o.percent"></span>
          @if (o.movie?.poster) { <img [src]="o.movie.poster" [alt]="o.label" /> } @else { <span class="mini-poster"></span> }
          <div class="grow" style="min-width:0">
            <div class="truncate"><strong>{{ o.movie?.title || o.label }}</strong> @if (poll.winner === o._id) { <span class="pill pill-gold">🏆 Winner</span> }</div>
            @if (o.movie) { <div class="text-xs text-muted">{{ o.movie.releaseYear }} · {{ (o.movie.genre || []).slice(0,2).join(', ') }}</div> }
          </div>
          @if (poll.myVotes.includes(o._id)) { <span class="pill pill-gold">Your vote</span> }
          <strong class="pct">{{ o.percent }}%</strong>
        </div>
      }
    </div>

    <div class="row between mt-2 wrap">
      <div class="row">
        @if (poll.status === 'open' && poll.multipleChoice) {
          <button class="btn btn-primary btn-sm" [disabled]="busy || !dirty" (click)="submit()">Submit votes</button>
        }
        @if (poll.status === 'open' && poll.myVotes.length) { <button class="btn btn-outline btn-sm" (click)="clear()">Withdraw vote</button> }
      </div>
      <div class="row">
        @if (poll.status === 'open' && canManage) { <button class="btn btn-secondary btn-sm" (click)="close()">Close & pick winner</button> }
        @if (poll.status === 'closed' && poll.winner && !poll.event) {
          <button class="btn btn-primary btn-sm" (click)="planEvent.emit(poll)">📅 Plan movie night</button>
        }
        @if (poll.event) { <a class="btn btn-secondary btn-sm" [routerLink]="['/events', poll.event]">View event →</a> }
      </div>
    </div>
  </div>
  `,
  styles: [`
    .q { font-size: 1.15rem; margin: 12px 0 4px; }
    .pct { font-variant-numeric: tabular-nums; min-width: 42px; text-align: right; }
    .poll.closed .poll-option { cursor: default; }
    .wrap { flex-wrap: wrap; gap: 8px; }
  `]
})
export class PollCardComponent implements OnInit, OnDestroy {
  @Input({ required: true }) poll: any;
  @Input() showCircle = true;
  @Input() isCircleAdmin = false;
  @Output() planEvent = new EventEmitter<any>();
  selected = new Set<string>();
  dirty = false;
  busy = false;
  private sub?: Subscription;

  constructor(private api: ApiService, private auth: AuthService, private rt: RealtimeService, private toast: ToastService) {}

  ngOnInit(): void {
    this.syncSelection();
    // Live results
    this.sub = this.rt.on('poll:update').subscribe(({ pollId }) => {
      if (pollId === this.poll._id) this.api.poll(pollId).subscribe({ next: p => { this.poll = p; if (!this.dirty) this.syncSelection(); }, error: () => {} });
    });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  get canManage(): boolean { return this.poll.creator?._id === this.auth.currentUser?._id || this.isCircleAdmin; }
  private syncSelection(): void { this.selected = new Set(this.poll.myVotes); this.dirty = false; }

  toggle(o: any): void {
    if (this.poll.status !== 'open' || this.busy) return;
    if (!this.poll.multipleChoice) { this.cast([o._id]); return; }
    this.selected.has(o._id) ? this.selected.delete(o._id) : this.selected.add(o._id);
    this.dirty = true;
  }
  submit(): void { if (this.selected.size) this.cast([...this.selected]); else this.clear(); }

  private cast(ids: string[]): void {
    this.busy = true;
    this.api.vote(this.poll._id, ids).subscribe({
      next: p => { this.poll = p; this.syncSelection(); this.busy = false; },
      error: e => { this.busy = false; this.toast.error(e); }
    });
  }
  clear(): void {
    this.api.clearVote(this.poll._id).subscribe({ next: p => { this.poll = p; this.syncSelection(); }, error: e => this.toast.error(e) });
  }
  close(): void {
    if (!confirm('Close voting and finalise the winner?')) return;
    this.api.closePoll(this.poll._id).subscribe({ next: p => { this.poll = p; this.toast.success('Poll closed', 'Members have been notified.'); }, error: e => this.toast.error(e) });
  }
}
