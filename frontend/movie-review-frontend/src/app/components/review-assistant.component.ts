import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';

/**
 * Review Intelligence panel. It only ever SUGGESTS: the parent decides whether to apply text
 * through (apply) and the review is published only by the user's own Submit.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-review-assistant',
  standalone: true,
  template: `
  <div class="assistant">
    <div class="row between wrap">
      <div class="row"><span class="spark">✦</span><strong>Review Intelligence</strong><span class="text-xs text-muted hidden-mobile">Suggestions only — nothing changes until you apply it.</span></div>
      <button class="btn btn-secondary btn-sm" [disabled]="busy || text.trim().length < 5" (click)="analyze()">{{ busy ? 'Analysing…' : (a ? 'Re-analyse' : 'Analyse my review') }}</button>
    </div>
    @if (error) { <div class="error-box mt-1">{{ error }}</div> }

    @if (a) {
      <div class="grid-2 mt-2">
        <div class="cell">
          <div class="k">Sentiment</div>
          <div><span class="pill" [class.pill-green]="a.sentiment.label === 'positive'" [class.pill-red]="a.sentiment.label === 'negative'" [class.pill-gold]="a.sentiment.label === 'mixed'">{{ a.sentiment.label }}</span> <span class="text-xs text-muted">score {{ a.sentiment.score }}</span></div>
          @if (a.ratingConsistency && !a.ratingConsistency.consistent) { <p class="text-xs warn mt-1">⚠ {{ a.ratingConsistency.note }}</p> }
          @if (a.ratingConsistency?.consistent) { <p class="text-xs text-muted mt-1">{{ a.ratingConsistency.note }}</p> }
        </div>
        <div class="cell">
          <div class="k">Readability</div>
          <div><strong>{{ a.readability.score }}</strong>/100 · {{ a.readability.grade }}</div>
          <div class="text-xs text-muted">{{ a.readability.words }} words · {{ a.readability.wordsPerSentence }} words/sentence</div>
        </div>
      </div>

      <div class="cell mt-1">
        <div class="row between"><div class="k">Grammar & style ({{ a.grammar.fixes.length }})</div>
          @if (a.grammar.fixes.length) { <button class="btn btn-primary btn-sm" (click)="use(a.grammar.corrected, 'Corrections applied')">Apply corrections</button> }</div>
        @for (f of a.grammar.fixes.slice(0, 8); track $index) { <div class="text-xs"><s class="text-muted">{{ f.from }}</s> → <strong>{{ f.to }}</strong> <span class="text-muted">· {{ f.reason }}</span></div> }
        @if (!a.grammar.fixes.length) { <p class="text-xs text-muted">No issues found.</p> }
      </div>

      @if (a.spoilers.isSpoiler) {
        <div class="cell spoil mt-1">
          <div class="k">⚠ CineSpoiler found possible spoilers</div>
          @for (s of a.spoilers.sentences; track s.index) { <p class="text-xs">“{{ s.text }}” <span class="text-muted">({{ (s.probability * 100).toFixed(0) }}%)</span></p> }
          <div class="row mt-1"><button class="btn btn-secondary btn-sm" (click)="spoiler.emit(true)">Hide these behind a spoiler warning</button><button class="btn btn-outline btn-sm" (click)="spoiler.emit(false)">It's not a spoiler</button></div>
        </div>
      }

      <div class="grid-2 mt-1">
        <div class="cell">
          <div class="k">Summary</div>
          <p class="text-sm">{{ a.summary }}</p>
        </div>
        <div class="cell">
          <div class="k">Caption</div>
          <p class="text-sm">{{ a.caption }}</p>
          <button class="link text-xs" (click)="copy(a.caption)">Copy caption</button>
        </div>
      </div>

      <div class="cell mt-1">
        <div class="k">Craft analysis</div>
        <div class="aspects">
          @for (k of aspectKeys; track k) {
            <div class="aspect" [class.off]="!a.aspects[k].mentioned">
              <span class="name">{{ k }}</span>
              @if (a.aspects[k].mentioned) {
                <span class="pill" [class.pill-green]="a.aspects[k].sentiment === 'positive'" [class.pill-red]="a.aspects[k].sentiment === 'negative'">{{ a.aspects[k].sentiment }}</span>
                <span class="text-xs text-muted clamp-2">“{{ a.aspects[k].evidence[0] }}”</span>
              } @else { <span class="text-xs text-muted">not discussed</span> }
            </div>
          }
        </div>
        @if (a.themes.length) { <div class="row-wrap mt-1"><span class="k" style="margin:0">Themes:</span>@for (t of a.themes; track t) { <span class="pill pill-gold">{{ t }}</span> }</div> }
      </div>

      <div class="cell mt-1">
        <div class="k">Rewrite in a different style</div>
        <div class="row-wrap">
          @for (s of styles; track s.id) { <button class="chip" [class.active]="style === s.id" [disabled]="rewriting" (click)="rewrite(s.id)">{{ s.label }}</button> }
        </div>
        @if (!a.rewriteAvailable) { <p class="text-xs text-muted mt-1">Style rewrites use the AI language model, which isn't configured on this server. All other tools run locally.</p> }
        @if (rewriting) { <p class="text-xs text-muted mt-1">Rewriting…</p> }
        @if (rewritten) {
          <div class="preview mt-1">
            <p class="text-sm" style="white-space:pre-line">{{ rewritten.rewritten }}</p>
            @if (rewritten.changes?.length) { <p class="text-xs text-muted mt-1">Changes: {{ rewritten.changes.join('; ') }}</p> }
            <div class="row mt-1"><button class="btn btn-primary btn-sm" (click)="use(rewritten.rewritten, 'Rewrite applied — review it before submitting', rewritten.historyId)">Use this version</button><button class="btn btn-outline btn-sm" (click)="rewritten = null">Discard</button></div>
          </div>
        }
      </div>
    }
  </div>
  `,
  styles: [`
    .assistant { border: 1px solid rgba(212,166,74,0.3); border-radius: var(--radius-lg); padding: 14px; background: linear-gradient(160deg, rgba(212,166,74,0.07), transparent 60%); }
    .spark { color: var(--accent); }
    .wrap { flex-wrap: wrap; gap: 8px; }
    .cell { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 12px; }
    .k { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); margin-bottom: 6px; font-weight: 600; }
    .warn { color: var(--accent); }
    .spoil { border-color: rgba(212,166,74,0.45); }
    .aspects { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
    .aspect { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 8px; background: var(--bg-tertiary); }
    .aspect.off { opacity: .55; }
    .aspect .name { text-transform: capitalize; font-weight: 600; font-size: .85rem; }
    .preview { border-left: 2px solid var(--accent); padding-left: 12px; }
    .link { background: none; padding: 0; }
  `]
})
export class ReviewAssistantComponent {
  @Input() text = '';
  @Input() movieId?: string;
  @Input() rating?: number;
  @Output() apply = new EventEmitter<string>();
  @Output() spoiler = new EventEmitter<boolean>();

  a: any = null;
  busy = false;
  error = '';
  style = '';
  rewriting = false;
  rewritten: any = null;
  aspectKeys = ['acting', 'cinematography', 'screenplay', 'direction', 'music'];
  styles = [{ id: 'casual', label: 'Casual' }, { id: 'professional', label: 'Professional' }, { id: 'critical', label: 'Critical' }, { id: 'cinematic', label: 'Cinematic' }, { id: 'short', label: 'Short & engaging' }];

  constructor(private api: ApiService, private toast: ToastService) {}

  analyze(): void {
    this.busy = true; this.error = ''; this.rewritten = null;
    this.api.analyzeReview(this.text, this.movieId, this.rating || undefined).subscribe({
      next: a => { this.a = a; this.busy = false; },
      error: e => { this.busy = false; this.error = e.error?.message || 'Analysis failed'; }
    });
  }

  rewrite(style: string): void {
    this.style = style; this.rewriting = true; this.rewritten = null;
    this.api.rewriteReview(this.text, style, this.movieId, this.rating || undefined).subscribe({
      next: r => { this.rewritten = r; this.rewriting = false; },
      error: e => { this.rewriting = false; this.toast.error(e); }
    });
  }

  use(text: string, msg: string, historyId?: string): void {
    this.apply.emit(text);
    const id = historyId || this.a?.historyId;
    if (id) this.api.acceptAiSuggestion(id).subscribe({ error: () => {} });
    this.toast.success(msg);
    this.a = null; this.rewritten = null;
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => this.toast.success('Caption copied'), () => {});
  }
}
