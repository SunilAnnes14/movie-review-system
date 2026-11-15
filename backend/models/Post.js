const mongoose = require('mongoose');

// CineFeed social post. Likes are stored on the post (likes collection embedded)
// so like/unlike is a single atomic update.
const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  circle: { type: mongoose.Schema.Types.ObjectId, ref: 'Circle' },
  kind: {
    type: String,
    enum: ['text', 'review', 'recommendation', 'watch_update', 'collection', 'poll', 'event'],
    default: 'text'
  },
  text: { type: String, trim: true, maxlength: 3000, default: '' },
  movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
  review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
  collectionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },
  poll: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll' },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'MovieEvent' },
  watchStatus: { type: String },
  visibility: { type: String, enum: ['public', 'friends', 'circle'], default: 'public' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  isSpoiler: { type: Boolean, default: false },
  spoilerMarkedBy: { type: String, enum: ['none', 'auto', 'user'], default: 'none' }
}, { timestamps: true });

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ circle: 1, createdAt: -1 });
postSchema.index({ visibility: 1, createdAt: -1 });
postSchema.index({ movie: 1 });

module.exports = mongoose.models.Post || mongoose.model('Post', postSchema);
