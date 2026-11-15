import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { MoviePickerComponent } from '../shared/movie-picker.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-create-poll',
  standalone: true,
  imports: [FormsModule, MoviePickerComponent],
  template: `
  <div class="modal-backdrop" (click)="close.emit()">
    <div class="modal" (click)="$event.stopPropagation()">
      <h2>🗳️ New CinePoll</h2>
      @if (!circleId) {
        <div class="form-group">
          <label class="form-label">CineCircle</label>
          <select class="form-select" [(ngModel)]="circle">
            <option value="">Select a circle…</option>
            @for (c of circles; track c._id) { <option [value]="c._id">{{ c.name }}</option> }
          </select>
          @if (!circles.length) { <p class="text-xs text-muted mt-1">Polls live inside a CineCircle — create or join one first.</p> }
        </div>
      }
      <div class="form-group"><label class="form-label">Question</label><input class="form-input" [(ngModel)]="question" maxlength="200" /></div>

      <label class="form-label">Movie options ({{ options.length }}/10)</label>
      <div class="stack" style="gap:6px">
        @for (m of options; track m._id; let i = $index) {
          <div class="poll-option" style="cursor:default">
            @if (m.poster) { <img [src]="m.poster" [alt]="m.title" /> } @else { <span class="mini-poster"></span> }
            <span class="grow">{{ m.title }} <span class="text-muted text-xs">{{ m.releaseYear }}</span></span>
            <button class="btn btn-danger btn-sm" (click)="options.splice(i, 1)">✕</button>
          </div>
        }
      </div>
      <div class="row mt-1">
        <button class="btn btn-secondary btn-sm" [disabled]="options.length >= 10" (click)="picker = true">+ Add movie</button>
        <button class="btn btn-outline btn-sm" [disabled]="!selectedCircle || suggesting" (click)="suggest()">{{ suggesting ? 'Thinking…' : '✨ Suggest with Group CineMatch' }}</button>
      </div>

      <div class="grid-2 mt-2">
        <div class="form-group">
          <label class="form-label">Voting closes (optional)</label>
          <input class="form-input" type="datetime-local" [(ngModel)]="expiresAt" [min]="minDate" />
        </div>
        <div class="form-group">
          <label class="form-label">Voting mode</label>
          <div class="row-wrap">
            <span class="chip" [class.active]="!multipleChoice" (click)="multipleChoice = false">Single choice</span>
            <span class="chip" [class.active]="multipleChoice" (click)="multipleChoice = true">Multiple choice</span>
          </div>
        </div>
      </div>
      @if (error) { <div class="error-box">{{ error }}</div> }
      <div class="modal-actions">
        <button class="btn btn-secondary" (click)="close.emit()">Cancel</button>
        <button class="btn btn-primary" [disabled]="saving || !selectedCircle || !question.trim() || options.length < 2" (click)="create()">{{ saving ? 'Creating…' : 'Start poll' }}</button>
      </div>
    </div>
  </div>
  @if (picker) { <cv-movie-picker title="Add a poll option" [selectedIds]="optionIds" (picked)="add($event)" (close)="picker = false" /> }
  `
})
export class CreatePollComponent implements OnInit {
  @Input() circleId?: string;
  @Output() created = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();
  circles: any[] = [];
  circle = '';
  question = 'What should we watch this Saturday?';
  options: any[] = [];
  multipleChoice = false;
  expiresAt = '';
  picker = false;
  saving = false;
  suggesting = false;
  error = '';
  minDate = new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16);

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    if (!this.circleId) this.api.myCircles().subscribe(c => (this.circles = c.filter(x => x.membership?.status === 'active')));
    const d = new Date(Date.now() + 2 * 86400000); d.setMinutes(0, 0, 0);
    this.expiresAt = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  get selectedCircle(): string { return this.circleId || this.circle; }
  get optionIds(): string[] { return this.options.map(o => o._id); }

  add(m: any): void {
    if (!this.optionIds.includes(m._id) && this.options.length < 10) this.options.push(m);
  }

  suggest(): void {
    this.suggesting = true;
    this.api.groupMatch(this.selectedCircle).subscribe({
      next: (r: any) => {
        for (const item of r.items.slice(0, 6)) if (this.options.length < 4) this.add(item.movie);
        this.suggesting = false;
        if (!r.items.length) this.toast.show('Group CineMatch has no suggestions yet');
      },
      error: e => { this.suggesting = false; this.toast.error(e); }
    });
  }

  create(): void {
    this.saving = true; this.error = '';
    this.api.createPoll({
      circleId: this.selectedCircle,
      question: this.question,
      options: this.optionIds,
      multipleChoice: this.multipleChoice,
      expiresAt: this.expiresAt ? new Date(this.expiresAt).toISOString() : undefined
    }).subscribe({
      next: p => { this.saving = false; this.created.emit(p); },
      error: e => { this.saving = false; this.error = e.error?.message || 'Could not create the poll'; }
    });
  }
}
