const Notification = require('../models/Notification');
const { emitToUser } = require('../realtime/socket');

/**
 * Persist a notification for each recipient and push it in real time.
 * Never notifies the actor about their own action.
 */
async function notify(userIds, { type, title, body = '', link = '', actor } = {}) {
  const recipients = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(String))]
    .filter(id => !actor || id !== String(actor));
  if (!recipients.length) return [];

  const docs = await Notification.insertMany(
    recipients.map(user => ({ user, type, title, body: body.slice(0, 500), link, actor }))
  );
  for (const doc of docs) emitToUser(doc.user, 'notification', doc.toObject());
  return docs;
}

module.exports = { notify };
