import { Injectable } from '@angular/core';

export interface Toast { id: number; title: string; body?: string; type: 'info' | 'success' | 'error'; link?: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts: Toast[] = [];
  private seq = 0;

  show(title: string, opts: { body?: string; type?: Toast['type']; link?: string; ms?: number } = {}): void {
    const t: Toast = { id: ++this.seq, title, body: opts.body, type: opts.type || 'info', link: opts.link };
    this.toasts = [...this.toasts.slice(-3), t];
    setTimeout(() => this.dismiss(t.id), opts.ms ?? 4500);
  }
  success(title: string, body?: string) { this.show(title, { body, type: 'success' }); }
  error(err: any, fallback = 'Something went wrong') {
    const msg = typeof err === 'string' ? err : err?.error?.message || (err?.status === 0 ? 'Cannot reach the MoviQ server' : fallback);
    this.show(msg, { type: 'error', ms: 6000 });
  }
  dismiss(id: number): void { this.toasts = this.toasts.filter(t => t.id !== id); }
}
