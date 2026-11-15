const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../utils/http');

/**
 * Secure image uploads (avatars, circle covers).
 *  - authenticated, single file, 2 MB limit, memory storage (nothing touches disk until validated)
 *  - type is verified from the file's magic bytes, not the client-supplied name or MIME type
 *  - stored under a random name with a server-chosen extension (no path traversal, no overwrite)
 *  - served from /uploads with nosniff so a file can never be executed as HTML/script
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 0 }
});

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.toString('ascii', 0, 6))) return 'gif';
  return null;
}

const router = express.Router();

router.post('/image', protect, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 2 MB or smaller' : 'Upload failed';
      return next(httpError(400, message));
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'Choose an image to upload (field name "image")');
  const ext = sniff(req.file.buffer);
  if (!ext) throw httpError(400, 'Only JPEG, PNG, WebP or GIF images are allowed');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), req.file.buffer, { flag: 'wx' });
  const base = `${req.protocol}://${req.get('host')}`;
  res.status(201).json({ url: `${base}/uploads/${name}`, size: req.file.size, type: ext });
}));

// Static serving with defensive headers
const serve = express.static(UPLOAD_DIR, {
  index: false,
  dotfiles: 'deny',
  maxAge: '7d',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
});

module.exports = { router, serve, UPLOAD_DIR };
