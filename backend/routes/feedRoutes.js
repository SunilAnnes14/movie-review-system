const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Movie = require('../models/Movie');
const Review = require('../models/Review');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, assertId, cleanString } = require('../utils/http');
const { friendIds, followingIds, activeCircleIds, loadCircle, canView, sameId, membership } = require('../utils/access');
const { notify } = require('../services/notify');
const cinespoiler = require('../ai/cinespoiler');

const router = express.Router();
router.use(protect);

const POST_POPULATE = [
  { path: 'author', select: 'name avatar' },
  { path: 'movie', select: 'title poster backdrop releaseYear genre averageRating director' },
  { path: 'review', select: 'rating comment containsSpoilers spoilerSentences createdAt' },
  { path: 'collectionRef', select: 'name description movies', populate: { path: 'movies', select: 'title poster', options: { limit: 6 } } },
  { path: 'poll', select: 'question status totalVotes options', populate: { path: 'options.movie', select: 'title poster' } },
  { path: 'event', select: 'title startsAt venue status' },
  { path: 'circle', select: 'name' }
];

const present = (p, userId) => {
  const o = p.toObject ? p.toObject() : p;
  return { ...o, likedByMe: (o.likes || []).some(id => sameId(id, userId)), likes: undefined };
};

async function canSeePost(post, user) {
  if (sameId(post.author?._id || post.author, user._id)) return true;
  if (post.circle) {
    const access = await loadCircle(post.circle._id || post.circle, user, 'view').catch(() => null);
    return !!access && (access.active || access.circle.visibility === 'public');
  }
  return canView(user, post.author?._id || post.author, post.visibility === 'public' ? 'public' : 'friends');
}

/**
 * Personalised feed. tab = all | friends | circles | mine | popular
 * Cursor pagination with ?before=<ISO date>.
 */
router.get('/', asyncHandler(async (req, res) => {
  const me = req.user._id;
  const tab = req.query.tab || 'all';
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const [friends, following, circles] = await Promise.all([friendIds(me), followingIds(me), activeCircleIds(me)]);

  let filter;
  if (req.query.circle) {
    assertId(req.query.circle, 'circle id');
    const { circle, active } = await loadCircle(req.query.circle, req.user, 'view');
    if (!active && circle.visibility === 'private') throw httpError(403, 'Members only');
    filter = { circle: circle._id };
  } else {
    const friendClause = { author: { $in: friends }, visibility: { $in: ['public', 'friends'] }, circle: { $exists: false } };
    const followClause = { author: { $in: following }, visibility: 'public', circle: { $exists: false } };
    const circleClause = { circle: { $in: circles } };
    const mineClause = { author: me };
    if (tab === 'friends') filter = { $or: [friendClause, followClause] };
    else if (tab === 'circles') filter = circleClause;
    else if (tab === 'mine') filter = mineClause;
    else if (tab === 'popular') filter = { visibility: 'public', circle: { $exists: false }, createdAt: { $gte: new Date(Date.now() - 14 * 86400000) } };
    else filter = { $or: [friendClause, followClause, circleClause, mineClause] };
  }
  if (req.query.before) filter = { $and: [filter, { createdAt: { $lt: new Date(req.query.before) } }] };

  const sort = tab === 'popular' ? { likeCount: -1, commentCount: -1, createdAt: -1 } : { createdAt: -1 };
  const posts = await Post.find(filter).sort(sort).limit(limit).populate(POST_POPULATE);
  res.json({ posts: posts.map(p => present(p, me)), hasMore: posts.length === limit });
}));

router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const kinds = ['text', 'recommendation'];
  const kind = kinds.includes(b.kind) ? b.kind : 'text';
  const text = cleanString(b.text, 3000);
  const doc = { author: req.user._id, kind, text, visibility: ['public', 'friends'].includes(b.visibility) ? b.visibility : 'public' };

  let movie = null;
  if (b.movieId) {
    assertId(b.movieId, 'movie id');
    movie = await Movie.findById(b.movieId).select('_id title cast characters').lean();
    if (!movie) throw httpError(404, 'Movie not found');
    doc.movie = movie._id;
  }
  if (b.reviewId) {
    assertId(b.reviewId, 'review id');
    const review = await Review.findOne({ _id: b.reviewId, userId: req.user._id }).lean();
    if (!review) throw httpError(404, 'You can only share your own reviews');
    doc.review = review._id; doc.kind = 'review'; doc.movie = review.movieId; doc.isSpoiler = review.containsSpoilers;
  }
  if (b.circleId) {
    assertId(b.circleId, 'circle id');
    await loadCircle(b.circleId, req.user, 'member');
    doc.circle = b.circleId;
    doc.visibility = 'circle';
  }
  if (!doc.text && !doc.movie && !doc.review) throw httpError(400, 'Write something or attach a movie');
  if (kind === 'recommendation' && !doc.movie) throw httpError(400, 'Recommendations need a movie');

  if (typeof b.isSpoiler === 'boolean') { doc.isSpoiler = b.isSpoiler; doc.spoilerMarkedBy = b.isSpoiler ? 'user' : 'none'; }
  else if (doc.text) {
    const d = await cinespoiler.detect(doc.text, movie, { log: { user: req.user._id, source: 'post' } });
    if (d.isSpoiler) { doc.isSpoiler = true; doc.spoilerMarkedBy = 'auto'; }
  }

  const post = await Post.create(doc);
  await post.populate(POST_POPULATE);
  res.status(201).json(present(post, req.user._id));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'post id');
  const post = await Post.findById(req.params.id);
  if (!post) throw httpError(404, 'Post not found');
  let allowed = sameId(post.author, req.user._id) || req.user.role === 'admin';
  if (!allowed && post.circle) {
    const m = await membership(post.circle, req.user._id);
    allowed = m && ['owner', 'admin'].includes(m.role);
  }
  if (!allowed) throw httpError(403, 'Not allowed');
  await Comment.deleteMany({ post: post._id });
  await post.deleteOne();
  res.json({ message: 'Post deleted' });
}));

router.post('/:id/like', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'post id');
  const post = await Post.findById(req.params.id).populate('author', 'name');
  if (!post || !(await canSeePost(post, req.user))) throw httpError(404, 'Post not found');
  const liked = post.likes.some(id => sameId(id, req.user._id));
  const update = liked
    ? { $pull: { likes: req.user._id }, $inc: { likeCount: -1 } }
    : { $addToSet: { likes: req.user._id }, $inc: { likeCount: 1 } };
  const updated = await Post.findByIdAndUpdate(post._id, update, { new: true });
  if (!liked) await notify(post.author._id, { type: 'post_like', title: `${req.user.name} liked your post`, link: '/feed', actor: req.user._id });
  res.json({ liked: !liked, likeCount: updated.likeCount });
}));

router.get('/:id/comments', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'post id');
  const post = await Post.findById(req.params.id);
  if (!post || !(await canSeePost(post, req.user))) throw httpError(404, 'Post not found');
  res.json(await Comment.find({ post: post._id }).populate('author', 'name avatar').sort({ createdAt: 1 }).limit(200).lean());
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'post id');
  const post = await Post.findById(req.params.id).populate('movie', 'title cast characters');
  if (!post || !(await canSeePost(post, req.user))) throw httpError(404, 'Post not found');
  const text = cleanString(req.body?.text, 1000);
  if (!text) throw httpError(400, 'Comment cannot be empty');
  let isSpoiler = req.body?.isSpoiler;
  if (typeof isSpoiler !== 'boolean') isSpoiler = (await cinespoiler.detect(text, post.movie, { log: { user: req.user._id, source: 'comment' } })).isSpoiler;
  const comment = await Comment.create({ post: post._id, author: req.user._id, text, isSpoiler });
  await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
  await notify(post.author, { type: 'post_comment', title: `${req.user.name} commented on your post`, body: isSpoiler ? '(spoiler hidden)' : text.slice(0, 120), link: '/feed', actor: req.user._id });
  res.status(201).json(await Comment.findById(comment._id).populate('author', 'name avatar').lean());
}));

router.delete('/:postId/comments/:id', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'comment id');
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw httpError(404, 'Comment not found');
  if (!sameId(comment.author, req.user._id) && req.user.role !== 'admin') throw httpError(403, 'Not allowed');
  await comment.deleteOne();
  await Post.updateOne({ _id: comment.post }, { $inc: { commentCount: -1 } });
  res.json({ message: 'Comment deleted' });
}));

module.exports = router;
