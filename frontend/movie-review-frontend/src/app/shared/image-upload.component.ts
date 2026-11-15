import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';

/** Upload an image (JPEG/PNG/WebP/GIF, max 2 MB) and emit its URL. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-image-upload',
  standalone: true,
  template: `
    <label class="btn btn-secondary btn-sm upload" [class.busy]="busy">
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="pick($event)" [disabled]="busy" />
      {{ busy ? 'Uploading…' : label }}
    </label>
  `,
  styles: [`.upload { position: relative; cursor: pointer; } .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } .busy { opacity: .6; }`]
})
export class ImageUploadComponent {
  @Input() label = 'Upload image';
  @Output() uploaded = new EventEmitter<string>();
  busy = false;

  constructor(private api: ApiService, private toast: ToastService) {}

  pick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.toast.error('Image must be 2 MB or smaller'); return; }
    this.busy = true;
    this.api.uploadImage(file).subscribe({
      next: r => { this.busy = false; this.uploaded.emit(r.url); this.toast.success('Image uploaded'); },
      error: err => { this.busy = false; this.toast.error(err, 'Upload failed'); }
    });
  }
}
