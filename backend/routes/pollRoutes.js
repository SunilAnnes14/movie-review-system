const express = require('express');
const Poll = require('../models/Poll');
const PollVote = require('../models/PollVote');
const Movie = require('../models/Movie');
const CircleMember = require('../models/CircleMember');
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, assertId, cleanString } = require('../utils/http');
const { loadCircle, activeCircleIds, sameId } = require('../utils/access');
const { notify } = require('../services/notify');
const { present, recount, closePoll, POLL_POPULATE } = require('../services/polls');
const { emitToCircle } = require('../realtime/socket');

const router = express.Router();
router.use(protect);

async function loadPoll(id, user, mode = 'member') {
  assertId(id, 'poll id');
  const poll = await Poll.findById(id);
  if (!poll) throw httpError(404, 'Poll not found');
  const access = await loadCircle(poll.circle, user, mode);
  return { poll, ...access };
}

// Polls across my circles (or one circle)
router.get('/', asyncHandler(async (req, res) => {
  let circles;
  if (req.query.circle) {
    assertId(req.query.circle, 'circle id');
    const { circle, active } = await loadCircle(req.query.circle, req.user, 'view');
    if (!active && circle.visibility === 'private') throw httpError(403, 'Members only');
    circles = [circle._id];
  } else {
    circles = await activeCircleIds(req.user._id);
  }
  const filter = { circle: { $in: circles } };
  if (['open', 'closed'].includes(req.query.status)) filter.status = req.query.status;
  const polls = await Poll.find(filter).populate(POLL_POPULATE).sort({ status: -1, createdAt: -1 }).limit(100);
  res.json(await Promise.all(polls.map(p => present(p, req.user._id))));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { poll } = await loadPoll(req.params.id, req.user, 'view');
  await poll.populate(POLL_POPULATE);
  res.json(await present(poll, req.user._id));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { circleId, question, options, multipleChoice, expiresAt } = req.body || {};
  assertId(circleId, 'circle id');
  const { circle } = await loadCircle(circleId, req.user, 'member');

  const q = cleanString(question, 200);
  if (!q) throw httpError(400, 'Poll question is required');
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) throw httpError(400, 'A poll needs between 2 and 10 options');

  const built = [];
  for (const opt of options) {
    const movieId = typeof opt === 'string' ? opt : opt?.movieId;
    if (movieId) {
      assertId(movieId, 'movie id');
      const movie = await Movie.findById(movieId).select('title');
      if (!movie) throw httpError(404, 'One of the movies was not found');
      if (built.some(b => sameId(b.movie, movie._id))) throw httpError(400, 'Duplicate movie option');
      built.push({ movie: movie._id, label: movie.title });
    } else if (opt?.label) {
      built.push({ label: cleanString(opt.label, 200) });
    } else {
      throw httpError(400, 'Each option needs a movie or a label');
    }
  }

  let expiry;
  if (expiresAt) {
    expiry = new Date(expiresAt);
    if (isNaN(expiry) || expiry <= new Date()) throw httpError(400, 'Expiry must be in the future');
  }

  const poll = await Poll.create({ circle: circle._id, creator: req.user._id, question: q, options: built, multipleChoice: !!multipleChoice, expiresAt: expiry });
  await Post.create({ author: req.user._id, circle: circle._id, kind: 'poll', poll: poll._id, text: q, visibility: 'circle' });

  const members = await CircleMember.find({ circle: circle._id, status: 'active' }).distinct('user');
  await notify(members, { type: 'poll_created', title: `New poll in ${circle.name}`, body: q, link: `/circles/${circle._id}?tab=polls`, actor: req.user._id });
  emitToCircle(circle._id, 'poll:update', { pollId: String(poll._id), circleId: String(circle._id) });

  await poll.populate(POLL_POPULATE);
  res.status(201).json(await present(poll, req.user._id));
}));

/**
 * Vote. Body: { optionIds: [..] } (or { optionId }).
 * Single-choice polls keep exactly one vote per user (re-voting moves the vote);
 * multiple-choice polls replace the user's selection. The unique index on
 * (poll, user, option) makes duplicate votes impossible even under concurrency.
 */
router.post('/:id/vote', asyncHandler(async (req, res) => {
  const { poll } = await loadPoll(req.params.id, req.user, 'member');
  if (poll.status === 'closed') throw httpError(400, 'This poll is closed');
  if (poll.expiresAt && poll.expiresAt <= new Date()) {
    await closePoll(poll._id, { reason: 'expired' });
    throw httpError(400, 'This poll has expired');
  }

  let ids = Array.isArray(req.body.optionIds) ? req.body.optionIds : [req.body.optionId];
  ids = [...new Set(ids.filter(Boolean).map(String))];
  if (!ids.length) throw httpError(400, 'Choose an option');
  if (!poll.multipleChoice && ids.length > 1) throw httpError(400, 'This poll allows only one choice');
  const valid = new Set(poll.options.map(o => String(o._id)));
  if (ids.some(id => !valid.has(id))) throw httpError(400, 'Invalid option');

  await PollVote.deleteMany({ poll: poll._id, user: req.user._id, option: { $nin: ids } });
  for (const option of ids) {
    try {
      await PollVote.create({ poll: poll._id, user: req.user._id, option });
    } catch (e) {
      if (e.code !== 11000) throw e; // already voted for this option
    }
  }
  const updated = await recount(poll._id);
  emitToCircle(poll.circle, 'poll:update', { pollId: String(poll._id), circleId: String(poll.circle) });
  await updated.populate(POLL_POPULATE);
  res.json(await present(updated, req.user._id));
}));

router.delete('/:id/vote', asyncHandler(async (req, res) => {
  const { poll } = await loadPoll(req.params.id, req.user, 'member');
  if (poll.status === 'closed') throw httpError(400, 'This poll is closed');
  await PollVote.deleteMany({ poll: poll._id, user: req.user._id });
  const updated = await recount(poll._id);
  emitToCircle(poll.circle, 'poll:update', { pollId: String(poll._id), circleId: String(poll.circle) });
  await updated.populate(POLL_POPULATE);
  res.json(await present(updated, req.user._id));
}));

// Finalize: creator or circle admin
router.post('/:id/close', asyncHandler(async (req, res) => {
  const { poll, member } = await loadPoll(req.params.id, req.user, 'member');
  if (!sameId(poll.creator, req.user._id) && !['owner', 'admin'].includes(member.role)) throw httpError(403, 'Only the poll creator or a circle admin can close this poll');
  if (poll.status === 'closed') throw httpError(400, 'Poll is already closed');
  const closed = await closePoll(poll._id);
  res.json(await present(closed, req.user._id));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { poll, member } = await loadPoll(req.params.id, req.user, 'member');
  if (!sameId(poll.creator, req.user._id) && !['owner', 'admin'].includes(member.role)) throw httpError(403, 'Not allowed');
  await Promise.all([PollVote.deleteMany({ poll: poll._id }), Post.deleteMany({ poll: poll._id })]);
  await poll.deleteOne();
  emitToCircle(poll.circle, 'poll:update', { pollId: String(poll._id), circleId: String(poll.circle), deleted: true });
  res.json({ message: 'Poll deleted' });
}));

module.exports = router;
