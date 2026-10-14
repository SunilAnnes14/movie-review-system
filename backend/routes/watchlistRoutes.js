const express = require('express');
const router = express.Router();
const {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  checkWatchlist
} = require('../controllers/watchlistController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getWatchlist);
router.get('/check/:movieId', protect, checkWatchlist);
router.post('/:movieId', protect, addToWatchlist);
router.delete('/:movieId', protect, removeFromWatchlist);

module.exports = router;
