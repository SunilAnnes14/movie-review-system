const mongoose = require('mongoose');

const circleMemberSchema = new mongoose.Schema({
  circle: { type: mongoose.Schema.Types.ObjectId, ref: 'Circle', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  // 'invited' members can see the invite but not private content until they accept
  status: { type: String, enum: ['active', 'invited'], default: 'active' },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

circleMemberSchema.index({ circle: 1, user: 1 }, { unique: true });
circleMemberSchema.index({ user: 1, status: 1 });

module.exports = mongoose.models.CircleMember || mongoose.model('CircleMember', circleMemberSchema);
