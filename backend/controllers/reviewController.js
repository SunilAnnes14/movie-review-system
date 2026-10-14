const Review = require('../models/Review');
const Movie = require('../models/Movie');

// @desc    Get reviews for a movie
// @route   GET /api/movies/:id/reviews
// @access  Public
const getMovieReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ movieId: req.params.id })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    next(error);
  }
};

// @desc    Create a review
// @route   POST /api/movies/:id/reviews
// @access  Private
const createReview = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    // Check if user already reviewed this movie
    const existingReview = await Review.findOne({
      movieId: req.params.id,
      userId: req.user._id
    });

    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this movie' });
    }

    const review = await Review.create({
      movieId: req.params.id,
      userId: req.user._id,
      rating: req.body.rating,
      comment: req.body.comment
    });

    const populatedReview = await Review.findById(review._id)
      .populate('userId', 'name email');

    res.status(201).json(populatedReview);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a review
// @route   PUT /api/reviews/:id
// @access  Private
const updateReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check ownership
    if (review.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own reviews' });
    }

    review.rating = req.body.rating || review.rating;
    review.comment = req.body.comment || review.comment;

    const updatedReview = await review.save();
    const populatedReview = await Review.findById(updatedReview._id)
      .populate('userId', 'name email');

    // Recalculate movie average
    await Review.calculateAverageRating(review.movieId);

    res.json(populatedReview);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a review
// @route   DELETE /api/reviews/:id
// @access  Private (owner or admin)
const deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check ownership or admin
    if (review.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this review' });
    }

    const movieId = review.movieId;
    await Review.findByIdAndDelete(req.params.id);

    // Recalculate movie average
    await Review.calculateAverageRating(movieId);

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reviews by current user
// @route   GET /api/reviews/my
// @access  Private
const getMyReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ userId: req.user._id })
      .populate('movieId', 'title poster releaseYear genre')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reviews (admin)
// @route   GET /api/reviews
// @access  Private/Admin
const getAllReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find()
      .populate('userId', 'name email')
      .populate('movieId', 'title poster')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMovieReviews,
  createReview,
  updateReview,
  deleteReview,
  getMyReviews,
  getAllReviews
};
