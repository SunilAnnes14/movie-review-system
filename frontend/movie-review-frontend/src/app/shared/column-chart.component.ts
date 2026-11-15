import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/** Single-series column chart (one hue, values on hover, recessive baseline, accessible table fallback). */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'cv-columns',
  standalone: true,
  template: `
    <div class="chart" role="img" [attr.aria-label]="ariaLabel">
      <div class="plot" [style.height.px]="height">
        @for (d of data; track d.label; let i = $index) {
          <div class="col" (mouseenter)="hover = i" (mouseleave)="hover = -1" (focus)="hover = i" (blur)="hover = -1" tabindex="0">
            <div class="mark" [style.height.%]="pct(d.value)" [class.zero]="!d.value"></div>
            @if (hover === i) { <div class="tip"><strong>{{ d.value }}</strong> {{ unit }}<span>{{ d.label }}</span>@if (d.note) { <span>{{ d.note }}</span> }</div> }
          </div>
        }
      </div>
      <div class="axis">
        @for (d of data; track d.label; let i = $index) { <span [class.show]="i % labelEvery === 0 || i === data.length - 1">{{ d.short || d.label }}</span> }
      </div>
      <table class="sr-only"><tbody>@for (d of data; track d.label) { <tr><th>{{ d.label }}</th><td>{{ d.value }} {{ unit }}</td></tr> }</tbody></table>
    </div>
  `,
  styles: [`
    .plot { display: flex; align-items: flex-end; gap: 6px; border-bottom: 1px solid var(--border-hover); padding-top: 8px; }
    .col { flex: 1; height: 100%; display: flex; align-items: flex-end; position: relative; cursor: default; outline: none; }
    .mark { width: 100%; max-width: 28px; margin: 0 auto; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 2px; transition: height .5s cubic-bezier(.2,.8,.2,1), opacity .15s; opacity: .85; }
    .mark.zero { background: var(--border-hover); }
    .col:hover .mark, .col:focus .mark { opacity: 1; }
    .tip { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: var(--bg-secondary); border: 1px solid var(--border-hover); border-radius: 8px; padding: 6px 10px; font-size: .75rem; white-space: nowrap; z-index: 5; box-shadow: var(--shadow-md); color: var(--text-primary); }
    .tip span { display: block; color: var(--text-muted); }
    .axis { display: flex; gap: 6px; margin-top: 6px; }
    .axis span { flex: 1; text-align: center; font-size: .65rem; color: var(--text-muted); visibility: hidden; white-space: nowrap; }
    .axis span.show { visibility: visible; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `]
})
export class ColumnChartComponent {
  @Input() data: { label: string; short?: string; value: number; note?: string }[] = [];
  @Input() height = 140;
  @Input() unit = '';
  @Input() ariaLabel = 'Column chart';
  hover = -1;
  get max(): number { return Math.max(1, ...this.data.map(d => d.value)); }
  get labelEvery(): number { return this.data.length > 8 ? 2 : 1; }
  pct(v: number): number { return (v / this.max) * 100; }
}
