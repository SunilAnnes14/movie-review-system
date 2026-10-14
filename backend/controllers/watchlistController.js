const Watchlist = require('../models/Watchlist');
const Movie = require('../models/Movie');

// @desc    Get user's watchlist
// @route   GET /api/watchlist
// @access  Private
const getWatchlist = async (req, res, next) => {
  try {
    const watchlist = await Watchlist.find({ userId: req.user._id })
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

    const entry = await Watchlist.create({
      userId: req.user._id,
      movieId: req.params.movieId
    });

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

    res.json({ inWatchlist: !!entry });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist, checkWatchlist };
