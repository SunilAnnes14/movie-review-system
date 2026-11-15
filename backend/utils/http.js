const mongoose = require('mongoose');

// Wrap async route handlers so rejected promises reach the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// An Error that carries an HTTP status for errorHandler
const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Escape user input before using it inside a RegExp (prevents ReDoS / regex injection)
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);

const isId = (value) => mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === String(value);

const assertId = (value, label = 'ID') => {
  if (!isId(value)) throw httpError(400, `Invalid ${label}`);
  return value;
};

const cleanString = (value, max = 1000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const isHttpUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
};

// Public user fields that are safe to send to other users
const PUBLIC_USER_FIELDS = 'name avatar bio lastSeen createdAt';

module.exports = { asyncHandler, httpError, escapeRegex, isId, assertId, cleanString, isHttpUrl, PUBLIC_USER_FIELDS };
