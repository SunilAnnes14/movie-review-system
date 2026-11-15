const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  genre: {
    type: [String],
    required: [true, 'At least one genre is required'],
    validate: {
      validator: function(v) { return v && v.length > 0; },
      message: 'At least one genre is required'
    }
  },
  releaseYear: {
    type: Number,
    required: [true, 'Release year is required'],
    min: [1888, 'Release year must be after 1888'],
    max: [2030, 'Release year cannot be in the far future']
  },
  director: {
    type: String,
    required: [true, 'Director is required'],
    trim: true
  },
  cast: {
    type: [String],
    default: []
  },
  poster: {
    type: String,
    default: ''
  },
  backdrop: {
    type: String,
    default: ''
  },
  trailer: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    default: 120
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  // Original language (ISO 639-1, e.g. en, ta, ja). Not named 'language': MongoDB text indexes
  // reserve that field name for the text-search language.
  originalLanguage: { type: String, lowercase: true, trim: true, default: 'en' },
  // TMDB integration
  tmdbId: { type: Number },
  keywords: { type: [String], default: [] },
  characters: { type: [String], default: [] },
  tmdbRating: { type: Number, default: 0 },
  popularity: { type: Number, default: 0 },
  releaseDate: { type: String, default: '' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

movieSchema.index({ tmdbId: 1 }, { unique: true, sparse: true });
movieSchema.index({ genre: 1 });
movieSchema.index({ originalLanguage: 1 });

// Text index for search
movieSchema.index({ title: 'text', description: 'text', director: 'text' });

module.exports = mongoose.models.Movie || mongoose.model('Movie', movieSchema);
