/**
 * Live check against the REAL Anthropic and TMDB services, using the keys in backend/.env.
 * Run it only after adding ANTHROPIC_API_KEY and/or TMDB_READ_TOKEN (or TMDB_API_KEY) and
 * restarting the backend. It makes a handful of small requests (a few Claude calls cost cents),
 * does not import movies or otherwise change the catalog, and skips any service without a key.
 *
 * Usage: npm run test:live      (backend must be running on PORT, seeded demo user present)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.existsSync(path.join(here, '..', '.env')) ? fs.readFileSync(path.join(here, '..', '.env'), 'utf8') : '';
const has = (k) => new RegExp(`^${k}=.+`, 'm').test(envText);
const BASE = process.env.API_URL || 'http://localhost:5000/api';

let passed = 0, failed = 0, skipped = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`); }
}
async function call(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: json };
}

(async () => {
  console.log(`\nMoviQ LIVE service check -> ${BASE}\n`);
  const login = await call('POST', '/auth/login', { body: { email: 'john@example.com', password: 'password123' } });
  const T = login.body?.token;
  if (!T) { console.log('Cannot sign in as john@example.com - is the backend running and seeded?'); process.exitCode = 1; return; }

  console.log('TMDB');
  if (has('TMDB_READ_TOKEN') || has('TMDB_API_KEY')) {
    let r = await call('GET', '/tmdb/status');
    check('backend reports TMDB configured (restart the backend after editing .env)', r.body?.configured === true);
    r = await call('GET', '/tmdb/search?q=Nayakan');
    const hit = r.body?.results?.find(m => m.releaseYear === 1987);
    check('real TMDB search returns Nayakan (1987)', r.status === 200 && !!hit, `status=${r.status} ${r.body?.message || ''}`);
    check('real poster URL returned', /^https:\/\/image\.tmdb\.org\/t\/p\//.test(hit?.poster || ''));
    check('original language is Tamil', hit?.language === 'ta');
    if (hit) {
      r = await call('GET', `/tmdb/movie/${hit.tmdbId}`);
      check('real details include director Mani Ratnam', r.status === 200 && r.body?.director === 'Mani Ratnam', `director=${r.body?.director}`);
    }
    r = await call('GET', '/discover/trending');
    check('Discover trending is served from TMDB', r.body?.source === 'tmdb' && r.body.items.length > 0);
  } else { skipped++; console.log('  skip no TMDB_READ_TOKEN / TMDB_API_KEY in backend/.env'); }

  console.log('Anthropic');
  if (has('ANTHROPIC_API_KEY')) {
    let r = await call('GET', '/ai/status', { token: T });
    check('backend reports the LLM enabled (restart the backend after editing .env)', r.body?.llm === true, JSON.stringify(r.body?.services || {}));
    r = await call('POST', '/ai/bot/chat', { token: T, body: { message: 'Recommend two Tamil thrillers from the catalog.' } });
    check('CineBot answered through the real model', r.status === 200 && r.body?.provider === 'llm', `status=${r.status} ${r.body?.message || ''}`);
    check('CineBot grounded its answer in catalog movies', (r.body?.movies || []).length > 0);
    console.log(`       reply: ${String(r.body?.reply || '').replace(/\s+/g, ' ').slice(0, 160)}…`);
    r = await call('POST', '/ai/review/rewrite', { token: T, body: { text: 'Great movie, the acting was good and I liked the music.', style: 'short' } });
    check('Review rewrite returned structured output from the real model', r.status === 200 && typeof r.body?.rewritten === 'string' && r.body.rewritten.length > 0, `status=${r.status} ${r.body?.message || ''}`);
  } else { skipped++; console.log('  skip no ANTHROPIC_API_KEY in backend/.env'); }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} service(s) skipped`);
  process.exitCode = failed ? 1 : 0; // let open sockets close naturally (process.exit can trip a libuv assertion on Windows)
})();
