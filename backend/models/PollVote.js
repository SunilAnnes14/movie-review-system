const mongoose = require('mongoose');

const pollVoteSchema = new mongoose.Schema({
  poll: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  option: { type: mongoose.Schema.Types.ObjectId, required: true }
}, { timestamps: true });

// A user can never vote for the same option twice
pollVoteSchema.index({ poll: 1, user: 1, option: 1 }, { unique: true });
pollVoteSchema.index({ poll: 1, option: 1 });

module.exports = mongoose.models.PollVote || mongoose.model('PollVote', pollVoteSchema);
