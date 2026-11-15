const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['text', 'movie', 'review', 'recommendation', 'system'], default: 'text' },
  text: { type: String, trim: true, maxlength: 4000, default: '' },
  movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
  review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String, maxlength: 16 }
  }],
  isSpoiler: { type: Boolean, default: false },
  spoilerMarkedBy: { type: String, enum: ['none', 'auto', 'user'], default: 'none' }
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ movie: 1 });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
