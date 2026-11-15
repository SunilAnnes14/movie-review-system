const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Review = require('../models/Review');
const Watchlist = require('../models/Watchlist');
const Movie = require('../models/Movie');
const { isHttpUrl } = require('../utils/http');

const VISIBILITY = ['public', 'friends', 'private'];
const cleanList = (value, max = 20) => (Array.isArray(value) ? value : [])
  .filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean).slice(0, max);

const publicProfile = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  bio: user.bio,
  avatar: user.avatar,
  onboarded: user.onboarded,
  favoriteGenres: user.favoriteGenres,
  favoriteDirectors: user.favoriteDirectors,
  favoriteActors: user.favoriteActors,
  favoriteMovies: user.favoriteMovies,
  privacy: user.privacy
});

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    // Create user
    const user = await User.create({ name, email, password });

    res.status(201).json({
      ...publicProfile(user),
      token: generateToken(user._id)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      ...publicProfile(user),
      token: generateToken(user._id)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const reviewCount = await Review.countDocuments({ userId: req.user._id });
    const watchlistCount = await Watchlist.countDocuments({ userId: req.user._id });

    res.json({
      ...publicProfile(user),
      reviewCount,
      watchlistCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      ...publicProfile(updatedUser),
      token: generateToken(updatedUser._id)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update taste preferences (onboarding), bio/avatar and privacy controls
// @route   PUT /api/auth/preferences
// @access  Private
const updatePreferences = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const b = req.body || {};

    if (b.favoriteGenres !== undefined) user.favoriteGenres = cleanList(b.favoriteGenres, 12);
    if (b.favoriteDirectors !== undefined) user.favoriteDirectors = cleanList(b.favoriteDirectors, 12);
    if (b.favoriteActors !== undefined) user.favoriteActors = cleanList(b.favoriteActors, 12);
    if (b.favoriteMovies !== undefined) {
      const ids = (Array.isArray(b.favoriteMovies) ? b.favoriteMovies : []).slice(0, 20);
      user.favoriteMovies = await Movie.find({ _id: { $in: ids.filter(id => /^[0-9a-f]{24}$/i.test(id)) } }).distinct('_id');
    }
    if (typeof b.bio === 'string') user.bio = b.bio.slice(0, 300);
    if (typeof b.avatar === 'string') {
      if (!isHttpUrl(b.avatar)) return res.status(400).json({ message: 'Avatar must be an http(s) URL' });
      user.avatar = b.avatar;
    }
    if (b.privacy && typeof b.privacy === 'object') {
      const p = b.privacy;
      if (VISIBILITY.includes(p.profileVisibility)) user.privacy.profileVisibility = p.profileVisibility;
      if (VISIBILITY.includes(p.libraryVisibility)) user.privacy.libraryVisibility = p.libraryVisibility;
      for (const flag of ['allowHistoryForAI', 'allowReviewsForAI', 'spoilerShield']) {
        if (typeof p[flag] === 'boolean') user.privacy[flag] = p[flag];
      }
    }
    if (b.onboarded === true) user.onboarded = true;

    await user.save();
    res.json(publicProfile(user));
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, getProfile, updateProfile, updatePreferences };
