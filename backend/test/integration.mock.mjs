/**
 * Integration test for the LLM (Anthropic) and TMDB code paths, run against local contract mocks.
 *
 * Without real credentials those paths can't be called live, so this test:
 *   1. starts a mock Anthropic Messages API and a mock TMDB API that speak the real wire formats
 *      and VALIDATE every request our backend sends (model, headers, effort, fallbacks,
 *      structured-output schema, tool_use/tool_result pairing, TMDB auth...),
 *   2. starts a separate backend instance (port 5050, its own throwaway database) configured with
 *      ANTHROPIC_API_KEY / TMDB_READ_TOKEN and pointed at the mocks,
 *   3. drives every integration path through the public API,
 *   4. drops the throwaway database.
 *
 * Requires a MongoDB reachable at 127.0.0.1:27017 (e.g. the dev backend's managed mongod is running).
 * Usage: npm run test:integration
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(here, '..');
const PORT = 5050, ANTHROPIC_PORT = 5101, TMDB_PORT = 5102;
const BASE = `http://127.0.0.1:${PORT}/api`;
const DB_URI = 'mongodb://127.0.0.1:27017/cinevault_integration_test';

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`); }
}

// ------------------------------------------------------------------ mock Anthropic
const anthropicLog = [];      // every request body
const violations = [];        // contract violations found in our requests

function readBody(req) {
  return new Promise(resolve => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => resolve(d)); });
}
const message = (content, stop_reason = 'end_turn') => ({
  id: `msg_${Math.random().toString(36).slice(2)}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 }
});
const textOfUser = (m) => (typeof m.content === 'string' ? m.content : (m.content || []).filter(b => b.type === 'text').map(b => b.text).join(' '));

const anthropic = http.createServer(async (req, res) => {
  const raw = await readBody(req);
  const send = (status, obj, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
  if (!req.url.startsWith('/v1/messages') || req.method !== 'POST') return send(404, { type: 'error', error: { type: 'not_found_error', message: 'not found' } });

  let body;
  try { body = JSON.parse(raw); } catch { return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad json' } }); }
  anthropicLog.push(body);

  // ---- contract checks on every request
  const v = (msg) => violations.push(msg);
  // SDK 1.x sends API keys as 'Authorization: Bearer <key>'; older clients use 'x-api-key'. Accept either, but the key must match.
  const sentKey = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (sentKey !== 'test-anthropic-key') v('API key missing or incorrect');
  if (!String(req.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01')) v('missing server-side-fallback beta header');
  if (body.fallbacks !== 'default') v('fallbacks should be "default"');
  if (body.model !== 'claude-opus-5-5') v(`unexpected model ${body.model}`);
  if (!Number.isInteger(body.max_tokens) || body.max_tokens <= 0) v('max_tokens missing');
  if (!body.output_config?.effort) v('output_config.effort missing');
  for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) if (k in body) v(`${k} must not be sent`);
  if (body.output_config?.format && body.output_config.format.type !== 'json_schema') v('output_config.format.type must be json_schema');
  if (!Array.isArray(body.messages) || body.messages[0]?.role !== 'user') v('first message must be a user turn');
  // every tool_result must answer a tool_use from the immediately preceding assistant turn
  body.messages.forEach((m, i) => {
    if (m.role !== 'user' || !Array.isArray(m.content)) return;
    const results = m.content.filter(b => b.type === 'tool_result');
    if (!results.length) return;
    const prev = body.messages[i - 1];
    const ids = new Set((Array.isArray(prev?.content) ? prev.content : []).filter(b => b.type === 'tool_use').map(b => b.id));
    for (const r of results) if (!ids.has(r.tool_use_id)) v(`tool_result ${r.tool_use_id} has no matching tool_use`);
    if (m.content.some(b => b.type !== 'tool_result')) v('tool_result message must contain only tool_result blocks');
  });
  if (body.tools) for (const t of body.tools) if (!t.name || !t.input_schema || t.input_schema.type !== 'object') v(`malformed tool ${t.name}`);

  const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system || '');
  const last = body.messages[body.messages.length - 1];
  const lastText = textOfUser(last);

  // ---- error scenarios
  if (lastText.includes('RATE_LIMIT_ME') || JSON.stringify(body).includes('RATE_LIMIT_ME')) return send(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '0' });
  if (JSON.stringify(body.messages).includes('REFUSE_ME')) return send(200, { ...message([]), stop_reason: 'refusal' });

  // ---- CineBot: tool loop
  if (system.includes('You are CineBot')) {
    const toolResults = Array.isArray(last.content) ? last.content.filter(b => b.type === 'tool_result') : [];
    if (!toolResults.length) {
      return send(200, message([
        { type: 'text', text: 'Let me look that up.' },
        { type: 'tool_use', id: 'toolu_mock_1', name: 'search_catalog', input: { language: 'ta', genre: 'Action' } }
      ], 'tool_use'));
    }
    let found = [];
    try { found = JSON.parse(toolResults[0].content); } catch { /* ignore */ }
    const title = Array.isArray(found) && found[0]?.title ? found[0].title : 'nothing';
    return send(200, message([{ type: 'text', text: `From the catalog, **${title}** is a strong Tamil action pick.\nFOLLOWUPS: More like ${title} | Something lighter` }]));
  }
  // ---- Review rewrite (structured output)
  if (system.includes('editor for movie reviews')) {
    return send(200, message([{ type: 'text', text: JSON.stringify({ rewritten: 'A luminous, gripping film that I adored.', changes: ['More vivid wording'] }) }]));
  }
  // ---- CineSpoiler verification (structured output)
  if (system.includes('classify movie-related sentences')) {
    const lines = lastText.split('\n').filter(l => /^\d+\. /.test(l));
    const results = lines.map(l => ({ index: Number(l.split('.')[0]), spoiler: /turns out|reveal/i.test(l) }));
    return send(200, message([{ type: 'text', text: JSON.stringify({ results }) }]));
  }
  // ---- CineSense narrative (structured output)
  if (system.includes('movie personality')) {
    return send(200, message([{ type: 'text', text: JSON.stringify({ personality: 'MOCK-LLM: You gravitate to intense Tamil action thrillers.' }) }]));
  }
  return send(200, message([{ type: 'text', text: 'ok' }]));
});

// ------------------------------------------------------------------ mock TMDB
const tmdbLog = [];
const FIXTURES = {
  90001: { id: 90001, title: 'Vikram Vedha', original_language: 'ta', release_date: '2017-07-21', overview: 'A tough police officer hunts a gangster who tells him stories that challenge his idea of right and wrong.', genres: [{ id: 28, name: 'Action' }, { id: 80, name: 'Crime' }, { id: 53, name: 'Thriller' }], runtime: 147, vote_average: 8.2, popularity: 40, poster_path: '/vv.jpg', backdrop_path: '/vvb.jpg', tagline: '',
    credits: { cast: [{ name: 'R. Madhavan', character: 'Vikram' }, { name: 'Vijay Sethupathi', character: 'Vedha' }], crew: [{ job: 'Director', name: 'Pushkar–Gayathri' }] },
    keywords: { keywords: [{ name: 'cat and mouse' }, { name: 'moral dilemma' }] }, videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'mockKey1' }] } },
  90002: { id: 90002, title: 'Jigarthanda', original_language: 'ta', release_date: '2014-08-01', overview: 'An aspiring filmmaker researches a feared gangster for his debut film.', genres: [{ id: 80, name: 'Crime' }, { id: 35, name: 'Comedy' }, { id: 28, name: 'Action' }], runtime: 171, vote_average: 7.9, popularity: 20, poster_path: '/jt.jpg', backdrop_path: null,
    credits: { cast: [{ name: 'Siddharth', character: 'Karthik' }, { name: 'Bobby Simha', character: 'Sethu' }], crew: [{ job: 'Director', name: 'Karthik Subbaraj' }] },
    keywords: { keywords: [{ name: 'gangster' }] }, videos: { results: [] } },
  90003: { id: 90003, title: 'Kadaisi Vivasayi', original_language: 'ta', release_date: '2022-02-11', overview: 'An elderly farmer\'s quiet life is disrupted by a misunderstanding.', genres: [{ id: 18, name: 'Drama' }], runtime: 143, vote_average: 7.6, popularity: 10, poster_path: '/kv.jpg', backdrop_path: null,
    credits: { cast: [{ name: 'Nallandi', character: 'Mayandi' }], crew: [{ job: 'Director', name: 'M. Manikandan' }] },
    keywords: { keywords: [{ name: 'farmer' }] }, videos: { results: [] } }
};
const summary = (f) => ({ id: f.id, title: f.title, overview: f.overview, poster_path: f.poster_path, backdrop_path: f.backdrop_path, release_date: f.release_date, genre_ids: f.genres.map(g => g.id), vote_average: f.vote_average, popularity: f.popularity, original_language: f.original_language });

const tmdb = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  tmdbLog.push({ path: url.pathname, auth: req.headers.authorization || null, query: Object.fromEntries(url.searchParams) });
  const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.headers.authorization !== 'Bearer test-tmdb-token') return send(401, { status_message: 'Invalid API key' });
  const p = url.pathname.replace(/^\/3/, '');
  if (p === '/search/movie') {
    const q = (url.searchParams.get('query') || '').toLowerCase();
    if (q === 'boom') return send(500, { status_message: 'internal' });
    const results = Object.values(FIXTURES).filter(f => f.title.toLowerCase().includes(q)).map(summary);
    return send(200, { page: 1, total_pages: 1, results });
  }
  if (p.startsWith('/trending/movie/')) return send(200, { results: Object.values(FIXTURES).map(summary) });
  if (p === '/discover/movie') return send(200, { results: Object.values(FIXTURES).filter(f => f.genres.some(g => String(g.id) === url.searchParams.get('with_genres'))).map(summary) });
  const m = p.match(/^\/movie\/(\d+)$/);
  if (m) return FIXTURES[m[1]] ? send(200, FIXTURES[m[1]]) : send(404, { status_message: 'not found' });
  return send(404, { status_message: 'unknown endpoint' });
});

// ------------------------------------------------------------------ helpers
async function call(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: json };
}
const listen = (srv, port) => new Promise(resolve => srv.listen(port, '127.0.0.1', resolve));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let backend;
async function startBackend() {
  backend = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(PORT), MONGO_URI: DB_URI, MONGO_FALLBACK: 'false',
      ANTHROPIC_API_KEY: 'test-anthropic-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${ANTHROPIC_PORT}`, AI_PROVIDER: '',
      TMDB_READ_TOKEN: 'test-tmdb-token', TMDB_API_KEY: '', TMDB_BASE_URL: `http://127.0.0.1:${TMDB_PORT}/3`,
      SCHEDULER_INTERVAL_MS: '600000', LOG_CLIENT_ERRORS: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  backend.stdout.on('data', d => (out += d));
  backend.stderr.on('data', d => (out += d));
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up yet */ }
    if (backend.exitCode !== null) break;
    await sleep(500);
  }
  throw new Error(`integration backend did not start:\n${out.slice(-800)}`);
}

// ------------------------------------------------------------------ test
async function run() {
  console.log('\nCineVault integration test (Anthropic + TMDB contract mocks)\n');
  await listen(anthropic, ANTHROPIC_PORT);
  await listen(tmdb, TMDB_PORT);
  await startBackend();

  const reg = await call('POST', '/auth/register', { body: { name: 'Integration Tester', email: `int-${Date.now()}@example.com`, password: 'secret123' } });
  const T = reg.body?.token;
  check('test user registered on integration backend', reg.status === 201 && !!T);

  console.log('TMDB');
  let r = await call('GET', '/tmdb/status');
  check('TMDB reported as configured', r.body?.configured === true);
  r = await call('GET', '/tmdb/search?q=vikram');
  const hit = r.body?.results?.[0];
  check('search maps TMDB results', r.status === 200 && hit?.tmdbId === 90001 && hit.title === 'Vikram Vedha' && hit.releaseYear === 2017);
  check('poster URL built from TMDB image base', hit?.poster === 'https://image.tmdb.org/t/p/w342/vv.jpg');
  check('genre ids mapped to names', JSON.stringify(hit?.genre) === JSON.stringify(['Action', 'Crime', 'Thriller']));
  check('original language mapped', hit?.language === 'ta');
  check('TMDB called with bearer token', tmdbLog.every(l => l.auth === 'Bearer test-tmdb-token'));
  r = await call('GET', '/tmdb/trending');
  check('trending proxied', r.status === 200 && r.body.length === 3);
  r = await call('GET', '/discover/trending');
  check('Discover trending uses TMDB when configured', r.body?.source === 'tmdb' && r.body.items.length === 3);
  r = await call('GET', '/tmdb/genre/Crime');
  check('genre browse uses discover endpoint', r.status === 200 && r.body.length === 2 && tmdbLog.some(l => l.path === '/3/discover/movie' && l.query.with_genres === '80'));
  r = await call('GET', '/tmdb/movie/90001');
  check('details include director, cast and trailer', r.body?.director === 'Pushkar–Gayathri' && r.body.cast.includes('Vijay Sethupathi') && r.body.trailer === 'https://www.youtube.com/watch?v=mockKey1');

  r = await call('POST', '/movies/import/90001', { token: T });
  const imported = r.body;
  check('import creates a catalog movie', r.status === 201 && imported?.tmdbId === 90001 && imported.director === 'Pushkar–Gayathri');
  check('import stores characters, keywords and language', imported?.characters?.includes('Vedha') && imported.keywords.includes('moral dilemma') && imported.originalLanguage === 'ta');
  r = await call('POST', '/movies/import/90001', { token: T });
  check('re-import is idempotent', r.status === 200 && r.body._id === imported._id);
  r = await call('POST', '/movies/import/12345', { token: T });
  check('unknown TMDB id returns 404', r.status === 404);
  r = await call('GET', '/tmdb/search?q=boom');
  check('TMDB server error surfaces as 502', r.status === 502);
  for (const id of [90002, 90003]) await call('POST', `/movies/import/${id}`, { token: T });
  r = await call('GET', '/movies?language=ta');
  check('imported films appear in the Tamil filter', r.body?.total === 3);

  console.log('Anthropic (LLM paths)');
  r = await call('GET', '/ai/status', { token: T });
  check('AI status reports LLM enabled', r.body?.llm === true && r.body.model === 'claude-opus-5-5');

  const before = anthropicLog.length;
  r = await call('POST', '/ai/bot/chat', { token: T, body: { message: 'Find me a Tamil action movie', history: [{ role: 'assistant', content: 'Hi!' }] } });
  check('CineBot answers through the LLM', r.status === 200 && r.body.provider === 'llm');
  check('CineBot ran a two-step tool loop', anthropicLog.length - before === 2);
  const secondReq = anthropicLog[anthropicLog.length - 1];
  const toolMsg = secondReq?.messages?.[secondReq.messages.length - 1];
  const toolPayload = toolMsg?.content?.[0]?.content || '';
  check('tool result returned real catalog data', toolPayload.includes('Vikram Vedha') || toolPayload.includes('Jigarthanda'));
  check('leading assistant history dropped so the first turn is the user', anthropicLog[before]?.messages[0]?.role === 'user');
  check('reply text and movie cards come from retrieved data', /Vikram Vedha|Jigarthanda/.test(r.body?.reply || '') && r.body.movies.some(m => ['Vikram Vedha', 'Jigarthanda'].includes(m.title)));
  check('follow-up suggestions parsed and removed from reply', r.body?.followUps?.length === 2 && !r.body.reply.includes('FOLLOWUPS'));
  check('CineBot sends 6 tools with valid schemas', anthropicLog[before]?.tools?.length === 6);

  r = await call('POST', '/ai/review/rewrite', { token: T, body: { text: 'Great movie, I loved it a lot.', style: 'cinematic', movieId: imported._id, rating: 5 } });
  check('review rewrite parsed from structured output', r.status === 200 && r.body.rewritten === 'A luminous, gripping film that I adored.' && r.body.changes.length === 1 && r.body.provider === 'llm');
  check('rewrite request used a JSON schema', anthropicLog[anthropicLog.length - 1]?.output_config?.format?.schema?.required?.includes('rewritten'));

  r = await call('POST', '/ai/spoiler/detect', { token: T, body: { text: 'The visuals are stunning. It turns out the professor lied about plan A.', movieId: imported._id } });
  check('CineSpoiler uses hybrid LLM verification for borderline sentences', r.status === 200 && r.body.method === 'hybrid' && r.body.flagged.includes(1) && !r.body.flagged.includes(0));
  const spoilerReq = anthropicLog[anthropicLog.length - 1];
  check('only the borderline sentence was sent to the LLM', textOfUser(spoilerReq.messages[0]).includes('turns out') && !textOfUser(spoilerReq.messages[0]).includes('visuals are stunning'));

  const movies = (await call('GET', '/movies?language=ta')).body.movies;
  for (const [i, m] of movies.entries()) await call('POST', `/movies/${m._id}/reviews`, { token: T, body: { rating: 5 - (i % 2), comment: 'An intense, brilliantly acted thriller with a superb score.' } });
  r = await call('POST', '/ai/cinesense/regenerate', { token: T });
  check('CineSense narrative written by the LLM', r.status === 200 && r.body.generatedWith === 'llm' && r.body.profile.personality.startsWith('MOCK-LLM'));
  const dnaReq = anthropicLog[anthropicLog.length - 1];
  check('CineSense sends aggregated stats only, not review text', !JSON.stringify(dnaReq).includes('brilliantly acted thriller'));

  console.log('Failure handling');
  r = await call('POST', '/ai/review/rewrite', { token: T, body: { text: 'REFUSE_ME please rewrite this.', style: 'casual' } });
  check('model refusal surfaces as 422', r.status === 422);
  r = await call('POST', '/ai/review/rewrite', { token: T, body: { text: 'RATE_LIMIT_ME please rewrite this.', style: 'casual' } });
  check('rate limit surfaces as 503 after SDK retries', r.status === 503);
  const rlAttempts = anthropicLog.filter(b => JSON.stringify(b).includes('RATE_LIMIT_ME')).length;
  check('SDK retried the rate-limited request', rlAttempts === 3, `attempts=${rlAttempts}`);
  r = await call('POST', '/ai/bot/chat', { token: T, body: { message: 'RATE_LIMIT_ME what should I watch?' } });
  check('CineBot falls back to local retrieval when the LLM is unavailable', r.status === 200 && r.body.provider === 'local');

  console.log('Contract');
  check(`all ${anthropicLog.length} Anthropic requests matched the API contract`, violations.length === 0, [...new Set(violations)].join('; '));
}

run()
  .catch(e => { failed++; failures.push(`crash: ${e.message}`); console.error(e); })
  .finally(async () => {
    try { backend?.kill(); } catch { /* ignore */ }
    anthropic.close(); tmdb.close();
    try {
      await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    } catch { /* database may not exist */ }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) console.log('Failures:\n - ' + failures.join('\n - '));
    process.exit(failed ? 1 : 0);
  });
