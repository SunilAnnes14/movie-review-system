const User = require('../models/User');
const Review = require('../models/Review');
const Movie = require('../models/Movie');
const Watchlist = require('../models/Watchlist');

// @desc    Get all users (admin)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by ID (admin)
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
};

// @desc    Update user (admin)
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.role = req.body.role || user.role;

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user (admin)
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Don't allow deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    await Review.deleteMany({ userId: user._id });
    await Watchlist.deleteMany({ userId: user._id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats (admin)
// @route   GET /api/users/stats/dashboard
// @access  Private/Admin
const getDashboardStats = async (req, res, next) => {
  try {
    const totalMovies = await Movie.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalReviews = await Review.countDocuments();

    const avgRatingResult = await Review.aggregate([
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);

    const averageRating = avgRatingResult.length > 0
      ? Math.round(avgRatingResult[0].avgRating * 100) / 100
      : 0;

    res.json({
      totalMovies,
      totalUsers,
      totalReviews,
      averageRating
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getUserById, updateUser, deleteUser, getDashboardStats };
