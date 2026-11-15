const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile, updatePreferences } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/preferences', protect, updatePreferences);

module.exports = router;

