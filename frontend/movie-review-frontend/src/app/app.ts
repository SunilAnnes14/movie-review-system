import { Component, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { filter, Subject, debounceTime } from 'rxjs';
import { AuthService } from './services/auth.service';
import { ApiService } from './services/api.service';
import { RealtimeService } from './services/realtime.service';
import { ToastService } from './services/toast.service';
import { WatchlistService } from './services/watchlist.service';
import { IconComponent } from './shared/icon.component';
import { AvatarComponent } from './shared/avatar.component';
import { TimeAgoPipe } from './shared/pipes';
import { LogoComponent } from './shared/logo.component';

interface NavItem { path: string; label: string; icon: string; auth?: boolean; exact?: boolean; badge?: () => number; }

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, IconComponent, AvatarComponent, TimeAgoPipe, LogoComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  mobileMenuOpen = false;
  notifOpen = false;
  notifications: any[] = [];
  unreadNotifications = 0;
  unreadMessages = 0;
  searchQuery = '';
  private refreshUnread$ = new Subject<void>();

  readonly nav: NavItem[] = [
    { path: '/', label: 'Home', icon: 'home', exact: true },
    { path: '/discover', label: 'Discover', icon: 'discover' },
    { path: '/vault', label: 'My Vault', icon: 'vault', auth: true },
    { path: '/feed', label: 'CineFeed', icon: 'feed', auth: true },
    { path: '/circles', label: 'CineCircle', icon: 'circle', auth: true },
    { path: '/chat', label: 'CineChat', icon: 'chat', auth: true, badge: () => this.unreadMessages },
    { path: '/polls', label: 'CinePoll', icon: 'poll', auth: true },
    { path: '/events', label: 'CinePlan', icon: 'plan', auth: true },
    { path: '/ai', label: 'AI Studio', icon: 'ai', auth: true },
    { path: '/profile', label: 'Profile', icon: 'profile', auth: true }
  ];

  constructor(
    public authService: AuthService,
    private api: ApiService,
    private rt: RealtimeService,
    public toast: ToastService,
    private vault: WatchlistService,
    private router: Router
  ) {
    this.authService.currentUser$.subscribe(user => {
      if (user) this.bootstrapSession();
      else { this.notifications = []; this.unreadNotifications = 0; this.unreadMessages = 0; }
    });

    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.mobileMenuOpen = false;
      this.notifOpen = false;
      const u = this.authService.currentUser;
      const url: string = e.urlAfterRedirects;
      if (u && u.onboarded === false && !url.startsWith('/welcome') && !url.startsWith('/login') && !url.startsWith('/register')) {
        this.router.navigate(['/welcome']);
      }
    });

    this.rt.on('notification').subscribe(n => {
      this.notifications = [n, ...this.notifications].slice(0, 30);
      this.unreadNotifications++;
      if (n.type !== 'message') this.toast.show(n.title, { body: n.body, link: n.link });
    });
    this.rt.on('message:new').subscribe(() => this.refreshUnread$.next());
    this.rt.on('conversation:read').subscribe(() => this.refreshUnread$.next());
    this.refreshUnread$.pipe(debounceTime(400)).subscribe(() => this.loadUnreadMessages());
  }

  private bootstrapSession(): void {
    this.api.notifications().subscribe({ next: r => { this.notifications = r.items; this.unreadNotifications = r.unread; }, error: () => {} });
    this.loadUnreadMessages();
    this.vault.getWatchlist().subscribe({ error: () => {} });
  }

  private loadUnreadMessages(): void {
    if (!this.authService.isLoggedIn) return;
    this.api.unreadMessages().subscribe({ next: r => (this.unreadMessages = r.unread), error: () => {} });
  }

  get visibleNav(): NavItem[] {
    return this.nav.filter(n => !n.auth || this.authService.isLoggedIn);
  }

  toggleMobileMenu(): void { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMobileMenu(): void { this.mobileMenuOpen = false; }

  toggleNotifications(e: Event): void {
    e.stopPropagation();
    this.notifOpen = !this.notifOpen;
  }

  openNotification(n: any): void {
    if (!n.read) {
      n.read = true;
      this.unreadNotifications = Math.max(0, this.unreadNotifications - 1);
      this.api.readNotification(n._id).subscribe({ error: () => {} });
    }
    this.notifOpen = false;
    if (n.link) this.router.navigateByUrl(n.link);
  }

  readAll(): void {
    this.api.readAllNotifications().subscribe(() => {
      this.notifications.forEach(n => (n.read = true));
      this.unreadNotifications = 0;
    });
  }

  openToast(t: any): void {
    this.toast.dismiss(t.id);
    if (t.link) this.router.navigateByUrl(t.link);
  }

  search(): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.router.navigate(['/discover'], { queryParams: { q } });
    this.searchQuery = '';
  }

  @HostListener('document:click')
  closePopovers(): void { this.notifOpen = false; }

  logout(): void {
    this.authService.logout();
    this.mobileMenuOpen = false;
    this.router.navigate(['/']);
  }
}
