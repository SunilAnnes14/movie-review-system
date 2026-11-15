import { AfterViewChecked, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { RealtimeService } from '../services/realtime.service';
import { ToastService } from '../services/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { SpoilerTextComponent } from '../shared/spoiler-text.component';
import { IconComponent } from '../shared/icon.component';
import { MoviePickerComponent } from '../shared/movie-picker.component';
import { TimeAgoPipe } from '../shared/pipes';

const REACTIONS = ['🍿', '❤️', '😂', '😮', '👍', '🔥'];

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-chat-window',
  standalone: true,
  imports: [RouterLink, FormsModule, AvatarComponent, SpoilerTextComponent, IconComponent, MoviePickerComponent, TimeAgoPipe],
  template: `
  <div class="chat">
    <div class="messages" #scroller (scroll)="onScroll()">
      @if (hasMore) { <div class="row" style="justify-content:center"><button class="btn btn-secondary btn-sm" (click)="loadOlder()">Load earlier messages</button></div> }
      @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }
      @if (!loading && !messages.length) { <div class="state"><div class="icon">💬</div><p>No messages yet. Say hi, or share a movie!</p></div> }

      @for (m of messages; track m._id; let i = $index) {
        @if (showDay(i)) { <div class="day">{{ dayLabel(m.createdAt) }}</div> }
        @if (m.kind === 'system') {
          <div class="bubble system">{{ m.text }}</div>
        } @else {
          <div class="msg" [class.mine]="isMine(m)" [class.grouped]="grouped(i)">
            @if (!isMine(m)) { <div class="av">@if (!grouped(i)) { <cv-avatar [user]="m.sender" size="sm" /> }</div> }
            <div class="col">
              @if (!isMine(m) && !grouped(i)) { <div class="sender">{{ m.sender?.name }}</div> }
              <div class="bubble" [class.mine]="isMine(m)">
                @if (m.replyTo) {
                  <div class="reply-quote">↩ <strong>{{ m.replyTo.sender?.name }}</strong>: {{ m.replyTo.isSpoiler ? '⚠️ spoiler' : (m.replyTo.text || 'a movie') }}</div>
                }
                @if (m.text) { <cv-spoiler-text [text]="m.text" [spoiler]="m.isSpoiler" [movieId]="m.movie?._id" /> }
                @if (m.isSpoiler && m.spoilerMarkedBy === 'auto') { <div class="text-xs text-muted mt-1">🛡️ Auto-hidden by CineSpoiler</div> }
                @if (m.movie) {
                  <a class="movie-card-mini" [routerLink]="['/movies', m.movie._id]">
                    <div class="p" [style.background-image]="m.movie.poster ? 'url(' + m.movie.poster + ')' : ''"></div>
                    <div class="grow"><strong>{{ m.movie.title }}</strong><div class="text-xs text-muted">{{ m.movie.releaseYear }} · {{ (m.movie.genre || []).slice(0,2).join(', ') }}</div>
                    @if (m.kind === 'recommendation') { <span class="pill pill-gold mt-1">Recommended</span> }</div>
                  </a>
                }
                @if (m.review) {
                  <a class="movie-card-mini" [routerLink]="['/movies', m.review.movieId?._id]">
                    <div class="grow"><div class="text-xs text-muted">Review of {{ m.review.movieId?.title }} by {{ m.review.userId?.name }}</div><span class="text-accent">{{ '★'.repeat(m.review.rating) }}</span>
                    <div class="text-sm"><cv-spoiler-text [text]="m.review.comment" [sentences]="m.review.spoilerSentences" [spoiler]="m.review.containsSpoilers" [movieId]="m.review.movieId?._id" /></div></div>
                  </a>
                }
                <div class="tools">
                  <button title="Reply" (click)="replyTo = m"><cv-icon name="reply" [size]="14" /></button>
                  <button title="React" (click)="pickerFor = pickerFor === m._id ? null : m._id"><cv-icon name="smile" [size]="14" /></button>
                </div>
                @if (pickerFor === m._id) {
                  <div class="react-picker">@for (e of reactions; track e) { <button (click)="react(m, e)">{{ e }}</button> }</div>
                }
              </div>
              @if (m.reactions?.length) {
                <div class="reactions">
                  @for (r of groupReactions(m); track r.emoji) { <button class="rx" [class.mine]="r.mine" (click)="react(m, r.emoji)">{{ r.emoji }} {{ r.count }}</button> }
                </div>
              }
              <div class="time">{{ m.createdAt | timeAgo }}</div>
            </div>
          </div>
        }
      }
    </div>

    @if (typingNames.length) { <div class="typing">{{ typingNames.join(', ') }} {{ typingNames.length > 1 ? 'are' : 'is' }} typing<span class="dots">…</span></div> }

    <div class="composer">
      @if (replyTo) {
        <div class="row reply-bar"><span class="grow truncate text-xs">Replying to <strong>{{ replyTo.sender?.name }}</strong>: {{ replyTo.text || 'movie' }}</span><button class="icon-btn" (click)="replyTo = null"><cv-icon name="close" [size]="14" /></button></div>
      }
      @if (attach) {
        <div class="row reply-bar"><span class="grow text-xs">🎬 Sharing <strong>{{ attach.title }}</strong></span>
          <label class="switch text-xs"><input type="checkbox" [(ngModel)]="asRecommendation" /> as recommendation</label>
          <button class="icon-btn" (click)="attach = null"><cv-icon name="close" [size]="14" /></button></div>
      }
      <div class="row">
        <button class="icon-btn" title="Share a movie" (click)="moviePicker = true"><cv-icon name="film" /></button>
        <input class="form-input grow" [(ngModel)]="text" (ngModelChange)="onTyping()" (keydown.enter)="send()" placeholder="Message…" maxlength="4000" />
        <label class="switch text-xs" title="Hide this message behind a spoiler warning"><input type="checkbox" [(ngModel)]="spoiler" /> <span class="hidden-mobile">Spoiler</span></label>
        <button class="btn btn-primary" [disabled]="sending || (!text.trim() && !attach)" (click)="send()"><cv-icon name="send" [size]="16" /></button>
      </div>
    </div>

    @if (moviePicker) { <cv-movie-picker title="Share a movie" (picked)="attach = $event; moviePicker = false" (close)="moviePicker = false" /> }
  </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; }
    .chat { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
    .day { text-align: center; font-size: 0.72rem; color: var(--text-muted); margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .08em; }
    .msg { display: flex; gap: 8px; align-items: flex-end; margin-top: 10px; }
    .msg.grouped { margin-top: 2px; }
    .msg.mine { justify-content: flex-end; }
    .av { width: 28px; flex-shrink: 0; }
    .col { display: flex; flex-direction: column; max-width: 78%; min-width: 0; }
    .msg.mine .col { align-items: flex-end; }
    .sender { font-size: 0.72rem; color: var(--text-muted); margin: 0 0 3px 4px; }
    .bubble { max-width: 100%; }
    .bubble .tools { position: absolute; top: -14px; right: 6px; display: none; gap: 2px; background: var(--bg-secondary); border: 1px solid var(--border-hover); border-radius: 8px; padding: 2px; }
    .bubble:hover .tools { display: flex; }
    .tools button { background: none; color: var(--text-secondary); padding: 4px; border-radius: 6px; display: inline-flex; }
    .tools button:hover { color: var(--accent); background: rgba(255,255,255,0.05); }
    .react-picker { position: absolute; top: -44px; right: 0; z-index: 5; display: flex; gap: 2px; background: var(--bg-secondary); border: 1px solid var(--border-hover); border-radius: 999px; padding: 4px 6px; box-shadow: var(--shadow-md); }
    .react-picker button { background: none; font-size: 1.15rem; padding: 2px 4px; border-radius: 6px; } .react-picker button:hover { transform: scale(1.2); }
    .reactions { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
    .rx { background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; }
    .rx.mine { border-color: var(--accent); color: var(--accent); }
    .time { font-size: 0.65rem; color: var(--text-muted); margin: 2px 4px 0; }
    .reply-quote { font-size: 0.75rem; color: var(--text-muted); border-left: 2px solid var(--accent); padding-left: 8px; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px; }
    .movie-card-mini { display: flex; gap: 10px; align-items: center; margin-top: 8px; padding: 8px; border-radius: 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); min-width: 220px; }
    .movie-card-mini .p { width: 40px; height: 60px; border-radius: 5px; background: var(--bg-tertiary) center/cover; flex-shrink: 0; }
    .typing { font-size: 0.75rem; color: var(--accent); padding: 0 18px 6px; font-style: italic; }
    .composer { border-top: 1px solid var(--border-color); padding: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); }
    .reply-bar { background: var(--bg-tertiary); border-radius: 8px; padding: 4px 4px 4px 10px; }
  `]
})
export class ChatWindowComponent implements OnChanges, OnDestroy, AfterViewChecked {
  @Input({ required: true }) conversationId!: string;
  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  messages: any[] = [];
  loading = false;
  hasMore = false;
  text = '';
  spoiler = false;
  sending = false;
  replyTo: any = null;
  attach: any = null;
  asRecommendation = false;
  moviePicker = false;
  pickerFor: string | null = null;
  reactions = REACTIONS;
  typingUsers = new Map<string, { name: string; at: number }>();
  private subs: Subscription[] = [];
  private stickToBottom = true;
  private scrollPending = false;
  private typingTimer: any;
  private amTyping = false;
  private current = '';

  constructor(private api: ApiService, private auth: AuthService, private rt: RealtimeService, private toast: ToastService) {}

  ngOnChanges(): void {
    if (this.current === this.conversationId) return;
    this.teardown();
    this.current = this.conversationId;
    this.messages = []; this.replyTo = null; this.attach = null; this.typingUsers.clear();
    this.loading = true;
    this.rt.joinConversation(this.conversationId);
    this.api.messages(this.conversationId).subscribe({
      next: r => { this.messages = r.messages; this.hasMore = r.hasMore; this.loading = false; this.scrollSoon(); this.markRead(); },
      error: e => { this.loading = false; this.toast.error(e); }
    });

    this.subs.push(
      this.rt.on('message:new').subscribe(({ conversationId, message }) => {
        if (conversationId !== this.conversationId || this.messages.some(m => m._id === message._id)) return;
        this.messages.push(message);
        this.typingUsers.delete(message.sender?._id);
        if (this.stickToBottom || this.isMine(message)) this.scrollSoon();
        if (!this.isMine(message)) this.markRead();
      }),
      this.rt.on('message:reaction').subscribe(({ conversationId, messageId, reactions }) => {
        if (conversationId !== this.conversationId) return;
        const m = this.messages.find(x => x._id === messageId);
        if (m) m.reactions = reactions;
      }),
      this.rt.on('typing').subscribe(({ conversationId, userId, name, typing }) => {
        if (conversationId !== this.conversationId) return;
        typing ? this.typingUsers.set(userId, { name, at: Date.now() }) : this.typingUsers.delete(userId);
      })
    );
  }

  ngAfterViewChecked(): void {
    if (this.scrollPending && this.scroller) {
      this.scroller.nativeElement.scrollTop = this.scroller.nativeElement.scrollHeight;
      this.scrollPending = false;
    }
  }

  ngOnDestroy(): void { this.teardown(); }

  private teardown(): void {
    if (this.current) { this.stopTyping(); this.rt.leaveConversation(this.current); }
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];
  }

  get typingNames(): string[] {
    const now = Date.now();
    return [...this.typingUsers.values()].filter(t => now - t.at < 6000).map(t => t.name);
  }

  isMine(m: any): boolean { return m.sender?._id === this.auth.currentUser?._id; }
  grouped(i: number): boolean {
    const a = this.messages[i - 1], b = this.messages[i];
    return !!a && a.kind !== 'system' && a.sender?._id === b.sender?._id && new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < 5 * 60000 && !this.showDay(i);
  }
  showDay(i: number): boolean {
    if (i === 0) return true;
    return new Date(this.messages[i - 1].createdAt).toDateString() !== new Date(this.messages[i].createdAt).toDateString();
  }
  dayLabel(d: string): string {
    const date = new Date(d), today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === y.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  groupReactions(m: any): { emoji: string; count: number; mine: boolean }[] {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of m.reactions || []) {
      const g = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      g.count++;
      if (String(r.user) === this.auth.currentUser?._id) g.mine = true;
      map.set(r.emoji, g);
    }
    return [...map.values()];
  }

  onScroll(): void {
    const el = this.scroller?.nativeElement;
    if (el) this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  private scrollSoon(): void { this.scrollPending = true; }

  loadOlder(): void {
    const first = this.messages[0];
    if (!first) return;
    const el = this.scroller?.nativeElement;
    const prevHeight = el?.scrollHeight || 0;
    this.api.messages(this.conversationId, first.createdAt).subscribe(r => {
      this.messages = [...r.messages, ...this.messages];
      this.hasMore = r.hasMore;
      setTimeout(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    });
  }

  private markRead(): void { this.api.markRead(this.conversationId).subscribe({ error: () => {} }); }

  onTyping(): void {
    if (!this.amTyping) { this.amTyping = true; this.rt.typing(this.conversationId, true); }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), 2500);
  }
  private stopTyping(): void {
    clearTimeout(this.typingTimer);
    if (this.amTyping) { this.amTyping = false; this.rt.typing(this.conversationId, false); }
  }

  send(): void {
    const text = this.text.trim();
    if (this.sending || (!text && !this.attach)) return;
    this.sending = true;
    this.stopTyping();
    this.api.sendMessage(this.conversationId, {
      text,
      kind: this.attach ? (this.asRecommendation ? 'recommendation' : 'movie') : 'text',
      movieId: this.attach?._id,
      replyTo: this.replyTo?._id,
      isSpoiler: this.spoiler ? true : undefined
    }).subscribe({
      next: (m: any) => {
        if (!this.messages.some(x => x._id === m._id)) this.messages.push(m);
        if (m.isSpoiler && !this.spoiler) this.toast.show('CineSpoiler hid your message', { body: 'It looked like a plot reveal. Others can click to reveal it.' });
        this.text = ''; this.spoiler = false; this.replyTo = null; this.attach = null; this.asRecommendation = false; this.sending = false;
        this.scrollSoon();
      },
      error: e => { this.sending = false; this.toast.error(e); }
    });
  }

  react(m: any, emoji: string): void {
    this.pickerFor = null;
    this.api.react(m._id, emoji).subscribe({ next: (r: any) => (m.reactions = r.reactions), error: e => this.toast.error(e) });
  }
}
