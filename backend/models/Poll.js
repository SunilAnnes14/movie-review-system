const mongoose = require('mongoose');

// CinePoll. Options are embedded (poll_options); each vote is its own document (PollVote)
// so uniqueness can be enforced by the database.
const pollSchema = new mongoose.Schema({
  circle: { type: mongoose.Schema.Types.ObjectId, ref: 'Circle', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: [true, 'Poll question is required'], trim: true, maxlength: 200 },
  options: [{
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
    label: { type: String, trim: true, maxlength: 200 },
    votes: { type: Number, default: 0 }
  }],
  multipleChoice: { type: Boolean, default: false },
  expiresAt: { type: Date },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  closedAt: { type: Date },
  winner: { type: mongoose.Schema.Types.ObjectId }, // option _id
  totalVotes: { type: Number, default: 0 },
  voterCount: { type: Number, default: 0 },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'MovieEvent' }
}, { timestamps: true });

pollSchema.index({ circle: 1, createdAt: -1 });
pollSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.models.Poll || mongoose.model('Poll', pollSchema);
