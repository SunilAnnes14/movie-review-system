const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  bio: { type: String, trim: true, maxlength: 300, default: '' },
  avatar: { type: String, trim: true, maxlength: 500, default: '' },
  // CineMatch cold-start onboarding preferences (user_preferences)
  favoriteGenres: { type: [String], default: [] },
  favoriteDirectors: { type: [String], default: [] },
  favoriteActors: { type: [String], default: [] },
  favoriteMovies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }],
  onboarded: { type: Boolean, default: false },
  privacy: {
    profileVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
    libraryVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'friends' },
    allowHistoryForAI: { type: Boolean, default: true },
    allowReviewsForAI: { type: Boolean, default: true },
    spoilerShield: { type: Boolean, default: true }
  },
  lastSeen: { type: Date, default: Date.now }
}, {
  timestamps: true
});

userSchema.index({ name: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
