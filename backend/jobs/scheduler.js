const Poll = require('../models/Poll');
const MovieEvent = require('../models/MovieEvent');
const { closePoll } = require('../services/polls');
const { notify } = require('../services/notify');

/**
 * Background jobs (every 30s):
 *  - close expired polls, pick the winner, notify the circle
 *  - send event reminders 24h and 1h before a movie night to attendees who are going / maybe
 */

const INTERVAL = Number(process.env.SCHEDULER_INTERVAL_MS) || 30_000;
let timer = null;
let running = false;

async function closeExpiredPolls() {
  const expired = await Poll.find({ status: 'open', expiresAt: { $lte: new Date() } }).select('_id').limit(50);
  for (const p of expired) await closePoll(p._id, { reason: 'expired' }).catch(e => console.error('poll close failed', e.message));
}

async function sendReminders() {
  const now = Date.now();
  const windows = [
    { flag: 'day', ms: 24 * 3600 * 1000, label: 'tomorrow' },
    { flag: 'hour', ms: 3600 * 1000, label: 'in about an hour' }
  ];
  for (const w of windows) {
    const events = await MovieEvent.find({
      status: 'scheduled',
      startsAt: { $gt: new Date(now), $lte: new Date(now + w.ms) },
      [`reminders.${w.flag}`]: false
    }).populate('movie', 'title').limit(50);
    for (const e of events) {
      const recipients = e.attendees.filter(a => ['going', 'maybe', 'invited'].includes(a.rsvp)).map(a => a.user);
      await notify(recipients, {
        type: 'event_reminder',
        title: `⏰ ${e.title} starts ${w.label}`,
        body: `${e.movie?.title || 'Movie night'}${e.venue ? ` at ${e.venue}` : ''}`,
        link: `/events/${e._id}`
      });
      e.reminders[w.flag] = true;
      if (w.flag === 'hour') e.reminders.day = true;
      await e.save();
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await closeExpiredPolls();
    await sendReminders();
  } catch (e) {
    console.error('[scheduler]', e.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, INTERVAL);
  timer.unref?.();
  tick();
}

module.exports = { start, tick };
