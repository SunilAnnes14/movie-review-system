const express = require('express');
const MovieEvent = require('../models/MovieEvent');
const Poll = require('../models/Poll');
const Movie = require('../models/Movie');
const CircleMember = require('../models/CircleMember');
const Circle = require('../models/Circle');
const Conversation = require('../models/Conversation');
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, assertId, cleanString, isHttpUrl } = require('../utils/http');
const { loadCircle, activeCircleIds, sameId } = require('../utils/access');
const { notify } = require('../services/notify');
const { sendMessage } = require('../services/chat');
const { emitToCircle } = require('../realtime/socket');

const router = express.Router();
router.use(protect);

const EVENT_POPULATE = [
  { path: 'movie', select: 'title poster backdrop releaseYear genre director duration averageRating' },
  { path: 'creator', select: 'name avatar' },
  { path: 'circle', select: 'name coverImage' },
  { path: 'attendees.user', select: 'name avatar' },
  { path: 'proposals.proposedBy', select: 'name' },
  { path: 'proposals.available', select: 'name' },
  { path: 'feedback.user', select: 'name' },
  { path: 'poll', select: 'question status' }
];

function present(e, userId) {
  const ev = e.toObject ? e.toObject() : e;
  const counts = { going: 0, maybe: 0, not_going: 0, invited: 0 };
  for (const a of ev.attendees || []) counts[a.rsvp] = (counts[a.rsvp] || 0) + 1;
  const mine = (ev.attendees || []).find(a => a.user && sameId(a.user, userId));
  const ratings = (ev.feedback || []).map(f => f.rating).filter(Boolean);
  return {
    ...ev,
    counts,
    myRsvp: mine?.rsvp || null,
    isPast: new Date(ev.startsAt) < new Date(),
    avgFeedback: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    proposals: (ev.proposals || []).map(p => ({ ...p, availableCount: p.available.length, iAmAvailable: p.available.some(u => sameId(u, userId)) }))
      .sort((a, b) => b.availableCount - a.availableCount)
  };
}

async function loadEvent(id, user, mode = 'member') {
  assertId(id, 'event id');
  const event = await MovieEvent.findById(id);
  if (!event) throw httpError(404, 'Event not found');
  const access = await loadCircle(event.circle, user, mode);
  return { event, ...access };
}

async function postToCircleChat(circleId, senderId, payload) {
  const circle = await Circle.findById(circleId).select('conversation');
  if (!circle?.conversation) return;
  const conv = await Conversation.findById(circle.conversation);
  if (conv?.participants.length) await sendMessage(conv, senderId, payload).catch(() => {});
}

// Upcoming / past events in my circles (or one circle)
router.get('/', asyncHandler(async (req, res) => {
  let circles;
  if (req.query.circle) {
    assertId(req.query.circle, 'circle id');
    await loadCircle(req.query.circle, req.user, 'member');
    circles = [req.query.circle];
  } else {
    circles = await activeCircleIds(req.user._id);
  }
  const filter = { circle: { $in: circles } };
  if (req.query.when === 'upcoming') filter.startsAt = { $gte: new Date(Date.now() - 3 * 3600 * 1000) };
  if (req.query.when === 'past') filter.startsAt = { $lt: new Date() };
  const events = await MovieEvent.find(filter).populate(EVENT_POPULATE).sort({ startsAt: req.query.when === 'past' ? -1 : 1 }).limit(100);
  res.json(events.map(e => present(e, req.user._id)));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { event } = await loadEvent(req.params.id, req.user);
  await event.populate(EVENT_POPULATE);
  res.json(present(event, req.user._id));
}));

router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  let { circleId, movieId } = b;

  // Converting a poll result: the event inherits circle + winning movie and links back to the poll
  let poll = null;
  if (b.pollId) {
    assertId(b.pollId, 'poll id');
    poll = await Poll.findById(b.pollId);
    if (!poll) throw httpError(404, 'Poll not found');
    circleId = poll.circle;
    if (!movieId && poll.winner) movieId = poll.options.id(poll.winner)?.movie;
  }
  assertId(circleId, 'circle id');
  const { circle } = await loadCircle(circleId, req.user, 'member');
  if (!movieId) throw httpError(400, 'Pick a movie for the event');
  assertId(movieId, 'movie id');
  const movie = await Movie.findById(movieId).select('title');
  if (!movie) throw httpError(404, 'Movie not found');

  const startsAt = new Date(b.startsAt);
  if (isNaN(startsAt)) throw httpError(400, 'A valid date and time is required');
  if (startsAt < new Date(Date.now() - 60 * 1000)) throw httpError(400, 'The event must be in the future');
  const bookingUrl = cleanString(b.bookingUrl, 500);
  if (!isHttpUrl(bookingUrl)) throw httpError(400, 'Booking link must be an http(s) URL');

  const members = await CircleMember.find({ circle: circle._id, status: 'active' }).distinct('user');
  let invitees = members;
  if (Array.isArray(b.invite) && b.invite.length) {
    const wanted = new Set(b.invite.map(String));
    invitees = members.filter(m => wanted.has(String(m)) || sameId(m, req.user._id));
  }

  const event = await MovieEvent.create({
    circle: circle._id,
    creator: req.user._id,
    poll: poll?._id,
    movie: movie._id,
    title: cleanString(b.title, 120) || `${movie.title} movie night`,
    description: cleanString(b.description, 2000),
    startsAt,
    venue: cleanString(b.venue, 200),
    address: cleanString(b.address, 300),
    bookingUrl,
    attendees: invitees.map(u => ({ user: u, rsvp: sameId(u, req.user._id) ? 'going' : 'invited', respondedAt: sameId(u, req.user._id) ? new Date() : undefined }))
  });
  if (poll) { poll.event = event._id; await poll.save(); }

  await Post.create({ author: req.user._id, circle: circle._id, kind: 'event', event: event._id, movie: movie._id, text: event.title, visibility: 'circle' });
  await notify(invitees, {
    type: 'event_created',
    title: `${event.title} — ${startsAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
    body: `${req.user.name} planned a movie night in ${circle.name}${event.venue ? ` at ${event.venue}` : ''}. RSVP now!`,
    link: `/events/${event._id}`,
    actor: req.user._id
  });
  await postToCircleChat(circle._id, req.user._id, { kind: 'movie', movieId: movie._id, text: `📅 New movie night: ${event.title}` });
  emitToCircle(circle._id, 'event:update', { eventId: String(event._id), circleId: String(circle._id) });

  await event.populate(EVENT_POPULATE);
  res.status(201).json(present(event, req.user._id));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { event, member } = await loadEvent(req.params.id, req.user);
  if (!sameId(event.creator, req.user._id) && !['owner', 'admin'].includes(member.role)) throw httpError(403, 'Only the organiser can edit this event');
  const b = req.body || {};
  const changes = [];
  if (b.title !== undefined) event.title = cleanString(b.title, 120) || event.title;
  if (b.description !== undefined) event.description = cleanString(b.description, 2000);
  if (b.venue !== undefined && b.venue !== event.venue) { event.venue = cleanString(b.venue, 200); changes.push('venue'); }
  if (b.address !== undefined) event.address = cleanString(b.address, 300);
  if (b.bookingUrl !== undefined) {
    if (!isHttpUrl(b.bookingUrl)) throw httpError(400, 'Booking link must be an http(s) URL');
    event.bookingUrl = cleanString(b.bookingUrl, 500);
  }
  if (b.startsAt) {
    const d = new Date(b.startsAt);
    if (isNaN(d)) throw httpError(400, 'Invalid date');
    if (+d !== +event.startsAt) { event.startsAt = d; event.reminders = { day: false, hour: false }; changes.push('time'); }
  }
  if (['scheduled', 'cancelled', 'completed'].includes(b.status) && b.status !== event.status) { event.status = b.status; changes.push(b.status); }
  await event.save();

  if (changes.length) {
    await notify(event.attendees.map(a => a.user), { type: 'event_update', title: `${event.title} was updated`, body: `Changed: ${changes.join(', ')}`, link: `/events/${event._id}`, actor: req.user._id });
  }
  emitToCircle(event.circle, 'event:update', { eventId: String(event._id), circleId: String(event.circle) });
  await event.populate(EVENT_POPULATE);
  res.json(present(event, req.user._id));
}));

router.post('/:id/rsvp', asyncHandler(async (req, res) => {
  const { event } = await loadEvent(req.params.id, req.user);
  const rsvp = req.body?.rsvp;
  if (!['going', 'maybe', 'not_going'].includes(rsvp)) throw httpError(400, 'RSVP must be going, maybe or not_going');
  const mine = event.attendees.find(a => sameId(a.user, req.user._id));
  if (mine) { mine.rsvp = rsvp; mine.respondedAt = new Date(); }
  else event.attendees.push({ user: req.user._id, rsvp, respondedAt: new Date() });
  await event.save();
  emitToCircle(event.circle, 'event:update', { eventId: String(event._id), circleId: String(event.circle) });
  if (rsvp === 'going' && !sameId(event.creator, req.user._id)) {
    await notify(event.creator, { type: 'event_update', title: `${req.user.name} is going to ${event.title}`, link: `/events/${event._id}`, actor: req.user._id });
  }
  await event.populate(EVENT_POPULATE);
  res.json(present(event, req.user._id));
}));

// Suggest an alternative date
router.post('/:id/proposals', asyncHandler(async (req, res) => {
  const { event } = await loadEvent(req.params.id, req.user);
  const d = new Date(req.body?.startsAt);
  if (isNaN(d) || d < new Date()) throw httpError(400, 'Proposed date must be in the future');
  if (event.proposals.length >= 10) throw httpError(400, 'Too many proposals on this event');
  event.proposals.push({ startsAt: d, proposedBy: req.user._id, available: [req.user._id] });
  await event.save();
  await notify(event.attendees.map(a => a.user), { type: 'event_update', title: `${req.user.name} suggested another date for ${event.title}`, link: `/events/${event._id}`, actor: req.user._id });
  emitToCircle(event.circle, 'event:update', { eventId: String(event._id), circleId: String(event.circle) });
  await event.populate(EVENT_POPULATE);
  res.status(201).json(present(event, req.user._id));
}));

// Toggle my availability for a proposed date
router.post('/:id/proposals/:proposalId/availability', asyncHandler(async (req, res) => {
  const { event } = await loadEvent(req.params.id, req.user);
  const p = event.proposals.id(req.params.proposalId);
  if (!p) throw httpError(404, 'Proposal not found');
  const idx = p.available.findIndex(u => sameId(u, req.user._id));
  if (idx >= 0) p.available.splice(idx, 1); else p.available.push(req.user._id);
  await event.save();
  emitToCircle(event.circle, 'event:update', { eventId: String(event._id), circleId: String(event.circle) });
  await event.populate(EVENT_POPULATE);
  res.json(present(event, req.user._id));
}));

// Organiser adopts a proposed date
router.post('/:id/proposals/:proposalId/adopt', asyncHandler(async (req, res) => {
  const { event, member } = await loadEvent(req.params.id, req.user);
  if (!sameId(event.creator, req.user._id) && !['owner', 'admin'].includes(member.role)) throw httpError(403, 'Only the organiser can change the date');
  const p = event.proposals.id(req.params.proposalId);
  if (!p) throw httpError(404, 'Proposal not found');
  event.startsAt = p.startsAt;
  event.reminders = { day: false, hour: false };
  event.proposals.pull(p._id);
  await event.save();
  await notify(event.attendees.map(a => a.user), { type: 'event_update', title: `${event.title} moved to ${p.startsAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`, link: `/events/${event._id}`, actor: req.user._id });
  emitToCircle(event.circle, 'event:update', { eventId: String(event._id), circleId: String(event.circle) });
  await event.populate(EVENT_POPULATE);
  res.json(present(event, req.user._id));
}));

// Movie-night feedback (after the event) - feeds CinePulse
router.post('/:id/feedback', asyncHandler(async (req, res) => {
  const { event } = await loadEvent(req.params.id, req.user);
  if (event.startsAt > new Date()) throw httpError(400, 'Feedback opens after the movie night starts');
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Rating must be 1-5');
  const comment = cleanString(req.body?.comment, 500);
  const mine = event.feedback.find(f => sameId(f.user, req.user._id));
  if (mine) { mine.rating = rating; mine.comment = comment; mine.at = new Date(); }
  else event.feedback.push({ user: req.user._id, rating, comment });
  if (event.status === 'scheduled') event.status = 'completed';
  await event.save();
  await event.populate(EVENT_POPULATE);
  res.json(present(event, req.user._id));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { event, member } = await loadEvent(req.params.id, req.user);
  if (!sameId(event.creator, req.user._id) && !['owner', 'admin'].includes(member.role)) throw httpError(403, 'Only the organiser can delete this event');
  await Poll.updateOne({ event: event._id }, { $unset: { event: 1 } });
  await Post.deleteMany({ event: event._id });
  await event.deleteOne();
  emitToCircle(event.circle, 'event:update', { eventId: String(event._id), circleId: String(event.circle), deleted: true });
  res.json({ message: 'Event deleted' });
}));

module.exports = router;
