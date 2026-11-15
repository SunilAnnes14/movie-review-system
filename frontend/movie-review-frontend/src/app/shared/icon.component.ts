import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

// Stroke icons (24x24, 1.8 stroke) used in navigation and actions
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  discover: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z',
  vault: 'M4 4h16v16H4zM4 9h16M9 4v5M8 14h3',
  feed: 'M4 5h16M4 12h16M4 19h10',
  circle: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6M2 21v-1a6 6 0 0 1 12 0v1m3-7a5 5 0 0 1 5 5v2',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z',
  poll: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  plan: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm-1 5h16M8 3v4m8-4v4',
  ai: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  people: 'M16 11a3 3 0 1 0 0-6M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-6 10a6 6 0 0 1 12 0m4-6a4 4 0 0 1 4 4v2',
  bell: 'M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  send: 'M4 12 20 4l-6 16-3-7z',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  comment: 'M4 5h16v11H8l-4 4z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  admin: 'M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  reply: 'M9 7 4 12l5 5M4 12h11a5 5 0 0 1 5 5v1',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sparkle: 'M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5 19 19M5 19l2.5-2.5M16.5 7.5 19 5',
  pin: 'M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  ticket: 'M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM13 4v16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'
};

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-icon',
  standalone: true,
  template: `<svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="d" /></svg>`,
  styles: [':host { display: inline-flex; line-height: 0; }']
})
export class IconComponent {
  @Input() name = 'film';
  @Input() size = 20;
  get d(): string { return PATHS[this.name] || PATHS['film']; }
}
