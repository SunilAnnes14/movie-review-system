import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { AvatarComponent } from '../shared/avatar.component';
import { SpoilerTextComponent } from '../shared/spoiler-text.component';
import { IconComponent } from '../shared/icon.component';
import { TimeAgoPipe, EventDatePipe, LabelPipe } from '../shared/pipes';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-post-card',
  standalone: true,
  imports: [RouterLink, FormsModule, AvatarComponent, SpoilerTextComponent, IconComponent, TimeAgoPipe, EventDatePipe, LabelPipe],
  template: `
  <article class="panel post">
    <header class="row">
      <cv-avatar [user]="post.author" />
      <div class="grow">
        <div class="text-sm">
          <a [routerLink]="['/u', post.author?._id]"><strong>{{ post.author?.name }}</strong></a>
          <span class="text-secondary"> {{ verb }}</span>
          @if (post.movie && post.kind !== 'text') { <a class="text-accent" [routerLink]="['/movies', post.movie._id]"> {{ post.movie.title }}</a> }
          @if (post.circle && showCircle) { <span class="text-muted"> in </span><a [routerLink]="['/circles', post.circle._id]" class="text-secondary">{{ post.circle.name }}</a> }
        </div>
        <div class="text-xs text-muted">{{ post.createdAt | timeAgo }} · {{ post.visibility === 'circle' ? 'Circle' : (post.visibility === 'friends' ? 'Friends' : 'Public') }}</div>
      </div>
      @if (canDelete) { <button class="icon-btn" title="Delete" (click)="remove()"><cv-icon name="trash" [size]="16" /></button> }
    </header>

    <div class="body">
      @if (post.text && post.kind !== 'poll' && post.kind !== 'event') {
        <p class="text"><cv-spoiler-text [text]="post.text" [spoiler]="post.isSpoiler" [movieId]="post.movie?._id" /></p>
      }

      @if (post.kind === 'review' && post.review) {
        <div class="stars-row">@for (i of [1,2,3,4,5]; track i) { <span [class.on]="i <= post.review.rating">★</span> }</div>
        <p class="text"><cv-spoiler-text [text]="post.review.comment" [sentences]="post.review.spoilerSentences" [spoiler]="post.review.containsSpoilers" [movieId]="post.movie?._id" /></p>
      }

      @if (post.movie && post.kind !== 'event') {
        <a class="movie-attach" [routerLink]="['/movies', post.movie._id]">
          <div class="poster-sm" [style.background-image]="post.movie.poster ? 'url(' + post.movie.poster + ')' : ''"></div>
          <div class="grow">
            <strong>{{ post.movie.title }}</strong>
            <div class="text-xs text-muted">{{ post.movie.releaseYear }} · {{ post.movie.director }}</div>
            <div class="text-xs text-secondary">{{ (post.movie.genre || []).join(' · ') }}</div>
          </div>
          @if (post.kind === 'watch_update') { <span class="pill" [class.pill-green]="post.watchStatus === 'watched'">{{ post.watchStatus | label }}</span> }
          @if (post.kind === 'recommendation') { <span class="pill pill-gold">Recommended</span> }
        </a>
      }

      @if (post.kind === 'collection' && post.collectionRef) {
        <div class="movie-attach">
          <div class="grow"><strong>📚 {{ post.collectionRef.name }}</strong><div class="text-xs text-muted">{{ post.collectionRef.movies?.length || 0 }} movies</div></div>
          <div class="row" style="gap:4px">@for (m of (post.collectionRef.movies || []).slice(0, 5); track m._id) { <div class="poster-xs" [style.background-image]="'url(' + m.poster + ')'"></div> }</div>
        </div>
      }

      @if (post.kind === 'poll' && post.poll) {
        <a class="movie-attach" [routerLink]="['/circles', post.circle?._id]" [queryParams]="{ tab: 'polls' }">
          <div class="grow"><strong>🗳️ {{ post.poll.question }}</strong><div class="text-xs text-muted">{{ post.poll.totalVotes }} votes · {{ post.poll.status }}</div></div>
          <span class="btn btn-secondary btn-sm">Vote</span>
        </a>
      }

      @if (post.kind === 'event' && post.event) {
        <a class="movie-attach" [routerLink]="['/events', post.event._id]">
          <div class="poster-sm" [style.background-image]="post.movie?.poster ? 'url(' + post.movie.poster + ')' : ''"></div>
          <div class="grow"><strong>📅 {{ post.event.title }}</strong><div class="text-xs text-secondary">{{ post.event.startsAt | eventDate }}</div>@if (post.event.venue) { <div class="text-xs text-muted">📍 {{ post.event.venue }}</div> }</div>
          <span class="btn btn-secondary btn-sm">RSVP</span>
        </a>
      }
    </div>

    <footer class="row actions">
      <button class="act" [class.liked]="post.likedByMe" (click)="like()"><cv-icon name="heart" [size]="17" /> {{ post.likeCount || '' }}</button>
      <button class="act" (click)="toggleComments()"><cv-icon name="comment" [size]="17" /> {{ post.commentCount || '' }}</button>
    </footer>

    @if (showComments) {
      <div class="comments">
        @for (c of comments; track c._id) {
          <div class="row comment">
            <cv-avatar [user]="c.author" size="sm" />
            <div class="grow">
              <div class="text-sm"><strong>{{ c.author?.name }}</strong> <span class="text-muted text-xs">{{ c.createdAt | timeAgo }}</span></div>
              <div class="text-sm text-secondary"><cv-spoiler-text [text]="c.text" [spoiler]="c.isSpoiler" [movieId]="post.movie?._id" /></div>
            </div>
          </div>
        }
        <div class="input-row mt-1">
          <input class="form-input" placeholder="Write a comment…" [(ngModel)]="commentText" (keyup.enter)="comment()" maxlength="1000" />
          <label class="switch text-xs" title="Mark as spoiler"><input type="checkbox" [(ngModel)]="commentSpoiler" /> Spoiler</label>
          <button class="btn btn-primary btn-sm" [disabled]="!commentText.trim()" (click)="comment()">Post</button>
        </div>
      </div>
    }
  </article>
  `,
  styles: [`
    .post { display: flex; flex-direction: column; gap: 12px; }
    .text { white-space: pre-line; font-size: 0.93rem; line-height: 1.6; }
    .stars-row span { color: #3a3a40; font-size: 1rem; } .stars-row span.on { color: var(--accent); }
    .movie-attach { display: flex; align-items: center; gap: 14px; padding: 10px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color); transition: border-color var(--transition-fast); }
    .movie-attach:hover { border-color: rgba(212,166,74,0.4); }
    .poster-sm { width: 46px; height: 68px; border-radius: 6px; background: var(--bg-tertiary) center/cover; flex-shrink: 0; }
    .poster-xs { width: 28px; height: 42px; border-radius: 3px; background: var(--bg-tertiary) center/cover; }
    .actions { gap: 4px; border-top: 1px solid var(--border-color); padding-top: 8px; }
    .act { display: inline-flex; align-items: center; gap: 6px; background: none; color: var(--text-secondary); padding: 6px 10px; border-radius: 8px; font-size: 0.85rem; }
    .act:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); }
    .act.liked { color: #f472b6; }
    .comments { border-top: 1px solid var(--border-color); padding-top: 10px; display: flex; flex-direction: column; gap: 10px; }
    .comment { align-items: flex-start; }
  `]
})
export class PostCardComponent {
  @Input() post: any;
  @Input() showCircle = true;
  @Output() deleted = new EventEmitter<string>();
  showComments = false;
  comments: any[] = [];
  commentText = '';
  commentSpoiler = false;

  constructor(private api: ApiService, private auth: AuthService, private toast: ToastService) {}

  get verb(): string {
    switch (this.post.kind) {
      case 'review': return 'reviewed';
      case 'watch_update': return this.post.watchStatus === 'watched' ? 'watched' : 'started watching';
      case 'recommendation': return 'recommends';
      case 'collection': return 'shared a collection';
      case 'poll': return 'started a poll';
      case 'event': return 'planned a movie night';
      default: return '';
    }
  }
  get canDelete(): boolean { return this.post.author?._id === this.auth.currentUser?._id || this.auth.isAdmin; }

  like(): void {
    const prev = { liked: this.post.likedByMe, count: this.post.likeCount };
    this.post.likedByMe = !prev.liked;
    this.post.likeCount = prev.count + (prev.liked ? -1 : 1);
    this.api.likePost(this.post._id).subscribe({
      next: r => { this.post.likedByMe = r.liked; this.post.likeCount = r.likeCount; },
      error: e => { this.post.likedByMe = prev.liked; this.post.likeCount = prev.count; this.toast.error(e); }
    });
  }

  toggleComments(): void {
    this.showComments = !this.showComments;
    if (this.showComments) this.api.comments(this.post._id).subscribe({ next: c => (this.comments = c), error: e => this.toast.error(e) });
  }

  comment(): void {
    const text = this.commentText.trim();
    if (!text) return;
    this.api.addComment(this.post._id, text, this.commentSpoiler || undefined).subscribe({
      next: (c: any) => {
        this.comments.push(c); this.post.commentCount++; this.commentText = ''; this.commentSpoiler = false;
        if (c.isSpoiler) this.toast.show('CineSpoiler hid your comment behind a spoiler warning');
      },
      error: e => this.toast.error(e)
    });
  }

  remove(): void {
    if (!confirm('Delete this post?')) return;
    this.api.deletePost(this.post._id).subscribe({ next: () => this.deleted.emit(this.post._id), error: e => this.toast.error(e) });
  }
}
