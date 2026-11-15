const Poll = require('../models/Poll');
const PollVote = require('../models/PollVote');
const MovieEvent = require('../models/MovieEvent');
const CircleMember = require('../models/CircleMember');
const Review = require('../models/Review');
const { GroupAnalytics } = require('../models/AIRecords');
const cinematch = require('./cinematch');

/**
 * CinePulse - group preference intelligence.
 *
 * Genre preference is estimated with a Dirichlet-multinomial model: every genre starts with a
 * small prior (alpha) and receives evidence from
 *   - poll votes (each vote spreads 1 unit over the voted movie's genres)
 *   - poll winners (extra weight)
 *   - movie-night feedback ratings (centred on 3★)
 *   - members' own ratings of movies the group watched together
 *   - members' current taste profiles (CineMatch)
 * The posterior mean gives the preference share; the amount of evidence determines the
 * confidence level, and the wording of insights is softened accordingly - predictions are
 * never presented as certain.
 */

const ALPHA = 0.5;

async function analyze(circleId) {
  const [polls, events, members] = await Promise.all([
    Poll.find({ circle: circleId }).populate('options.movie', 'title genre poster').sort({ createdAt: 1 }).lean(),
    MovieEvent.find({ circle: circleId }).populate('movie', 'title genre poster').sort({ startsAt: 1 }).lean(),
    CircleMember.find({ circle: circleId, status: 'active' }).populate('user', 'name privacy favoriteGenres favoriteDirectors favoriteActors favoriteMovies').lean()
  ]);
  const memberUsers = members.filter(m => m.user).map(m => m.user);
  const memberIds = memberUsers.map(u => String(u._id));

  const evidence = new Map();
  const add = (genre, w) => evidence.set(genre, (evidence.get(genre) || 0) + w);
  const trend = new Map(); // month -> Map(genre -> weight)
  const addTrend = (date, genres, w) => {
    const key = new Date(date).toISOString().slice(0, 7);
    if (!trend.has(key)) trend.set(key, new Map());
    const t = trend.get(key);
    for (const g of genres) t.set(g, (t.get(g) || 0) + w / genres.length);
  };

  // ---- Polls & votes
  const votes = polls.length ? await PollVote.find({ poll: { $in: polls.map(p => p._id) } }).lean() : [];
  const votesByPoll = new Map();
  for (const v of votes) { const k = String(v.poll); votesByPoll.set(k, (votesByPoll.get(k) || 0) + 1); }
  const movieVotes = new Map();
  let consensusSum = 0, consensusPolls = 0;
  const participation = [];

  for (const p of polls) {
    const optionById = new Map(p.options.map(o => [String(o._id), o]));
    const pollVotes = votes.filter(v => String(v.poll) === String(p._id));
    for (const v of pollVotes) {
      const opt = optionById.get(String(v.option));
      const genres = opt?.movie?.genre || [];
      for (const g of genres) add(g, 1 / genres.length);
      if (genres.length) addTrend(v.createdAt, genres, 1);
      if (opt?.movie) {
        const k = String(opt.movie._id);
        const cur = movieVotes.get(k) || { movie: opt.movie, votes: 0 };
        cur.votes++; movieVotes.set(k, cur);
      }
    }
    if (p.winner) {
      const w = optionById.get(String(p.winner));
      for (const g of w?.movie?.genre || []) add(g, 1 / w.movie.genre.length);
    }
    const total = p.totalVotes || pollVotes.length;
    if (total) {
      consensusSum += Math.max(...p.options.map(o => o.votes)) / total;
      consensusPolls++;
    }
    const voters = new Set(pollVotes.map(v => String(v.user))).size;
    participation.push({ pollId: p._id, question: p.question, date: p.createdAt, voters, rate: memberIds.length ? Math.round((voters / memberIds.length) * 100) : 0 });
  }

  // ---- Movie nights: feedback & members' ratings of the movie
  const eventMovieIds = events.filter(e => e.movie).map(e => e.movie._id);
  const groupRatings = eventMovieIds.length
    ? await Review.find({ movieId: { $in: eventMovieIds }, userId: { $in: memberIds } }).select('movieId rating userId').lean()
    : [];
  const nights = [];
  for (const e of events) {
    if (!e.movie) continue;
    const fb = (e.feedback || []).map(f => f.rating).filter(Boolean);
    const rs = groupRatings.filter(r => String(r.movieId) === String(e.movie._id)).map(r => r.rating);
    const all = [...fb, ...rs];
    const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    if (avg !== null) {
      for (const g of e.movie.genre || []) add(g, ((avg - 3) / 2) * 1.5);
      addTrend(e.startsAt, e.movie.genre || [], Math.max(0.2, (avg - 1) / 2));
    }
    nights.push({ eventId: e._id, title: e.title, movie: e.movie.title, date: e.startsAt, avgRating: avg ? Math.round(avg * 10) / 10 : null, ratings: all.length, going: (e.attendees || []).filter(a => a.rsvp === 'going').length });
  }

  // ---- Current member tastes (light evidence)
  const catalog = await cinematch.loadCatalog();
  const profiles = await Promise.all(memberUsers.map(u => cinematch.buildProfile(u, catalog)));
  for (const p of profiles) {
    const genres = [...p.vector.entries()].filter(([k, v]) => k.startsWith('g:') && v > 0);
    const sum = genres.reduce((s, [, v]) => s + v, 0) || 1;
    for (const [k, v] of genres) add(k.slice(2), (v / sum) * 0.8);
  }

  // ---- Posterior
  const genres = [...evidence.keys()];
  const positiveTotal = genres.reduce((s, g) => s + Math.max(0, evidence.get(g)), 0);
  const denom = positiveTotal + ALPHA * genres.length || 1;
  const genreTrends = genres.map(g => ({
    genre: g,
    share: Math.round(((Math.max(0, evidence.get(g)) + ALPHA) / denom) * 1000) / 10,
    evidence: Math.round(evidence.get(g) * 100) / 100
  })).sort((a, b) => b.share - a.share);

  const observations = votes.length + nights.reduce((s, n) => s + n.ratings, 0);
  const confidence = observations >= 30 ? 'high' : observations >= 8 ? 'medium' : 'low';

  // Group compatibility (pairwise taste similarity)
  let pairSum = 0, pairs = 0;
  const { cosine } = require('./text');
  for (let i = 0; i < profiles.length; i++) for (let j = i + 1; j < profiles.length; j++) { pairSum += cosine(profiles[i].vector, profiles[j].vector); pairs++; }
  const compatibility = pairs ? Math.round(Math.max(0, pairSum / pairs) * 100) : null;

  const top = genreTrends.slice(0, 2).map(g => g.genre);
  const insights = [];
  const hedge = { high: 'consistently', medium: 'so far tended to', low: 'shown an early lean towards' }[confidence];
  if (top.length) {
    insights.push(confidence === 'high'
      ? `Your group has ${hedge} preferred ${top.join(' and ')} movies.`
      : `Your group has ${hedge} ${top.join(' and ')} movies.`);
  }
  if (consensusPolls) {
    const c = Math.round((consensusSum / consensusPolls) * 100);
    insights.push(c >= 60 ? `Polls usually reach a clear winner (the top pick averages ${c}% of votes).` : `Your polls are often close (the top pick averages ${c}% of votes) - group CineMatch can help find a compromise.`);
  }
  const ratedNights = nights.filter(n => n.avgRating !== null);
  if (ratedNights.length) {
    const best = [...ratedNights].sort((a, b) => b.avgRating - a.avgRating)[0];
    insights.push(`Best-received movie night so far: ${best.movie} (${best.avgRating}★ average).`);
  }
  if (!observations) insights.push('Not enough group history yet - run a poll or plan a movie night and CinePulse will start learning.');

  const nextCategory = genreTrends[0] ? {
    genre: genreTrends[0].genre,
    alternative: genreTrends[1]?.genre || null,
    statement: `Your group may enjoy a ${genreTrends[0].genre.toLowerCase()}${genreTrends[1] ? `-${genreTrends[1].genre.toLowerCase()}` : ''} movie next.`,
    confidence,
    caveat: 'This is a statistical estimate from past votes, ratings and member tastes - not a guarantee.'
  } : null;

  const months = [...trend.keys()].sort();
  const trendSeries = months.map(m => ({ month: m, genres: Object.fromEntries([...trend.get(m).entries()].map(([g, v]) => [g, Math.round(v * 100) / 100])) }));

  const data = {
    generatedAt: new Date(),
    confidence,
    observations,
    memberCount: memberIds.length,
    compatibility,
    genreTrends,
    trendSeries,
    voting: {
      polls: polls.length,
      closedPolls: polls.filter(p => p.status === 'closed').length,
      totalVotes: votes.length,
      avgVotesPerPoll: polls.length ? Math.round((votes.length / polls.length) * 10) / 10 : 0,
      avgParticipation: participation.length ? Math.round(participation.reduce((s, p) => s + p.rate, 0) / participation.length) : 0,
      consensus: consensusPolls ? Math.round((consensusSum / consensusPolls) * 100) : null,
      participation: participation.slice(-10)
    },
    popularMovies: [...movieVotes.values()].sort((a, b) => b.votes - a.votes).slice(0, 6).map(m => ({ movie: { _id: m.movie._id, title: m.movie.title, poster: m.movie.poster, genre: m.movie.genre }, votes: m.votes })),
    movieNights: nights.slice(-10),
    insights,
    nextCategory,
    method: 'Dirichlet-smoothed genre preference from votes, winners, movie-night feedback, members\' ratings and current tastes.'
  };

  await GroupAnalytics.create({ circle: circleId, data }).catch(() => {});
  return data;
}

module.exports = { analyze };
