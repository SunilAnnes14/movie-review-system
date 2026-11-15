const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, assertId } = require('../utils/http');
const { areFriends, sameId } = require('../utils/access');
const { getOrCreateDirect, sendMessage, unreadCount, MESSAGE_POPULATE } = require('../services/chat');
const { isOnline, emitToUsers } = require('../realtime/socket');

const router = express.Router();
router.use(protect);

async function loadConversation(id, userId) {
  assertId(id, 'conversation id');
  const conv = await Conversation.findOne({ _id: id, participants: userId });
  if (!conv) throw httpError(404, 'Conversation not found');
  return conv;
}

// List my conversations with unread counts
router.get('/conversations', asyncHandler(async (req, res) => {
  const convs = await Conversation.find({ participants: req.user._id })
    .populate('participants', 'name avatar lastSeen')
    .populate('circle', 'name coverImage')
    .sort({ lastMessageAt: -1 }).limit(100).lean();
  const out = await Promise.all(convs.map(async c => {
    const others = c.participants.filter(p => !sameId(p, req.user._id));
    return {
      _id: c._id,
      type: c.type,
      title: c.type === 'circle' ? c.circle?.name : others[0]?.name || 'Conversation',
      image: c.type === 'circle' ? c.circle?.coverImage : others[0]?.avatar,
      circle: c.circle?._id,
      participants: c.participants.map(p => ({ _id: p._id, name: p.name, avatar: p.avatar, online: isOnline(p._id), lastSeen: p.lastSeen })),
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      unread: await unreadCount(c, req.user._id)
    };
  }));
  res.json(out);
}));

router.get('/unread', asyncHandler(async (req, res) => {
  const convs = await Conversation.find({ participants: req.user._id }).select('reads').lean();
  const counts = await Promise.all(convs.map(c => unreadCount(c, req.user._id)));
  res.json({ unread: counts.reduce((a, b) => a + b, 0) });
}));

// Start (or reopen) a direct chat. Only friends can start a DM, which keeps messaging private.
router.post('/direct/:userId', asyncHandler(async (req, res) => {
  const other = assertId(req.params.userId, 'user id');
  if (sameId(other, req.user._id)) throw httpError(400, 'You cannot message yourself');
  if (!(await User.exists({ _id: other }))) throw httpError(404, 'User not found');
  if (!(await areFriends(req.user._id, other))) throw httpError(403, 'You can only message friends');
  const conv = await getOrCreateDirect(req.user._id, other);
  res.json({ _id: conv._id });
}));

// Paginated history (newest first in DB, returned oldest -> newest)
router.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const conv = await loadConversation(req.params.id, req.user._id);
  const filter = { conversation: conv._id };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).populate(MESSAGE_POPULATE).lean();
  res.json({ messages: messages.reverse(), hasMore: messages.length === limit });
}));

router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const conv = await loadConversation(req.params.id, req.user._id);
  const { text, kind, movieId, reviewId, replyTo, isSpoiler } = req.body || {};
  const allowedKinds = ['text', 'movie', 'review', 'recommendation'];
  const msg = await sendMessage(conv, req.user._id, {
    text, kind: allowedKinds.includes(kind) ? kind : 'text', movieId, reviewId, replyTo,
    isSpoiler: typeof isSpoiler === 'boolean' ? isSpoiler : undefined
  });
  res.status(201).json(msg);
}));

// Toggle an emoji reaction
router.post('/messages/:id/react', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'message id');
  const emoji = String(req.body?.emoji || '').slice(0, 16);
  if (!emoji) throw httpError(400, 'Emoji is required');
  const msg = await Message.findById(req.params.id);
  if (!msg) throw httpError(404, 'Message not found');
  const conv = await loadConversation(msg.conversation, req.user._id);

  const idx = msg.reactions.findIndex(r => sameId(r.user, req.user._id) && r.emoji === emoji);
  if (idx >= 0) msg.reactions.splice(idx, 1);
  else msg.reactions.push({ user: req.user._id, emoji });
  await msg.save();

  const payload = { conversationId: String(conv._id), messageId: String(msg._id), reactions: msg.reactions };
  emitToUsers(conv.participants.map(String), 'message:reaction', payload);
  res.json(payload);
}));

router.post('/conversations/:id/read', asyncHandler(async (req, res) => {
  const conv = await loadConversation(req.params.id, req.user._id);
  const now = new Date();
  const updated = await Conversation.updateOne({ _id: conv._id, 'reads.user': req.user._id }, { $set: { 'reads.$.at': now } });
  if (!updated.matchedCount) await Conversation.updateOne({ _id: conv._id }, { $push: { reads: { user: req.user._id, at: now } } });
  emitToUsers([String(req.user._id)], 'conversation:read', { conversationId: String(conv._id) });
  res.json({ ok: true });
}));

module.exports = router;
