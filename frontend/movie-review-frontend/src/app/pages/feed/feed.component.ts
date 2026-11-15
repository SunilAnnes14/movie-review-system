import { Component, Input, OnChanges, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { PostCardComponent } from '../../components/post-card.component';
import { AvatarComponent } from '../../shared/avatar.component';
import { MoviePickerComponent } from '../../shared/movie-picker.component';

/** CineFeed. Also embedded in CineCircle with [circleId]. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-feed',
  standalone: true,
  imports: [RouterLink, FormsModule, PostCardComponent, AvatarComponent, MoviePickerComponent],
  template: `
  <div [class.v2-page]="!circleId" [style.max-width]="circleId ? null : '780px'">
    @if (!circleId) {
      <div class="v2-header">
        <div>
          <p class="v2-eyebrow">CineFeed</p>
          <h1 class="v2-title">What your people are watching</h1>
          <p class="v2-subtitle">Reviews, recommendations and movie-night plans from friends, people you follow and your circles.</p>
        </div>
      </div>
    }

    <div class="panel composer">
      <div class="row" style="align-items:flex-start">
        <cv-avatar [user]="auth.currentUser" />
        <textarea class="form-textarea grow" rows="2" maxlength="3000" [(ngModel)]="text" [placeholder]="kind === 'recommendation' ? 'Why should people watch it?' : 'Share a thought about a movie…'"></textarea>
      </div>
      @if (movie) {
        <div class="row attach mt-1">
          <span class="pill pill-gold">🎬 {{ movie.title }}</span>
          <a class="link text-xs" (click)="movie = null; kind = 'text'">remove</a>
        </div>
      }
      <div class="row between mt-1 wrap">
        <div class="row-wrap">
          <button class="chip" [class.active]="kind === 'text'" (click)="kind = 'text'">💬 Post</button>
          <button class="chip" [class.active]="kind === 'recommendation'" (click)="kind = 'recommendation'; !movie && (picker = true)">⭐ Recommend</button>
          <button class="chip" (click)="picker = true">🎬 Attach movie</button>
          <label class="switch text-xs"><input type="checkbox" [(ngModel)]="spoiler" /> Contains spoilers</label>
        </div>
        <div class="row">
          @if (!circleId) {
            <select class="form-select" [(ngModel)]="visibility" style="width:auto;padding:6px 10px;font-size:.8rem">
              <option value="public">Public</option><option value="friends">Friends</option>
            </select>
          }
          <button class="btn btn-primary btn-sm" [disabled]="posting || (!text.trim() && !movie) || (kind === 'recommendation' && !movie)" (click)="publish()">Share</button>
        </div>
      </div>
    </div>

    @if (!circleId) {
      <div class="tabs mt-3">
        @for (t of tabs; track t.id) { <button class="tab" [class.active]="tab === t.id" (click)="setTab(t.id)">{{ t.label }}</button> }
      </div>
    }

    <div class="stack" [class.mt-3]="circleId">
      @for (p of posts; track p._id) {
        <cv-post-card [post]="p" [showCircle]="!circleId" (deleted)="posts = posts.filter(x => x._id !== $event)" />
      }
    </div>

    @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }
    @if (error) { <div class="error-box mt-2">{{ error }} <a class="link" (click)="load(true)">Retry</a></div> }
    @if (!loading && !posts.length && !error) {
      <div class="state">
        <div class="icon">📰</div>
        <h3>Your feed is quiet</h3>
        <p>{{ circleId ? 'Be the first to post in this circle.' : 'Add friends, follow people or join a CineCircle to fill your feed. Your own reviews and watch updates appear here too.' }}</p>
        @if (!circleId) { <div class="row" style="justify-content:center"><a routerLink="/people" class="btn btn-secondary btn-sm">Find friends</a><a routerLink="/circles" class="btn btn-secondary btn-sm">Browse circles</a></div> }
      </div>
    }
    @if (hasMore && !loading) { <div class="row mt-2" style="justify-content:center"><button class="btn btn-secondary" (click)="load()">Load more</button></div> }

    @if (picker) { <cv-movie-picker title="Attach a movie" (picked)="movie = $event; picker = false" (close)="picker = false" /> }
  </div>
  `,
  styles: [`.composer textarea { resize: vertical; min-height: 56px; } .wrap { flex-wrap: wrap; gap: 10px; }`]
})
export class FeedComponent implements OnInit, OnChanges {
  @Input() circleId?: string;
  tabs = [{ id: 'all', label: 'For you' }, { id: 'friends', label: 'Friends' }, { id: 'circles', label: 'Circles' }, { id: 'popular', label: 'Popular' }, { id: 'mine', label: 'My posts' }];
  tab = 'all';
  posts: any[] = [];
  loading = false;
  hasMore = false;
  error = '';
  text = '';
  kind: 'text' | 'recommendation' = 'text';
  movie: any = null;
  spoiler = false;
  visibility = 'public';
  picker = false;
  posting = false;

  constructor(private api: ApiService, public auth: AuthService, private toast: ToastService) {}

  ngOnInit(): void { if (!this.circleId) this.load(true); }
  ngOnChanges(): void { if (this.circleId) this.load(true); }

  setTab(t: string): void { this.tab = t; this.load(true); }

  load(reset = false): void {
    if (reset) { this.posts = []; this.hasMore = false; }
    this.loading = true; this.error = '';
    const before = !reset && this.posts.length ? this.posts[this.posts.length - 1].createdAt : undefined;
    this.api.feed({ tab: this.tab, circle: this.circleId, before }).subscribe({
      next: r => { this.posts = [...this.posts, ...r.posts]; this.hasMore = r.hasMore && this.tab !== 'popular'; this.loading = false; },
      error: e => { this.loading = false; this.error = e.error?.message || 'Could not load the feed'; }
    });
  }

  publish(): void {
    this.posting = true;
    this.api.createPost({
      text: this.text, kind: this.kind, movieId: this.movie?._id, visibility: this.visibility,
      circleId: this.circleId, isSpoiler: this.spoiler ? true : undefined
    }).subscribe({
      next: (p: any) => {
        this.posts = [p, ...this.posts];
        if (p.isSpoiler && !this.spoiler) this.toast.show('CineSpoiler detected a possible spoiler', { body: 'Your post is hidden behind a click-to-reveal warning.' });
        this.text = ''; this.movie = null; this.kind = 'text'; this.spoiler = false; this.posting = false;
      },
      error: e => { this.posting = false; this.toast.error(e); }
    });
  }
}
