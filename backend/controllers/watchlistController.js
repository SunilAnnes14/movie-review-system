const Watchlist = require('../models/Watchlist');
const Movie = require('../models/Movie');
const Post = require('../models/Post');

const STATUSES = ['want_to_watch', 'watching', 'watched'];

// Watch activity appears in friends' CineFeed (unless the library is private)
async function shareWatchUpdate(user, movieId, status) {
  const level = user.privacy?.libraryVisibility || 'friends';
  if (level === 'private' || status === 'want_to_watch') return;
  await Post.create({ author: user._id, kind: 'watch_update', movie: movieId, watchStatus: status, visibility: level === 'public' ? 'public' : 'friends' });
}

// @desc    Get user's watchlist
// @route   GET /api/watchlist
// @access  Private
const getWatchlist = async (req, res, next) => {
  try {
    const filter = { userId: req.user._id };
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const watchlist = await Watchlist.find(filter)
      .populate('movieId')
      .sort({ createdAt: -1 });

    res.json(watchlist);
  } catch (error) {
    next(error);
  }
};

// @desc    Add movie to watchlist
// @route   POST /api/watchlist/:movieId
// @access  Private
const addToWatchlist = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.movieId);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    // Check if already in watchlist
    const existing = await Watchlist.findOne({
      userId: req.user._id,
      movieId: req.params.movieId
    });

    if (existing) {
      return res.status(400).json({ message: 'Movie is already in your watchlist' });
    }

    const status = STATUSES.includes(req.body?.status) ? req.body.status : 'want_to_watch';
    const entry = await Watchlist.create({
      userId: req.user._id,
      movieId: req.params.movieId,
      status,
      watchedAt: status === 'watched' ? new Date() : undefined
    });
    await shareWatchUpdate(req.user, movie._id, status).catch(() => {});

    const populated = await Watchlist.findById(entry._id).populate('movieId');

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};

// @desc    Remove movie from watchlist
// @route   DELETE /api/watchlist/:movieId
// @access  Private
const removeFromWatchlist = async (req, res, next) => {
  try {
    const entry = await Watchlist.findOneAndDelete({
      userId: req.user._id,
      movieId: req.params.movieId
    });

    if (!entry) {
      return res.status(404).json({ message: 'Movie not found in your watchlist' });
    }

    res.json({ message: 'Movie removed from watchlist' });
  } catch (error) {
    next(error);
  }
};

// @desc    Check if movie is in user's watchlist
// @route   GET /api/watchlist/check/:movieId
// @access  Private
const checkWatchlist = async (req, res, next) => {
  try {
    const entry = await Watchlist.findOne({
      userId: req.user._id,
      movieId: req.params.movieId
    });

    res.json({ inWatchlist: !!entry, status: entry?.status || null, favorite: !!entry?.favorite });
  } catch (error) {
    next(error);
  }
};

// @desc    Change vault status (want_to_watch / watching / watched) or favourite flag
// @route   PUT /api/watchlist/:movieId
// @access  Private
const updateStatus = async (req, res, next) => {
  try {
    const { status, favorite } = req.body || {};
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Status must be one of: ' + STATUSES.join(', ') });
    }
    const movie = await Movie.findById(req.params.movieId);
    if (!movie) return res.status(404).json({ message: 'Movie not found' });

    let entry = await Watchlist.findOne({ userId: req.user._id, movieId: movie._id });
    const previous = entry?.status;
    if (!entry) entry = new Watchlist({ userId: req.user._id, movieId: movie._id });
    if (status) entry.status = status;
    if (typeof favorite === 'boolean') entry.favorite = favorite;
    if (status === 'watched' && previous !== 'watched') entry.watchedAt = new Date();
    await entry.save();

    if (status && status !== previous) await shareWatchUpdate(req.user, movie._id, status).catch(() => {});
    res.json(await Watchlist.findById(entry._id).populate('movieId'));
  } catch (error) {
    next(error);
  }
};

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist, checkWatchlist, updateStatus };
