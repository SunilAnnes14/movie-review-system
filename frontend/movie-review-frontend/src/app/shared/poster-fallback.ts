/**
 * Inline SVG poster for movies without artwork (no network request, matches the gold theme).
 */
export function posterFallback(title = 'CineVault'): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const words = esc(title).split(/\s+/);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 14) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  const text = lines.slice(0, 5).map((l, i) => `<tspan x="28" dy="${i === 0 ? 0 : 38}">${l}</tspan>`).join('');
  const y = 450 - 40 - (Math.min(lines.length, 5) - 1) * 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
<defs><radialGradient id="g" cx="20%" cy="0%" r="90%"><stop offset="0" stop-color="#5a4620"/><stop offset="0.6" stop-color="#1c1912"/><stop offset="1" stop-color="#111114"/></radialGradient></defs>
<rect width="300" height="450" fill="url(#g)"/><rect x="28" y="${y - 44}" width="30" height="3" fill="#d4a64a"/>
<text x="28" y="${y}" fill="#f1e3c2" font-family="Georgia, serif" font-size="32" font-weight="600">${text}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
