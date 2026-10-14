const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getDashboardStats
} = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/stats/dashboard', protect, adminOnly, getDashboardStats);
router.get('/', protect, adminOnly, getUsers);

router.route('/:id')
  .get(protect, adminOnly, getUserById)
  .put(protect, adminOnly, updateUser)
  .delete(protect, adminOnly, deleteUser);

module.exports = router;
