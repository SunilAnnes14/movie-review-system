const express = require('express');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Follow = require('../models/Follow');
const Review = require('../models/Review');
const Watchlist = require('../models/Watchlist');
const Collection = require('../models/Collection');
const CircleMember = require('../models/CircleMember');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, escapeRegex, assertId, PUBLIC_USER_FIELDS } = require('../utils/http');
const { canView, friendIds, sameId } = require('../utils/access');
const { isOnline } = require('../realtime/socket');
const { notify } = require('../services/notify');
const cinematch = require('../ai/cinematch');

const router = express.Router();
router.use(protect);

async function relationship(me, otherId) {
  const [fr, following, followedBy] = await Promise.all([
    Friendship.findOne({ $or: [{ requester: me, recipient: otherId }, { requester: otherId, recipient: me }] }).lean(),
    Follow.exists({ follower: me, following: otherId }),
    Follow.exists({ follower: otherId, following: me })
  ]);
  let friend = 'none';
  if (fr?.status === 'accepted') friend = 'friends';
  else if (fr) friend = sameId(fr.requester, me) ? 'request_sent' : 'request_received';
  return { friend, requestId: fr && fr.status === 'pending' ? fr._id : null, following: !!following, followedBy: !!followedBy };
}

const userCard = (u) => ({ _id: u._id, name: u.name, avatar: u.avatar, bio: u.bio, online: isOnline(u._id), lastSeen: u.lastSeen });

// ---------- People search
router.get('/users/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const users = await User.find({ _id: { $ne: req.user._id }, name: { $regex: escapeRegex(q), $options: 'i' }, 'privacy.profileVisibility': { $ne: 'private' } })
    .select(PUBLIC_USER_FIELDS).limit(20).lean();
  const out = await Promise.all(users.map(async u => ({ ...userCard(u), relationship: await relationship(req.user._id, u._id) })));
  res.json(out);
}));

// ---------- Public profile
router.get('/users/:id', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'user id');
  const user = await User.findById(req.params.id).lean();
  if (!user) throw httpError(404, 'User not found');
  const rel = sameId(user._id, req.user._id) ? { friend: 'self' } : await relationship(req.user._id, user._id);
  const visible = await canView(req.user, user._id, user.privacy?.profileVisibility || 'public');
  if (!visible) return res.json({ ...userCard(user), restricted: true, relationship: rel });

  const [reviewCount, watchedCount, friendsCount, followers, following, circles, libraryVisible] = await Promise.all([
    Review.countDocuments({ userId: user._id }),
    Watchlist.countDocuments({ userId: user._id, status: 'watched' }),
    Friendship.countDocuments({ status: 'accepted', $or: [{ requester: user._id }, { recipient: user._id }] }),
    Follow.countDocuments({ following: user._id }),
    Follow.countDocuments({ follower: user._id }),
    CircleMember.countDocuments({ user: user._id, status: 'active' }),
    canView(req.user, user._id, user.privacy?.libraryVisibility || 'friends')
  ]);
  const tasteMatch = sameId(user._id, req.user._id) ? null : await cinematch.userSimilarity(req.user._id, user._id).catch(() => null);

  res.json({
    ...userCard(user),
    createdAt: user.createdAt,
    favoriteGenres: user.favoriteGenres,
    favoriteDirectors: user.favoriteDirectors,
    stats: { reviewCount, watchedCount, friendsCount, followers, following, circles },
    libraryVisible,
    tasteMatch,
    relationship: rel
  });
}));

router.get('/users/:id/library', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'user id');
  const user = await User.findById(req.params.id).select('privacy').lean();
  if (!user) throw httpError(404, 'User not found');
  if (!(await canView(req.user, user._id, user.privacy?.libraryVisibility || 'friends'))) throw httpError(403, "This user's library is private");
  const filter = { userId: user._id };
  if (['want_to_watch', 'watching', 'watched'].includes(req.query.status)) filter.status = req.query.status;
  res.json(await Watchlist.find(filter).populate('movieId', 'title poster releaseYear genre averageRating').sort({ updatedAt: -1 }).limit(200).lean());
}));

router.get('/users/:id/reviews', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'user id');
  const user = await User.findById(req.params.id).select('privacy').lean();
  if (!user) throw httpError(404, 'User not found');
  if (!(await canView(req.user, user._id, user.privacy?.libraryVisibility || 'friends'))) throw httpError(403, "This user's reviews are private");
  res.json(await Review.find({ userId: user._id }).populate('movieId', 'title poster releaseYear genre').sort({ createdAt: -1 }).limit(100).lean());
}));

router.get('/users/:id/collections', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'user id');
  const owner = req.params.id;
  const levels = ['public'];
  if (sameId(owner, req.user._id)) levels.push('friends', 'private');
  else if (await canView(req.user, owner, 'friends')) levels.push('friends');
  res.json(await Collection.find({ owner, visibility: { $in: levels } }).populate('movies', 'title poster releaseYear').sort({ updatedAt: -1 }).lean());
}));

// ---------- Friends
router.get('/friends', asyncHandler(async (req, res) => {
  const ids = await friendIds(req.user._id);
  const users = await User.find({ _id: { $in: ids } }).select(PUBLIC_USER_FIELDS).lean();
  res.json(users.map(userCard).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)));
}));

router.get('/friends/requests', asyncHandler(async (req, res) => {
  const [incoming, outgoing] = await Promise.all([
    Friendship.find({ recipient: req.user._id, status: 'pending' }).populate('requester', PUBLIC_USER_FIELDS).sort({ createdAt: -1 }).lean(),
    Friendship.find({ requester: req.user._id, status: 'pending' }).populate('recipient', PUBLIC_USER_FIELDS).sort({ createdAt: -1 }).lean()
  ]);
  res.json({
    incoming: incoming.filter(r => r.requester).map(r => ({ _id: r._id, user: userCard(r.requester), createdAt: r.createdAt })),
    outgoing: outgoing.filter(r => r.recipient).map(r => ({ _id: r._id, user: userCard(r.recipient), createdAt: r.createdAt }))
  });
}));

router.post('/friends/:userId', asyncHandler(async (req, res) => {
  const target = assertId(req.params.userId, 'user id');
  if (sameId(target, req.user._id)) throw httpError(400, 'You cannot befriend yourself');
  if (!(await User.exists({ _id: target }))) throw httpError(404, 'User not found');

  const reverse = await Friendship.findOne({ requester: target, recipient: req.user._id });
  if (reverse) {
    if (reverse.status === 'accepted') throw httpError(400, 'You are already friends');
    reverse.status = 'accepted';
    reverse.acceptedAt = new Date();
    await reverse.save();
    await notify(target, { type: 'friend_accepted', title: `${req.user.name} accepted your friend request`, link: `/u/${req.user._id}`, actor: req.user._id });
    return res.json({ status: 'friends', friendship: reverse });
  }
  const existing = await Friendship.findOne({ requester: req.user._id, recipient: target });
  if (existing) throw httpError(400, existing.status === 'accepted' ? 'You are already friends' : 'Friend request already sent');

  const fr = await Friendship.create({ requester: req.user._id, recipient: target });
  await notify(target, { type: 'friend_request', title: `${req.user.name} sent you a friend request`, link: '/people', actor: req.user._id });
  res.status(201).json({ status: 'request_sent', friendship: fr });
}));

router.post('/friends/requests/:id/:action(accept|reject)', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'request id');
  const fr = await Friendship.findOne({ _id: req.params.id, recipient: req.user._id, status: 'pending' });
  if (!fr) throw httpError(404, 'Friend request not found');
  if (req.params.action === 'reject') {
    await fr.deleteOne();
    return res.json({ status: 'rejected' });
  }
  fr.status = 'accepted';
  fr.acceptedAt = new Date();
  await fr.save();
  await notify(fr.requester, { type: 'friend_accepted', title: `${req.user.name} accepted your friend request`, link: `/u/${req.user._id}`, actor: req.user._id });
  res.json({ status: 'friends' });
}));

router.delete('/friends/:userId', asyncHandler(async (req, res) => {
  const other = assertId(req.params.userId, 'user id');
  const result = await Friendship.deleteOne({ $or: [{ requester: req.user._id, recipient: other }, { requester: other, recipient: req.user._id }] });
  if (!result.deletedCount) throw httpError(404, 'No friendship or request found');
  res.json({ status: 'none' });
}));

// ---------- Follows
router.post('/follow/:userId', asyncHandler(async (req, res) => {
  const target = assertId(req.params.userId, 'user id');
  if (sameId(target, req.user._id)) throw httpError(400, 'You cannot follow yourself');
  if (!(await User.exists({ _id: target }))) throw httpError(404, 'User not found');
  const created = await Follow.updateOne({ follower: req.user._id, following: target }, {}, { upsert: true });
  if (created.upsertedCount) await notify(target, { type: 'follow', title: `${req.user.name} started following you`, link: `/u/${req.user._id}`, actor: req.user._id });
  res.json({ following: true });
}));

router.delete('/follow/:userId', asyncHandler(async (req, res) => {
  assertId(req.params.userId, 'user id');
  await Follow.deleteOne({ follower: req.user._id, following: req.params.userId });
  res.json({ following: false });
}));

module.exports = router;
