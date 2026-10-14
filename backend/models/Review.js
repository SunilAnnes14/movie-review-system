const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  movieId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie',
    required: [true, 'Movie ID is required']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    trim: true,
    minlength: [5, 'Review must be at least 5 characters'],
    maxlength: [1000, 'Review cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});

// One review per user per movie
reviewSchema.index({ movieId: 1, userId: 1 }, { unique: true });

// Static method to calculate average rating for a movie
reviewSchema.statics.calculateAverageRating = async function(movieId) {
  const Movie = require('./Movie');
  const result = await this.aggregate([
    { $match: { movieId: movieId } },
    {
      $group: {
        _id: '$movieId',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  if (result.length > 0) {
    await Movie.findByIdAndUpdate(movieId, {
      averageRating: Math.round(result[0].averageRating * 100) / 100,
      reviewCount: result[0].reviewCount
    });
  } else {
    await Movie.findByIdAndUpdate(movieId, {
      averageRating: 0,
      reviewCount: 0
    });
  }
};

// Recalculate after save
reviewSchema.post('save', function() {
  this.constructor.calculateAverageRating(this.movieId);
});

// Recalculate after remove
reviewSchema.post('findOneAndDelete', function(doc) {
  if (doc) {
    doc.constructor.calculateAverageRating(doc.movieId);
  }
});

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
