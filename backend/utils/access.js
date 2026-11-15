const Friendship = require('../models/Friendship');
const Follow = require('../models/Follow');
const CircleMember = require('../models/CircleMember');
const Circle = require('../models/Circle');
const { httpError } = require('./http');

const sameId = (a, b) => String(a?._id || a) === String(b?._id || b);

async function friendIds(userId) {
  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }]
  }).select('requester recipient').lean();
  return rows.map(r => (sameId(r.requester, userId) ? r.recipient : r.requester));
}

async function areFriends(a, b) {
  if (!a || !b) return false;
  const row = await Friendship.exists({
    status: 'accepted',
    $or: [{ requester: a, recipient: b }, { requester: b, recipient: a }]
  });
  return !!row;
}

async function followingIds(userId) {
  const rows = await Follow.find({ follower: userId }).select('following').lean();
  return rows.map(r => r.following);
}

/**
 * Can `viewer` see something owned by `owner` that has visibility `level`
 * ('public' | 'friends' | 'private')?
 */
async function canView(viewer, owner, level) {
  if (viewer && sameId(viewer, owner)) return true;
  if (viewer && viewer.role === 'admin') return true;
  if (level === 'public') return true;
  if (level === 'friends') return areFriends(viewer?._id, owner);
  return false;
}

async function activeCircleIds(userId) {
  const rows = await CircleMember.find({ user: userId, status: 'active' }).select('circle').lean();
  return rows.map(r => r.circle);
}

async function membership(circleId, userId) {
  if (!userId) return null;
  return CircleMember.findOne({ circle: circleId, user: userId }).lean();
}

/**
 * Load a circle and enforce access.
 *  - mode 'view'   : public circles are visible to everyone, private ones only to active members (or invitees)
 *  - mode 'member' : caller must be an active member
 *  - mode 'admin'  : caller must be owner/admin
 */
async function loadCircle(circleId, user, mode = 'view') {
  const circle = await Circle.findById(circleId);
  if (!circle) throw httpError(404, 'CineCircle not found');
  const member = await membership(circle._id, user?._id);
  const active = member && member.status === 'active';

  if (mode === 'view') {
    if (circle.visibility === 'private' && !member && user?.role !== 'admin') {
      throw httpError(403, 'This CineCircle is private');
    }
  } else if (mode === 'member') {
    if (!active) throw httpError(403, 'You must be a member of this CineCircle');
  } else if (mode === 'admin') {
    if (!active || !['owner', 'admin'].includes(member.role)) {
      throw httpError(403, 'Only circle admins can do that');
    }
  }
  return { circle, member, active };
}

module.exports = { sameId, friendIds, areFriends, followingIds, canView, activeCircleIds, membership, loadCircle };
