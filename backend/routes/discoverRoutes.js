const express = require('express');
const Movie = require('../models/Movie');
const Review = require('../models/Review');
const Watchlist = require('../models/Watchlist');
const Message = require('../models/Message');
const Post = require('../models/Post');
const Poll = require('../models/Poll');
const Circle = require('../models/Circle');
const User = require('../models/User');
const { protect, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { friendIds, sameId } = require('../utils/access');
const tmdb = require('../services/tmdb');
const cinematch = require('../ai/cinematch');

const router = express.Router();
const card = cinematch.movieCard;
const WEEK = 7 * 86400000;

// Trending: TMDB weekly trending when configured, otherwise local activity in the last 30 days
router.get('/trending', optionalAuth, asyncHandler(async (req, res) => {
  if (tmdb.isConfigured()) {
    try {
      const items = await tmdb.trending(req.query.window);
      const local = await Movie.find({ tmdbId: { $in: items.map(i => i.tmdbId) } }).select('_id tmdbId').lean();
      const byTmdb = new Map(local.map(m => [m.tmdbId, m._id]));
      return res.json({ source: 'tmdb', items: items.map(i => ({ ...i, _id: byTmdb.get(i.tmdbId) || null })) });
    } catch (e) {
      // fall through to local trending
    }
  }
  const since = new Date(Date.now() - 30 * 86400000);
  const [reviews, vault] = await Promise.all([
    Review.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$movieId', n: { $sum: 2 } } }]),
    Watchlist.aggregate([{ $match: { updatedAt: { $gte: since } } }, { $group: { _id: '$movieId', n: { $sum: 1 } } }])
  ]);
  const score = new Map();
  for (const r of [...reviews, ...vault]) score.set(String(r._id), (score.get(String(r._id)) || 0) + r.n);
  let movies = await Movie.find({ _id: { $in: [...score.keys()] } }).lean();
  movies.sort((a, b) => score.get(String(b._id)) - score.get(String(a._id)) || b.averageRating - a.averageRating);
  if (movies.length < 12) {
    const extra = await Movie.find({ _id: { $nin: movies.map(m => m._id) } }).sort({ averageRating: -1, popularity: -1 }).limit(12 - movies.length).lean();
    movies = movies.concat(extra);
  }
  res.json({ source: 'local', items: movies.slice(0, 20).map(card) });
}));

router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const me = req.user._id;
  const friends = await friendIds(me);
  const since = new Date(Date.now() - 4 * WEEK);

  // Friends' library entries are only shown when their library is visible to friends
  const visibleFriends = await User.find({ _id: { $in: friends }, 'privacy.libraryVisibility': { $ne: 'private' } }).distinct('_id');

  const [friendsWatched, popularReviews, discussedMessages, discussedPosts, popularPolls, popularCircles, recs] = await Promise.all([
    Watchlist.find({ userId: { $in: visibleFriends }, status: { $in: ['watched', 'watching'] } })
      .sort({ updatedAt: -1 }).limit(12).populate('movieId').populate('userId', 'name avatar').lean(),
    Review.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 26 * WEEK) } } },
      { $lookup: { from: 'posts', localField: '_id', foreignField: 'review', as: 'post' } },
      { $addFields: { engagement: { $add: [{ $ifNull: [{ $first: '$post.likeCount' }, 0] }, { $ifNull: [{ $first: '$post.commentCount' }, 0] }, { $divide: [{ $strLenCP: '$comment' }, 400] }] } } },
      { $sort: { engagement: -1, createdAt: -1 } },
      { $limit: 6 }
    ]),
    Message.aggregate([{ $match: { movie: { $exists: true }, createdAt: { $gte: since } } }, { $group: { _id: '$movie', n: { $sum: 1 } } }]),
    Post.aggregate([{ $match: { movie: { $exists: true }, createdAt: { $gte: since } } }, { $group: { _id: '$movie', n: { $sum: { $add: [1, '$commentCount'] } } } }]),
    Poll.find({ status: 'open' }).sort({ totalVotes: -1, createdAt: -1 }).limit(20).populate('circle', 'name visibility').populate('options.movie', 'title poster').lean(),
    Circle.find({ visibility: 'public' }).sort({ memberCount: -1, updatedAt: -1 }).limit(6).lean(),
    cinematch.recommendForUser(me, { limit: 8 })
  ]);

  await Review.populate(popularReviews, [{ path: 'userId', select: 'name avatar' }, { path: 'movieId', select: 'title poster releaseYear' }]);

  const discussed = new Map();
  for (const d of [...discussedMessages, ...discussedPosts]) discussed.set(String(d._id), (discussed.get(String(d._id)) || 0) + d.n);
  const discussedMovies = await Movie.find({ _id: { $in: [...discussed.keys()] } }).lean();
  discussedMovies.sort((a, b) => discussed.get(String(b._id)) - discussed.get(String(a._id)));

  // Similar movie enthusiasts: users (not yet friends) with the most similar taste
  const candidates = await User.find({ _id: { $nin: [...friends, me] }, 'privacy.profileVisibility': 'public' }).select('name avatar').limit(40).lean();
  const sims = await Promise.all(candidates.map(async u => ({ user: u, tasteMatch: await cinematch.userSimilarity(me, u._id) })));

  res.json({
    friendsWatching: friendsWatched.filter(w => w.movieId && w.userId).map(w => ({ user: w.userId, movie: card(w.movieId), status: w.status, at: w.updatedAt })),
    popularReviews: popularReviews.filter(r => r.movieId).map(r => ({ _id: r._id, user: r.userId, movie: r.movieId, rating: r.rating, comment: r.comment, containsSpoilers: r.containsSpoilers, spoilerSentences: r.spoilerSentences, createdAt: r.createdAt })),
    mostDiscussed: discussedMovies.slice(0, 8).map(m => ({ movie: card(m), mentions: discussed.get(String(m._id)) })),
    popularPolls: popularPolls.filter(p => p.circle?.visibility === 'public').slice(0, 5).map(p => ({ _id: p._id, question: p.question, totalVotes: p.totalVotes, circle: { _id: p.circle._id, name: p.circle.name }, options: p.options.map(o => ({ label: o.label, poster: o.movie?.poster, votes: o.votes })) })),
    popularCircles: popularCircles.map(c => ({ _id: c._id, name: c.name, description: c.description, coverImage: c.coverImage, memberCount: c.memberCount })),
    similarUsers: sims.filter(s => s.tasteMatch > 10).sort((a, b) => b.tasteMatch - a.tasteMatch).slice(0, 6),
    recommended: recs.items
  });
}));

module.exports = router;
