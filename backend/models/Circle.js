const mongoose = require('mongoose');

// CineCircle - a movie community / group
const circleSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Circle name is required'], trim: true, minlength: 3, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  coverImage: { type: String, trim: true, maxlength: 500, default: '' },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  memberCount: { type: Number, default: 1 },
  sharedWatchlist: [{
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now }
  }],
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }
}, { timestamps: true });

circleSchema.index({ visibility: 1, memberCount: -1 });
circleSchema.index({ name: 1 });

module.exports = mongoose.models.Circle || mongoose.model('Circle', circleSchema);
