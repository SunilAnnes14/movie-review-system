const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Movie = require('../models/Movie');
const Review = require('../models/Review');
const cinespoiler = require('../ai/cinespoiler');
const { emitToUsers } = require('../realtime/socket');
const { httpError } = require('../utils/http');

const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name avatar' },
  { path: 'movie', select: 'title poster releaseYear genre averageRating director' },
  { path: 'review', select: 'rating comment containsSpoilers spoilerSentences movieId userId', populate: [{ path: 'movieId', select: 'title poster' }, { path: 'userId', select: 'name' }] },
  { path: 'replyTo', select: 'text sender kind isSpoiler', populate: { path: 'sender', select: 'name' } }
];

const directKey = (a, b) => [String(a), String(b)].sort().join(':');

async function getOrCreateDirect(a, b) {
  const key = directKey(a, b);
  let conv = await Conversation.findOne({ directKey: key });
  if (!conv) {
    try {
      conv = await Conversation.create({ type: 'direct', participants: [a, b], directKey: key, reads: [{ user: a }, { user: b }] });
    } catch (e) {
      if (e.code === 11000) conv = await Conversation.findOne({ directKey: key });
      else throw e;
    }
  }
  return conv;
}

/**
 * Persist a message and push it to every participant in real time.
 * Text is screened by CineSpoiler (when tied to a movie or clearly revealing) unless the sender
 * explicitly marked it.
 */
async function sendMessage(conversation, senderId, { text = '', kind = 'text', movieId, reviewId, replyTo, isSpoiler } = {}) {
  const payload = { conversation: conversation._id, sender: senderId, kind, text: String(text || '').trim().slice(0, 4000) };

  if (movieId) {
    const movie = await Movie.findById(movieId).select('_id title cast characters').lean();
    if (!movie) throw httpError(404, 'Movie not found');
    payload.movie = movie._id;
    payload._movie = movie;
  }
  if (reviewId) {
    const review = await Review.findById(reviewId).select('_id').lean();
    if (!review) throw httpError(404, 'Review not found');
    payload.review = review._id;
  }
  if (replyTo) {
    const parent = await Message.findOne({ _id: replyTo, conversation: conversation._id }).select('_id').lean();
    if (parent) payload.replyTo = parent._id;
  }
  if (!payload.text && !payload.movie && !payload.review) throw httpError(400, 'Message cannot be empty');

  if (typeof isSpoiler === 'boolean') {
    payload.isSpoiler = isSpoiler;
    payload.spoilerMarkedBy = isSpoiler ? 'user' : 'none';
  } else if (payload.text && kind !== 'system') {
    const detection = await cinespoiler.detect(payload.text, payload._movie, { log: { user: senderId, source: 'message' } });
    payload.isSpoiler = detection.isSpoiler;
    payload.spoilerMarkedBy = detection.isSpoiler ? 'auto' : 'none';
  }
  delete payload._movie;

  const msg = await Message.create(payload);
  const preview = msg.isSpoiler ? '⚠️ Spoiler' : (msg.text || (msg.movie ? '🎬 Shared a movie' : '⭐ Shared a review')).slice(0, 120);
  await Conversation.updateOne(
    { _id: conversation._id },
    { lastMessageAt: msg.createdAt, lastMessagePreview: preview }
  );
  // The sender has read their own message
  await Conversation.updateOne({ _id: conversation._id, 'reads.user': senderId }, { $set: { 'reads.$.at': msg.createdAt } });

  const full = await Message.findById(msg._id).populate(MESSAGE_POPULATE).lean();
  emitToUsers(conversation.participants.map(String), 'message:new', { conversationId: String(conversation._id), message: full });
  return full;
}

async function unreadCount(conv, userId) {
  const read = (conv.reads || []).find(r => String(r.user) === String(userId));
  return Message.countDocuments({ conversation: conv._id, sender: { $ne: userId }, ...(read ? { createdAt: { $gt: read.at } } : {}) });
}

module.exports = { getOrCreateDirect, sendMessage, unreadCount, MESSAGE_POPULATE };
