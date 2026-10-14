const express = require('express');
const router = express.Router();
const {
  getMovies,
  getMovie,
  createMovie,
  updateMovie,
  deleteMovie,
  getGenres
} = require('../controllers/movieController');
const { getMovieReviews, createReview } = require('../controllers/reviewController');
const { protect, adminOnly } = require('../middleware/auth');

// Genre list (must be before /:id to avoid conflicts)
router.get('/genres/list', getGenres);

// Movie CRUD
router.route('/')
  .get(getMovies)
  .post(protect, adminOnly, createMovie);

router.route('/:id')
  .get(getMovie)
  .put(protect, adminOnly, updateMovie)
  .delete(protect, adminOnly, deleteMovie);

// Movie reviews
router.route('/:id/reviews')
  .get(getMovieReviews)
  .post(protect, createReview);

module.exports = router;
