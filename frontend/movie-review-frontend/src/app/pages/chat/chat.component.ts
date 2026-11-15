import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { ToastService } from '../../services/toast.service';
import { ChatWindowComponent } from '../../components/chat-window.component';
import { AvatarComponent } from '../../shared/avatar.component';
import { TimeAgoPipe } from '../../shared/pipes';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-chat',
  standalone: true,
  imports: [RouterLink, ChatWindowComponent, AvatarComponent, TimeAgoPipe],
  template: `
  <div class="chat-page" [class.has-active]="!!activeId">
    <aside class="convs">
      <div class="convs-head">
        <h2>CineChat</h2>
        <button class="btn btn-secondary btn-sm" (click)="showNew = !showNew">+ New</button>
      </div>
      @if (showNew) {
        <div class="new-list">
          <p class="text-xs text-muted">Message a friend</p>
          @for (f of friends; track f._id) {
            <button class="conv" (click)="startDirect(f)"><cv-avatar [user]="f" size="sm" [showPresence]="true" /><span class="grow truncate">{{ f.name }}</span></button>
          } @empty { <p class="text-sm text-muted">No friends yet. <a routerLink="/people" class="link">Find people</a></p> }
        </div>
      }
      @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }
      @for (c of conversations; track c._id) {
        <button class="conv" [class.active]="c._id === activeId" (click)="open(c)">
          @if (c.type === 'circle') { <span class="circle-icon">🎟️</span> }
          @else { <cv-avatar [user]="other(c)" [showPresence]="true" /> }
          <span class="grow" style="min-width:0">
            <span class="row between"><strong class="truncate">{{ c.title }}</strong><span class="text-xs text-muted">{{ c.lastMessageAt | timeAgo }}</span></span>
            <span class="row between"><span class="text-xs text-secondary truncate">{{ c.lastMessagePreview || 'No messages yet' }}</span>
            @if (c.unread) { <span class="nav-badge">{{ c.unread }}</span> }</span>
          </span>
        </button>
      } @empty {
        @if (!loading) { <div class="state"><div class="icon">💬</div><p>Start a chat with a friend or join a CineCircle to get a group chat.</p></div> }
      }
    </aside>

    <section class="window">
      @if (active) {
        <header class="win-head row">
          <button class="icon-btn back" (click)="back()">←</button>
          @if (active.type === 'circle') {
            <span class="circle-icon">🎟️</span>
            <div class="grow"><a [routerLink]="['/circles', active.circle]"><strong>{{ active.title }}</strong></a><div class="text-xs text-muted">{{ active.participants.length }} members · {{ onlineCount(active) }} online</div></div>
          } @else {
            <cv-avatar [user]="other(active)" [showPresence]="true" />
            <div class="grow"><a [routerLink]="['/u', other(active)?._id]"><strong>{{ active.title }}</strong></a><div class="text-xs text-muted">{{ isOnline(other(active)) ? 'Online' : 'Last seen ' + (other(active)?.lastSeen | timeAgo) }}</div></div>
          }
        </header>
        <cv-chat-window [conversationId]="active._id" />
      } @else {
        <div class="state" style="margin:auto"><div class="icon">🎬</div><h3>Pick a conversation</h3><p>Messages are private to their participants and update in real time.</p></div>
      }
    </section>
  </div>
  `,
  styles: [`
    .chat-page { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 65px); border-bottom: 1px solid var(--border-color); }
    .convs { border-right: 1px solid var(--border-color); overflow-y: auto; padding: 16px 10px; background: var(--bg-secondary); }
    .convs-head { display: flex; justify-content: space-between; align-items: center; padding: 0 6px 12px; }
    .convs-head h2 { font-size: 1.3rem; }
    .new-list { padding: 8px; margin-bottom: 8px; border: 1px dashed var(--border-hover); border-radius: var(--radius-md); }
    .conv { width: 100%; display: flex; gap: 12px; align-items: center; text-align: left; padding: 10px; border-radius: var(--radius-md); background: none; color: inherit; }
    .conv:hover { background: rgba(255,255,255,0.04); }
    .conv.active { background: var(--accent-soft); }
    .circle-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--bg-tertiary); display: grid; place-items: center; flex-shrink: 0; border: 1px solid rgba(212,166,74,0.3); }
    .window { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    .win-head { padding: 12px 16px; border-bottom: 1px solid var(--border-color); }
    .back { display: none; }
    cv-chat-window { flex: 1; min-height: 0; }
    @media (max-width: 760px) {
      .chat-page { grid-template-columns: 1fr; height: calc(100vh - 61px); }
      .chat-page.has-active .convs { display: none; }
      .chat-page:not(.has-active) .window { display: none; }
      .back { display: inline-flex; }
    }
  `]
})
export class ChatComponent implements OnInit, OnDestroy {
  conversations: any[] = [];
  friends: any[] = [];
  loading = true;
  activeId: string | null = null;
  showNew = false;
  private subs: Subscription[] = [];

  constructor(private api: ApiService, private auth: AuthService, private rt: RealtimeService, private toast: ToastService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => { this.activeId = p.get('id'); this.clearUnread(); });
    this.load();
    this.api.friends().subscribe({ next: f => (this.friends = f), error: () => {} });
    this.subs.push(this.rt.on('message:new').subscribe(({ conversationId, message }) => {
      const c = this.conversations.find(x => x._id === conversationId);
      if (!c) { this.load(); return; }
      c.lastMessageAt = message.createdAt;
      c.lastMessagePreview = message.isSpoiler ? '⚠️ Spoiler' : (message.text || '🎬 Shared a movie');
      if (conversationId !== this.activeId && message.sender?._id !== this.auth.currentUser?._id) c.unread = (c.unread || 0) + 1;
      this.conversations = [c, ...this.conversations.filter(x => x !== c)];
    }));
  }
  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  load(): void {
    this.api.conversations().subscribe({
      next: c => { this.conversations = c; this.loading = false; this.clearUnread(); },
      error: e => { this.loading = false; this.toast.error(e); }
    });
  }

  get active(): any { return this.conversations.find(c => c._id === this.activeId); }
  other(c: any): any { return c?.participants?.find((p: any) => p._id !== this.auth.currentUser?._id) || c?.participants?.[0]; }
  isOnline(u: any): boolean { return !!u && (this.rt.onlineUsers.has(u._id) || u.online); }
  onlineCount(c: any): number { return c.participants.filter((p: any) => this.isOnline(p)).length; }
  private clearUnread(): void { const c = this.active; if (c) c.unread = 0; }

  open(c: any): void { this.router.navigate(['/chat', c._id]); }
  back(): void { this.router.navigate(['/chat']); }

  startDirect(f: any): void {
    this.api.startDirect(f._id).subscribe({
      next: r => { this.showNew = false; if (!this.conversations.some(c => c._id === r._id)) this.load(); this.router.navigate(['/chat', r._id]); },
      error: e => this.toast.error(e)
    });
  }
}
