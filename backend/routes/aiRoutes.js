const express = require('express');
const Movie = require('../models/Movie');
const { AIReviewHistory } = require('../models/AIRecords');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, assertId } = require('../utils/http');
const { loadCircle } = require('../utils/access');
const llm = require('../ai/llm');
const cinematch = require('../ai/cinematch');
const cinesense = require('../ai/cinesense');
const reviewIntel = require('../ai/reviewIntel');
const cinespoiler = require('../ai/cinespoiler');
const cinebot = require('../ai/cinebot');
const cinepulse = require('../ai/cinepulse');

const router = express.Router();
router.use(protect);

const loadMovie = async (id) => {
  if (!id) return null;
  assertId(id, 'movie id');
  return Movie.findById(id).lean();
};

router.get('/status', (req, res) => {
  res.json({
    llm: llm.available(),
    model: llm.available() ? llm.MODEL : null,
    services: {
      cinematch: 'local hybrid recommender',
      cinesense: llm.available() ? 'local statistics + LLM narrative' : 'local statistics',
      reviewIntelligence: llm.available() ? 'local analysis + LLM rewrites' : 'local analysis (rewrites need LLM)',
      cinespoiler: llm.available() ? 'hybrid classifier' : 'local classifier',
      cinebot: llm.available() ? 'LLM with retrieval tools' : 'local retrieval assistant',
      cinepulse: 'statistical model'
    }
  });
});

// ---------- CineMatch
router.get('/cinematch', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 30);
  if (req.query.seed) assertId(req.query.seed, 'movie id');
  res.json(await cinematch.recommendForUser(req.user._id, { limit, genre: req.query.genre, seedMovieId: req.query.seed }));
}));

router.get('/cinematch/circle/:circleId', asyncHandler(async (req, res) => {
  assertId(req.params.circleId, 'circle id');
  await loadCircle(req.params.circleId, req.user, 'member');
  const memberIds = req.query.members ? String(req.query.members).split(',').filter(Boolean) : undefined;
  res.json(await cinematch.recommendForCircle(req.params.circleId, { limit: Math.min(Number(req.query.limit) || 10, 25), memberIds }));
}));

// ---------- CineSense
router.get('/cinesense', asyncHandler(async (req, res) => {
  const existing = await cinesense.get(req.user._id);
  res.json(existing || await cinesense.generate(req.user._id));
}));

router.post('/cinesense/regenerate', asyncHandler(async (req, res) => {
  res.json(await cinesense.generate(req.user._id));
}));

// ---------- Review Intelligence (suggestions only - nothing is published from here)
router.post('/review/analyze', asyncHandler(async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (text.length < 5) throw httpError(400, 'Write at least a sentence to analyse');
  if (text.length > 5000) throw httpError(400, 'Review is too long (5000 characters max)');
  const movie = await loadMovie(req.body.movieId);
  const result = await reviewIntel.analyze(text, { movie, rating: Number(req.body.rating) || undefined });
  const record = await AIReviewHistory.create({ user: req.user._id, movie: movie?._id, action: 'analyze', input: text, output: { sentiment: result.sentiment, spoilers: result.spoilers.flagged, fixes: result.grammar.fixes.length }, provider: 'local' });
  res.json({ ...result, historyId: record._id });
}));

router.post('/review/rewrite', asyncHandler(async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (text.length < 5 || text.length > 5000) throw httpError(400, 'Review must be between 5 and 5000 characters');
  const movie = await loadMovie(req.body.movieId);
  const result = await reviewIntel.rewrite(text, req.body.style, { movie, rating: Number(req.body.rating) || undefined });
  const record = await AIReviewHistory.create({ user: req.user._id, movie: movie?._id, action: 'rewrite', style: req.body.style, input: text, output: result, provider: 'llm' });
  res.json({ ...result, historyId: record._id });
}));

// The client calls this only when the user explicitly applies a suggestion
router.post('/review/history/:id/accept', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'history id');
  await AIReviewHistory.updateOne({ _id: req.params.id, user: req.user._id }, { accepted: true });
  res.json({ ok: true });
}));

router.get('/review/history', asyncHandler(async (req, res) => {
  res.json(await AIReviewHistory.find({ user: req.user._id }).populate('movie', 'title').sort({ createdAt: -1 }).limit(30).lean());
}));

// ---------- CineSpoiler
router.post('/spoiler/detect', asyncHandler(async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) throw httpError(400, 'Text is required');
  if (text.length > 5000) throw httpError(400, 'Text is too long');
  const movie = await loadMovie(req.body.movieId);
  res.json(await cinespoiler.detect(text, movie, { log: { user: req.user._id, source: 'manual' } }));
}));

// ---------- CineBot
router.post('/bot/chat', asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) throw httpError(400, 'Ask CineBot something');
  if (message.length > 1000) throw httpError(400, 'Message is too long');
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];
  res.json(await cinebot.chat(req.user._id, { message, history, spoilerFree: req.body.spoilerFree !== false }));
}));

// ---------- CinePulse
router.get('/pulse/:circleId', asyncHandler(async (req, res) => {
  assertId(req.params.circleId, 'circle id');
  await loadCircle(req.params.circleId, req.user, 'member');
  res.json(await cinepulse.analyze(req.params.circleId));
}));

module.exports = router;
