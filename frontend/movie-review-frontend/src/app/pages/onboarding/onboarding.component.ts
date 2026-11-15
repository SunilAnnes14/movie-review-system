import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MovieService } from '../../services/movie.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { GENRES } from '../../config';
import { PosterTileComponent } from '../../shared/poster-tile.component';

/** Cold-start onboarding: favourite genres, directors and movies seed CineMatch & CineSense. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule, PosterTileComponent],
  template: `
  <div class="v2-page onboarding">
    <div class="steps">
      @for (s of [1,2,3]; track s) { <span class="step" [class.on]="step >= s"></span> }
    </div>

    @if (step === 1) {
      <p class="v2-eyebrow">Step 1 of 3 · Your taste</p>
      <h1 class="v2-title">Which genres pull you in?</h1>
      <p class="v2-subtitle">Pick at least three. CineMatch uses these to recommend movies before you've rated anything.</p>
      <div class="row-wrap mt-3">
        @for (g of genres; track g) {
          <span class="chip big" [class.active]="selectedGenres.has(g)" (click)="toggle(selectedGenres, g)">{{ g }}</span>
        }
      </div>
    }

    @if (step === 2) {
      <p class="v2-eyebrow">Step 2 of 3 · Filmmakers</p>
      <h1 class="v2-title">Directors and actors you love</h1>
      <p class="v2-subtitle">Optional, but it sharpens your Movie DNA.</p>
      <h3 class="mt-3 mb-2">Directors</h3>
      <div class="row-wrap">
        @for (d of directors; track d) { <span class="chip" [class.active]="selectedDirectors.has(d)" (click)="toggle(selectedDirectors, d)">{{ d }}</span> }
      </div>
      <div class="input-row mt-2" style="max-width:420px">
        <input class="form-input" placeholder="Add another director" [(ngModel)]="customDirector" (keyup.enter)="addCustom('director')" />
        <button class="btn btn-secondary" (click)="addCustom('director')">Add</button>
      </div>
      <h3 class="mt-3 mb-2">Actors</h3>
      <div class="row-wrap">
        @for (a of actors; track a) { <span class="chip" [class.active]="selectedActors.has(a)" (click)="toggle(selectedActors, a)">{{ a }}</span> }
      </div>
      <div class="input-row mt-2" style="max-width:420px">
        <input class="form-input" placeholder="Add another actor" [(ngModel)]="customActor" (keyup.enter)="addCustom('actor')" />
        <button class="btn btn-secondary" (click)="addCustom('actor')">Add</button>
      </div>
    }

    @if (step === 3) {
      <p class="v2-eyebrow">Step 3 of 3 · Favourites</p>
      <h1 class="v2-title">Pick a few favourite movies</h1>
      <p class="v2-subtitle">Tap posters you love. They become the seed of your recommendations.</p>
      <div class="poster-grid mt-3">
        @for (m of movies; track m._id) {
          <div class="pick" [class.picked]="selectedMovies.has(m._id)">
            <cv-poster [movie]="m" [linkable]="false" (pick)="toggle(selectedMovies, m._id)" [badge]="selectedMovies.has(m._id) ? '♥ Favourite' : ''" />
          </div>
        }
      </div>
    }

    <div class="row between mt-3 actions">
      <button class="btn btn-outline" (click)="skip()">Skip for now</button>
      <div class="row">
        @if (step > 1) { <button class="btn btn-secondary" (click)="step = step - 1">Back</button> }
        @if (step < 3) {
          <button class="btn btn-primary" [disabled]="step === 1 && selectedGenres.size < 3" (click)="step = step + 1">Continue</button>
        } @else {
          <button class="btn btn-primary" [disabled]="saving" (click)="finish()">{{ saving ? 'Building your Movie DNA…' : 'Finish' }}</button>
        }
      </div>
    </div>
  </div>
  `,
  styles: [`
    .onboarding { max-width: 920px; }
    .steps { display: flex; gap: 8px; margin-bottom: 28px; }
    .step { height: 4px; flex: 1; border-radius: 4px; background: var(--bg-tertiary); transition: background .3s; }
    .step.on { background: var(--accent-gradient); }
    .chip.big { padding: 10px 18px; font-size: 0.92rem; }
    .pick.picked ::ng-deep .poster { box-shadow: 0 0 0 2px var(--accent); }
    .actions { position: sticky; bottom: 0; padding: 16px 0; background: linear-gradient(0deg, var(--bg-primary) 60%, transparent); }
  `]
})
export class OnboardingComponent implements OnInit {
  step = 1;
  genres = GENRES;
  directors: string[] = [];
  actors: string[] = [];
  movies: any[] = [];
  selectedGenres = new Set<string>();
  selectedDirectors = new Set<string>();
  selectedActors = new Set<string>();
  selectedMovies = new Set<string>();
  customDirector = '';
  customActor = '';
  saving = false;

  constructor(private movieService: MovieService, private auth: AuthService, private router: Router, private toast: ToastService) {}

  ngOnInit(): void {
    const u = this.auth.currentUser;
    (u?.favoriteGenres || []).forEach(g => this.selectedGenres.add(g));
    (u?.favoriteDirectors || []).forEach(d => this.selectedDirectors.add(d));
    (u?.favoriteActors || []).forEach(a => this.selectedActors.add(a));
    (u?.favoriteMovies || []).forEach(m => this.selectedMovies.add(String(m)));
    this.movieService.getMovies({ sort: 'rating', limit: 40 }).subscribe(r => {
      this.movies = r.movies;
      this.directors = [...new Set(r.movies.map(m => m.director))].slice(0, 16);
      const counts = new Map<string, number>();
      r.movies.forEach(m => m.cast.slice(0, 3).forEach(a => counts.set(a, (counts.get(a) || 0) + 1)));
      this.actors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([a]) => a);
    });
  }

  toggle(set: Set<string>, v: string): void { set.has(v) ? set.delete(v) : set.add(v); }

  addCustom(kind: 'director' | 'actor'): void {
    const v = (kind === 'director' ? this.customDirector : this.customActor).trim();
    if (!v) return;
    if (kind === 'director') { if (!this.directors.includes(v)) this.directors.push(v); this.selectedDirectors.add(v); this.customDirector = ''; }
    else { if (!this.actors.includes(v)) this.actors.push(v); this.selectedActors.add(v); this.customActor = ''; }
  }

  skip(): void {
    this.auth.updatePreferences({ onboarded: true }).subscribe({ next: () => this.router.navigate(['/']), error: e => this.toast.error(e) });
  }

  finish(): void {
    this.saving = true;
    this.auth.updatePreferences({
      favoriteGenres: [...this.selectedGenres],
      favoriteDirectors: [...this.selectedDirectors],
      favoriteActors: [...this.selectedActors],
      favoriteMovies: [...this.selectedMovies],
      onboarded: true
    }).subscribe({
      next: () => { this.toast.success('Your taste profile is ready', 'CineMatch is tuned to you.'); this.router.navigate(['/ai'], { queryParams: { tool: 'match' } }); },
      error: e => { this.saving = false; this.toast.error(e); }
    });
  }
}
