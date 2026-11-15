import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { ToastService } from '../../services/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { PosterTileComponent } from '../../shared/poster-tile.component';
import { MoviePickerComponent } from '../../shared/movie-picker.component';
import { ImageUploadComponent } from '../../shared/image-upload.component';
import { ChatWindowComponent } from '../../components/chat-window.component';
import { PollCardComponent } from '../../components/poll-card.component';
import { CreatePollComponent } from '../../components/create-poll.component';
import { CreateEventComponent } from '../../components/create-event.component';
import { GroupMatchComponent } from '../../components/group-match.component';
import { PulseComponent } from '../../components/pulse.component';
import { FeedComponent } from '../feed/feed.component';
import { EventsComponent } from '../events/events.component';

type Tab = 'feed' | 'chat' | 'polls' | 'events' | 'watchlist' | 'match' | 'pulse' | 'members';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-circle-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, AvatarComponent, PosterTileComponent, MoviePickerComponent, ImageUploadComponent, ChatWindowComponent, PollCardComponent, CreatePollComponent, CreateEventComponent, GroupMatchComponent, PulseComponent, FeedComponent, EventsComponent],
  template: `
  @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }
  @if (error) { <div class="v2-page"><div class="state"><div class="icon">🔒</div><h3>{{ error }}</h3><a routerLink="/circles" class="btn btn-secondary btn-sm">Back to circles</a></div></div> }
  @if (c) {
    <div class="cover" [style.background-image]="c.coverImage ? 'url(' + c.coverImage + ')' : ''">
      <div class="cover-inner v2-page">
        <a routerLink="/circles" class="text-sm text-secondary">← CineCircle</a>
        <div class="row between mt-2 wrap">
          <div>
            <p class="v2-eyebrow">{{ c.visibility === 'private' ? '🔒 Private circle' : '🌐 Public circle' }} · {{ c.memberCount }} members</p>
            <h1 class="v2-title">{{ c.name }}</h1>
            @if (c.description) { <p class="v2-subtitle">{{ c.description }}</p> }
          </div>
          <div class="row">
            @if (!isMember) {
              @if (c.membership?.status === 'invited' || c.visibility === 'public') { <button class="btn btn-primary" (click)="join()">{{ c.membership?.status === 'invited' ? 'Accept invite' : 'Join circle' }}</button> }
            } @else {
              <button class="btn btn-secondary btn-sm" (click)="openInvite()">+ Invite friends</button>
              @if (c.membership.role === 'owner') { <button class="btn btn-outline btn-sm" (click)="openSettings()">Settings</button> }
              @else { <button class="btn btn-outline btn-sm" (click)="leave()">Leave</button> }
            }
          </div>
        </div>
      </div>
    </div>

    <div class="v2-page" style="padding-top: 0">
      @if (!isMember) {
        <div class="info-box mb-3">You're previewing this circle. Join to chat, vote in polls and plan movie nights.</div>
      }
      <div class="tabs">
        @for (t of tabs; track t.id) {
          @if (isMember || t.public) { <button class="tab" [class.active]="tab === t.id" (click)="setTab(t.id)">{{ t.label }}</button> }
        }
      </div>

      @switch (tab) {
        @case ('feed') { <app-feed [circleId]="c._id" /> }
        @case ('chat') {
          @if (c.conversation) { <div class="panel chat-panel"><cv-chat-window [conversationId]="c.conversation" /></div> }
        }
        @case ('polls') {
          <div class="row between mb-2"><span class="text-secondary text-sm">Vote on what the group watches next.</span><button class="btn btn-primary btn-sm" (click)="creatingPoll = true">+ New poll</button></div>
          <div class="stack">
            @for (p of polls; track p._id) { <cv-poll-card [poll]="p" [showCircle]="false" [isCircleAdmin]="isAdmin" (planEvent)="planFrom = $event" /> }
            @empty { <div class="state"><div class="icon">🗳️</div><p>No polls yet. Ask: “What should we watch this Saturday?”</p></div> }
          </div>
        }
        @case ('events') { <app-events [circleId]="c._id" /> }
        @case ('watchlist') {
          <div class="row between mb-2"><span class="text-secondary text-sm">Movies the group wants to watch together.</span><button class="btn btn-primary btn-sm" (click)="picker = true">+ Add movie</button></div>
          <div class="poster-grid">
            @for (s of c.sharedWatchlist; track s._id) {
              <cv-poster [movie]="s.movie" [sub]="'by ' + (s.addedBy?.name || '')">
                @if (isMember) { <button class="btn btn-outline btn-sm mt-1" (click)="removeShared(s.movie._id)">Remove</button> }
              </cv-poster>
            }
          </div>
          @if (!c.sharedWatchlist.length) { <div class="state"><div class="icon">🍿</div><p>Nothing on the shared watchlist yet.</p></div> }
        }
        @case ('match') { <cv-group-match [circleId]="c._id" /> }
        @case ('pulse') { <cv-pulse [circleId]="c._id" /> }
        @case ('members') {
          <div class="panel">
            @for (m of members; track m._id) {
              <div class="list-row">
                <cv-avatar [user]="m.user" [showPresence]="true" />
                <a class="grow" [routerLink]="['/u', m.user._id]"><div class="title">{{ m.user.name }}</div><div class="meta">{{ m.status === 'invited' ? 'Invited' : (m.user.online ? 'Online' : 'Offline') }}</div></a>
                <span class="pill" [class.pill-gold]="m.role !== 'member'">{{ m.role }}</span>
                @if (isOwner && m.role !== 'owner' && m.status === 'active') {
                  <button class="btn btn-outline btn-sm" (click)="toggleAdmin(m)">{{ m.role === 'admin' ? 'Make member' : 'Make admin' }}</button>
                }
                @if (isAdmin && m.role !== 'owner') { <button class="btn btn-danger btn-sm" (click)="removeMember(m)">Remove</button> }
              </div>
            }
          </div>
        }
      }
    </div>

    @if (creatingPoll) { <cv-create-poll [circleId]="c._id" (created)="creatingPoll = false; loadPolls()" (close)="creatingPoll = false" /> }
    @if (planFrom) { <cv-create-event [poll]="planFrom" (created)="router.navigate(['/events', $event._id])" (close)="planFrom = null" /> }
    @if (picker) { <cv-movie-picker title="Add to shared watchlist" (picked)="addShared($event)" (close)="picker = false" /> }

    @if (inviting) {
      <div class="modal-backdrop" (click)="inviting = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>Invite friends to {{ c.name }}</h2>
          @for (f of inviteCandidates; track f._id) {
            <label class="list-row" style="cursor:pointer"><input type="checkbox" [checked]="invite.has(f._id)" (change)="invite.has(f._id) ? invite.delete(f._id) : invite.add(f._id)" /><cv-avatar [user]="f" size="sm" /><span>{{ f.name }}</span></label>
          } @empty { <p class="text-muted text-sm">All your friends are already here (or you haven't added any yet).</p> }
          <div class="modal-actions"><button class="btn btn-secondary" (click)="inviting = false">Cancel</button><button class="btn btn-primary" [disabled]="!invite.size" (click)="sendInvites()">Send invites</button></div>
        </div>
      </div>
    }

    @if (editing) {
      <div class="modal-backdrop" (click)="editing = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>Circle settings</h2>
          <div class="form-group"><label class="form-label">Name</label><input class="form-input" [(ngModel)]="edit.name" maxlength="80" /></div>
          <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" rows="3" [(ngModel)]="edit.description" maxlength="1000"></textarea></div>
          <div class="form-group"><label class="form-label">Cover image</label><div class="input-row"><input class="form-input" [(ngModel)]="edit.coverImage" /><cv-image-upload label="Upload" (uploaded)="edit.coverImage = $event" /></div></div>
          <div class="form-group"><label class="form-label">Visibility</label>
            <select class="form-select" [(ngModel)]="edit.visibility"><option value="public">Public</option><option value="private">Private</option></select></div>
          <div class="modal-actions">
            <button class="btn btn-danger" style="margin-right:auto" (click)="deleteCircle()">Delete circle</button>
            <button class="btn btn-secondary" (click)="editing = false">Cancel</button>
            <button class="btn btn-primary" (click)="saveSettings()">Save</button>
          </div>
        </div>
      </div>
    }
  }
  `,
  styles: [`
    .cover { background: linear-gradient(135deg, #3a2f18, #0b0b0d 70%) center/cover; position: relative; }
    .cover::before { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, var(--bg-primary) 0%, rgba(8,8,10,0.72) 55%, rgba(8,8,10,0.45)); }
    .cover-inner { position: relative; padding-bottom: 20px; }
    .wrap { flex-wrap: wrap; gap: 14px; align-items: flex-end; }
    .chat-panel { padding: 0; height: min(68vh, 720px); display: flex; overflow: hidden; }
    .chat-panel cv-chat-window { flex: 1; }
  `]
})
export class CircleDetailComponent implements OnInit, OnDestroy {
  c: any = null;
  loading = true;
  error = '';
  tab: Tab = 'feed';
  polls: any[] = [];
  members: any[] = [];
  creatingPoll = false;
  planFrom: any = null;
  picker = false;
  inviting = false;
  inviteCandidates: any[] = [];
  invite = new Set<string>();
  editing = false;
  edit: any = {};
  tabs: { id: Tab; label: string; public?: boolean }[] = [
    { id: 'feed', label: '📰 Feed', public: true }, { id: 'chat', label: '💬 Chat' }, { id: 'polls', label: '🗳️ Polls' },
    { id: 'events', label: '📅 Events' }, { id: 'watchlist', label: '🍿 Shared watchlist', public: true }, { id: 'match', label: '🎯 Group CineMatch' },
    { id: 'pulse', label: '📈 CinePulse' }, { id: 'members', label: '👥 Members', public: true }
  ];
  private subs: Subscription[] = [];
  private joinedRoom = '';

  constructor(private route: ActivatedRoute, public router: Router, private api: ApiService, private auth: AuthService, private rt: RealtimeService, private toast: ToastService) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => this.load(p.get('id')!));
    this.route.queryParamMap.subscribe(q => { const t = q.get('tab') as Tab; if (t && this.tabs.some(x => x.id === t)) this.activate(t); });
    this.subs.push(
      this.rt.on('poll:update').subscribe(({ circleId, deleted }) => { if (circleId === this.c?._id && (deleted || !this.polls.length)) this.loadPolls(); }),
      this.rt.on('circle:watchlist').subscribe(({ circleId }) => { if (circleId === this.c?._id) this.refresh(); })
    );
  }
  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); if (this.joinedRoom) this.rt.leaveCircle(this.joinedRoom); }

  get isMember(): boolean { return this.c?.membership?.status === 'active'; }
  get isAdmin(): boolean { return this.isMember && ['owner', 'admin'].includes(this.c.membership.role); }
  get isOwner(): boolean { return this.c?.membership?.role === 'owner'; }

  load(id: string): void {
    this.loading = true; this.error = '';
    this.api.circle(id).subscribe({
      next: c => {
        this.c = c; this.loading = false;
        if (this.isMember && this.joinedRoom !== c._id) { this.joinedRoom = c._id; this.rt.joinCircle(c._id); }
        if (!this.isMember && !this.tabs.find(t => t.id === this.tab)?.public) this.tab = 'feed';
        this.activate(this.tab);
      },
      error: e => { this.loading = false; this.error = e.error?.message || 'Circle not found'; }
    });
  }
  refresh(): void { this.api.circle(this.c._id).subscribe(c => (this.c = c)); }

  setTab(t: Tab): void { this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true }); }
  private activate(t: Tab): void {
    this.tab = t;
    if (!this.c) return;
    if (t === 'polls') this.loadPolls();
    if (t === 'members') this.loadMembers();
  }

  loadPolls(): void { this.api.polls({ circle: this.c._id }).subscribe({ next: p => (this.polls = p), error: e => this.toast.error(e) }); }
  loadMembers(): void { this.api.circleMembers(this.c._id).subscribe({ next: m => (this.members = m), error: e => this.toast.error(e) }); }

  join(): void {
    this.api.joinCircle(this.c._id).subscribe({ next: () => { this.toast.success(`Welcome to ${this.c.name}!`); this.load(this.c._id); }, error: e => this.toast.error(e) });
  }
  leave(): void {
    if (!confirm(`Leave ${this.c.name}?`)) return;
    this.api.leaveCircle(this.c._id).subscribe({ next: () => this.router.navigate(['/circles']), error: e => this.toast.error(e) });
  }

  openInvite(): void {
    this.inviting = true; this.invite.clear();
    this.api.friends().subscribe(friends => {
      this.api.circleMembers(this.c._id).subscribe(members => {
        const ids = new Set(members.map(m => m.user._id));
        this.inviteCandidates = friends.filter(f => !ids.has(f._id));
      });
    });
  }
  sendInvites(): void {
    this.api.inviteToCircle(this.c._id, [...this.invite]).subscribe({ next: (r: any) => { this.inviting = false; this.toast.success(`${r.invited} invitation(s) sent`); }, error: e => this.toast.error(e) });
  }

  addShared(m: any): void {
    this.picker = false;
    this.api.addCircleWatchlist(this.c._id, m._id).subscribe({ next: () => { this.toast.success(`${m.title} added`); this.refresh(); }, error: e => this.toast.error(e) });
  }
  removeShared(movieId: string): void { this.api.removeCircleWatchlist(this.c._id, movieId).subscribe({ next: () => this.refresh(), error: e => this.toast.error(e) }); }

  toggleAdmin(m: any): void {
    const role = m.role === 'admin' ? 'member' : 'admin';
    this.api.setMemberRole(this.c._id, m.user._id, role).subscribe({ next: () => (m.role = role), error: e => this.toast.error(e) });
  }
  removeMember(m: any): void {
    if (!confirm(`Remove ${m.user.name} from the circle?`)) return;
    this.api.removeMember(this.c._id, m.user._id).subscribe({ next: () => (this.members = this.members.filter(x => x !== m)), error: e => this.toast.error(e) });
  }

  saveSettings(): void {
    this.api.updateCircle(this.c._id, this.edit).subscribe({ next: () => { this.editing = false; this.load(this.c._id); }, error: e => this.toast.error(e) });
  }
  deleteCircle(): void {
    if (!confirm(`Delete ${this.c.name} permanently? Polls, events, posts and chat history will be removed.`)) return;
    this.api.deleteCircle(this.c._id).subscribe({ next: () => this.router.navigate(['/circles']), error: e => this.toast.error(e) });
  }

  openSettings(): void {
    this.edit = { name: this.c.name, description: this.c.description, coverImage: this.c.coverImage, visibility: this.c.visibility };
    this.editing = true;
  }
}
