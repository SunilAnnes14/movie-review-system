const express = require('express');
const Movie = require('../models/Movie');
const tmdb = require('../services/tmdb');
const { asyncHandler, httpError } = require('../utils/http');

const router = express.Router();

router.get('/status', (req, res) => res.json({ configured: tmdb.isConfigured() }));

// Each TMDB result is annotated with the local catalog _id when it has been imported already
async function annotate(items) {
  const local = await Movie.find({ tmdbId: { $in: items.map(i => i.tmdbId) } }).select('_id tmdbId').lean();
  const map = new Map(local.map(m => [m.tmdbId, m._id]));
  return items.map(i => ({ ...i, _id: map.get(i.tmdbId) || null }));
}

router.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) throw httpError(400, 'Search query is too short');
  const data = await tmdb.search(q, Math.max(1, Math.min(Number(req.query.page) || 1, 20)));
  res.json({ ...data, results: await annotate(data.results) });
}));

router.get('/trending', asyncHandler(async (req, res) => {
  res.json(await annotate(await tmdb.trending(req.query.window)));
}));

router.get('/genre/:genre', asyncHandler(async (req, res) => {
  res.json(await annotate(await tmdb.discoverByGenre(req.params.genre)));
}));

router.get('/movie/:tmdbId', asyncHandler(async (req, res) => {
  const id = Number(req.params.tmdbId);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid TMDB id');
  const [d] = await annotate([await tmdb.details(id)]);
  res.json(d);
}));

module.exports = router;
