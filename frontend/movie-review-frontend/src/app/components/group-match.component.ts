import { Component, Input, OnChanges, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { AvatarComponent } from '../shared/avatar.component';

/** Group CineMatch: fairness-aware recommendations for a CineCircle. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-group-match',
  standalone: true,
  imports: [RouterLink, AvatarComponent],
  template: `
  @if (loading) { <div class="loading-container"><div class="spinner"></div><p class="loading-text">Balancing everyone's taste…</p></div> }
  @if (error) { <div class="error-box">{{ error }}</div> }
  @if (data && !loading) {
    <div class="panel panel-gold row between wrap">
      <div>
        <div class="v2-eyebrow">Group taste compatibility</div>
        <div class="big">{{ data.compatibility }}%</div>
        <p class="text-xs text-muted" style="max-width:440px">{{ data.method }}</p>
      </div>
      <div>
        <p class="text-xs text-muted mb-2">Include members</p>
        <div class="row-wrap">
          @for (m of allMembers; track m.userId) {
            <span class="chip" [class.active]="selected.has(m.userId)" (click)="toggle(m.userId)"><cv-avatar [user]="{ name: m.name }" size="sm" /> {{ m.name }} @if (m.coldStart) { <span class="pill">new</span> }</span>
          }
        </div>
      </div>
    </div>

    @if (!data.items.length) { <div class="state"><div class="icon">🎬</div><p>No unseen movies left that the group hasn't already watched. Add more movies from Discover.</p></div> }

    <div class="stack mt-2">
      @for (r of data.items; track r.movie._id; let i = $index) {
        <div class="panel rec">
          <a [routerLink]="['/movies', r.movie._id]" class="poster" [style.background-image]="r.movie.poster ? 'url(' + r.movie.poster + ')' : ''"></a>
          <div class="grow" style="min-width:0">
            <div class="row between wrap">
              <div class="row" style="gap:8px"><span class="rank">#{{ i + 1 }}</span><a [routerLink]="['/movies', r.movie._id]"><strong>{{ r.movie.title }}</strong></a><span class="text-muted text-sm">{{ r.movie.releaseYear }}</span></div>
              <div class="row"><span class="pill pill-gold">{{ r.groupMatch }}% group match</span>@if (r.broadAppeal) { <span class="pill pill-green">Broad appeal</span> }</div>
            </div>
            <div class="text-xs text-muted">{{ r.movie.genre.join(' · ') }} · {{ r.agreement }}% agreement</div>
            <ul class="reasons">@for (why of r.reasons; track $index) { <li>{{ why }}</li> }</ul>
            <div class="members">
              @for (m of r.members; track m.userId) {
                <div class="bar-row"><span class="label truncate">{{ m.name }}</span><div class="bar"><span [style.width.%]="m.match"></span></div><span class="num">{{ m.match }}%</span></div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  }
  `,
  styles: [`
    .big { font-family: var(--font-display); font-size: 2.6rem; color: var(--accent); line-height: 1; margin: 4px 0; }
    .wrap { flex-wrap: wrap; gap: 14px; }
    .rec { display: flex; gap: 16px; align-items: flex-start; }
    .poster { width: 84px; aspect-ratio: 2/3; border-radius: 8px; background: var(--bg-tertiary) center/cover; flex-shrink: 0; }
    .rank { color: var(--accent); font-family: var(--font-display); font-weight: 700; }
    .reasons { margin: 8px 0; padding-left: 0; } .reasons li { font-size: .85rem; color: var(--text-secondary); } .reasons li::before { content: '✦ '; color: var(--accent); }
    .members .bar-row { grid-template-columns: 110px 1fr 44px; margin: 4px 0; }
  `]
})
export class GroupMatchComponent implements OnChanges {
  @Input({ required: true }) circleId!: string;
  data: any = null;
  allMembers: any[] = [];
  selected = new Set<string>();
  loading = false;
  error = '';

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnChanges(): void { this.allMembers = []; this.selected.clear(); this.load(); }

  toggle(id: string): void {
    if (this.selected.has(id) && this.selected.size <= 1) return;
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    this.load();
  }

  load(): void {
    this.loading = true; this.error = '';
    const members = this.selected.size && this.selected.size < this.allMembers.length ? [...this.selected] : undefined;
    this.api.groupMatch(this.circleId, members).subscribe({
      next: d => {
        this.data = d; this.loading = false;
        if (!this.allMembers.length) { this.allMembers = d.members; d.members.forEach((m: any) => this.selected.add(m.userId)); }
      },
      error: e => { this.loading = false; this.error = e.error?.message || 'Could not compute group recommendations'; }
    });
  }
}
