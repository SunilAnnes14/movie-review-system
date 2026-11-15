import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { AvatarComponent } from '../shared/avatar.component';

/** Send a movie card (or a review) into one of the user's CineChat conversations. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-share-to-chat',
  standalone: true,
  imports: [FormsModule, AvatarComponent],
  template: `
  <div class="modal-backdrop" (click)="close.emit()">
    <div class="modal" (click)="$event.stopPropagation()">
      <h2>Share {{ reviewId ? 'review' : 'movie' }} in CineChat</h2>
      <p class="text-secondary text-sm mb-2">🎬 {{ movieTitle }}</p>
      <input class="form-input" [(ngModel)]="note" maxlength="500" placeholder="Add a message (optional)" />
      @if (!reviewId) { <label class="switch text-sm mt-1"><input type="checkbox" [(ngModel)]="asRecommendation" /> Send as a recommendation</label> }
      <div class="list mt-2" style="max-height: 45vh; overflow-y: auto">
        @if (loading) { <p class="text-muted text-sm">Loading conversations…</p> }
        @for (c of conversations; track c._id) {
          <button class="list-row conv" [disabled]="sending" (click)="send(c)">
            @if (c.type === 'circle') { <span class="ci">🎟️</span> } @else { <cv-avatar [user]="c.participants[0]" size="sm" /> }
            <span class="grow title">{{ c.title }}</span>
            <span class="text-xs text-muted">{{ c.type === 'circle' ? 'Group' : 'Direct' }}</span>
          </button>
        } @empty { @if (!loading) { <p class="text-muted text-sm">No conversations yet. Add a friend or join a CineCircle first.</p> } }
      </div>
      <div class="modal-actions"><button class="btn btn-secondary" (click)="close.emit()">Cancel</button></div>
    </div>
  </div>
  `,
  styles: [`.conv { width: 100%; background: none; color: inherit; text-align: left; border-radius: 8px; } .conv:hover { background: rgba(255,255,255,0.04); } .ci { width: 28px; text-align: center; }`]
})
export class ShareToChatComponent implements OnInit {
  @Input({ required: true }) movieId!: string;
  @Input() movieTitle = '';
  @Input() reviewId?: string;
  @Output() close = new EventEmitter<void>();
  conversations: any[] = [];
  loading = true;
  sending = false;
  note = '';
  asRecommendation = true;

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.api.conversations().subscribe({
      next: c => { this.conversations = c.map(x => ({ ...x, participants: x.participants.filter((p: any) => p.name === x.title).concat(x.participants) })); this.loading = false; },
      error: e => { this.loading = false; this.toast.error(e); }
    });
  }

  send(c: any): void {
    this.sending = true;
    const body = this.reviewId
      ? { kind: 'review', reviewId: this.reviewId, text: this.note }
      : { kind: this.asRecommendation ? 'recommendation' : 'movie', movieId: this.movieId, text: this.note };
    this.api.sendMessage(c._id, body).subscribe({
      next: () => { this.toast.success(`Shared with ${c.title}`); this.close.emit(); },
      error: e => { this.sending = false; this.toast.error(e); }
    });
  }
}
