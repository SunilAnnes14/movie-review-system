import { AfterViewChecked, Component, ElementRef, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { WatchlistService } from '../../services/watchlist.service';
import { ToastService } from '../../services/toast.service';
import { PosterTileComponent } from '../../shared/poster-tile.component';
import { MoviePickerComponent } from '../../shared/movie-picker.component';
import { ColumnChartComponent } from '../../shared/column-chart.component';
import { MiniMarkdownPipe, TimeAgoPipe } from '../../shared/pipes';
import { GroupMatchComponent } from '../../components/group-match.component';
import { PulseComponent } from '../../components/pulse.component';
import { ReviewAssistantComponent } from '../../components/review-assistant.component';
import { GENRES } from '../../config';

type Tool = 'match' | 'dna' | 'review' | 'spoiler' | 'bot' | 'pulse';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-ai-studio',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe, PosterTileComponent, MoviePickerComponent, ColumnChartComponent, MiniMarkdownPipe, TimeAgoPipe, GroupMatchComponent, PulseComponent, ReviewAssistantComponent],
  template: `
  <div class="v2-page">
    <div class="v2-header">
      <div>
        <p class="v2-eyebrow">AI Studio</p>
        <h1 class="v2-title">Six intelligences, one movie brain</h1>
        <p class="v2-subtitle">Every tool uses your real ratings, vault and circles — with your permission. {{ status?.llm ? 'Language-model features are enabled.' : 'Running on local models; add an API key on the server to unlock LLM features.' }}</p>
      </div>
      <a routerLink="/profile" [queryParams]="{ tab: 'privacy' }" class="btn btn-outline btn-sm">🔒 AI privacy settings</a>
    </div>

    <div class="tools">
      @for (t of tools; track t.id) {
        <button class="tool" [class.active]="tool === t.id" (click)="select(t.id)">
          <span class="ic">{{ t.icon }}</span>
          <span><strong>{{ t.name }}</strong><span class="text-xs text-muted d-block">{{ t.desc }}</span></span>
        </button>
      }
    </div>

    <!-- ================= CINEMATCH ================= -->
    @if (tool === 'match') {
      <div class="tabs">
        <button class="tab" [class.active]="matchMode === 'me'" (click)="matchMode = 'me'">For me</button>
        <button class="tab" [class.active]="matchMode === 'group'" (click)="matchMode = 'group'; loadCircles()">Group CineMatch</button>
      </div>
      @if (matchMode === 'me') {
        <div class="row-wrap mb-2">
          <span class="chip" [class.active]="!matchGenre" (click)="loadMatch('')">All genres</span>
          @for (g of genres; track g) { <span class="chip" [class.active]="matchGenre === g" (click)="loadMatch(g)">{{ g }}</span> }
        </div>
        @if (match?.profile?.coldStart) {
          <div class="info-box mb-2">You're in cold-start mode — recommendations lean on your onboarding picks. Rate a few movies to unlock collaborative filtering. <a routerLink="/welcome" class="link">Update taste picks</a></div>
        }
        @if (match && !match.profile?.usedHistory) { <div class="info-box mb-2">Viewing-history use is off in your privacy settings, so only your stated preferences are used.</div> }
        @if (loadingMatch) { <div class="loading-container"><div class="spinner"></div></div> }
        @if (match && !loadingMatch) {
          <p class="text-xs text-muted mb-2">Strategy: <strong>{{ match.strategy }}</strong> · top genres {{ match.profile.topGenres.join(', ') || '—' }}</p>
          <div class="stack">
            @for (r of match.items; track r.movie._id) {
              <div class="panel rec">
                <cv-poster [movie]="r.movie" [badge]="r.match + '%'" style="width:110px;flex-shrink:0" />
                <div class="grow" style="min-width:0">
                  <div class="row between wrap"><a [routerLink]="['/movies', r.movie._id]"><h3 style="margin:0">{{ r.movie.title }}</h3></a>
                    <button class="btn btn-secondary btn-sm" (click)="addToVault(r.movie)">{{ vault.statusByMovie.has(r.movie._id) ? '✓ In vault' : '+ Want to watch' }}</button></div>
                  <p class="text-xs text-muted">{{ r.movie.releaseYear }} · {{ r.movie.director }} · {{ r.movie.genre.join(', ') }}</p>
                  <ul class="reasons">@for (why of r.reasons; track $index) { <li>{{ why.text }}</li> }</ul>
                  <div class="breakdown">
                    <div class="bar-row"><span class="label">Content match</span><div class="bar"><span [style.width.%]="r.breakdown.content"></span></div><span class="num">{{ r.breakdown.weights.content * 100 | number:'1.0-0' }}% wt</span></div>
                    @if (r.breakdown.collaborative !== null) { <div class="bar-row"><span class="label">Similar viewers</span><div class="bar"><span [style.width.%]="r.breakdown.collaborative"></span></div><span class="num">{{ r.breakdown.weights.collaborative * 100 | number:'1.0-0' }}% wt</span></div> }
                    <div class="bar-row"><span class="label">Quality</span><div class="bar"><span [style.width.%]="r.breakdown.quality"></span></div><span class="num">{{ r.breakdown.weights.quality * 100 | number:'1.0-0' }}% wt</span></div>
                  </div>
                </div>
              </div>
            } @empty { <div class="state"><div class="icon">🎬</div><p>You've seen everything in this genre we know about. Import more from Discover.</p></div> }
          </div>
        }
      } @else {
        <div class="row mb-2">
          <select class="form-select" style="max-width:320px" [(ngModel)]="circleId">
            <option value="">Choose a CineCircle…</option>
            @for (c of circles; track c._id) { <option [value]="c._id">{{ c.name }}</option> }
          </select>
        </div>
        @if (circleId) { <cv-group-match [circleId]="circleId" /> }
        @else if (!circles.length) { <div class="state"><div class="icon">🎟️</div><p>Join or create a CineCircle to get group recommendations.</p><a routerLink="/circles" class="btn btn-secondary btn-sm">CineCircle</a></div> }
      }
    }

    <!-- ================= CINESENSE ================= -->
    @if (tool === 'dna') {
      @if (loadingDna) { <div class="loading-container"><div class="spinner"></div><p class="loading-text">Sequencing your Movie DNA…</p></div> }
      @if (dna && !loadingDna) {
        <div class="panel panel-gold dna-hero">
          <div class="grow">
            <div class="v2-eyebrow">Your movie personality</div>
            <h2 class="archetype">{{ dna.profile.archetype }}</h2>
            <p class="personality">{{ dna.profile.personality }}</p>
            <p class="text-xs text-muted mt-1">Based on {{ dna.profile.dataPoints }} movie(s) · confidence {{ dna.profile.confidence }} · {{ dna.generatedWith === 'llm' ? 'narrative by AI model' : 'local analysis' }} · updated {{ dna.updatedAt | timeAgo }}</p>
          </div>
          <button class="btn btn-primary" [disabled]="loadingDna" (click)="regenerateDna()">↻ Regenerate</button>
        </div>

        <div class="stat-grid mt-2">
          <div class="stat"><div class="value">{{ dna.profile.stats.watched }}</div><div class="label">Watched</div></div>
          <div class="stat"><div class="value">{{ dna.profile.stats.reviewsWritten }}</div><div class="label">Reviews</div></div>
          <div class="stat"><div class="value">{{ dna.profile.stats.avgRating ?? '—' }}</div><div class="label">Avg rating</div></div>
          <div class="stat"><div class="value">{{ dna.profile.favoriteDecades[0]?.name || '—' }}</div><div class="label">Favourite decade</div></div>
          <div class="stat"><div class="value">{{ dna.profile.reviewTone?.label || '—' }}</div><div class="label">Review tone</div></div>
        </div>

        <div class="grid-2 mt-2">
          <div class="panel">
            <h3>Favourite genres</h3>
            <p class="text-xs text-muted mb-2">Affinity weighted by how much you liked each film.</p>
            @for (g of dna.profile.favoriteGenres; track g.name) {
              <div class="bar-row" [title]="g.count + ' film(s)' + (g.avgRating ? ', avg ' + g.avgRating + '★' : '')"><span class="label">{{ g.name }}</span><div class="bar"><span [style.width.%]="g.score / maxOf(dna.profile.favoriteGenres) * 100"></span></div><span class="num">{{ g.avgRating ? g.avgRating + '★' : g.count }}</span></div>
            } @empty { <p class="text-muted text-sm">No genre data yet.</p> }
          </div>
          <div class="panel">
            <h3>Storytelling styles</h3>
            <p class="text-xs text-muted mb-2">Detected from synopses, keywords and your reviews.</p>
            @for (s of dna.profile.storytellingStyles; track s.name) {
              <div class="bar-row"><span class="label">{{ s.name }}</span><div class="bar"><span [style.width.%]="s.score / maxOf(dna.profile.storytellingStyles) * 100"></span></div><span class="num">{{ s.score }}</span></div>
            } @empty { <p class="text-muted text-sm">Watch and rate more to reveal your style.</p> }
          </div>
        </div>

        <div class="grid-3 mt-2">
          <div class="panel"><h3>Directors</h3>@for (d of dna.profile.favoriteDirectors; track d.name) { <div class="list-row"><span class="grow">{{ d.name }}</span><span class="pill">{{ d.count }}</span></div> } @empty { <p class="text-muted text-sm">—</p> }</div>
          <div class="panel"><h3>Actors</h3>@for (a of dna.profile.favoriteActors; track a.name) { <div class="list-row"><span class="grow">{{ a.name }}</span><span class="pill">{{ a.count }}</span></div> } @empty { <p class="text-muted text-sm">—</p> }</div>
          <div class="panel"><h3>Most watched genres</h3>@for (g of dna.profile.mostWatchedGenres; track g.name) { <div class="list-row"><span class="grow">{{ g.name }}</span><span class="pill">{{ g.count }}</span></div> } @empty { <p class="text-muted text-sm">—</p> }</div>
        </div>

        <div class="grid-2 mt-2">
          <div class="panel">
            <h3>Monthly viewing</h3>
            <p class="text-xs text-muted mb-2">Movies marked watched, last 12 months.</p>
            <cv-columns [data]="monthly" unit="watched" ariaLabel="Movies watched per month" />
          </div>
          <div class="panel">
            <h3>How you rate</h3>
            <p class="text-xs text-muted mb-2">Your rating distribution.</p>
            @for (r of dna.profile.stats.distribution.slice().reverse(); track r.star) {
              <div class="bar-row"><span class="label">{{ '★'.repeat(r.star) }}</span><div class="bar"><span [style.width.%]="r.count / maxCount(dna.profile.stats.distribution) * 100"></span></div><span class="num">{{ r.count }}</span></div>
            }
          </div>
        </div>
        @if (dna.profile.reviewTone?.signatureWords?.length) {
          <div class="panel mt-2"><h3>Your signature review words</h3><div class="row-wrap">@for (w of dna.profile.reviewTone.signatureWords; track w) { <span class="pill pill-gold">{{ w }}</span> }</div></div>
        }
      }
    }

    <!-- ================= REVIEW INTELLIGENCE ================= -->
    @if (tool === 'review') {
      <div class="grid-2">
        <div class="panel">
          <h3>Draft a review</h3>
          <div class="row mb-2">
            @if (reviewMovie) { <span class="pill pill-gold">🎬 {{ reviewMovie.title }}</span> }
            <button class="btn btn-secondary btn-sm" (click)="picker = 'review'">{{ reviewMovie ? 'Change movie' : 'Choose movie (optional)' }}</button>
          </div>
          <div class="row mb-2">@for (i of [1,2,3,4,5]; track i) { <button class="star-btn" [class.on]="i <= reviewRating" (click)="reviewRating = i">★</button> }</div>
          <textarea class="form-textarea" rows="8" [(ngModel)]="reviewText" maxlength="5000" placeholder="Write freely — then let Review Intelligence help."></textarea>
          @if (reviewMovie) { <a class="btn btn-primary btn-sm mt-2" [routerLink]="['/movies', reviewMovie._id]">Go to the movie page to publish →</a> }
          <p class="text-xs text-muted mt-1">Review Intelligence never publishes or edits on its own. You stay the author.</p>
        </div>
        <div>
          <cv-review-assistant [text]="reviewText" [movieId]="reviewMovie?._id" [rating]="reviewRating" (apply)="reviewText = $event" (spoiler)="toast.show($event ? 'Spoiler warning will be applied when you publish on the movie page' : 'Noted — not a spoiler')" />
          @if (history.length) {
            <div class="panel mt-2">
              <h3>Recent assistant activity</h3>
              @for (h of history.slice(0, 6); track h._id) {
                <div class="list-row"><span class="grow text-sm">{{ h.action === 'rewrite' ? 'Rewrite · ' + h.style : 'Analysis' }}@if (h.movie) { · {{ h.movie.title }} }</span><span class="pill" [class.pill-green]="h.accepted">{{ h.accepted ? 'applied' : 'not applied' }}</span><span class="text-xs text-muted">{{ h.createdAt | timeAgo }}</span></div>
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- ================= CINESPOILER ================= -->
    @if (tool === 'spoiler') {
      <div class="grid-2">
        <div class="panel">
          <h3>Spoiler lab</h3>
          <p class="text-xs text-muted mb-2">Paste any review, comment or message. CineSpoiler scores every sentence — mentioning a movie or a character alone is not a spoiler; revealing what happens is.</p>
          <div class="row mb-2">
            @if (spoilerMovie) { <span class="pill pill-gold">🎬 {{ spoilerMovie.title }}</span> }
            <button class="btn btn-secondary btn-sm" (click)="picker = 'spoiler'">{{ spoilerMovie ? 'Change movie' : 'Movie context (improves accuracy)' }}</button>
          </div>
          <textarea class="form-textarea" rows="7" [(ngModel)]="spoilerText" maxlength="5000" placeholder="e.g. The visuals are stunning. It turns out the professor lied about plan A."></textarea>
          <button class="btn btn-primary mt-2" [disabled]="spoilerText.trim().length < 3 || checkingSpoiler" (click)="detectSpoilers()">{{ checkingSpoiler ? 'Scanning…' : 'Scan for spoilers' }}</button>
        </div>
        <div class="panel">
          <h3>Result</h3>
          @if (spoilerResult) {
            <p class="mb-2">@if (spoilerResult.isSpoiler) { <span class="pill pill-red">⚠ Contains spoilers</span> } @else { <span class="pill pill-green">✓ Spoiler-free</span> } <span class="text-xs text-muted">method: {{ spoilerResult.method }}</span></p>
            @for (s of spoilerResult.sentences; track s.index) {
              <div class="sent" [class.flag]="s.spoiler">
                <div class="row between"><span class="text-sm">{{ s.text }}</span><strong class="text-xs">{{ (s.probability * 100).toFixed(0) }}%</strong></div>
                <div class="bar mt-1"><span [style.width.%]="s.probability * 100"></span></div>
                @if (s.features.length) { <div class="text-xs text-muted mt-1">{{ s.features.join(' · ') }}</div> }
              </div>
            }
          } @else { <p class="text-muted text-sm">Run a scan to see sentence-level results.</p> }
          <div class="info-box mt-2">
            <label class="switch"><input type="checkbox" [ngModel]="auth.currentUser?.privacy?.spoilerShield !== false" (ngModelChange)="setShield($event)" /> Spoiler shield — hide flagged content across CineVault</label>
            <p class="text-xs mt-1">Movies you've marked <strong>Watched</strong> are never hidden from you.</p>
          </div>
        </div>
      </div>
    }

    <!-- ================= CINEBOT ================= -->
    @if (tool === 'bot') {
      <div class="panel bot">
        <div class="row between bot-head">
          <div class="row"><span class="bot-av">✦</span><div><strong>CineBot</strong><div class="text-xs text-muted">{{ status?.llm ? 'AI model with live catalog retrieval' : 'Local retrieval assistant' }}</div></div></div>
          <div class="row">
            <label class="switch text-xs"><input type="checkbox" [(ngModel)]="spoilerFree" /> Spoiler-free</label>
            @if (botMessages.length) { <button class="btn btn-outline btn-sm" (click)="botMessages = []">Clear</button> }
          </div>
        </div>
        <div class="bot-log" #botLog>
          @if (!botMessages.length) {
            <div class="state">
              <div class="icon">🎞️</div><h3>Ask me anything about movies</h3>
              <div class="row-wrap" style="justify-content:center">
                @for (s of suggestions; track s) { <button class="chip" (click)="ask(s)">{{ s }}</button> }
              </div>
            </div>
          }
          @for (m of botMessages; track $index) {
            <div class="bmsg" [class.user]="m.role === 'user'">
              <div class="bubble" [class.mine]="m.role === 'user'" [innerHTML]="m.role === 'user' ? escape(m.content) : (m.content | miniMarkdown)"></div>
              @if (m.movies?.length) {
                <div class="poster-row mt-1">
                  @for (mv of m.movies; track mv._id || mv.tmdbId) {
                    <cv-poster [movie]="mv" [linkable]="!!mv._id">
                      @if (mv._id) { <button class="btn btn-secondary btn-sm mt-1" style="width:100%" (click)="addToVault(mv)">{{ vault.statusByMovie.has(mv._id) ? '✓ Vault' : '+ Vault' }}</button> }
                    </cv-poster>
                  }
                </div>
              }
              @if (m.followUps?.length && $last) { <div class="row-wrap mt-1">@for (f of m.followUps; track f) { <button class="chip" (click)="ask(f)">{{ f }}</button> }</div> }
            </div>
          }
          @if (botBusy) { <div class="bmsg"><div class="bubble"><span class="typing-dots">CineBot is looking things up…</span></div></div> }
        </div>
        <form class="row bot-input" (ngSubmit)="ask(botInput)">
          <input class="form-input grow" name="bot" [(ngModel)]="botInput" placeholder="Recommend movies like Shutter Island…" maxlength="1000" autocomplete="off" />
          <button class="btn btn-primary" [disabled]="botBusy || !botInput.trim()">Ask</button>
        </form>
      </div>
    }

    <!-- ================= CINEPULSE ================= -->
    @if (tool === 'pulse') {
      <div class="row mb-2">
        <select class="form-select" style="max-width:320px" [(ngModel)]="circleId">
          <option value="">Choose a CineCircle…</option>
          @for (c of circles; track c._id) { <option [value]="c._id">{{ c.name }}</option> }
        </select>
      </div>
      @if (circleId) { <cv-pulse [circleId]="circleId" /> }
      @else if (!circles.length) { <div class="state"><div class="icon">📈</div><p>CinePulse analyses a CineCircle's polls, votes and movie nights. Join a circle first.</p></div> }
    }

    @if (picker) { <cv-movie-picker (picked)="onPicked($event)" (close)="picker = null" /> }
  </div>
  `,
  styles: [`
    .tools { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 24px; }
    .tool { display: flex; gap: 10px; align-items: flex-start; text-align: left; padding: 12px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color); color: inherit; transition: all var(--transition-fast); }
    .tool:hover { border-color: var(--border-hover); }
    .tool.active { border-color: var(--accent); background: var(--accent-soft); }
    .tool .ic { font-size: 1.3rem; }
    .d-block { display: block; }
    .rec { display: flex; gap: 18px; align-items: flex-start; }
    .reasons { padding-left: 0; margin: 6px 0 10px; } .reasons li { font-size: .86rem; color: var(--text-secondary); margin: 3px 0; } .reasons li::before { content: '✦ '; color: var(--accent); }
    .breakdown .bar-row { grid-template-columns: 110px 1fr 60px; margin: 4px 0; font-size: .75rem; }
    .wrap { flex-wrap: wrap; gap: 8px; }
    .dna-hero { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
    .archetype { font-size: 2rem; color: var(--accent); margin: 4px 0 8px; }
    .personality { font-family: var(--font-display); font-size: 1.12rem; line-height: 1.55; max-width: 760px; }
    .star-btn { background: none; font-size: 1.6rem; color: #3a3a40; padding: 0 2px; } .star-btn.on { color: var(--accent); }
    .sent { padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 8px; }
    .sent.flag { border-color: rgba(248,113,113,0.45); background: rgba(248,113,113,0.05); }
    .bot { padding: 0; display: flex; flex-direction: column; height: min(72vh, 760px); }
    .bot-head { padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
    .bot-av { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-gradient); color: var(--on-accent); font-weight: 700; }
    .bot-log { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
    .bmsg { display: flex; flex-direction: column; align-items: flex-start; } .bmsg.user { align-items: flex-end; }
    .bmsg .bubble { max-width: min(680px, 92%); }
    .bmsg .poster-row { max-width: 100%; grid-auto-columns: 130px; }
    .bot-input { padding: 12px; border-top: 1px solid var(--border-color); }
    :host ::ng-deep .md-li { margin: 2px 0; }
    @media (max-width: 1100px) { .tools { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 720px) { .dna-hero { flex-direction: column; } .archetype { font-size: 1.6rem; } .personality { font-size: 1rem; } .tools { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tool .text-xs { display: none; } .rec { flex-direction: column; } }
  `]
})
export class AiStudioComponent implements OnInit, AfterViewChecked {
  @ViewChild('botLog') botLog?: ElementRef<HTMLDivElement>;
  tools = [
    { id: 'match' as Tool, name: 'CineMatch', icon: '🎯', desc: 'Personal & group picks' },
    { id: 'dna' as Tool, name: 'CineSense', icon: '🧬', desc: 'Your Movie DNA' },
    { id: 'review' as Tool, name: 'Review Intelligence', icon: '✍️', desc: 'Writing assistant' },
    { id: 'spoiler' as Tool, name: 'CineSpoiler', icon: '🛡️', desc: 'Spoiler detection' },
    { id: 'bot' as Tool, name: 'CineBot', icon: '🤖', desc: 'Movie assistant' },
    { id: 'pulse' as Tool, name: 'CinePulse', icon: '📈', desc: 'Group insights' }
  ];
  tool: Tool = 'match';
  status: any = null;
  genres = GENRES.filter(g => !['Documentary', 'Western', 'Music', 'History'].includes(g));
  picker: 'review' | 'spoiler' | null = null;

  // CineMatch
  matchMode: 'me' | 'group' = 'me';
  matchGenre = '';
  match: any = null;
  loadingMatch = false;
  circles: any[] = [];
  circleId = '';
  // CineSense
  dna: any = null;
  loadingDna = false;
  // Review
  reviewText = '';
  reviewRating = 0;
  reviewMovie: any = null;
  history: any[] = [];
  // Spoiler
  spoilerText = '';
  spoilerMovie: any = null;
  spoilerResult: any = null;
  checkingSpoiler = false;
  // Bot
  botMessages: any[] = [];
  botInput = '';
  botBusy = false;
  spoilerFree = true;
  suggestions = ['Recommend movies like Inception', 'Suggest underrated psychological thrillers', 'Explain the ending of Interstellar', 'Recommend Christopher Nolan movies', 'Find movies with unexpected endings', 'Suggest a movie for my mood: thoughtful', 'Suggest a movie for my CineCircle'];
  private scrollBot = false;

  constructor(private api: ApiService, public auth: AuthService, public vault: WatchlistService, public toast: ToastService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.api.aiStatus().subscribe({ next: s => (this.status = s), error: () => {} });
    try { const saved = sessionStorage.getItem('cinebot'); if (saved) this.botMessages = JSON.parse(saved); } catch { /* storage unavailable */ }
    this.route.queryParamMap.subscribe(p => {
      const t = p.get('tool') as Tool;
      this.activate(this.tools.some(x => x.id === t) ? t : 'match');
      if (p.get('circle')) this.circleId = p.get('circle')!;
    });
  }

  ngAfterViewChecked(): void {
    if (this.scrollBot && this.botLog) { this.botLog.nativeElement.scrollTop = this.botLog.nativeElement.scrollHeight; this.scrollBot = false; }
  }

  select(t: Tool): void { this.router.navigate([], { queryParams: { tool: t }, queryParamsHandling: 'merge' }); }

  private activate(t: Tool): void {
    this.tool = t;
    if (t === 'match' && !this.match) this.loadMatch('');
    if (t === 'dna' && !this.dna) this.loadDna();
    if (t === 'review' && !this.history.length) this.api.aiReviewHistory().subscribe({ next: h => (this.history = h), error: () => {} });
    if (t === 'pulse' || (t === 'match' && this.matchMode === 'group')) this.loadCircles();
    if (t === 'bot') this.scrollBot = true;
  }

  loadCircles(): void {
    if (this.circles.length) return;
    this.api.myCircles().subscribe(c => {
      this.circles = c.filter(x => x.membership?.status === 'active');
      if (!this.circleId && this.circles.length) this.circleId = this.circles[0]._id;
    });
  }

  loadMatch(genre: string): void {
    this.matchGenre = genre;
    this.loadingMatch = true;
    this.api.cinematch({ genre, limit: 12 }).subscribe({
      next: m => { this.match = m; this.loadingMatch = false; },
      error: e => { this.loadingMatch = false; this.toast.error(e); }
    });
  }

  loadDna(): void {
    this.loadingDna = true;
    this.api.cinesense().subscribe({ next: d => { this.dna = d; this.loadingDna = false; }, error: e => { this.loadingDna = false; this.toast.error(e); } });
  }
  regenerateDna(): void {
    this.loadingDna = true;
    this.api.regenerateCinesense().subscribe({ next: d => { this.dna = d; this.loadingDna = false; this.toast.success('Movie DNA updated'); }, error: e => { this.loadingDna = false; this.toast.error(e); } });
  }
  get monthly(): any[] {
    return (this.dna?.profile.monthly || []).map((m: any) => {
      const d = new Date(m.month + '-01T00:00:00');
      return { label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }), short: d.toLocaleString('en-US', { month: 'short' }), value: m.watched, note: m.avgRating ? `avg ${m.avgRating}★` : '' };
    });
  }
  maxOf(list: any[]): number { return Math.max(0.01, ...list.map(x => x.score)); }
  maxCount(list: any[]): number { return Math.max(1, ...list.map(x => x.count)); }

  onPicked(m: any): void {
    if (this.picker === 'review') this.reviewMovie = m;
    if (this.picker === 'spoiler') this.spoilerMovie = m;
    this.picker = null;
  }

  detectSpoilers(): void {
    this.checkingSpoiler = true;
    this.api.detectSpoilers(this.spoilerText, this.spoilerMovie?._id).subscribe({
      next: r => { this.spoilerResult = r; this.checkingSpoiler = false; },
      error: e => { this.checkingSpoiler = false; this.toast.error(e); }
    });
  }
  setShield(on: boolean): void {
    this.auth.updatePreferences({ privacy: { ...(this.auth.currentUser?.privacy as any), spoilerShield: on } }).subscribe({
      next: () => this.toast.success(on ? 'Spoiler shield on' : 'Spoiler shield off'), error: e => this.toast.error(e)
    });
  }

  ask(text: string): void {
    const message = text.trim();
    if (!message || this.botBusy) return;
    const history = this.botMessages.map(m => ({ role: m.role, content: m.content }));
    this.botMessages.push({ role: 'user', content: message });
    this.botInput = ''; this.botBusy = true; this.scrollBot = true;
    this.api.botChat(message, history, this.spoilerFree).subscribe({
      next: (r: any) => { this.botMessages.push({ role: 'assistant', content: r.reply, movies: r.movies, followUps: r.followUps }); this.afterBot(); },
      error: e => { this.botMessages.push({ role: 'assistant', content: e.error?.message || 'Sorry, I could not answer that right now.' }); this.afterBot(); }
    });
  }
  private afterBot(): void {
    this.botBusy = false; this.scrollBot = true;
    try { sessionStorage.setItem('cinebot', JSON.stringify(this.botMessages.slice(-30))); } catch { /* storage unavailable */ }
  }
  escape(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  addToVault(m: any): void {
    if (this.vault.statusByMovie.has(m._id)) { this.router.navigate(['/movies', m._id]); return; }
    this.vault.addToWatchlist(m._id).subscribe({ next: () => this.toast.success(`${m.title} added to Want to Watch`), error: e => this.toast.error(e) });
  }
}
