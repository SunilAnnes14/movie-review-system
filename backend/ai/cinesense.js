const Review = require('../models/Review');
const Watchlist = require('../models/Watchlist');
const User = require('../models/User');
const { MovieDNA } = require('../models/AIRecords');
const { sentiment, keywords } = require('./text');
const llm = require('./llm');

/**
 * CineSense - personal Movie DNA.
 * Statistics are computed from the user's real ratings, vault and reviews. Storytelling styles
 * come from a lexicon over synopses, TMDB keywords and the user's own review text, weighted
 * by how much the user liked each film. The personality text is assembled from those numbers;
 * if an LLM is configured (and the user allows review usage) it writes a richer narrative from
 * the same aggregated statistics only - never from raw personal data.
 */

const STYLES = {
  'Nonlinear storytelling': /non-?linear|time travel|timeline|flashback|memory|memories|dream|loop|parallel/i,
  'Mind-bending twists': /twist|mind-?bend|reveal|surpris|unexpected|puzzle|mystery|identity|illusion/i,
  'Psychological depth': /psycholog|mind|obsess|paranoi|madness|trauma|guilt|insan|mental/i,
  'Complex characters': /complex|morally|anti-?hero|flawed|character study|redemption|corrupt/i,
  'Epic world-building': /epic|empire|galaxy|world|kingdom|saga|universe|planet|space|future/i,
  'Emotional storytelling': /emotional|heart|love|family|loss|grief|friendship|moving|tear|cry/i,
  'Dark & gritty tone': /dark|gritty|crime|violence|brutal|noir|bleak|war|murder|gang/i,
  'Humour & wit': /comed|funny|hilarious|witty|satire|absurd|laugh|quirky/i,
  'Social commentary': /class|society|social|political|inequality|system|power|commentary/i,
  'Visual spectacle': /visual|spectacle|stunning|cinematograph|effects|imax|breathtaking|beautiful/i
};

const ARCHETYPES = [
  { name: 'The Mind Explorer', match: (g, s) => (g['Sci-Fi'] || 0) + (s['Mind-bending twists'] || 0) + (s['Nonlinear storytelling'] || 0) },
  { name: 'The Dark Romantic', match: (g, s) => (g.Thriller || 0) + (g.Crime || 0) + (s['Dark & gritty tone'] || 0) },
  { name: 'The Heart Seeker', match: (g, s) => (g.Drama || 0) + (g.Romance || 0) + (s['Emotional storytelling'] || 0) },
  { name: 'The Thrill Chaser', match: (g, s) => (g.Action || 0) + (g.Adventure || 0) + (s['Visual spectacle'] || 0) },
  { name: 'The Wit Connoisseur', match: (g, s) => (g.Comedy || 0) + (g.Animation || 0) + (s['Humour & wit'] || 0) },
  { name: 'The Social Observer', match: (g, s) => (g.Drama || 0) * 0.5 + (s['Social commentary'] || 0) * 2 + (s['Complex characters'] || 0) }
];

const tally = (map, key, value) => map.set(key, (map.get(key) || 0) + value);

function rank(map, counts, limit = 5) {
  return [...map.entries()].map(([name, score]) => ({ name, score: Math.round(score * 100) / 100, count: counts?.get(name) || 0 }))
    .sort((a, b) => b.score - a.score).slice(0, limit);
}

async function generate(userId, { useLLM = true } = {}) {
  const user = await User.findById(userId).lean();
  const allowReviews = user.privacy?.allowReviewsForAI !== false;
  const allowHistory = user.privacy?.allowHistoryForAI !== false;

  const [reviews, vault] = await Promise.all([
    allowHistory ? Review.find({ userId }).populate('movieId').lean() : [],
    allowHistory ? Watchlist.find({ userId }).populate('movieId').lean() : []
  ]);

  // Every distinct movie the user engaged with, with an affinity weight
  const engaged = new Map();
  for (const w of vault) if (w.movieId) engaged.set(String(w.movieId._id), { movie: w.movieId, weight: w.status === 'watched' ? 0.6 : 0.3, status: w.status, date: w.watchedAt || w.updatedAt });
  for (const r of reviews) if (r.movieId) engaged.set(String(r.movieId._id), { movie: r.movieId, weight: (r.rating - 2.5) / 2.5 + 0.2, rating: r.rating, review: r.comment, date: r.createdAt, status: 'watched' });

  const genreScore = new Map(), genreCount = new Map(), genreRatings = new Map();
  const directorScore = new Map(), directorCount = new Map();
  const actorScore = new Map(), actorCount = new Map();
  const decadeScore = new Map(), decadeCount = new Map();
  const styleScore = new Map();
  const monthly = new Map();

  for (const { movie, weight, rating, review, date, status } of engaged.values()) {
    for (const g of movie.genre || []) {
      tally(genreScore, g, weight); tally(genreCount, g, 1);
      if (rating) { const arr = genreRatings.get(g) || []; arr.push(rating); genreRatings.set(g, arr); }
    }
    if (movie.director) { tally(directorScore, movie.director, weight); tally(directorCount, movie.director, 1); }
    for (const a of (movie.cast || []).slice(0, 4)) { tally(actorScore, a, weight); tally(actorCount, a, 1); }
    if (movie.releaseYear) { const d = `${Math.floor(movie.releaseYear / 10) * 10}s`; tally(decadeScore, d, weight); tally(decadeCount, d, 1); }

    const corpus = `${movie.description} ${(movie.keywords || []).join(' ')} ${(movie.genre || []).join(' ')} ${allowReviews && review ? review : ''}`;
    for (const [style, re] of Object.entries(STYLES)) if (re.test(corpus)) tally(styleScore, style, Math.max(0.1, weight));

    if (status === 'watched' && date) {
      const key = new Date(date).toISOString().slice(0, 7);
      const m = monthly.get(key) || { month: key, watched: 0, ratings: [] };
      m.watched++; if (rating) m.ratings.push(rating);
      monthly.set(key, m);
    }
  }
  // Onboarding preferences count as a light prior
  for (const g of user.favoriteGenres || []) tally(genreScore, g, 0.5);
  for (const d of user.favoriteDirectors || []) tally(directorScore, d, 0.5);
  for (const a of user.favoriteActors || []) tally(actorScore, a, 0.4);

  const ratings = reviews.map(r => r.rating);
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null;
  const distribution = [1, 2, 3, 4, 5].map(star => ({ star, count: ratings.filter(r => r === star).length }));
  const reviewSentiment = allowReviews && reviews.length ? sentiment(reviews.map(r => r.comment).join(' ')) : null;

  const favoriteGenres = rank(genreScore, genreCount, 6).map(g => {
    const rs = genreRatings.get(g.name) || [];
    return { ...g, avgRating: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10 : null };
  });
  const mostWatched = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
  const styles = rank(styleScore, null, 5);

  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const m = monthly.get(key);
    months.push({ month: key, watched: m?.watched || 0, avgRating: m?.ratings.length ? Math.round((m.ratings.reduce((a, b) => a + b, 0) / m.ratings.length) * 10) / 10 : null });
  }

  const gObj = Object.fromEntries(genreScore), sObj = Object.fromEntries(styleScore);
  const archetype = [...ARCHETYPES].sort((a, b) => b.match(gObj, sObj) - a.match(gObj, sObj))[0];

  const dataPoints = engaged.size;
  const confidence = dataPoints >= 15 ? 'high' : dataPoints >= 5 ? 'medium' : 'low';

  const profile = {
    archetype: dataPoints || user.favoriteGenres?.length ? archetype.name : 'The Curious Newcomer',
    confidence,
    dataPoints,
    stats: { moviesEngaged: dataPoints, reviewsWritten: reviews.length, watched: [...engaged.values()].filter(e => e.status === 'watched').length, avgRating, distribution },
    favoriteGenres,
    mostWatchedGenres: mostWatched,
    favoriteDirectors: rank(directorScore, directorCount, 5),
    favoriteActors: rank(actorScore, actorCount, 6),
    favoriteDecades: rank(decadeScore, decadeCount, 4),
    storytellingStyles: styles,
    reviewTone: reviewSentiment ? { label: reviewSentiment.label, score: reviewSentiment.score, signatureWords: keywords(reviews.map(r => r.comment).join(' '), 8) } : null,
    monthly: months,
    usedHistory: allowHistory,
    usedReviews: allowReviews
  };
  profile.personality = describe(profile, user);
  let generatedWith = 'local';

  if (useLLM && llm.available() && allowReviews && dataPoints >= 3) {
    try {
      const out = await llm.json({
        system: 'You write warm, specific "movie personality" descriptions for a film social app. Use only the statistics provided; do not invent films or facts. 2-3 sentences, second person.',
        prompt: `Aggregated viewing statistics:\n${JSON.stringify({ archetype: profile.archetype, favoriteGenres, styles, favoriteDirectors: profile.favoriteDirectors, favoriteDecades: profile.favoriteDecades, avgRating, reviewTone: profile.reviewTone?.label })}`,
        schema: { type: 'object', properties: { personality: { type: 'string' } }, required: ['personality'], additionalProperties: false },
        maxTokens: 800
      });
      if (out.personality) { profile.personality = out.personality; generatedWith = 'llm'; }
    } catch (e) {
      // keep the locally generated description
    }
  }

  const doc = await MovieDNA.findOneAndUpdate(
    { user: userId },
    { profile, dataPoints, generatedWith },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

function describe(p) {
  if (!p.dataPoints && !p.favoriteGenres.length) {
    return 'Your Movie DNA is still forming. Rate a few movies or add them to your vault and CineSense will map your taste.';
  }
  const genres = p.favoriteGenres.slice(0, 3).map(g => g.name.toLowerCase());
  const styles = p.storytellingStyles.slice(0, 2).map(s => s.name.toLowerCase());
  const dir = p.favoriteDirectors[0];
  const parts = [];
  parts.push(`Your movie personality shows a strong preference for ${joinList(genres)}${styles.length ? `, with a pull towards ${joinList(styles)}` : ''}.`);
  if (dir && dir.count >= 2) parts.push(`${dir.name} is the filmmaker you return to most.`);
  if (p.stats.avgRating) {
    const tone = p.stats.avgRating >= 4.2 ? 'You are a generous, enthusiastic rater' : p.stats.avgRating <= 3 ? 'You are a discerning critic who saves high scores for the best' : 'You rate with balance';
    parts.push(`${tone} (average ${p.stats.avgRating}★).`);
  }
  if (p.favoriteDecades[0]) parts.push(`Films from the ${p.favoriteDecades[0].name} resonate with you most.`);
  if (p.confidence === 'low') parts.push('This profile is based on limited data and will sharpen as you watch more.');
  return parts.join(' ');
}

const joinList = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

async function get(userId) {
  return MovieDNA.findOne({ user: userId }).lean();
}

module.exports = { generate, get };
