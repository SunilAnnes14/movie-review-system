import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * MoviQ brand: a gold tile with a "Q" drawn as a film reel whose tail is a play button,
 * plus the MoviQ wordmark (the Q picks up the gold accent).
 * Same artwork as public/favicon.svg, inlined so it renders crisply at any size.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'mq-logo',
  standalone: true,
  template: `
    <span class="logo" [class.compact]="compact">
      <svg class="mark" [attr.width]="size" [attr.height]="size" viewBox="0 0 64 64" role="img" aria-label="MoviQ logo">
        <defs>
          <linearGradient [attr.id]="gid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f3d58e" />
            <stop offset="0.5" stop-color="#d4a64a" />
            <stop offset="1" stop-color="#9c6f22" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" [attr.fill]="'url(#' + gid + ')'" />
        <circle cx="29" cy="29" r="15.5" fill="none" stroke="#1b1405" stroke-width="5.5" />
        <circle cx="29" cy="29" r="3.2" fill="#1b1405" />
        <circle cx="29" cy="21.2" r="2.6" fill="#1b1405" />
        <circle cx="36.8" cy="29" r="2.6" fill="#1b1405" />
        <circle cx="29" cy="36.8" r="2.6" fill="#1b1405" />
        <circle cx="21.2" cy="29" r="2.6" fill="#1b1405" />
        <path d="M38.5 39.5 L53 46.2 Q54.6 47 53.2 48.1 L43.6 55.4 Q42.2 56.4 41.9 54.7 Z" fill="#1b1405" />
      </svg>
      @if (!compact) {
        <span class="text">
          <span class="word">Movi<span class="q">Q</span></span>
          @if (tagline) { <span class="tag">{{ tagline }}</span> }
        </span>
      }
    </span>
  `,
  styles: [`
    :host { display: flex; min-width: 0; max-width: 100%; }
    .logo { display: flex; align-items: center; gap: 12px; min-width: 0; max-width: 100%; }
    .mark { flex-shrink: 0; filter: drop-shadow(0 6px 16px rgba(212,166,74,0.28)); }
    .text { display: flex; flex-direction: column; min-width: 0; }
    .word { font-family: var(--font-display); font-weight: 700; font-size: 1.35rem; line-height: 1.05; letter-spacing: -0.01em; color: var(--text-primary); }
    .q { color: var(--accent); }
    .tag { font-size: 0.64rem; line-height: 1.3; color: var(--text-muted); letter-spacing: 0.03em; margin-top: 3px; overflow-wrap: anywhere; }
  `]
})
export class LogoComponent {
  @Input() size = 40;
  @Input() tagline = '';
  @Input() compact = false;
  // unique gradient id so several logos on one page don't clash
  readonly gid = 'mq-gold-' + Math.random().toString(36).slice(2, 8);
}
