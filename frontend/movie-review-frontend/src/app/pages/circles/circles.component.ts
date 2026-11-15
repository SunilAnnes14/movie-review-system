import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { ImageUploadComponent } from '../../shared/image-upload.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-circles',
  standalone: true,
  imports: [RouterLink, FormsModule, AvatarComponent, ImageUploadComponent],
  template: `
  <div class="v2-page">
    <div class="v2-header">
      <div>
        <p class="v2-eyebrow">CineCircle</p>
        <h1 class="v2-title">Your movie communities</h1>
        <p class="v2-subtitle">Group chats, polls, movie nights and a shared watchlist — for your film club, your friends or the whole internet.</p>
      </div>
      <button class="btn btn-primary" (click)="openCreate()">+ Create a circle</button>
    </div>

    @if (invites.length) {
      <div class="panel panel-gold mb-3">
        <h3>📨 Invitations</h3>
        @for (c of invites; track c._id) {
          <div class="list-row">
            <div class="cover-sm" [style.background-image]="c.coverImage ? 'url(' + c.coverImage + ')' : ''"></div>
            <div class="grow"><div class="title">{{ c.name }}</div><div class="meta">{{ c.memberCount }} members · {{ c.visibility }}</div></div>
            <button class="btn btn-primary btn-sm" (click)="accept(c)">Join</button>
            <button class="btn btn-outline btn-sm" (click)="decline(c)">Decline</button>
          </div>
        }
      </div>
    }

    <div class="section-head"><h2>My circles</h2></div>
    @if (loading) { <div class="grid-auto">@for (i of [1,2,3]; track i) { <div class="skeleton" style="height:210px"></div> }</div> }
    @if (!loading && !mine.length) {
      <div class="state"><div class="icon">🎟️</div><h3>No circles yet</h3><p>Create one for your friends — e.g. “Weekend Movie Club” — or join a public circle below.</p></div>
    }
    <div class="grid-auto">
      @for (c of mine; track c._id) {
        <a class="panel panel-tight hover-lift card" [routerLink]="['/circles', c._id]">
          <div class="cover" [style.background-image]="c.coverImage ? 'url(' + c.coverImage + ')' : ''"><span class="pill">{{ c.visibility === 'private' ? '🔒 Private' : '🌐 Public' }}</span></div>
          <h3>{{ c.name }}</h3>
          <p class="text-secondary text-sm clamp-2">{{ c.description || 'No description yet' }}</p>
          <div class="row between mt-1"><span class="text-xs text-muted">{{ c.memberCount }} members</span><span class="pill pill-gold">{{ c.membership?.role }}</span></div>
        </a>
      }
    </div>

    <div class="section-head"><h2>Discover public circles</h2>
      <input class="form-input" style="max-width:260px;padding:8px 12px" placeholder="Search circles…" [(ngModel)]="q" (keyup.enter)="loadDiscover()" />
    </div>
    <div class="grid-auto">
      @for (c of discover; track c._id) {
        <div class="panel panel-tight card">
          <a [routerLink]="['/circles', c._id]"><div class="cover" [style.background-image]="c.coverImage ? 'url(' + c.coverImage + ')' : ''"></div><h3>{{ c.name }}</h3></a>
          <p class="text-secondary text-sm clamp-2">{{ c.description || 'A movie community' }}</p>
          <div class="row between mt-1">
            <span class="text-xs text-muted">{{ c.memberCount }} members</span>
            @if (c.membership?.status === 'active') { <span class="pill pill-green">Joined</span> }
            @else { <button class="btn btn-primary btn-sm" (click)="join(c)">Join</button> }
          </div>
        </div>
      } @empty { <p class="text-muted text-sm">No public circles found.</p> }
    </div>

    @if (showCreate) {
      <div class="modal-backdrop" (click)="showCreate = false">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>Create a CineCircle</h2>
          <div class="form-group"><label class="form-label">Name</label><input class="form-input" [(ngModel)]="form.name" maxlength="80" placeholder="Weekend Movie Club" /></div>
          <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" rows="3" [(ngModel)]="form.description" maxlength="1000" placeholder="What does your circle watch?"></textarea></div>
          <div class="form-group"><label class="form-label">Cover image (optional)</label><div class="input-row"><input class="form-input" [(ngModel)]="form.coverImage" placeholder="https://… or upload" /><cv-image-upload label="Upload" (uploaded)="form.coverImage = $event" /></div></div>
          <div class="form-group">
            <label class="form-label">Visibility</label>
            <div class="row-wrap">
              <span class="chip" [class.active]="form.visibility === 'public'" (click)="form.visibility = 'public'">🌐 Public — anyone can join</span>
              <span class="chip" [class.active]="form.visibility === 'private'" (click)="form.visibility = 'private'">🔒 Private — invite only</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Invite friends</label>
            @for (f of friends; track f._id) {
              <label class="row list-row" style="cursor:pointer"><input type="checkbox" [checked]="invite.has(f._id)" (change)="toggleInvite(f._id)" /><cv-avatar [user]="f" size="sm" [showPresence]="true" /><span>{{ f.name }}</span></label>
            } @empty { <p class="text-muted text-sm">Add friends first to invite them (you can invite later too).</p> }
          </div>
          @if (createError) { <div class="error-box">{{ createError }}</div> }
          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="showCreate = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="creating || form.name.trim().length < 3" (click)="create()">{{ creating ? 'Creating…' : 'Create circle' }}</button>
          </div>
        </div>
      </div>
    }
  </div>
  `,
  styles: [`
    .card h3 { font-size: 1.05rem; margin: 10px 0 4px; }
    .cover { height: 110px; border-radius: var(--radius-md); background: linear-gradient(135deg, #3a2f18, #141418 70%) center/cover; display: flex; align-items: flex-start; justify-content: flex-end; padding: 8px; }
    .cover-sm { width: 52px; height: 40px; border-radius: 8px; background: linear-gradient(135deg, #3a2f18, #141418) center/cover; flex-shrink: 0; }
  `]
})
export class CirclesComponent implements OnInit {
  mine: any[] = [];
  invites: any[] = [];
  discover: any[] = [];
  friends: any[] = [];
  loading = true;
  q = '';
  showCreate = false;
  creating = false;
  createError = '';
  form = { name: '', description: '', coverImage: '', visibility: 'private' };
  invite = new Set<string>();

  constructor(private api: ApiService, private toast: ToastService, private router: Router) {}

  ngOnInit(): void { this.load(); this.loadDiscover(); }

  load(): void {
    this.api.myCircles().subscribe({
      next: list => { this.mine = list.filter(c => c.membership?.status === 'active'); this.invites = list.filter(c => c.membership?.status === 'invited'); this.loading = false; },
      error: e => { this.loading = false; this.toast.error(e); }
    });
  }
  loadDiscover(): void { this.api.discoverCircles(this.q).subscribe({ next: d => (this.discover = d), error: () => {} }); }

  openCreate(): void {
    this.showCreate = true;
    this.createError = '';
    this.api.friends().subscribe({ next: f => (this.friends = f), error: () => {} });
  }
  toggleInvite(id: string): void { this.invite.has(id) ? this.invite.delete(id) : this.invite.add(id); }

  create(): void {
    this.creating = true;
    this.api.createCircle({ ...this.form, invite: [...this.invite] }).subscribe({
      next: (c: any) => { this.toast.success(`${c.name} created`, c.invited ? `${c.invited} friend(s) invited` : undefined); this.router.navigate(['/circles', c._id]); },
      error: e => { this.creating = false; this.createError = e.error?.message || 'Could not create the circle'; }
    });
  }

  join(c: any): void {
    this.api.joinCircle(c._id).subscribe({ next: () => this.router.navigate(['/circles', c._id]), error: e => this.toast.error(e) });
  }
  accept(c: any): void { this.join(c); }
  decline(c: any): void {
    this.api.declineCircle(c._id).subscribe({ next: () => (this.invites = this.invites.filter(x => x !== c)), error: e => this.toast.error(e) });
  }
}
