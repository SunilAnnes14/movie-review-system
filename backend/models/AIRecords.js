const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Persistence for the AI services:
 *  - movie_recommendations : cached CineMatch results (personal & group)
 *  - movie_dna_profiles    : CineSense profiles
 *  - ai_review_history     : Review Intelligence requests + whether the user accepted them
 *  - spoiler_detections    : CineSpoiler classification log
 *  - group_analytics       : CinePulse snapshots
 */

const recommendationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  circle: { type: Schema.Types.ObjectId, ref: 'Circle' },
  scope: { type: String, enum: ['personal', 'group'], required: true },
  strategy: { type: String },
  items: { type: Schema.Types.Mixed, default: [] },
  meta: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true, collection: 'movie_recommendations' });
recommendationSchema.index({ user: 1, scope: 1, createdAt: -1 });
recommendationSchema.index({ circle: 1, createdAt: -1 });

const dnaSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  profile: { type: Schema.Types.Mixed, required: true },
  dataPoints: { type: Number, default: 0 },
  generatedWith: { type: String, enum: ['local', 'llm'], default: 'local' }
}, { timestamps: true, collection: 'movie_dna_profiles' });

const aiReviewSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  movie: { type: Schema.Types.ObjectId, ref: 'Movie' },
  action: { type: String, enum: ['analyze', 'rewrite'], required: true },
  style: { type: String },
  input: { type: String, maxlength: 6000 },
  output: { type: Schema.Types.Mixed },
  provider: { type: String, enum: ['local', 'llm'], default: 'local' },
  accepted: { type: Boolean, default: false }
}, { timestamps: true, collection: 'ai_review_history' });
aiReviewSchema.index({ user: 1, createdAt: -1 });

const spoilerSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  source: { type: String, enum: ['review', 'message', 'post', 'comment', 'manual'], required: true },
  sourceId: { type: Schema.Types.ObjectId },
  movie: { type: Schema.Types.ObjectId, ref: 'Movie' },
  isSpoiler: { type: Boolean, required: true },
  score: { type: Number },
  flagged: { type: [Number], default: [] },
  method: { type: String, enum: ['local', 'hybrid'], default: 'local' }
}, { timestamps: true, collection: 'spoiler_detections' });
spoilerSchema.index({ source: 1, sourceId: 1 });

const groupAnalyticsSchema = new Schema({
  circle: { type: Schema.Types.ObjectId, ref: 'Circle', required: true },
  data: { type: Schema.Types.Mixed, required: true }
}, { timestamps: true, collection: 'group_analytics' });
groupAnalyticsSchema.index({ circle: 1, createdAt: -1 });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
  MovieRecommendation: model('MovieRecommendation', recommendationSchema),
  MovieDNA: model('MovieDNA', dnaSchema),
  AIReviewHistory: model('AIReviewHistory', aiReviewSchema),
  SpoilerDetection: model('SpoilerDetection', spoilerSchema),
  GroupAnalytics: model('GroupAnalytics', groupAnalyticsSchema)
};
