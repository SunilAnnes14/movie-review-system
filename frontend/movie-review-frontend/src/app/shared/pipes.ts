import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', standalone: true, pure: false })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date | undefined | null): string {
    if (!value) return '';
    const d = new Date(value).getTime();
    const s = Math.round((Date.now() - d) / 1000);
    if (s < 0) {
      const f = -s;
      if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))}m`;
      if (f < 86400) return `in ${Math.round(f / 3600)}h`;
      return `in ${Math.round(f / 86400)}d`;
    }
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 604800) return `${Math.round(s / 86400)}d ago`;
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

@Pipe({ name: 'eventDate', standalone: true })
export class EventDatePipe implements PipeTransform {
  transform(value: string | Date | undefined | null, style: 'full' | 'short' = 'full'): string {
    if (!value) return '';
    const d = new Date(value);
    return style === 'short'
      ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
}

const STATUS_LABELS: Record<string, string> = { want_to_watch: 'Want to Watch', watching: 'Watching', watched: 'Watched', going: 'Going', maybe: 'Maybe', not_going: 'Not going', invited: 'Invited' };
@Pipe({ name: 'label', standalone: true })
export class LabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string { return value ? STATUS_LABELS[value] || value : ''; }
}

/** Minimal, safe markdown for CineBot replies: **bold**, bullets and line breaks. Escapes HTML first. */
@Pipe({ name: 'miniMarkdown', standalone: true })
export class MiniMarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const esc = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^[•\-*] (.*)$/gm, '<div class="md-li">• $1</div>')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }
}
