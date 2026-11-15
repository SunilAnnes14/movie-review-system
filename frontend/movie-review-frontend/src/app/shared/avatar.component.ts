import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { RealtimeService } from '../services/realtime.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-avatar',
  standalone: true,
  template: `
    <span class="avatar" [class.avatar-sm]="size === 'sm'" [class.avatar-lg]="size === 'lg'" [class.avatar-xl]="size === 'xl'" [title]="user?.name || ''">
      @if (user?.avatar) { <img [src]="user.avatar" [alt]="user.name" referrerpolicy="no-referrer" /> }
      @else { {{ initials }} }
      @if (showPresence) { <span class="dot" [class.on]="online"></span> }
    </span>
  `
})
export class AvatarComponent {
  @Input() user: any;
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() showPresence = false;

  constructor(private rt: RealtimeService) {}

  get initials(): string {
    const n = (this.user?.name || '?').trim().split(/\s+/);
    return ((n[0]?.[0] || '') + (n.length > 1 ? n[n.length - 1][0] : '')).toUpperCase();
  }
  get online(): boolean {
    return !!this.user && (this.rt.onlineUsers.has(String(this.user._id)) || !!this.user.online);
  }
}
