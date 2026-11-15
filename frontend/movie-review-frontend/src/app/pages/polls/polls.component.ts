import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { RealtimeService } from '../../services/realtime.service';
import { ToastService } from '../../services/toast.service';
import { PollCardComponent } from '../../components/poll-card.component';
import { CreatePollComponent } from '../../components/create-poll.component';
import { CreateEventComponent } from '../../components/create-event.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-polls',
  standalone: true,
  imports: [RouterLink, PollCardComponent, CreatePollComponent, CreateEventComponent],
  template: `
  <div class="v2-page" style="max-width: 880px">
    <div class="v2-header">
      <div>
        <p class="v2-eyebrow">CinePoll</p>
        <h1 class="v2-title">Vote on what to watch</h1>
        <p class="v2-subtitle">Every poll from your CineCircles, with live results. Close a poll to crown a winner, then turn it into a movie night.</p>
      </div>
      <button class="btn btn-primary" (click)="creating = true">+ New poll</button>
    </div>
    <div class="tabs">
      <button class="tab" [class.active]="status === 'open'" (click)="setStatus('open')">Open</button>
      <button class="tab" [class.active]="status === 'closed'" (click)="setStatus('closed')">Closed</button>
      <button class="tab" [class.active]="status === ''" (click)="setStatus('')">All</button>
    </div>
    @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }
    <div class="stack">
      @for (p of polls; track p._id) { <cv-poll-card [poll]="p" (planEvent)="planFrom = $event" /> }
    </div>
    @if (!loading && !polls.length) {
      <div class="state"><div class="icon">🗳️</div><h3>No {{ status }} polls</h3><p>Start one in a CineCircle: “What should we watch this Saturday?”</p>
        <a routerLink="/circles" class="btn btn-secondary btn-sm">Go to my circles</a></div>
    }
    @if (creating) { <cv-create-poll (created)="onCreated($event)" (close)="creating = false" /> }
    @if (planFrom) { <cv-create-event [poll]="planFrom" (created)="router.navigate(['/events', $event._id])" (close)="planFrom = null" /> }
  </div>
  `
})
export class PollsComponent implements OnInit, OnDestroy {
  polls: any[] = [];
  status = 'open';
  loading = true;
  creating = false;
  planFrom: any = null;
  private joined = new Set<string>();

  constructor(private api: ApiService, private rt: RealtimeService, private toast: ToastService, public router: Router) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.joined.forEach(id => this.rt.leaveCircle(id)); }

  setStatus(s: string): void { this.status = s; this.load(); }

  load(): void {
    this.loading = true;
    this.api.polls({ status: this.status }).subscribe({
      next: p => {
        this.polls = p; this.loading = false;
        for (const poll of p) { const id = poll.circle?._id; if (id && !this.joined.has(id)) { this.joined.add(id); this.rt.joinCircle(id); } }
      },
      error: e => { this.loading = false; this.toast.error(e); }
    });
  }

  onCreated(p: any): void { this.creating = false; this.status = 'open'; this.load(); this.toast.success('Poll started', 'Circle members were notified.'); }
}
