const Poll = require('../models/Poll');
const PollVote = require('../models/PollVote');
const Circle = require('../models/Circle');
const CircleMember = require('../models/CircleMember');
const Conversation = require('../models/Conversation');
const { notify } = require('./notify');
const { sendMessage } = require('./chat');
const { emitToCircle } = require('../realtime/socket');

const POLL_POPULATE = [
  { path: 'options.movie', select: 'title poster releaseYear genre averageRating director' },
  { path: 'creator', select: 'name avatar' },
  { path: 'circle', select: 'name' }
];

/** Shape a poll for one viewer (adds their votes and percentages) */
async function present(poll, userId) {
  const p = poll.toObject ? poll.toObject() : poll;
  const myVotes = userId ? await PollVote.find({ poll: p._id, user: userId }).distinct('option') : [];
  const total = p.totalVotes || 0;
  return {
    ...p,
    options: p.options.map(o => ({ ...o, percent: total ? Math.round((o.votes / total) * 100) : 0 })),
    myVotes: myVotes.map(String),
    expired: !!(p.expiresAt && new Date(p.expiresAt) <= new Date())
  };
}

/** Recount votes from PollVote documents (source of truth) */
async function recount(pollId) {
  const poll = await Poll.findById(pollId);
  const counts = await PollVote.aggregate([{ $match: { poll: poll._id } }, { $group: { _id: '$option', n: { $sum: 1 } } }]);
  const byOption = new Map(counts.map(c => [String(c._id), c.n]));
  for (const o of poll.options) o.votes = byOption.get(String(o._id)) || 0;
  poll.totalVotes = counts.reduce((s, c) => s + c.n, 0);
  poll.voterCount = (await PollVote.distinct('user', { poll: poll._id })).length;
  await poll.save();
  return poll;
}

/** Close a poll, pick the winner (most votes; ties broken by earliest option) and notify members */
async function closePoll(pollId, { reason = 'closed' } = {}) {
  const poll = await recount(pollId);
  if (poll.status === 'closed') return poll;
  poll.status = 'closed';
  poll.closedAt = new Date();
  const best = poll.options.reduce((a, b) => (b.votes > a.votes ? b : a), poll.options[0]);
  poll.winner = best && best.votes > 0 ? best._id : undefined;
  await poll.save();

  const populated = await Poll.findById(poll._id).populate(POLL_POPULATE);
  const winner = populated.options.find(o => poll.winner && String(o._id) === String(poll.winner));
  const winnerName = winner ? (winner.movie?.title || winner.label) : null;

  const members = await CircleMember.find({ circle: poll.circle, status: 'active' }).distinct('user');
  await notify(members, {
    type: 'poll_closed',
    title: `Poll closed: ${poll.question}`,
    body: winnerName ? `Winner: ${winnerName} (${winner.votes} votes)` : 'No votes were cast.',
    link: `/circles/${poll.circle}?tab=polls`
  });

  const circle = await Circle.findById(poll.circle).select('conversation');
  if (circle?.conversation) {
    const conv = await Conversation.findById(circle.conversation);
    if (conv?.participants.length) {
      await sendMessage(conv, poll.creator, {
        kind: winner?.movie ? 'movie' : 'system',
        movieId: winner?.movie?._id,
        text: `🗳️ Poll "${poll.question}" ${reason === 'expired' ? 'expired' : 'closed'}${winnerName ? ` — winner: ${winnerName}` : ' with no votes'}`
      }).catch(() => {});
    }
  }
  emitToCircle(poll.circle, 'poll:update', { pollId: String(poll._id), circleId: String(poll.circle) });
  return populated;
}

module.exports = { present, recount, closePoll, POLL_POPULATE };
