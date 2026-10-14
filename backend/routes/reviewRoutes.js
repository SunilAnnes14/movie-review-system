const express = require('express');
const router = express.Router();
const {
  updateReview,
  deleteReview,
  getMyReviews,
  getAllReviews
} = require('../controllers/reviewController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/my', protect, getMyReviews);
router.get('/', protect, adminOnly, getAllReviews);

router.route('/:id')
  .put(protect, updateReview)
  .delete(protect, deleteReview);

module.exports = router;
