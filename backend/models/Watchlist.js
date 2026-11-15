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
  },
  // Personal vault status
  status: {
    type: String,
    enum: ['want_to_watch', 'watching', 'watched'],
    default: 'want_to_watch'
  },
  watchedAt: { type: Date },
  favorite: { type: Boolean, default: false }
}, {
  timestamps: true
});

// One entry per user per movie
watchlistSchema.index({ userId: 1, movieId: 1 }, { unique: true });
watchlistSchema.index({ userId: 1, status: 1 });


module.exports = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema);
