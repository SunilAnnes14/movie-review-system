/**
 * MoviQ end-to-end test: social graph, CineCircle, CineChat (real Socket.IO clients),
 * CinePoll, CinePlan, CineFeed, privacy/access control and the six AI services.
 *
 * Usage: npm run test:v2   (server must be running; database seeded)
 */
import { io } from 'socket.io-client';

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const SOCKET = BASE.replace(/\/api$/, '');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`); }
}
async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch (e) { /* empty */ }
  return { status: res.status, body: json };
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function nextEvent(socket, event, predicate = () => true, timeout = 4000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { socket.off(event, handler); resolve(null); }, timeout);
    const handler = (payload) => { if (predicate(payload)) { clearTimeout(t); socket.off(event, handler); resolve(payload); } };
    socket.on(event, handler);
  });
}
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(SOCKET, { auth: { token }, transports: ['websocket'] });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});

const stamp = Date.now();
const mk = (n) => ({ name: `V2 ${n} ${stamp}`, email: `v2-${n.toLowerCase()}-${stamp}@example.com`, password: 'secret123' });
const users = { A: mk('Alice'), B: mk('Bob'), C: mk('Carol') };
const T = {}, ID = {};
const sockets = [];

async function run() {
  console.log(`\nMoviQ smoke test -> ${BASE}\n`);

  console.log('Accounts & onboarding');
  for (const [k, u] of Object.entries(users)) {
    const r = await call('POST', '/auth/register', { body: u });
    T[k] = r.body?.token; ID[k] = r.body?._id;
    check(`register ${k}`, r.status === 201 && !!T[k] && r.body.onboarded === false);
  }
  const movies = (await call('GET', '/movies?limit=100')).body.movies;
  const byTitle = (t) => movies.find(m => m.title === t);
  const inception = byTitle('Inception'), interstellar = byTitle('Interstellar'), darkKnight = byTitle('The Dark Knight');
  check('seed movies available', !!inception && !!interstellar && !!darkKnight);

  let r = await call('PUT', '/auth/preferences', { token: T.A, body: { favoriteGenres: ['Sci-Fi', 'Thriller'], favoriteDirectors: ['Christopher Nolan'], favoriteMovies: [inception._id], onboarded: true } });
  check('onboarding preferences saved', r.status === 200 && r.body.onboarded && r.body.favoriteGenres.includes('Sci-Fi'));
  r = await call('PUT', '/auth/preferences', { token: T.A, body: { avatar: 'javascript:alert(1)' } });
  check('unsafe avatar URL rejected', r.status === 400);
  await call('PUT', '/auth/preferences', { token: T.B, body: { favoriteGenres: ['Sci-Fi', 'Drama'], onboarded: true } });
  await call('PUT', '/auth/preferences', { token: T.C, body: { favoriteGenres: ['Comedy'], onboarded: true } });

  console.log('Catalog additions');
  let r0 = await call('GET', '/movies?language=ta&limit=50');
  check('Tamil cinema filter returns only Tamil films', r0.status === 200 && r0.body.total >= 18 && r0.body.movies.every(m => m.originalLanguage === 'ta'));
  check('Tamil classics present', ['Nayakan', 'Thalapathi', 'Vikram', 'Jai Bhim'].every(t => r0.body.movies.some(m => m.title === t)));
  r0 = await call('GET', '/movies?keyword=imdb%20top&limit=50');
  check('IMDb top-rated classics tagged', r0.status === 200 && r0.body.total >= 16 && r0.body.movies.some(m => m.title === '12 Angry Men'));
  r0 = await call('GET', '/movies?language=%24ne');
  check('malformed language filter is ignored safely', r0.status === 200 && r0.body.total > 0);

  console.log('My Vault');
  r = await call('POST', `/watchlist/${interstellar._id}`, { token: T.A, body: { status: 'watched' } });
  check('add to vault with status', r.status === 201 && r.body.status === 'watched');
  r = await call('PUT', `/watchlist/${darkKnight._id}`, { token: T.A, body: { status: 'watching' } });
  check('status update upserts vault entry', r.status === 200 && r.body.status === 'watching');
  r = await call('PUT', `/watchlist/${darkKnight._id}`, { token: T.A, body: { status: 'bogus' } });
  check('invalid status rejected', r.status === 400);
  r = await call('GET', '/watchlist?status=watched', { token: T.A });
  check('vault filters by status', r.status === 200 && r.body.length === 1);
  r = await call('GET', `/watchlist/check/${darkKnight._id}`, { token: T.A });
  check('vault check reports status', r.body.status === 'watching');

  r = await call('POST', '/collections', { token: T.A, body: { name: 'Nolan essentials', visibility: 'public' } });
  ID.collection = r.body?._id;
  check('collection created', r.status === 201);
  r = await call('POST', `/collections/${ID.collection}/movies/${inception._id}`, { token: T.A });
  check('movie added to collection', r.status === 200 && r.body.movies.length === 1);
  r = await call('POST', `/collections/${ID.collection}/movies/${inception._id}`, { token: T.B });
  check('others cannot modify a collection', r.status === 403);

  console.log('Friends & follows');
  r = await call('GET', `/social/users/search?q=${encodeURIComponent('V2 Bob ' + stamp)}`, { token: T.A });
  check('user search finds people', r.status === 200 && r.body.some(u => u._id === ID.B));
  r = await call('POST', `/social/friends/${ID.B}`, { token: T.A });
  check('friend request sent', r.status === 201);
  r = await call('POST', `/social/friends/${ID.B}`, { token: T.A });
  check('duplicate friend request rejected', r.status === 400);
  r = await call('GET', '/social/friends/requests', { token: T.B });
  const reqId = r.body?.incoming?.find(x => x.user._id === ID.A)?._id;
  check('recipient sees incoming request', !!reqId);
  r = await call('POST', `/social/friends/requests/${reqId}/accept`, { token: T.B });
  check('friend request accepted', r.status === 200 && r.body.status === 'friends');
  r = await call('GET', '/social/friends', { token: T.A });
  check('friends list updated', r.body.some(u => u._id === ID.B));
  await call('POST', `/social/friends/${ID.C}`, { token: T.A });
  const cReq = (await call('GET', '/social/friends/requests', { token: T.C })).body.incoming[0]?._id;
  r = await call('POST', `/social/friends/requests/${cReq}/reject`, { token: T.C });
  check('friend request rejected', r.status === 200);
  r = await call('POST', `/social/follow/${ID.C}`, { token: T.A });
  check('follow works', r.status === 200 && r.body.following);
  r = await call('GET', `/social/users/${ID.C}`, { token: T.A });
  check('profile shows relationship', r.status === 200 && r.body.relationship.following === true && r.body.relationship.friend === 'none');

  console.log('Privacy');
  r = await call('GET', `/social/users/${ID.A}/library`, { token: T.B });
  check('friend can view friends-only library', r.status === 200 && r.body.length >= 1);
  r = await call('GET', `/social/users/${ID.A}/library`, { token: T.C });
  check('non-friend cannot view friends-only library', r.status === 403);
  await call('PUT', '/auth/preferences', { token: T.B, body: { privacy: { libraryVisibility: 'private' } } });
  r = await call('GET', `/social/users/${ID.B}/reviews`, { token: T.A });
  check('private library hidden even from friends', r.status === 403);

  console.log('CineCircle');
  r = await call('POST', '/circles', { token: T.A, body: { name: `Weekend Movie Club ${stamp}`, description: 'Saturday nights', visibility: 'private', invite: [ID.B, ID.C] } });
  ID.circle = r.body?._id;
  check('private circle created, only friends invited', r.status === 201 && r.body.invited === 1);
  r = await call('GET', `/circles/${ID.circle}`, { token: T.C });
  check('outsider cannot view private circle', r.status === 403);
  r = await call('POST', `/circles/${ID.circle}/join`, { token: T.C });
  check('outsider cannot join private circle', r.status === 403);
  r = await call('GET', `/circles/${ID.circle}`, { token: T.B });
  check('invitee sees the circle', r.status === 200 && r.body.membership.status === 'invited' && r.body.conversation === null);
  r = await call('POST', `/circles/${ID.circle}/join`, { token: T.B });
  check('invitee accepts invite', r.status === 200);
  r = await call('GET', `/circles/${ID.circle}`, { token: T.B });
  ID.circleConv = r.body.conversation;
  check('member gets circle chat access', r.status === 200 && !!ID.circleConv && r.body.memberCount === 2);
  r = await call('POST', `/circles/${ID.circle}/watchlist/${inception._id}`, { token: T.B });
  check('shared watchlist add', r.status === 201);

  console.log('CineChat (real-time)');
  const sA = await connect(T.A), sB = await connect(T.B);
  sockets.push(sA, sB);
  check('authenticated sockets connect', sA.connected && sB.connected);
  let rejected = false;
  try { const bad = await connect('not-a-token'); bad.close(); } catch (e) { rejected = true; }
  check('socket rejects invalid token', rejected);

  const joinAck = await new Promise(res => sB.emit('conversation:join', ID.circleConv, res));
  check('member joins conversation room', joinAck?.ok === true);
  await new Promise(res => sA.emit('conversation:join', ID.circleConv, res));

  const typingP = nextEvent(sB, 'typing', p => p.userId === ID.A);
  sA.emit('typing', { conversationId: ID.circleConv, typing: true });
  check('typing indicator delivered', !!(await typingP));

  const msgP = nextEvent(sB, 'message:new', p => p.message?.text === 'Saturday at 7?');
  r = await call('POST', `/chat/conversations/${ID.circleConv}/messages`, { token: T.A, body: { text: 'Saturday at 7?' } });
  ID.msg = r.body?._id;
  check('message persisted', r.status === 201 && !!ID.msg);
  check('message pushed to other member in real time', !!(await msgP));

  r = await call('POST', `/chat/conversations/${ID.circleConv}/messages`, { token: T.B, body: { text: 'Works for me', replyTo: ID.msg, kind: 'movie', movieId: interstellar._id } });
  check('reply with movie card', r.status === 201 && r.body.replyTo?._id === ID.msg && r.body.movie?.title === 'Interstellar');
  r = await call('POST', `/chat/conversations/${ID.circleConv}/messages`, { token: T.B, body: { text: 'In the end Cooper is the ghost and Brand dies at the end.', movieId: interstellar._id } });
  check('spoiler message auto-flagged', r.status === 201 && r.body.isSpoiler === true);
  r = await call('POST', `/chat/conversations/${ID.circleConv}/messages`, { token: T.B, body: { text: 'Interstellar has an amazing score.' } });
  check('opinion message not flagged as spoiler', r.status === 201 && r.body.isSpoiler === false);

  const reactP = nextEvent(sB, 'message:reaction');
  r = await call('POST', `/chat/messages/${ID.msg}/react`, { token: T.A, body: { emoji: '🍿' } });
  check('reaction stored', r.status === 200 && r.body.reactions.length === 1);
  check('reaction broadcast', !!(await reactP));

  r = await call('GET', '/chat/conversations', { token: T.A });
  const conv = r.body.find(c => c._id === ID.circleConv);
  check('unread count tracks new messages', conv?.unread === 3, `unread=${conv?.unread}`);
  await call('POST', `/chat/conversations/${ID.circleConv}/read`, { token: T.A });
  r = await call('GET', '/chat/unread', { token: T.A });
  check('mark read clears unread', r.body.unread === 0);
  r = await call('GET', `/chat/conversations/${ID.circleConv}/messages`, { token: T.C });
  check('non-participant cannot read messages', r.status === 404);
  r = await call('POST', `/chat/direct/${ID.B}`, { token: T.A });
  check('friends can start a DM', r.status === 200 && !!r.body._id);
  r = await call('POST', `/chat/direct/${ID.C}`, { token: T.A });
  check('non-friends cannot DM', r.status === 403);

  console.log('CinePoll');
  await new Promise(res => sB.emit('circle:join', ID.circle, res));
  const pollNotif = nextEvent(sB, 'notification', n => n.type === 'poll_created');
  r = await call('POST', '/polls', { token: T.A, body: { circleId: ID.circle, question: 'What should we watch this Saturday?', options: [interstellar._id, inception._id, darkKnight._id], expiresAt: new Date(Date.now() + 3600e3) } });
  ID.poll = r.body?._id;
  const opt = r.body?.options || [];
  check('poll created with movie options', r.status === 201 && opt.length === 3 && opt[0].movie?.poster !== undefined);
  check('members notified of new poll', !!(await pollNotif));
  r = await call('POST', '/polls', { token: T.C, body: { circleId: ID.circle, question: 'x', options: [inception._id, darkKnight._id] } });
  check('non-member cannot create poll', r.status === 403);

  const livePoll = nextEvent(sB, 'poll:update', p => p.pollId === ID.poll);
  r = await call('POST', `/polls/${ID.poll}/vote`, { token: T.A, body: { optionId: opt[0]._id } });
  check('vote counted', r.status === 200 && r.body.totalVotes === 1 && r.body.myVotes[0] === opt[0]._id);
  check('live poll update pushed', !!(await livePoll));
  r = await call('POST', `/polls/${ID.poll}/vote`, { token: T.A, body: { optionIds: [opt[0]._id, opt[1]._id] } });
  check('multiple choices rejected on single-choice poll', r.status === 400);
  r = await call('POST', `/polls/${ID.poll}/vote`, { token: T.A, body: { optionId: opt[1]._id } });
  check('re-vote moves the vote (no duplicates)', r.body.totalVotes === 1 && r.body.options[1].votes === 1 && r.body.options[0].votes === 0);
  await call('POST', `/polls/${ID.poll}/vote`, { token: T.A, body: { optionId: opt[0]._id } });
  await call('POST', `/polls/${ID.poll}/vote`, { token: T.B, body: { optionId: opt[0]._id } });
  r = await call('POST', `/polls/${ID.poll}/vote`, { token: T.C, body: { optionId: opt[0]._id } });
  check('non-member cannot vote', r.status === 403);
  r = await call('POST', `/polls/${ID.poll}/close`, { token: T.B });
  check('only creator/admin can close', r.status === 403);
  const closedNotif = nextEvent(sB, 'notification', n => n.type === 'poll_closed');
  r = await call('POST', `/polls/${ID.poll}/close`, { token: T.A });
  check('poll finalised with winner', r.status === 200 && r.body.status === 'closed' && r.body.winner === opt[0]._id);
  check('members notified when voting closes', !!(await closedNotif));
  r = await call('POST', `/polls/${ID.poll}/vote`, { token: T.B, body: { optionId: opt[1]._id } });
  check('closed poll rejects votes', r.status === 400);

  r = await call('POST', '/polls', { token: T.B, body: { circleId: ID.circle, question: 'Pick any', multipleChoice: true, options: [inception._id, darkKnight._id] } });
  const multi = r.body;
  r = await call('POST', `/polls/${multi._id}/vote`, { token: T.B, body: { optionIds: multi.options.map(o => o._id) } });
  check('multiple-choice voting', r.status === 200 && r.body.totalVotes === 2 && r.body.voterCount === 1);

  console.log('CinePlan');
  const when = new Date(Date.now() + 3 * 86400e3);
  r = await call('POST', '/events', { token: T.A, body: { pollId: ID.poll, startsAt: when, venue: 'Grand Cinema', bookingUrl: 'https://tickets.example.com/interstellar' } });
  ID.event = r.body?._id;
  check('event created from poll winner', r.status === 201 && r.body.movie?._id === interstellar._id && r.body.poll?._id === ID.poll);
  check('creator auto-RSVPs going', r.body.myRsvp === 'going' && r.body.attendees.length === 2);
  r = await call('GET', `/polls/${ID.poll}`, { token: T.A });
  check('poll links to its event', r.body.event === ID.event);
  r = await call('POST', '/events', { token: T.A, body: { circleId: ID.circle, movieId: inception._id, startsAt: when, bookingUrl: 'javascript:1' } });
  check('unsafe booking link rejected', r.status === 400);
  r = await call('POST', `/events/${ID.event}/rsvp`, { token: T.B, body: { rsvp: 'maybe' } });
  check('RSVP recorded', r.status === 200 && r.body.myRsvp === 'maybe' && r.body.counts.maybe === 1);
  r = await call('POST', `/events/${ID.event}/proposals`, { token: T.B, body: { startsAt: new Date(Date.now() + 4 * 86400e3) } });
  const prop = r.body?.proposals?.[0];
  check('alternative date suggested', r.status === 201 && prop?.availableCount === 1);
  r = await call('POST', `/events/${ID.event}/proposals/${prop._id}/availability`, { token: T.A });
  check('availability toggled', r.body.proposals[0].availableCount === 2);
  r = await call('POST', `/events/${ID.event}/feedback`, { token: T.B, body: { rating: 5 } });
  check('feedback only after the event', r.status === 400);
  r = await call('GET', `/events/${ID.event}`, { token: T.C });
  check('outsider cannot see event', r.status === 403);
  r = await call('GET', '/events?when=upcoming', { token: T.B });
  check('upcoming events listed', r.body.some(e => e._id === ID.event));

  console.log('CineFeed');
  r = await call('POST', `/movies/${inception._id}/reviews`, { token: T.A, body: { rating: 5, comment: 'Mind-blowing. The twist is that the top keeps spinning and Cobb was dreaming all along.' } });
  ID.review = r.body?._id;
  check('review auto-flagged as spoiler', r.status === 201 && r.body.containsSpoilers === true && r.body.spoilerSentences.length >= 1);
  r = await call('PUT', `/reviews/${ID.review}`, { token: T.A, body: { comment: 'Mind-blowing visuals and a brilliant score. Loved it.', containsSpoilers: false } });
  check('author decision overrides spoiler flag', r.status === 200 && r.body.containsSpoilers === false);
  r = await call('POST', '/feed', { token: T.A, body: { text: 'Movie night this weekend!', visibility: 'friends' } });
  ID.post = r.body?._id;
  check('post created', r.status === 201);
  r = await call('GET', '/feed', { token: T.B });
  check('friend sees post, review and watch activity', r.body.posts.some(p => p._id === ID.post) && r.body.posts.some(p => p.kind === 'review') && r.body.posts.some(p => p.kind === 'watch_update'));
  r = await call('GET', '/feed', { token: T.C });
  check('friends-only post hidden from non-friend follower', !r.body.posts.some(p => p._id === ID.post));
  r = await call('POST', `/feed/${ID.post}/like`, { token: T.B });
  check('like toggles', r.body.liked === true && r.body.likeCount === 1);
  r = await call('POST', `/feed/${ID.post}/comments`, { token: T.B, body: { text: "Can't wait!" } });
  check('comment added', r.status === 201);
  r = await call('POST', `/feed/${ID.post}/like`, { token: T.C });
  check('cannot like an invisible post', r.status === 404);
  r = await call('GET', `/feed?circle=${ID.circle}`, { token: T.B });
  check('circle feed shows poll and event posts', r.body.posts.some(p => p.kind === 'poll') && r.body.posts.some(p => p.kind === 'event'));

  console.log('Discover & notifications');
  r = await call('GET', '/discover', { token: T.B });
  check('social discovery', r.status === 200 && Array.isArray(r.body.friendsWatching) && r.body.friendsWatching.length >= 1 && Array.isArray(r.body.recommended));
  r = await call('GET', '/discover/trending');
  check('trending (local fallback without TMDB)', r.status === 200 && r.body.items.length > 0);
  r = await call('GET', '/tmdb/search?q=dune');
  check('TMDB endpoints degrade gracefully', [200, 503].includes(r.status));
  r = await call('GET', '/notifications', { token: T.B });
  check('notifications persisted', r.status === 200 && r.body.unread > 0 && r.body.items.some(n => n.type === 'event_created'));
  await call('POST', '/notifications/read-all', { token: T.B });
  r = await call('GET', '/notifications', { token: T.B });
  check('mark all read', r.body.unread === 0);

  console.log('AI services');
  r = await call('GET', '/ai/status', { token: T.A });
  check('AI status', r.status === 200 && typeof r.body.llm === 'boolean');
  r = await call('GET', '/ai/cinematch', { token: T.A });
  const recs = r.body?.items || [];
  check('CineMatch returns ranked, explained recommendations', r.status === 200 && recs.length > 0 && recs[0].reasons.length > 0 && recs.every((x, i) => i === 0 || recs[i - 1].match >= x.match));
  check('CineMatch excludes movies already in the vault', !recs.some(x => [inception._id, interstellar._id, darkKnight._id].includes(x.movie._id)));
  r = await call('GET', '/ai/cinematch?genre=Drama', { token: T.A });
  check('CineMatch genre filter', r.body.items.every(x => x.movie.genre.includes('Drama')));
  r = await call('GET', `/ai/cinematch/circle/${ID.circle}`, { token: T.B });
  check('Group CineMatch with member compatibility', r.status === 200 && r.body.items.length > 0 && r.body.items[0].members.length === 2 && typeof r.body.compatibility === 'number');
  r = await call('GET', `/ai/cinematch/circle/${ID.circle}`, { token: T.C });
  check('Group CineMatch requires membership', r.status === 403);
  r = await call('POST', '/ai/cinesense/regenerate', { token: T.A });
  check('CineSense Movie DNA generated', r.status === 200 && !!r.body.profile?.personality && r.body.profile.favoriteGenres.length > 0 && r.body.profile.monthly.length === 12);
  r = await call('POST', '/ai/review/analyze', { token: T.A, body: { text: 'i realy loved the acting , the cinematograpy was stunning!!! in the end Cooper survives and reunites with Murph', movieId: interstellar._id, rating: 5 } });
  check('Review Intelligence analysis', r.status === 200 && r.body.grammar.fixes.length >= 3 && r.body.sentiment.label === 'positive' && r.body.aspects.acting.mentioned && r.body.spoilers.isSpoiler && !!r.body.caption);
  r = await call('POST', '/ai/review/rewrite', { token: T.A, body: { text: 'Great movie, loved it.', style: 'cinematic' } });
  check('rewrite requires LLM (clear 503 without key) or succeeds', r.status === 503 || (r.status === 200 && !!r.body.rewritten));
  r = await call('POST', '/ai/spoiler/detect', { token: T.A, body: { text: 'The visuals are great. It turns out the professor lied about plan A.', movieId: interstellar._id } });
  check('CineSpoiler sentence-level detection', r.status === 200 && r.body.flagged.length === 1 && r.body.flagged[0] === 1);
  r = await call('POST', '/ai/bot/chat', { token: T.A, body: { message: 'Recommend movies like Inception' } });
  check('CineBot "movies like X" uses retrieval', r.status === 200 && r.body.movies.length > 0 && !r.body.movies.some(m => m.title === 'Inception'));
  r = await call('POST', '/ai/bot/chat', { token: T.A, body: { message: 'Recommend Christopher Nolan movies' } });
  check('CineBot director lookup', r.status === 200 && r.body.movies.length > 0 && r.body.movies.every(m => m.director === 'Christopher Nolan'));
  r = await call('POST', '/ai/bot/chat', { token: T.A, body: { message: 'Recommend Tamil thrillers' } });
  check('CineBot language request returns Tamil films', r.status === 200 && r.body.movies.length > 0 && r.body.movies.every(m => ['Visaranai', 'Ratsasan', 'Kaithi', 'Vikram', 'Maharaja'].includes(m.title)));
  r = await call('POST', '/ai/bot/chat', { token: T.A, body: { message: 'Suggest a movie for my CineCircle' } });
  check('CineBot circle suggestions', r.status === 200 && r.body.movies.length > 0);
  r = await call('GET', `/ai/pulse/${ID.circle}`, { token: T.A });
  check('CinePulse group analytics', r.status === 200 && r.body.genreTrends.length > 0 && r.body.voting.totalVotes >= 3 && !!r.body.nextCategory?.caveat);

  console.log('Uploads & sharing');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d60000000049454e44ae426082', 'hex');
  const upload = async (bytes, name, token) => {
    const fd = new FormData();
    fd.append('image', new Blob([bytes]), name);
    const res = await fetch(`${BASE}/uploads/image`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  r = await upload(png, 'a.png');
  check('upload requires authentication', r.status === 401);
  r = await upload(Buffer.from('<script>alert(1)</script>'), 'evil.png', T.A);
  check('non-image disguised as .png is rejected', r.status === 400);
  r = await upload(Buffer.alloc(2 * 1024 * 1024 + 10, 0xff), 'big.jpg', T.A);
  check('oversized upload is rejected', r.status === 400);
  r = await upload(png, '../../etc/passwd.png', T.A);
  const uploadedUrl = r.body?.url;
  check('valid PNG stored under a random server name', r.status === 201 && /\/uploads\/[0-9a-f]{32}\.png$/.test(uploadedUrl || ''));
  const served = await fetch(uploadedUrl);
  check('uploaded file served with nosniff', served.status === 200 && served.headers.get('x-content-type-options') === 'nosniff');
  r = await call('PUT', '/auth/preferences', { token: T.A, body: { avatar: uploadedUrl } });
  check('uploaded image usable as avatar', r.status === 200 && r.body.avatar === uploadedUrl);
  const dmId = (await call('POST', `/chat/direct/${ID.B}`, { token: T.A })).body._id;
  r = await call('POST', `/chat/conversations/${dmId}/messages`, { token: T.A, body: { kind: 'review', reviewId: ID.review, text: 'Thoughts?' } });
  check('review shared into chat as a card', r.status === 201 && r.body.review?.rating === 5 && r.body.review?.movieId?.title === 'Inception');

  console.log('Cleanup');
  r = await call('DELETE', `/circles/${ID.circle}`, { token: T.B });
  check('only owner can delete circle', r.status === 403);
  r = await call('DELETE', `/circles/${ID.circle}`, { token: T.A });
  check('owner deletes circle', r.status === 200);
  await call('DELETE', `/reviews/${ID.review}`, { token: T.A });

  // Remove the throwaway accounts (cascades to friendships, follows, memberships, posts, notifications)
  const admin = await call('POST', '/auth/login', { body: { email: 'admin@moviereview.com', password: 'admin123' } });
  let removed = 0;
  for (const id of [ID.A, ID.B, ID.C]) if ((await call('DELETE', `/users/${id}`, { token: admin.body?.token })).status === 200) removed++;
  check('test accounts cleaned up', removed === 3);
  r = await call('GET', `/social/users/search?q=${encodeURIComponent('V2 Bob ' + stamp)}`, { token: T.A });
  check('deleted test accounts can no longer authenticate', r.status === 401);
}

run()
  .catch(e => { failed++; failures.push(`crash: ${e.message}`); console.error(e); })
  .finally(() => {
    sockets.forEach(s => s.close());
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) console.log('Failures:\n - ' + failures.join('\n - '));
    process.exit(failed ? 1 : 0);
  });
