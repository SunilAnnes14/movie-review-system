const express = require('express');
const Circle = require('../models/Circle');
const CircleMember = require('../models/CircleMember');
const Conversation = require('../models/Conversation');
const Movie = require('../models/Movie');
const Post = require('../models/Post');
const { protect, optionalAuth } = require('../middleware/auth');
const { asyncHandler, httpError, assertId, cleanString, isHttpUrl, escapeRegex, PUBLIC_USER_FIELDS } = require('../utils/http');
const { loadCircle, areFriends, sameId } = require('../utils/access');
const { notify } = require('../services/notify');
const { sendMessage } = require('../services/chat');
const { isOnline, emitToCircle } = require('../realtime/socket');

const router = express.Router();

const summary = (c, member) => ({
  _id: c._id, name: c.name, description: c.description, coverImage: c.coverImage, visibility: c.visibility,
  memberCount: c.memberCount, owner: c.owner, createdAt: c.createdAt,
  membership: member ? { role: member.role, status: member.status } : null
});

async function addConversationParticipant(circle, userId) {
  if (circle.conversation) {
    await Conversation.updateOne({ _id: circle.conversation }, { $addToSet: { participants: userId } });
    await Conversation.updateOne({ _id: circle.conversation, 'reads.user': { $ne: userId } }, { $push: { reads: { user: userId, at: new Date() } } });
  }
}

async function refreshCount(circleId) {
  const count = await CircleMember.countDocuments({ circle: circleId, status: 'active' });
  await Circle.updateOne({ _id: circleId }, { memberCount: count });
  return count;
}

// Discover public circles (+ search)
router.get('/discover', optionalAuth, asyncHandler(async (req, res) => {
  const filter = { visibility: 'public' };
  if (req.query.q) filter.name = { $regex: escapeRegex(req.query.q), $options: 'i' };
  const circles = await Circle.find(filter).sort({ memberCount: -1, updatedAt: -1 }).limit(30).lean();
  const memberships = req.user ? await CircleMember.find({ user: req.user._id, circle: { $in: circles.map(c => c._id) } }).lean() : [];
  res.json(circles.map(c => summary(c, memberships.find(m => sameId(m.circle, c._id)))));
}));

router.use(protect);

// My circles (active + pending invites)
router.get('/', asyncHandler(async (req, res) => {
  const memberships = await CircleMember.find({ user: req.user._id }).populate('circle').sort({ updatedAt: -1 }).lean();
  res.json(memberships.filter(m => m.circle).map(m => summary(m.circle, m)));
}));

router.post('/', asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name, 80);
  if (name.length < 3) throw httpError(400, 'Circle name must be at least 3 characters');
  const coverImage = cleanString(req.body.coverImage, 500);
  if (!isHttpUrl(coverImage)) throw httpError(400, 'Cover image must be an http(s) URL');

  const circle = await Circle.create({
    name,
    description: cleanString(req.body.description, 1000),
    coverImage,
    visibility: req.body.visibility === 'private' ? 'private' : 'public',
    owner: req.user._id
  });
  await CircleMember.create({ circle: circle._id, user: req.user._id, role: 'owner' });
  const conv = await Conversation.create({ type: 'circle', circle: circle._id, participants: [req.user._id], reads: [{ user: req.user._id }] });
  circle.conversation = conv._id;
  await circle.save();

  // Invite friends straight away
  const invited = [];
  for (const id of (Array.isArray(req.body.invite) ? req.body.invite : []).slice(0, 50)) {
    if (/^[0-9a-f]{24}$/i.test(id) && await areFriends(req.user._id, id)) {
      await CircleMember.updateOne({ circle: circle._id, user: id }, { $setOnInsert: { status: 'invited', invitedBy: req.user._id } }, { upsert: true });
      invited.push(id);
    }
  }
  if (invited.length) await notify(invited, { type: 'circle_invite', title: `${req.user.name} invited you to ${circle.name}`, link: `/circles/${circle._id}`, actor: req.user._id });

  res.status(201).json({ ...summary(circle, { role: 'owner', status: 'active' }), invited: invited.length });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle, member, active } = await loadCircle(req.params.id, req.user, 'view');
  const populated = await Circle.findById(circle._id).populate('owner', 'name avatar').populate('sharedWatchlist.movie', 'title poster releaseYear genre averageRating').populate('sharedWatchlist.addedBy', 'name').lean();
  const data = summary(populated, member);
  data.conversation = active ? circle.conversation : null;
  data.sharedWatchlist = active || circle.visibility === 'public' ? populated.sharedWatchlist.filter(s => s.movie) : [];
  res.json(data);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle } = await loadCircle(req.params.id, req.user, 'admin');
  if (req.body.name !== undefined) { const n = cleanString(req.body.name, 80); if (n.length >= 3) circle.name = n; }
  if (req.body.description !== undefined) circle.description = cleanString(req.body.description, 1000);
  if (req.body.coverImage !== undefined) {
    if (!isHttpUrl(req.body.coverImage)) throw httpError(400, 'Cover image must be an http(s) URL');
    circle.coverImage = cleanString(req.body.coverImage, 500);
  }
  if (['public', 'private'].includes(req.body.visibility)) circle.visibility = req.body.visibility;
  await circle.save();
  res.json(summary(circle));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle } = await loadCircle(req.params.id, req.user, 'member');
  if (!sameId(circle.owner, req.user._id) && req.user.role !== 'admin') throw httpError(403, 'Only the owner can delete this circle');
  await Promise.all([
    CircleMember.deleteMany({ circle: circle._id }),
    Conversation.deleteOne({ _id: circle.conversation }),
    Post.deleteMany({ circle: circle._id })
  ]);
  await circle.deleteOne();
  res.json({ message: 'CineCircle deleted' });
}));

// Join a public circle, or accept an invite to any circle
router.post('/:id/join', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const circle = await Circle.findById(req.params.id);
  if (!circle) throw httpError(404, 'CineCircle not found');
  const existing = await CircleMember.findOne({ circle: circle._id, user: req.user._id });
  if (existing?.status === 'active') throw httpError(400, 'You are already a member');
  if (!existing && circle.visibility === 'private') throw httpError(403, 'This circle is invite-only');

  if (existing) { existing.status = 'active'; await existing.save(); }
  else await CircleMember.create({ circle: circle._id, user: req.user._id, role: 'member' });
  await addConversationParticipant(circle, req.user._id);
  await refreshCount(circle._id);

  const admins = await CircleMember.find({ circle: circle._id, role: { $in: ['owner', 'admin'] } }).distinct('user');
  await notify(admins, { type: 'circle_join', title: `${req.user.name} joined ${circle.name}`, link: `/circles/${circle._id}`, actor: req.user._id });
  if (circle.conversation) {
    const conv = await Conversation.findById(circle.conversation);
    await sendMessage(conv, req.user._id, { kind: 'system', text: `${req.user.name} joined the circle 🎉` }).catch(() => {});
  }
  res.json({ message: 'Joined', membership: { role: existing?.role || 'member', status: 'active' } });
}));

router.post('/:id/decline', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  await CircleMember.deleteOne({ circle: req.params.id, user: req.user._id, status: 'invited' });
  res.json({ message: 'Invitation declined' });
}));

router.post('/:id/leave', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle, member } = await loadCircle(req.params.id, req.user, 'member');
  if (member.role === 'owner') throw httpError(400, 'The owner cannot leave. Delete the circle or transfer ownership first.');
  await CircleMember.deleteOne({ _id: member._id });
  if (circle.conversation) await Conversation.updateOne({ _id: circle.conversation }, { $pull: { participants: req.user._id } });
  await refreshCount(circle._id);
  res.json({ message: 'Left the circle' });
}));

// Invite friends (any active member can invite their friends)
router.post('/:id/invite', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle } = await loadCircle(req.params.id, req.user, 'member');
  const ids = (Array.isArray(req.body.userIds) ? req.body.userIds : [req.body.userId]).filter(Boolean).slice(0, 50);
  const invited = [];
  for (const id of ids) {
    if (!/^[0-9a-f]{24}$/i.test(id) || !(await areFriends(req.user._id, id))) continue;
    const r = await CircleMember.updateOne({ circle: circle._id, user: id }, { $setOnInsert: { status: 'invited', invitedBy: req.user._id } }, { upsert: true });
    if (r.upsertedCount) invited.push(id);
  }
  if (invited.length) await notify(invited, { type: 'circle_invite', title: `${req.user.name} invited you to ${circle.name}`, link: `/circles/${circle._id}`, actor: req.user._id });
  res.json({ invited: invited.length });
}));

router.get('/:id/members', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle, active } = await loadCircle(req.params.id, req.user, 'view');
  const filter = { circle: circle._id };
  if (!active) filter.status = 'active';
  const members = await CircleMember.find(filter).populate('user', PUBLIC_USER_FIELDS).sort({ role: 1, createdAt: 1 }).lean();
  res.json(members.filter(m => m.user).map(m => ({ _id: m._id, role: m.role, status: m.status, joinedAt: m.createdAt, user: { ...m.user, online: isOnline(m.user._id) } })));
}));

router.put('/:id/members/:userId', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle } = await loadCircle(req.params.id, req.user, 'admin');
  if (!['admin', 'member'].includes(req.body.role)) throw httpError(400, 'Role must be admin or member');
  const m = await CircleMember.findOne({ circle: circle._id, user: req.params.userId });
  if (!m || m.role === 'owner') throw httpError(404, 'Member not found');
  m.role = req.body.role;
  await m.save();
  res.json(m);
}));

router.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle } = await loadCircle(req.params.id, req.user, 'admin');
  const m = await CircleMember.findOne({ circle: circle._id, user: req.params.userId });
  if (!m || m.role === 'owner') throw httpError(404, 'Member not found');
  await m.deleteOne();
  if (circle.conversation) await Conversation.updateOne({ _id: circle.conversation }, { $pull: { participants: m.user } });
  await refreshCount(circle._id);
  res.json({ message: 'Member removed' });
}));

// Shared watchlist
router.post('/:id/watchlist/:movieId', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id'); assertId(req.params.movieId, 'movie id');
  const { circle } = await loadCircle(req.params.id, req.user, 'member');
  const movie = await Movie.findById(req.params.movieId).select('_id title');
  if (!movie) throw httpError(404, 'Movie not found');
  if (circle.sharedWatchlist.some(s => sameId(s.movie, movie._id))) throw httpError(400, 'Already on the shared watchlist');
  circle.sharedWatchlist.push({ movie: movie._id, addedBy: req.user._id });
  await circle.save();
  emitToCircle(circle._id, 'circle:watchlist', { circleId: String(circle._id) });
  res.status(201).json({ message: `${movie.title} added to the shared watchlist` });
}));

router.delete('/:id/watchlist/:movieId', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'circle id');
  const { circle } = await loadCircle(req.params.id, req.user, 'member');
  circle.sharedWatchlist = circle.sharedWatchlist.filter(s => !sameId(s.movie, req.params.movieId));
  await circle.save();
  emitToCircle(circle._id, 'circle:watchlist', { circleId: String(circle._id) });
  res.json({ message: 'Removed from the shared watchlist' });
}));

module.exports = router;
