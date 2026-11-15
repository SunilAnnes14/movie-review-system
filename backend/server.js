const http = require('http');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { disconnectDB, registerShutdownHooks } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const realtime = require('./realtime/socket');
const scheduler = require('./jobs/scheduler');

// Load env vars
dotenv.config();

const app = express();

// Middleware
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:4200';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || CLIENT_URL)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin / server-to-server requests (no Origin header)
    if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true
}));
app.use(helmet());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// Rate limiting for sensitive endpoints
const limiter = (windowMs, limit, message) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message }
});
const authLimiter = limiter(15 * 60 * 1000, Number(process.env.AUTH_RATE_LIMIT) || 60, 'Too many authentication attempts, please try again later');
const aiLimiter = limiter(60 * 1000, Number(process.env.AI_RATE_LIMIT) || 40, 'Too many AI requests, please slow down');
const writeLimiter = limiter(60 * 1000, Number(process.env.WRITE_RATE_LIMIT) || 240, 'Too many requests, please slow down');

// Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/movies', require('./routes/movieRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/watchlist', require('./routes/watchlistRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// CineVault 2.0
app.use('/api/tmdb', require('./routes/tmdbRoutes'));
app.use('/api/collections', require('./routes/collectionRoutes'));
app.use('/api/social', writeLimiter, require('./routes/socialRoutes'));
app.use('/api/circles', writeLimiter, require('./routes/circleRoutes'));
app.use('/api/chat', writeLimiter, require('./routes/chatRoutes'));
app.use('/api/polls', writeLimiter, require('./routes/pollRoutes'));
app.use('/api/events', writeLimiter, require('./routes/eventRoutes'));
app.use('/api/feed', writeLimiter, require('./routes/feedRoutes'));
app.use('/api/discover', require('./routes/discoverRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/ai', aiLimiter, require('./routes/aiRoutes'));
const uploads = require('./routes/uploadRoutes');
app.use('/api/uploads', writeLimiter, uploads.router);
app.use('/uploads', uploads.serve);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CineVault API is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});

// Error handler
app.use(errorHandler);

const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Connect to MongoDB first so the API never serves requests against a down database
const start = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error(`\x1b[31m✖ Failed to connect to MongoDB: ${error.message}\x1b[0m`);
    process.exit(1);
  }

  registerShutdownHooks();

  const server = http.createServer(app);
  realtime.init(server, CORS_ORIGINS);
  scheduler.start();

  server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`Realtime: Socket.IO on ws://localhost:${PORT}`);
    console.log(`TMDB: ${require('./services/tmdb').isConfigured() ? 'configured' : 'not configured (local catalog only)'}`);
    console.log(`AI: ${require('./ai/llm').available() ? 'LLM enabled' : 'local models (set ANTHROPIC_API_KEY to enable LLM features)'}`);
  });
};

start();
