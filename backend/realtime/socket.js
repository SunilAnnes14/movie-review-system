const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const CircleMember = require('../models/CircleMember');
const { friendIds } = require('../utils/access');

/**
 * CineChat / real-time layer.
 *
 * Rooms:
 *   user:<id>   - every socket of a user (notifications, DMs, presence)
 *   conv:<id>   - sockets currently viewing a conversation (typing indicators)
 *   circle:<id> - sockets viewing a circle (live poll results, feed)
 *
 * Every room join is authorised against the database.
 */

let io = null;
const online = new Map(); // userId -> number of open sockets

const isOnline = (userId) => online.has(String(userId));

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  if (!io) return;
  const rooms = [...new Set(userIds.map(id => `user:${id}`))];
  if (rooms.length) io.to(rooms).emit(event, payload);
}

function emitToCircle(circleId, event, payload) {
  if (io) io.to(`circle:${circleId}`).emit(event, payload);
}

async function broadcastPresence(userId, isUserOnline) {
  try {
    const friends = await friendIds(userId);
    emitToUsers(friends.map(String), 'presence', { userId: String(userId), online: isUserOnline, lastSeen: new Date() });
  } catch (e) {
    // presence is best-effort
  }
}

function init(httpServer, corsOrigins) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true }
  });

  // JWT handshake authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('name role');
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (e) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const uid = String(socket.user._id);
    socket.join(`user:${uid}`);

    const count = (online.get(uid) || 0) + 1;
    online.set(uid, count);
    if (count === 1) broadcastPresence(uid, true);

    socket.on('conversation:join', async (conversationId, ack) => {
      try {
        const conv = await Conversation.findOne({ _id: conversationId, participants: uid }).select('_id');
        if (!conv) return ack?.({ ok: false, error: 'Not a participant' });
        socket.join(`conv:${conversationId}`);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: 'Invalid conversation' });
      }
    });

    socket.on('conversation:leave', (conversationId) => socket.leave(`conv:${conversationId}`));

    socket.on('typing', ({ conversationId, typing } = {}) => {
      if (!conversationId || !socket.rooms.has(`conv:${conversationId}`)) return;
      socket.to(`conv:${conversationId}`).emit('typing', {
        conversationId, userId: uid, name: socket.user.name, typing: !!typing
      });
    });

    socket.on('circle:join', async (circleId, ack) => {
      try {
        const member = await CircleMember.findOne({ circle: circleId, user: uid, status: 'active' }).select('_id');
        if (!member) return ack?.({ ok: false, error: 'Not a member' });
        socket.join(`circle:${circleId}`);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: 'Invalid circle' });
      }
    });

    socket.on('circle:leave', (circleId) => socket.leave(`circle:${circleId}`));

    socket.on('disconnect', async () => {
      const left = (online.get(uid) || 1) - 1;
      if (left <= 0) {
        online.delete(uid);
        await User.updateOne({ _id: uid }, { lastSeen: new Date() }).catch(() => {});
        broadcastPresence(uid, false);
      } else {
        online.set(uid, left);
      }
    });
  });

  return io;
}

module.exports = { init, isOnline, emitToUser, emitToUsers, emitToCircle, getIO: () => io };
