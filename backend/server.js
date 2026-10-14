const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { disconnectDB, registerShutdownHooks } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/movies', require('./routes/movieRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/watchlist', require('./routes/watchlistRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Movie Review API is running' });
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

  app.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
  });
};

start();
