const express = require('express');
const router = express.Router();
const {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  checkWatchlist,
  updateStatus
} = require('../controllers/watchlistController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getWatchlist);
router.get('/check/:movieId', protect, checkWatchlist);
router.post('/:movieId', protect, addToWatchlist);
router.put('/:movieId', protect, updateStatus);
router.delete('/:movieId', protect, removeFromWatchlist);

module.exports = router;
