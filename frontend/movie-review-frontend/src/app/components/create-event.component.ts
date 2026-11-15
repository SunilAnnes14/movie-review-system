import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { MoviePickerComponent } from '../shared/movie-picker.component';
import { AvatarComponent } from '../shared/avatar.component';

/** CinePlan: create a movie night, optionally converting a closed poll's winner. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-create-event',
  standalone: true,
  imports: [FormsModule, MoviePickerComponent, AvatarComponent],
  template: `
  <div class="modal-backdrop" (click)="close.emit()">
    <div class="modal" (click)="$event.stopPropagation()">
      <h2>📅 Plan a movie night</h2>
      @if (poll) { <div class="info-box mb-2">From poll “{{ poll.question }}” — the winner is pre-selected and the event will link back to the poll.</div> }

      @if (!fixedCircle) {
        <div class="form-group">
          <label class="form-label">CineCircle</label>
          <select class="form-select" [(ngModel)]="circle" (ngModelChange)="loadMembers()">
            <option value="">Select a circle…</option>
            @for (c of circles; track c._id) { <option [value]="c._id">{{ c.name }}</option> }
          </select>
        </div>
      }

      <div class="form-group">
        <label class="form-label">Movie</label>
        @if (movie) {
          <div class="poll-option" style="cursor:default">
            @if (movie.poster) { <img [src]="movie.poster" [alt]="movie.title" /> }
            <span class="grow"><strong>{{ movie.title }}</strong> <span class="text-xs text-muted">{{ movie.releaseYear }}</span></span>
            <button class="btn btn-outline btn-sm" (click)="picker = true">Change</button>
          </div>
        } @else { <button class="btn btn-secondary btn-sm" (click)="picker = true">Choose a movie</button> }
      </div>

      <div class="form-group"><label class="form-label">Title</label><input class="form-input" [(ngModel)]="title" maxlength="120" [placeholder]="movie ? movie.title + ' movie night' : 'Saturday Movie Night'" /></div>
      <div class="grid-2">
        <div class="form-group"><label class="form-label">Date & time</label><input class="form-input" type="datetime-local" [(ngModel)]="startsAt" [min]="minDate" /></div>
        <div class="form-group"><label class="form-label">Cinema / location</label><input class="form-input" [(ngModel)]="venue" maxlength="200" placeholder="Grand Cinema, Screen 4" /></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label class="form-label">Address (optional)</label><input class="form-input" [(ngModel)]="address" maxlength="300" /></div>
        <div class="form-group"><label class="form-label">Booking link (optional)</label><input class="form-input" [(ngModel)]="bookingUrl" placeholder="https://…" /></div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" rows="2" [(ngModel)]="description" maxlength="2000" placeholder="Snacks at mine first, then the 7pm show!"></textarea></div>

      @if (members.length) {
        <div class="form-group">
          <label class="form-label">Invite ({{ invite.size }}/{{ members.length }})</label>
          <div class="row-wrap">
            @for (m of members; track m.user._id) {
              <span class="chip" [class.active]="invite.has(m.user._id)" (click)="toggle(m.user._id)"><cv-avatar [user]="m.user" size="sm" /> {{ m.user.name }}</span>
            }
          </div>
        </div>
      }
      @if (error) { <div class="error-box">{{ error }}</div> }
      <div class="modal-actions">
        <button class="btn btn-secondary" (click)="close.emit()">Cancel</button>
        <button class="btn btn-primary" [disabled]="saving || !selectedCircle || !movie || !startsAt" (click)="create()">{{ saving ? 'Creating…' : 'Create event' }}</button>
      </div>
    </div>
  </div>
  @if (picker) { <cv-movie-picker title="Movie for the night" (picked)="movie = $event; picker = false" (close)="picker = false" /> }
  `
})
export class CreateEventComponent implements OnInit {
  @Input() circleId?: string;
  @Input() poll?: any;
  @Output() created = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  circles: any[] = [];
  circle = '';
  members: any[] = [];
  invite = new Set<string>();
  movie: any = null;
  title = '';
  startsAt = '';
  venue = '';
  address = '';
  bookingUrl = '';
  description = '';
  picker = false;
  saving = false;
  error = '';
  minDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  constructor(private api: ApiService) {}

  get fixedCircle(): string | undefined { return this.circleId || this.poll?.circle?._id || this.poll?.circle; }
  get selectedCircle(): string { return this.fixedCircle || this.circle; }

  ngOnInit(): void {
    if (!this.fixedCircle) this.api.myCircles().subscribe(c => (this.circles = c.filter(x => x.membership?.status === 'active')));
    else this.loadMembers();
    if (this.poll?.winner) {
      const w = this.poll.options.find((o: any) => o._id === this.poll.winner);
      if (w?.movie) { this.movie = w.movie; this.title = `${w.movie.title} movie night`; }
    }
    const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(19, 0, 0, 0);
    this.startsAt = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  loadMembers(): void {
    if (!this.selectedCircle) { this.members = []; return; }
    this.api.circleMembers(this.selectedCircle).subscribe(m => {
      this.members = m.filter(x => x.status === 'active');
      this.invite = new Set(this.members.map(x => x.user._id));
    });
  }
  toggle(id: string): void { this.invite.has(id) ? this.invite.delete(id) : this.invite.add(id); }

  create(): void {
    this.saving = true; this.error = '';
    this.api.createEvent({
      circleId: this.selectedCircle,
      pollId: this.poll?._id,
      movieId: this.movie?._id,
      title: this.title,
      startsAt: new Date(this.startsAt).toISOString(),
      venue: this.venue, address: this.address, bookingUrl: this.bookingUrl, description: this.description,
      invite: [...this.invite]
    }).subscribe({
      next: e => { this.saving = false; this.created.emit(e); },
      error: e => { this.saving = false; this.error = e.error?.message || 'Could not create the event'; }
    });
  }
}
