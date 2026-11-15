const Movie = require('../models/Movie');
const Review = require('../models/Review');
const Watchlist = require('../models/Watchlist');
const User = require('../models/User');
const CircleMember = require('../models/CircleMember');
const { MovieRecommendation } = require('../models/AIRecords');
const { TfIdf, cosine, normalize, addScaled, tokenize } = require('./text');

/**
 * CineMatch - hybrid, explainable recommendation engine.
 *
 *  1. Content-based filtering: every movie becomes a sparse feature vector
 *     (genres, director, top cast, TMDB keywords, decade, TF-IDF of the synopsis).
 *     A user's taste vector is the rating-weighted sum of the movies they interacted with,
 *     plus their onboarding preferences (cold start).
 *  2. Item-based collaborative filtering (adjusted cosine over co-raters, with shrinkage)
 *     whenever enough rating overlap exists in the community.
 *  3. A quality prior (Bayesian average of community + TMDB rating).
 *  Weights adapt to how much data is available, and every result carries human-readable reasons.
 *
 * Group CineMatch scores each candidate per member and aggregates with a fairness-aware
 * function (mean + least-misery + disagreement penalty) rather than a plain average.
 */

const FEATURE_WEIGHTS = { genre: 1.0, director: 0.8, actor: 0.35, keyword: 0.3, decade: 0.25, text: 0.6 };

let catalogCache = null;
let catalogBuiltAt = 0;

async function loadCatalog() {
  if (catalogCache && Date.now() - catalogBuiltAt < 60_000) return catalogCache;
  const movies = await Movie.find().lean();
  const tfidf = new TfIdf(movies.map(m => `${m.title} ${m.description} ${(m.keywords || []).join(' ')}`));
  const vectors = new Map();
  movies.forEach((m, i) => {
    const v = new Map();
    for (const g of m.genre || []) v.set(`g:${g}`, FEATURE_WEIGHTS.genre);
    if (m.director) v.set(`d:${m.director}`, FEATURE_WEIGHTS.director);
    for (const a of (m.cast || []).slice(0, 5)) v.set(`a:${a}`, FEATURE_WEIGHTS.actor);
    for (const k of (m.keywords || []).slice(0, 15)) for (const t of tokenize(k)) v.set(`k:${t}`, FEATURE_WEIGHTS.keyword);
    if (m.releaseYear) v.set(`y:${Math.floor(m.releaseYear / 10) * 10}`, FEATURE_WEIGHTS.decade);
    for (const [t, w] of tfidf.docVector(i)) v.set(`w:${t}`, (v.get(`w:${t}`) || 0) + w * FEATURE_WEIGHTS.text);
    vectors.set(String(m._id), normalize(v));
  });
  catalogCache = { movies, byId: new Map(movies.map(m => [String(m._id), m])), vectors };
  catalogBuiltAt = Date.now();
  return catalogCache;
}

const invalidateCatalog = () => { catalogCache = null; };

/** Build a user's taste profile from history (if permitted) and onboarding preferences. */
async function buildProfile(userOrId, catalog) {
  const user = userOrId.privacy ? userOrId : await User.findById(userOrId).lean();
  const useHistory = user.privacy?.allowHistoryForAI !== false;
  const vector = new Map();
  const interactions = new Map(); // movieId -> weight
  const ratings = new Map();      // movieId -> rating
  const vault = new Set();

  if (useHistory) {
    const [reviews, entries] = await Promise.all([
      Review.find({ userId: user._id }).select('movieId rating').lean(),
      Watchlist.find({ userId: user._id }).select('movieId status favorite').lean()
    ]);
    for (const r of reviews) {
      const id = String(r.movieId);
      ratings.set(id, r.rating);
      vault.add(id);
      interactions.set(id, (r.rating - 3) / 2 + (r.rating >= 4 ? 0.3 : 0));
    }
    for (const e of entries) {
      const id = String(e.movieId);
      vault.add(id);
      if (!ratings.has(id)) {
        const w = { watched: 0.5, watching: 0.4, want_to_watch: 0.3 }[e.status] || 0.3;
        interactions.set(id, (interactions.get(id) || 0) + w + (e.favorite ? 0.5 : 0));
      }
    }
  }
  for (const m of user.favoriteMovies || []) {
    const id = String(m);
    interactions.set(id, (interactions.get(id) || 0) + 1.0);
    vault.add(id);
  }

  for (const [id, w] of interactions) {
    const v = catalog.vectors.get(id);
    if (v) addScaled(vector, v, w);
  }
  for (const g of user.favoriteGenres || []) vector.set(`g:${g}`, (vector.get(`g:${g}`) || 0) + 1.5);
  for (const d of user.favoriteDirectors || []) vector.set(`d:${d}`, (vector.get(`d:${d}`) || 0) + 1.2);
  for (const a of user.favoriteActors || []) vector.set(`a:${a}`, (vector.get(`a:${a}`) || 0) + 0.8);

  return {
    user: { _id: user._id, name: user.name },
    vector: normalize(vector),
    interactions,
    ratings,
    vault,
    usedHistory: useHistory,
    dataPoints: interactions.size + (user.favoriteGenres?.length || 0),
    coldStart: interactions.size < 3
  };
}

/** Community rating matrix (only users who allow their history to be used). */
async function loadRatingMatrix() {
  const optedOut = await User.find({ 'privacy.allowHistoryForAI': false }).distinct('_id');
  const reviews = await Review.find({ userId: { $nin: optedOut } }).select('userId movieId rating').lean();
  const byUser = new Map();
  for (const r of reviews) {
    const u = String(r.userId);
    if (!byUser.has(u)) byUser.set(u, []);
    byUser.get(u).push(r);
  }
  const byItem = new Map(); // movieId -> Map(userId -> centred rating)
  for (const [u, rs] of byUser) {
    const mean = rs.reduce((s, r) => s + r.rating, 0) / rs.length;
    for (const r of rs) {
      const m = String(r.movieId);
      if (!byItem.has(m)) byItem.set(m, new Map());
      byItem.get(m).set(u, r.rating - mean);
    }
  }
  return { byItem, raters: byUser.size };
}

function itemSimilarity(a, b) {
  if (!a || !b) return { sim: 0, n: 0 };
  let dot = 0, na = 0, nb = 0, n = 0;
  for (const [u, x] of a) {
    const y = b.get(u);
    if (y === undefined) continue;
    dot += x * y; na += x * x; nb += y * y; n++;
  }
  if (n < 2 || !na || !nb) return { sim: 0, n };
  return { sim: (dot / Math.sqrt(na * nb)) * (n / (n + 3)), n }; // shrinkage for small overlaps
}

/** Predicted centred rating for `movieId` from the user's own ratings (item-item CF). */
function collaborativeScore(profile, movieId, matrix) {
  if (profile.ratings.size === 0) return null;
  const target = matrix.byItem.get(movieId);
  if (!target) return null;
  const userMean = [...profile.ratings.values()].reduce((s, r) => s + r, 0) / profile.ratings.size;
  let num = 0, den = 0, support = 0;
  for (const [ratedId, rating] of profile.ratings) {
    const { sim } = itemSimilarity(matrix.byItem.get(ratedId), target);
    if (sim <= 0) continue;
    num += sim * (rating - userMean);
    den += sim;
    support++;
  }
  if (!den) return null;
  const predicted = Math.max(1, Math.min(5, userMean + num / den));
  return { predicted, support };
}

function qualityPrior(m) {
  const C = 3.5, k = 3;
  const local = m.reviewCount ? (m.averageRating * m.reviewCount + C * k) / (m.reviewCount + k) : C;
  const tmdb = m.tmdbRating ? m.tmdbRating / 2 : null;
  const blended = tmdb ? 0.6 * local + 0.4 * tmdb : local;
  return (blended - 1) / 4; // 0..1
}

function describeFeature(key) {
  const [type, ...rest] = key.split(':');
  const value = rest.join(':');
  switch (type) {
    case 'g': return { type: 'genre', value, text: `Matches your taste for ${value}` };
    case 'd': return { type: 'director', value, text: `Directed by ${value}, a filmmaker you connect with` };
    case 'a': return { type: 'actor', value, text: `Features ${value}` };
    case 'y': return { type: 'decade', value, text: `From the ${value}s, an era you enjoy` };
    case 'k': return { type: 'theme', value, text: `Shares themes you like (${value})` };
    default: return null;
  }
}

function explain(profile, movieId, catalog) {
  const mv = catalog.vectors.get(movieId);
  const contributions = [];
  for (const [k, v] of mv) {
    const p = profile.vector.get(k);
    if (p && p > 0 && !k.startsWith('w:')) contributions.push([k, p * v]);
  }
  contributions.sort((a, b) => b[1] - a[1]);
  const reasons = contributions.slice(0, 3).map(([k]) => describeFeature(k)).filter(Boolean);

  // Nearest movie the user liked
  let best = null;
  for (const [id, w] of profile.interactions) {
    if (w <= 0.2 || id === movieId) continue;
    const v = catalog.vectors.get(id);
    if (!v) continue;
    const s = cosine(v, mv);
    if (!best || s > best.s) best = { id, s };
  }
  if (best && best.s > 0.25) {
    const liked = catalog.byId.get(best.id);
    const rating = profile.ratings.get(best.id);
    reasons.unshift({ type: 'similar', value: liked.title, text: rating ? `Because you rated ${liked.title} ${rating}★` : `Similar to ${liked.title}, which is in your vault` });
  }
  return reasons.slice(0, 4);
}

/** Score every candidate movie for one profile. Returns Map(movieId -> {score, parts}). */
function scoreCandidates(profile, catalog, matrix, candidateIds) {
  const raw = new Map();
  for (const id of candidateIds) raw.set(id, cosine(profile.vector, catalog.vectors.get(id)));
  const vals = [...raw.values()];
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;

  const cfEnabled = matrix.raters >= 3 && profile.ratings.size >= 2;
  const out = new Map();
  for (const id of candidateIds) {
    const m = catalog.byId.get(id);
    const content = profile.vector.size ? (raw.get(id) - min) / span : 0.5;
    const cf = cfEnabled ? collaborativeScore(profile, id, matrix) : null;
    const quality = qualityPrior(m);

    let wContent = profile.vector.size ? 0.65 : 0.2;
    let wCF = cf ? Math.min(0.35, 0.12 * cf.support) : 0;
    let wQuality = 1 - wContent - wCF;
    if (wQuality < 0.15) { const scale = 0.85 / (wContent + wCF); wContent *= scale; wCF *= scale; wQuality = 0.15; }

    const cfNorm = cf ? (cf.predicted - 1) / 4 : 0;
    const score = wContent * content + wCF * cfNorm + wQuality * quality;
    out.set(id, {
      score,
      parts: {
        content: Math.round(content * 100),
        collaborative: cf ? Math.round(cfNorm * 100) : null,
        quality: Math.round(quality * 100),
        weights: { content: +wContent.toFixed(2), collaborative: +wCF.toFixed(2), quality: +wQuality.toFixed(2) }
      },
      cf
    });
  }
  return out;
}

const movieCard = (m) => ({
  _id: m._id, title: m.title, poster: m.poster, backdrop: m.backdrop, genre: m.genre, releaseYear: m.releaseYear,
  director: m.director, averageRating: m.averageRating, reviewCount: m.reviewCount, tmdbRating: m.tmdbRating, description: m.description
});

/** Personal recommendations */
async function recommendForUser(userId, { limit = 12, genre, seedMovieId, excludeIds = [] } = {}) {
  const catalog = await loadCatalog();
  const [profile, matrix] = await Promise.all([buildProfile(userId, catalog), loadRatingMatrix()]);

  let candidates = catalog.movies.map(m => String(m._id))
    .filter(id => !profile.vault.has(id) && !excludeIds.includes(id));
  if (genre) candidates = candidates.filter(id => (catalog.byId.get(id).genre || []).some(g => g.toLowerCase() === String(genre).toLowerCase()));
  if (!candidates.length) return { items: [], profile: summarizeProfile(profile), strategy: 'none' };

  // "More like this" mode biases the taste vector towards a seed movie
  if (seedMovieId && catalog.vectors.get(String(seedMovieId))) {
    const seeded = new Map(profile.vector);
    addScaled(seeded, catalog.vectors.get(String(seedMovieId)), 2.0);
    profile.vector = normalize(seeded);
    profile.interactions.set(String(seedMovieId), 1.5);
  }

  const scores = scoreCandidates(profile, catalog, matrix, candidates);
  const items = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit).map(([id, s]) => {
    const reasons = explain(profile, id, catalog);
    if (s.cf && s.cf.predicted >= 3.8) reasons.push({ type: 'community', text: `Viewers with similar ratings loved it (predicted ${s.cf.predicted.toFixed(1)}★)` });
    if (!reasons.length) reasons.push({ type: 'quality', text: `Highly rated by the community (${(catalog.byId.get(id).averageRating || 0).toFixed(1)}★)` });
    return { movie: movieCard(catalog.byId.get(id)), match: Math.round(s.score * 100), breakdown: s.parts, reasons };
  });

  const strategy = profile.coldStart ? (profile.vector.size ? 'cold-start-preferences' : 'popularity') : (items.some(i => i.breakdown.collaborative !== null) ? 'hybrid' : 'content');
  await MovieRecommendation.create({ user: userId, scope: 'personal', strategy, items: items.map(i => ({ movie: i.movie._id, match: i.match })) }).catch(() => {});
  return { items, strategy, profile: summarizeProfile(profile) };
}

function summarizeProfile(profile) {
  const top = (prefix) => [...profile.vector.entries()].filter(([k, v]) => k.startsWith(prefix) && v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k.slice(2));
  return { coldStart: profile.coldStart, usedHistory: profile.usedHistory, dataPoints: profile.dataPoints, topGenres: top('g:'), topDirectors: top('d:'), topActors: top('a:') };
}

/** Group CineMatch for a CineCircle */
async function recommendForCircle(circleId, { limit = 10, memberIds } = {}) {
  const catalog = await loadCatalog();
  let members = await CircleMember.find({ circle: circleId, status: 'active' }).populate('user', 'name privacy favoriteGenres favoriteDirectors favoriteActors favoriteMovies').lean();
  members = members.filter(m => m.user);
  if (memberIds?.length) members = members.filter(m => memberIds.includes(String(m.user._id)));
  if (!members.length) return { items: [], members: [], compatibility: 0 };

  const matrix = await loadRatingMatrix();
  const profiles = await Promise.all(members.map(m => buildProfile(m.user, catalog)));

  // Exclude movies already seen by more than half of the group
  const seenCount = new Map();
  for (const p of profiles) for (const id of p.vault) {
    const entry = p.ratings.has(id) || p.interactions.get(id) >= 0.4;
    if (entry) seenCount.set(id, (seenCount.get(id) || 0) + 1);
  }
  const candidates = catalog.movies.map(m => String(m._id)).filter(id => (seenCount.get(id) || 0) <= profiles.length / 2);
  if (!candidates.length) return { items: [], members: [], compatibility: 0 };

  const perMember = profiles.map(p => scoreCandidates(p, catalog, matrix, candidates));

  // Pairwise taste similarity -> group compatibility
  let pairSum = 0, pairs = 0;
  for (let i = 0; i < profiles.length; i++) for (let j = i + 1; j < profiles.length; j++) {
    pairSum += cosine(profiles[i].vector, profiles[j].vector); pairs++;
  }
  const compatibility = pairs ? Math.round(Math.max(0, pairSum / pairs) * 100) : 100;

  const items = candidates.map(id => {
    const s = perMember.map(scores => scores.get(id).score);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const min = Math.min(...s);
    const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
    const groupScore = Math.max(0, Math.min(1, 0.45 * mean + 0.35 * min + 0.2 * (1 - 2 * std)));
    return { id, s, mean, min, std, groupScore };
  }).sort((a, b) => b.groupScore - a.groupScore).slice(0, limit).map(r => {
    const m = catalog.byId.get(r.id);
    const matchingGenres = (m.genre || []).filter(g => profiles.filter(p => (p.vector.get(`g:${g}`) || 0) > 0).length >= Math.ceil(profiles.length / 2));
    const memberScores = profiles.map((p, i) => ({ userId: p.user._id, name: p.user.name, match: Math.round(r.s[i] * 100) }));
    const happiest = [...memberScores].sort((a, b) => b.match - a.match)[0];
    const reasons = [];
    if (matchingGenres.length) reasons.push(`${matchingGenres.join(' & ')} appeals to most of the group`);
    if (r.min >= 0.55) reasons.push('Broad appeal: nobody in the group is likely to dislike it');
    else if (r.std > 0.2) reasons.push(`Strong pick for ${happiest.name}, more divisive for others`);
    const explained = explain(profiles[r.s.indexOf(Math.max(...r.s))], r.id, catalog)[0];
    if (explained) reasons.push(explained.text.replace(/^Because you/, `Because ${happiest.name}`).replace(/your/g, `${happiest.name}'s`));
    return {
      movie: movieCard(m),
      groupMatch: Math.round(r.groupScore * 100),
      broadAppeal: r.min >= 0.55,
      agreement: Math.round((1 - Math.min(1, r.std * 2)) * 100),
      matchingGenres,
      members: memberScores,
      reasons
    };
  });

  await MovieRecommendation.create({ circle: circleId, scope: 'group', strategy: 'fairness-aware-hybrid', items: items.map(i => ({ movie: i.movie._id, match: i.groupMatch })), meta: { compatibility } }).catch(() => {});

  return {
    items,
    compatibility,
    members: profiles.map(p => ({ userId: p.user._id, name: p.user.name, coldStart: p.coldStart, usedHistory: p.usedHistory, topGenres: summarizeProfile(p).topGenres })),
    method: 'Per-member hybrid scores aggregated with 45% average satisfaction, 35% least-misery and a 20% disagreement penalty.'
  };
}

/** Content similarity between movies ("more like this") */
async function similarMovies(movieId, limit = 8) {
  const catalog = await loadCatalog();
  const v = catalog.vectors.get(String(movieId));
  if (!v) return [];
  return catalog.movies.filter(m => String(m._id) !== String(movieId))
    .map(m => ({ m, s: cosine(v, catalog.vectors.get(String(m._id))) }))
    .sort((a, b) => b.s - a.s).slice(0, limit)
    .map(({ m, s }) => ({ movie: movieCard(m), similarity: Math.round(s * 100) }));
}

/** Taste similarity between two users (0-100) for "similar movie enthusiasts" */
async function userSimilarity(userA, userB) {
  const catalog = await loadCatalog();
  const [a, b] = await Promise.all([buildProfile(userA, catalog), buildProfile(userB, catalog)]);
  return Math.round(Math.max(0, cosine(a.vector, b.vector)) * 100);
}

module.exports = { recommendForUser, recommendForCircle, similarMovies, userSimilarity, buildProfile, loadCatalog, invalidateCatalog, movieCard };
