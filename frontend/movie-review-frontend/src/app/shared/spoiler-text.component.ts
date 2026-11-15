import { Component, Input, OnChanges, ChangeDetectionStrategy } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { WatchlistService } from '../services/watchlist.service';

/**
 * CineSpoiler click-to-reveal text.
 *  - `sentences`: indexes of flagged sentences (sentence-level hiding), or
 *  - `spoiler`: hide the whole text.
 * Movie-specific protection: content about a movie the viewer has already watched is shown
 * automatically. Viewers who turned the spoiler shield off see everything.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-spoiler-text',
  standalone: true,
  template: `
    @if (protect && !revealedAll) {
      @if (wholeHidden) {
        <span class="spoiler-banner" (click)="revealAll($event)">⚠️ Spoiler hidden — click to reveal</span>
      } @else {
        @for (s of parts; track $index) {
          @if (s.hidden && !revealed.has($index)) {
            <span class="spoiler" title="Spoiler — click to reveal" (click)="reveal($index, $event)">{{ s.text }}</span>{{ ' ' }}
          } @else { <span>{{ s.text }} </span> }
        }
      }
    } @else {
      <span>{{ text }}</span>
    }
  `
})
export class SpoilerTextComponent implements OnChanges {
  @Input() text = '';
  @Input() sentences: number[] | null = null;
  @Input() spoiler = false;
  @Input() movieId?: string;

  parts: { text: string; hidden: boolean }[] = [];
  revealed = new Set<number>();
  revealedAll = false;

  constructor(private auth: AuthService, private vault: WatchlistService) {}

  ngOnChanges(): void {
    const split = (this.text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+|$)/g) || [this.text || ''];
    const flagged = new Set(this.sentences || []);
    this.parts = split.map((t, i) => ({ text: t.trim(), hidden: flagged.has(i) }));
    this.revealed.clear();
    this.revealedAll = false;
  }

  get protect(): boolean {
    if (!(this.spoiler || this.sentences?.length)) return false;
    if (this.auth.currentUser?.privacy?.spoilerShield === false) return false;
    return !this.vault.hasWatched(this.movieId);
  }
  get wholeHidden(): boolean { return !this.sentences?.length || this.parts.every(p => p.hidden); }

  reveal(i: number, e: Event): void { e.stopPropagation(); this.revealed.add(i); }
  revealAll(e: Event): void { e.stopPropagation(); this.revealedAll = true; }
}
