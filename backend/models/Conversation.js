const mongoose = require('mongoose');

// A CineChat conversation: a direct 1:1 chat or the group chat of a CineCircle.
const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['direct', 'circle'], required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  circle: { type: mongoose.Schema.Types.ObjectId, ref: 'Circle' },
  // Stable key for direct chats ("<smallerId>:<largerId>") so a pair has one conversation
  directKey: { type: String },
  lastMessageAt: { type: Date, default: Date.now },
  lastMessagePreview: { type: String, default: '' },
  reads: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

conversationSchema.index({ directKey: 1 }, { unique: true, sparse: true });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ circle: 1 });

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
