const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

/**
 * MongoDB connection.
 *
 * 1. Try MONGO_URI from .env (local mongod or MongoDB Atlas).
 * 2. If that server is not reachable AND the URI points at this machine,
 *    boot a real, persistent local `mongod` process (binary is downloaded once
 *    by mongodb-memory-server and cached in backend/.mongo-cache) and connect
 *    to it. Data lives in backend/.mongo-data so it survives restarts.
 *
 * The app never falls back to an in-memory/JSON store - it always talks to a
 * genuine MongoDB server.
 */

const DEFAULT_DB_NAME = 'movie_review_db';
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'];

// mongodb-memory-server configuration (must be set before it is required)
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.14';
process.env.MONGOMS_DOWNLOAD_DIR =
  process.env.MONGOMS_DOWNLOAD_DIR || path.join(__dirname, '..', '.mongo-cache');

let bundledMongo = null;

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

function parseMongoUri(uri) {
  try {
    const url = new URL(uri);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 27017,
      dbName: (url.pathname || '/').replace(/^\//, '') || DEFAULT_DB_NAME
    };
  } catch (error) {
    return null;
  }
}

function maskUri(uri) {
  // hide credentials that may be embedded in the connection string
  return String(uri).replace(/\/\/([^@/]+)@/, '//***:***@');
}

async function startBundledMongo(uri, parsed) {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const dbPath = process.env.MONGO_DATA_DIR || path.join(__dirname, '..', '.mongo-data');
  fs.mkdirSync(dbPath, { recursive: true });

  console.log(yellow('[CineVault DB] MongoDB is not reachable on this machine.'));
  console.log(cyan('[CineVault DB] Starting a local MongoDB server (first run downloads the mongod binary)...'));

  bundledMongo = await MongoMemoryServer.create({
    instance: {
      ip: '127.0.0.1',
      port: parsed.port,
      dbPath,
      storageEngine: 'wiredTiger'
    }
  });

  const localUri = bundledMongo.getUri(parsed.dbName);
  await mongoose.connect(localUri, { serverSelectionTimeoutMS: 5000 });

  console.log(green(`✔ MongoDB Connected: 127.0.0.1:${parsed.port}/${parsed.dbName} (managed local mongod)`));
  console.log(cyan(`[CineVault DB] Data directory: ${dbPath}`));
  return mongoose.connection;
}

const connectDB = async () => {
  const uri = process.env.MONGO_URI || `mongodb://127.0.0.1:27017/${DEFAULT_DB_NAME}`;

  // Fail fast instead of buffering queries when the DB is down
  mongoose.set('bufferCommands', false);

  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    console.log(green(`✔ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`));
    return conn.connection;
  } catch (error) {
    const parsed = parseMongoUri(uri);
    const isLocal = parsed && LOCAL_HOSTS.includes(parsed.host);
    const fallbackEnabled = process.env.MONGO_FALLBACK !== 'false';

    if (!isLocal || !fallbackEnabled) {
      throw new Error(
        `Cannot reach MongoDB at ${maskUri(uri)} (${error.message}).\n` +
          '  - Start a local MongoDB server, or set MONGO_URI in backend/.env to a reachable\n' +
          '    MongoDB instance (e.g. MongoDB Atlas), then restart the backend.'
      );
    }

    console.warn(yellow(`[CineVault DB] ${maskUri(uri)} is not reachable (${error.message}).`));
    return await startBundledMongo(uri, parsed);
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
  } catch (error) {
    // ignore - connection may already be closed
  }

  if (bundledMongo) {
    const server = bundledMongo;
    bundledMongo = null;
    try {
      await server.stop({ doCleanup: false });
    } catch (error) {
      // ignore - the managed mongod is cleaned up by the OS on exit
    }
  }
};

// Make sure the managed mongod is stopped with the process (seed/server/nodemon)
const registerShutdownHooks = () => {
  if (process.__cinevaultDbHooks) return;
  process.__cinevaultDbHooks = true;

  const shutdown = async () => {
    await disconnectDB();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('exit', () => {
    if (bundledMongo) {
      try {
        bundledMongo.stop({ doCleanup: false });
      } catch (error) {
        // ignore
      }
    }
  });
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
module.exports.registerShutdownHooks = registerShutdownHooks;
