/**
 * End-to-end API smoke test for the CineVault backend.
 * Verifies the complete user/admin flow against the real MongoDB database.
 *
 * Usage:  npm run test:api     (the server must be running on PORT)
 */

const BASE = process.env.API_URL || 'http://localhost:5000/api';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let json = null;
  try {
    json = await res.json();
  } catch (error) {
    json = null;
  }
  return { status: res.status, body: json };
}

const stamp = Date.now();
const newUser = {
  name: 'Smoke Tester',
  email: `smoke-${stamp}@example.com`,
  password: 'secret123'
};
const adminCredentials = { email: 'admin@moviereview.com', password: 'admin123' };

let userToken;
let adminToken;
let movieId;
let reviewId;
let createdMovieId;

async function run() {
  console.log(`\nCineVault API smoke test -> ${BASE}\n`);

  // --- Health & catalog -----------------------------------------------------
  console.log('Catalog');
  let res = await call('GET', '/health');
  check('health endpoint responds', res.status === 200 && res.body?.status === 'OK');

  res = await call('GET', '/movies?limit=50');
  const totalMovies = res.body?.total ?? 0;
  check('movies are served from MongoDB', res.status === 200 && totalMovies >= 10, `total=${totalMovies}`);
  movieId = res.body?.movies?.[0]?._id;
  check('movie documents carry an ObjectId', /^[0-9a-f]{24}$/.test(movieId || ''));

  res = await call('GET', '/movies?search=nolan');
  check('search filter works', res.status === 200 && res.body.movies.length > 0);

  res = await call('GET', '/movies?genre=Drama');
  check('genre filter works', res.status === 200 && res.body.movies.length > 0);

  res = await call('GET', '/movies?sort=rating&limit=5');
  check('sort by rating works', res.status === 200 && res.body.movies.length > 0);

  res = await call('GET', '/movies/genres/list');
  check('genre list endpoint works', res.status === 200 && Array.isArray(res.body) && res.body.length > 0);

  res = await call('GET', `/movies/${movieId}`);
  check('single movie lookup works', res.status === 200 && !!res.body.title);

  res = await call('GET', '/movies/not-a-real-id');
  check('invalid movie id is rejected', res.status === 400);

  res = await call('GET', '/movies/507f191e810c19729de860ea');
  check('missing movie returns 404', res.status === 404);

  // --- Auth -----------------------------------------------------------------
  console.log('Authentication');
  res = await call('POST', '/auth/register', { body: newUser });
  userToken = res.body?.token;
  check('register creates an account', res.status === 201 && !!userToken, `status=${res.status}`);

  res = await call('POST', '/auth/register', { body: newUser });
  check('duplicate registration is rejected', res.status === 400);

  res = await call('POST', '/auth/register', { body: { name: 'X', email: 'bad-email', password: '1' } });
  check('invalid registration payload is rejected', res.status >= 400);

  res = await call('POST', '/auth/login', { body: { email: newUser.email, password: 'wrong-password' } });
  check('wrong password is rejected', res.status === 401);

  res = await call('POST', '/auth/login', { body: { email: newUser.email, password: newUser.password } });
  userToken = res.body?.token;
  check('login returns a JWT', res.status === 200 && !!userToken);

  res = await call('POST', '/auth/login', { body: adminCredentials });
  adminToken = res.body?.token;
  check('admin login works', res.status === 200 && res.body.role === 'admin');

  res = await call('GET', '/auth/profile');
  check('protected route rejects anonymous request', res.status === 401);

  res = await call('GET', '/auth/profile', { token: userToken });
  check('profile returns current user', res.status === 200 && res.body.email === newUser.email);

  res = await call('PUT', '/auth/profile', { token: userToken, body: { name: 'Smoke Tester Updated' } });
  check('profile update works', res.status === 200 && res.body.name === 'Smoke Tester Updated');

  // --- Reviews --------------------------------------------------------------
  console.log('Reviews');
  res = await call('POST', `/movies/${movieId}/reviews`, {
    token: userToken,
    body: { rating: 5, comment: 'A fantastic movie, the smoke test loved every minute of it.' }
  });
  reviewId = res.body?._id;
  check('authenticated user can review', res.status === 201 && !!reviewId, `status=${res.status}`);

  res = await call('POST', `/movies/${movieId}/reviews`, {
    token: userToken,
    body: { rating: 1, comment: 'Trying to review the same movie twice should fail here.' }
  });
  check('one review per user per movie is enforced', res.status === 400);

  res = await call('POST', `/movies/${movieId}/reviews`, {
    body: { rating: 5, comment: 'Anonymous reviews are not allowed at all.' }
  });
  check('anonymous review is rejected', res.status === 401);

  res = await call('GET', `/movies/${movieId}/reviews`);
  const populated = Array.isArray(res.body) && res.body.some(r => r.userId?.name);
  check('movie reviews are populated with the author', res.status === 200 && populated);

  res = await call('GET', `/movies/${movieId}`);
  check('movie aggregates are recalculated', res.status === 200 && res.body.reviewCount >= 1 && res.body.averageRating > 0,
    `reviewCount=${res.body?.reviewCount} averageRating=${res.body?.averageRating}`);

  res = await call('PUT', `/reviews/${reviewId}`, {
    token: userToken,
    body: { rating: 2, comment: 'Changed my mind, this edit should update the movie average too.' }
  });
  check('author can edit a review', res.status === 200 && res.body.rating === 2);

  res = await call('PUT', `/reviews/${reviewId}`, {
    token: adminToken,
    body: { rating: 5, comment: 'Admins must not be able to edit somebody else\'s review.' }
  });
  check('other users cannot edit a review', res.status === 403);

  res = await call('GET', '/reviews/my', { token: userToken });
  check('my-reviews returns populated movies', res.status === 200 && res.body.some(r => r.movieId?.title));

  res = await call('GET', '/reviews/my');
  check('my-reviews requires authentication', res.status === 401);

  res = await call('GET', '/reviews');
  check('all reviews requires authentication', res.status === 401);

  res = await call('GET', '/reviews', { token: userToken });
  check('all reviews requires admin', res.status === 403);

  res = await call('GET', '/reviews', { token: adminToken });
  check('admin can list every review', res.status === 200 && Array.isArray(res.body));

  // --- Watchlist ------------------------------------------------------------
  console.log('Watchlist');
  res = await call('GET', '/watchlist');
  check('watchlist requires authentication', res.status === 401);

  res = await call('POST', `/watchlist/${movieId}`, { token: userToken, body: {} });
  check('movie can be bookmarked', res.status === 201, `status=${res.status}`);

  res = await call('POST', `/watchlist/${movieId}`, { token: userToken, body: {} });
  check('duplicate bookmark is rejected', res.status === 400);

  res = await call('GET', `/watchlist/check/${movieId}`, { token: userToken });
  check('watchlist check reports saved movie', res.status === 200 && res.body.inWatchlist === true);

  res = await call('GET', '/watchlist', { token: userToken });
  check('watchlist returns populated movies', res.status === 200 && res.body.some(w => w.movieId?.title));

  res = await call('DELETE', `/watchlist/${movieId}`, { token: userToken });
  check('bookmark can be removed', res.status === 200);

  res = await call('GET', `/watchlist/check/${movieId}`, { token: userToken });
  check('watchlist check reports removed movie', res.status === 200 && res.body.inWatchlist === false);

  // --- Admin: catalog management -------------------------------------------
  console.log('Admin dashboard');
  res = await call('POST', '/movies', {
    token: userToken,
    body: {
      title: 'Smoke Test Movie',
      description: 'A temporary movie created by the automated API smoke test suite.',
      genre: ['Drama'],
      releaseYear: 2024,
      director: 'QA Director'
    }
  });
  check('regular users cannot create movies', res.status === 403);

  res = await call('POST', '/movies', {
    token: adminToken,
    body: {
      title: 'Smoke Test Movie',
      description: 'A temporary movie created by the automated API smoke test suite.',
      genre: ['Drama'],
      releaseYear: 2024,
      director: 'QA Director',
      cast: ['Test Actor'],
      duration: 99
    }
  });
  createdMovieId = res.body?._id;
  check('admin can create a movie', res.status === 201 && !!createdMovieId, `status=${res.status}`);

  res = await call('PUT', `/movies/${createdMovieId}`, {
    token: adminToken,
    body: { title: 'Smoke Test Movie (edited)', releaseYear: 2025 }
  });
  check('admin can update a movie', res.status === 200 && res.body.title === 'Smoke Test Movie (edited)');

  res = await call('GET', '/users/stats/dashboard', { token: adminToken });
  check('dashboard stats are aggregated', res.status === 200 && res.body.totalMovies > 0 && res.body.totalReviews > 0,
    JSON.stringify(res.body));

  res = await call('GET', '/users/stats/dashboard');
  check('dashboard stats require admin', res.status === 401);

  res = await call('GET', '/users', { token: adminToken });
  check('admin can list users', res.status === 200 && res.body.some(u => u.email === newUser.email));

  res = await call('GET', '/users', { token: userToken });
  check('regular users cannot list users', res.status === 403);

  // --- Cleanup & cascade ----------------------------------------------------
  console.log('Cleanup');
  res = await call('DELETE', `/movies/${createdMovieId}`, { token: adminToken });
  check('admin can delete a movie', res.status === 200);

  res = await call('GET', `/movies/${createdMovieId}`);
  check('deleted movie is gone', res.status === 404);

  res = await call('DELETE', `/reviews/${reviewId}`, { token: userToken });
  check('author can delete a review', res.status === 200);

  res = await call('GET', `/movies/${movieId}`);
  check('movie aggregates reset after review deletion', res.status === 200 && res.body.reviewCount >= 0);

  res = await call('DELETE', `/reviews/${reviewId}`, { token: userToken });
  check('deleting the same review twice returns 404', res.status === 404);

  // --- Report ---------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.log('Failures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

run().catch(error => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
