const mongoose = require('mongoose');

// User-curated movie collections ("Best Nolan films", "Rainy Sunday picks"...)
const collectionSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: [true, 'Collection name is required'], trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  movies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }],
  visibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' }
}, { timestamps: true });

collectionSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.models.Collection || mongoose.model('Collection', collectionSchema);
