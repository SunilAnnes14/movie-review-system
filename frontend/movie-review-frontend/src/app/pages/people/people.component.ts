import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, switchMap, of, catchError } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { TimeAgoPipe } from '../../shared/pipes';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-people',
  standalone: true,
  imports: [RouterLink, FormsModule, AvatarComponent, TimeAgoPipe],
  template: `
  <div class="v2-page" style="max-width: 900px">
    <div class="v2-header">
      <div>
        <p class="v2-eyebrow">Friends</p>
        <h1 class="v2-title">Your movie people</h1>
        <p class="v2-subtitle">Find friends, accept requests and follow reviewers whose taste you trust.</p>
      </div>
    </div>

    <input class="form-input" placeholder="Search people by name…" [(ngModel)]="q" (ngModelChange)="search$.next($event)" />
    @if (q.trim().length >= 2) {
      <div class="panel mt-2">
        @for (u of results; track u._id) {
          <div class="list-row">
            <cv-avatar [user]="u" [showPresence]="true" />
            <a class="grow" [routerLink]="['/u', u._id]"><div class="title">{{ u.name }}</div><div class="meta clamp-2">{{ u.bio || 'Movie lover' }}</div></a>
            @switch (u.relationship.friend) {
              @case ('friends') { <span class="pill pill-green">Friends</span> }
              @case ('request_sent') { <span class="pill">Request sent</span> }
              @case ('request_received') { <button class="btn btn-primary btn-sm" (click)="respond(u.relationship.requestId, 'accept', u)">Accept</button> }
              @default { <button class="btn btn-primary btn-sm" (click)="add(u)">+ Add friend</button> }
            }
            <button class="btn btn-sm" [class.btn-secondary]="u.relationship.following" [class.btn-outline]="!u.relationship.following" (click)="toggleFollow(u)">{{ u.relationship.following ? 'Following' : 'Follow' }}</button>
          </div>
        } @empty { <p class="text-muted text-sm">{{ searching ? 'Searching…' : 'No one found.' }}</p> }
      </div>
    }

    @if (requests.incoming.length) {
      <div class="section-head"><h2>Friend requests <span class="pill pill-gold">{{ requests.incoming.length }}</span></h2></div>
      <div class="panel">
        @for (r of requests.incoming; track r._id) {
          <div class="list-row">
            <cv-avatar [user]="r.user" />
            <a class="grow" [routerLink]="['/u', r.user._id]"><div class="title">{{ r.user.name }}</div><div class="meta">{{ r.createdAt | timeAgo }}</div></a>
            <button class="btn btn-primary btn-sm" (click)="respond(r._id, 'accept')">Accept</button>
            <button class="btn btn-outline btn-sm" (click)="respond(r._id, 'reject')">Decline</button>
          </div>
        }
      </div>
    }

    <div class="section-head"><h2>Friends ({{ friends.length }})</h2></div>
    <div class="panel">
      @for (f of friends; track f._id) {
        <div class="list-row">
          <cv-avatar [user]="f" [showPresence]="true" />
          <a class="grow" [routerLink]="['/u', f._id]"><div class="title">{{ f.name }}</div><div class="meta">{{ f.online ? 'Online now' : 'Last seen ' + (f.lastSeen | timeAgo) }}</div></a>
          <button class="btn btn-secondary btn-sm" (click)="message(f)">💬 Message</button>
          <button class="btn btn-danger btn-sm" (click)="unfriend(f)">Remove</button>
        </div>
      } @empty {
        <div class="state"><div class="icon">👋</div><p>Search for people above to add your first friend.</p></div>
      }
    </div>

    @if (requests.outgoing.length) {
      <div class="section-head"><h2>Sent requests</h2></div>
      <div class="panel">
        @for (r of requests.outgoing; track r._id) {
          <div class="list-row"><cv-avatar [user]="r.user" size="sm" /><span class="grow">{{ r.user.name }}</span><button class="btn btn-outline btn-sm" (click)="cancel(r)">Cancel</button></div>
        }
      </div>
    }
  </div>
  `
})
export class PeopleComponent implements OnInit {
  q = '';
  results: any[] = [];
  searching = false;
  friends: any[] = [];
  requests: { incoming: any[]; outgoing: any[] } = { incoming: [], outgoing: [] };
  search$ = new Subject<string>();

  constructor(private api: ApiService, private toast: ToastService, private router: Router) {}

  ngOnInit(): void {
    this.load();
    this.search$.pipe(debounceTime(300), switchMap(q => {
      this.searching = true;
      return q.trim().length >= 2 ? this.api.searchUsers(q).pipe(catchError(() => of([]))) : of([]);
    })).subscribe(r => { this.results = r; this.searching = false; });
  }

  load(): void {
    this.api.friends().subscribe({ next: f => (this.friends = f), error: e => this.toast.error(e) });
    this.api.friendRequests().subscribe({ next: r => (this.requests = r), error: () => {} });
  }

  add(u: any): void {
    this.api.sendFriendRequest(u._id).subscribe({
      next: (r: any) => { u.relationship.friend = r.status; this.toast.success(r.status === 'friends' ? `You and ${u.name} are now friends` : 'Friend request sent'); this.load(); },
      error: e => this.toast.error(e)
    });
  }
  respond(id: string, action: 'accept' | 'reject', u?: any): void {
    this.api.respondFriendRequest(id, action).subscribe({
      next: () => { if (u) u.relationship.friend = action === 'accept' ? 'friends' : 'none'; this.load(); },
      error: e => this.toast.error(e)
    });
  }
  cancel(r: any): void { this.api.removeFriend(r.user._id).subscribe({ next: () => this.load(), error: e => this.toast.error(e) }); }
  unfriend(f: any): void {
    if (!confirm(`Remove ${f.name} from your friends?`)) return;
    this.api.removeFriend(f._id).subscribe({ next: () => this.load(), error: e => this.toast.error(e) });
  }
  toggleFollow(u: any): void {
    const obs = u.relationship.following ? this.api.unfollow(u._id) : this.api.follow(u._id);
    obs.subscribe({ next: (r: any) => (u.relationship.following = r.following), error: e => this.toast.error(e) });
  }
  message(f: any): void {
    this.api.startDirect(f._id).subscribe({ next: r => this.router.navigate(['/chat', r._id]), error: e => this.toast.error(e) });
  }
}
