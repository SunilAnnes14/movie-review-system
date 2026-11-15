const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: [
      'friend_request', 'friend_accepted', 'follow', 'circle_invite', 'circle_join',
      'poll_created', 'poll_closed', 'event_created', 'event_reminder', 'event_update',
      'post_like', 'post_comment', 'message', 'system'
    ],
    required: true
  },
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, maxlength: 500, default: '' },
  link: { type: String, maxlength: 300, default: '' },
  read: { type: Boolean, default: false }
}, { timestamps: true });

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
