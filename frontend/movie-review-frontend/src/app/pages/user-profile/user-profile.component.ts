import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { PosterTileComponent } from '../../shared/poster-tile.component';
import { SpoilerTextComponent } from '../../shared/spoiler-text.component';
import { TimeAgoPipe, LabelPipe } from '../../shared/pipes';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-user-profile',
  standalone: true,
  imports: [RouterLink, AvatarComponent, PosterTileComponent, SpoilerTextComponent, TimeAgoPipe, LabelPipe],
  template: `
  @if (loading) { <div class="loading-container"><div class="spinner"></div></div> }
  @if (u) {
    <div class="v2-page">
      <div class="panel profile-head">
        <cv-avatar [user]="u" size="xl" [showPresence]="true" />
        <div class="grow">
          <h1 class="v2-title">{{ u.name }}</h1>
          <p class="text-secondary">{{ u.bio || 'Movie lover' }}</p>
          <p class="text-xs text-muted">{{ u.online ? '● Online' : 'Last seen ' + (u.lastSeen | timeAgo) }}@if (u.createdAt) { · joined {{ u.createdAt | timeAgo }} }</p>
          @if (u.favoriteGenres?.length) { <div class="row-wrap mt-1">@for (g of u.favoriteGenres; track g) { <span class="pill">{{ g }}</span> }</div> }
        </div>
        @if (u.relationship.friend !== 'self') {
          <div class="stack actions">
            @if (u.tasteMatch !== null && u.tasteMatch !== undefined) { <span class="pill pill-gold">🧬 {{ u.tasteMatch }}% taste match</span> }
            @switch (u.relationship.friend) {
              @case ('friends') { <button class="btn btn-secondary btn-sm" (click)="message()">💬 Message</button><button class="btn btn-danger btn-sm" (click)="unfriend()">Unfriend</button> }
              @case ('request_sent') { <button class="btn btn-outline btn-sm" (click)="unfriend()">Cancel request</button> }
              @case ('request_received') { <button class="btn btn-primary btn-sm" (click)="accept()">Accept friend request</button> }
              @default { <button class="btn btn-primary btn-sm" (click)="addFriend()">+ Add friend</button> }
            }
            <button class="btn btn-sm" [class.btn-secondary]="u.relationship.following" [class.btn-outline]="!u.relationship.following" (click)="toggleFollow()">{{ u.relationship.following ? 'Following' : 'Follow' }}</button>
          </div>
        } @else { <a routerLink="/profile" class="btn btn-secondary btn-sm">Edit profile</a> }
      </div>

      @if (u.restricted) {
        <div class="state"><div class="icon">🔒</div><h3>This profile is private</h3><p>{{ u.name }} only shares their profile with friends.</p></div>
      } @else {
        <div class="stat-grid mt-2">
          <div class="stat"><div class="value">{{ u.stats.watchedCount }}</div><div class="label">Watched</div></div>
          <div class="stat"><div class="value">{{ u.stats.reviewCount }}</div><div class="label">Reviews</div></div>
          <div class="stat"><div class="value">{{ u.stats.friendsCount }}</div><div class="label">Friends</div></div>
          <div class="stat"><div class="value">{{ u.stats.followers }}</div><div class="label">Followers</div></div>
          <div class="stat"><div class="value">{{ u.stats.circles }}</div><div class="label">Circles</div></div>
        </div>

        @if (!u.libraryVisible) {
          <div class="info-box mt-3">🔒 {{ u.name }}'s library and reviews are {{ u.relationship.friend === 'friends' ? 'private' : 'visible to friends only' }}.</div>
        } @else {
          <div class="tabs mt-3">
            <button class="tab" [class.active]="tab === 'library'" (click)="tab = 'library'">Library</button>
            <button class="tab" [class.active]="tab === 'reviews'" (click)="tab = 'reviews'">Reviews</button>
            <button class="tab" [class.active]="tab === 'collections'" (click)="tab = 'collections'">Collections</button>
          </div>
          @if (tab === 'library') {
            <div class="poster-grid">@for (e of library; track e._id) { @if (e.movieId) { <cv-poster [movie]="e.movieId" [sub]="e.status | label" /> } }</div>
            @if (!library.length) { <p class="text-muted text-sm">No movies yet.</p> }
          }
          @if (tab === 'reviews') {
            <div class="stack">
              @for (r of reviews; track r._id) {
                <div class="panel panel-tight row" style="align-items:flex-start">
                  <div class="mini" [style.background-image]="r.movieId?.poster ? 'url(' + r.movieId.poster + ')' : ''"></div>
                  <div class="grow">
                    <div class="row between"><a [routerLink]="['/movies', r.movieId?._id]"><strong>{{ r.movieId?.title }}</strong></a><span class="pill pill-gold">★ {{ r.rating }}</span></div>
                    <p class="text-sm text-secondary mt-1"><cv-spoiler-text [text]="r.comment" [sentences]="r.spoilerSentences" [spoiler]="r.containsSpoilers" [movieId]="r.movieId?._id" /></p>
                    <p class="text-xs text-muted">{{ r.createdAt | timeAgo }}</p>
                  </div>
                </div>
              } @empty { <p class="text-muted text-sm">No reviews yet.</p> }
            </div>
          }
          @if (tab === 'collections') {
            @for (c of collections; track c._id) {
              <div class="panel mb-2"><h3>{{ c.name }}</h3>@if (c.description) { <p class="text-sm text-secondary">{{ c.description }}</p> }
                <div class="poster-row mt-2">@for (m of c.movies; track m._id) { <cv-poster [movie]="m" /> }</div></div>
            } @empty { <p class="text-muted text-sm">No collections shared.</p> }
          }
        }
      }
    </div>
  }
  `,
  styles: [`
    .profile-head { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
    .actions { gap: 8px; align-items: stretch; min-width: 180px; }
    .mini { width: 52px; height: 78px; border-radius: 6px; background: var(--bg-tertiary) center/cover; flex-shrink: 0; }
  `]
})
export class UserProfileComponent implements OnInit {
  u: any = null;
  loading = true;
  tab = 'library';
  library: any[] = [];
  reviews: any[] = [];
  collections: any[] = [];

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService, private auth: AuthService, private toast: ToastService) {}

  ngOnInit(): void { this.route.paramMap.subscribe(p => this.load(p.get('id')!)); }

  load(id: string): void {
    this.loading = true;
    this.api.user(id).subscribe({
      next: u => {
        this.u = u; this.loading = false;
        if (u.libraryVisible) {
          this.api.userLibrary(id).subscribe({ next: l => (this.library = l), error: () => {} });
          this.api.userReviews(id).subscribe({ next: r => (this.reviews = r), error: () => {} });
        }
        if (!u.restricted) this.api.userCollections(id).subscribe({ next: c => (this.collections = c), error: () => {} });
      },
      error: e => { this.loading = false; this.toast.error(e); this.router.navigate(['/people']); }
    });
  }

  private reload(): void { this.load(this.u._id); }
  addFriend(): void { this.api.sendFriendRequest(this.u._id).subscribe({ next: () => { this.toast.success('Friend request sent'); this.reload(); }, error: e => this.toast.error(e) }); }
  accept(): void { this.api.respondFriendRequest(this.u.relationship.requestId, 'accept').subscribe({ next: () => this.reload(), error: e => this.toast.error(e) }); }
  unfriend(): void { if (confirm('Are you sure?')) this.api.removeFriend(this.u._id).subscribe({ next: () => this.reload(), error: e => this.toast.error(e) }); }
  toggleFollow(): void {
    const obs = this.u.relationship.following ? this.api.unfollow(this.u._id) : this.api.follow(this.u._id);
    obs.subscribe({ next: (r: any) => (this.u.relationship.following = r.following), error: e => this.toast.error(e) });
  }
  message(): void { this.api.startDirect(this.u._id).subscribe({ next: r => this.router.navigate(['/chat', r._id]), error: e => this.toast.error(e) }); }
}
