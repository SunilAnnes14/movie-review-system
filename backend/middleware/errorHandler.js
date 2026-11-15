const CLIENT_ERRORS = ['ValidationError', 'CastError', 'JsonWebTokenError', 'TokenExpiredError'];

const errorHandler = (err, req, res, next) => {
  // Expected outcomes (4xx permission/validation errors, 502/503 from an unconfigured or
  // unreachable TMDB / AI provider) get one line; only unexpected 500s get a full stack trace.
  const status = err.statusCode || (CLIENT_ERRORS.includes(err.name) || err.code === 11000 ? 400 : 500);
  if (status === 500) console.error(err.stack);
  else if (process.env.LOG_CLIENT_ERRORS !== 'false') console.warn(`[${status}] ${req.method} ${req.originalUrl} - ${err.message}`);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ message: messages.join(', ') });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ message: `A record with this ${field} already exists` });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token expired' });
  }

  // Default server error
  res.status(err.statusCode || 500).json({
    message: err.message || 'Something went wrong'
  });
};

module.exports = errorHandler;
