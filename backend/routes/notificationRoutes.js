const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const { asyncHandler, assertId } = require('../utils/http');

const router = express.Router();
router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).populate('actor', 'name avatar').sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 30, 100)).lean(),
    Notification.countDocuments({ user: req.user._id, read: false })
  ]);
  res.json({ items, unread });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ ok: true });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'notification id');
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ ok: true });
}));

module.exports = router;
