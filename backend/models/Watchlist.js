const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  movieId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie',
    required: [true, 'Movie ID is required']
  }
}, {
  timestamps: true
});

// One entry per user per movie
watchlistSchema.index({ userId: 1, movieId: 1 }, { unique: true });

module.exports = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema);
