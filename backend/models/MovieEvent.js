const mongoose = require('mongoose');

// CinePlan movie night. Attendees (event_attendees) are embedded because they are
// always read and written together with the event.
const movieEventSchema = new mongoose.Schema({
  circle: { type: mongoose.Schema.Types.ObjectId, ref: 'Circle', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  poll: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll' },
  movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: [true, 'Pick a movie'] },
  title: { type: String, required: [true, 'Event title is required'], trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  startsAt: { type: Date, required: [true, 'Event date and time is required'] },
  venue: { type: String, trim: true, maxlength: 200, default: '' },
  address: { type: String, trim: true, maxlength: 300, default: '' },
  bookingUrl: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['scheduled', 'cancelled', 'completed'], default: 'scheduled' },
  attendees: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rsvp: { type: String, enum: ['going', 'maybe', 'not_going', 'invited'], default: 'invited' },
    respondedAt: { type: Date }
  }],
  // Alternative date proposals with availability votes
  proposals: [{
    startsAt: { type: Date, required: true },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    available: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  // Post-movie-night feedback, used by CinePulse
  feedback: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, maxlength: 500 },
    at: { type: Date, default: Date.now }
  }],
  reminders: {
    day: { type: Boolean, default: false },
    hour: { type: Boolean, default: false }
  }
}, { timestamps: true });

movieEventSchema.index({ circle: 1, startsAt: 1 });
movieEventSchema.index({ 'attendees.user': 1, startsAt: 1 });
movieEventSchema.index({ status: 1, startsAt: 1 });

module.exports = mongoose.models.MovieEvent || mongoose.model('MovieEvent', movieEventSchema);
