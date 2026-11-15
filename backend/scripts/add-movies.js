/**
 * Add the IMDb top classics and Tamil cinema titles to an EXISTING database without resetting it.
 * Idempotent: a movie is skipped when the same title + release year already exists.
 * Also sets the original language on known non-English titles already in the catalog.
 *
 * Usage: npm run movies:add
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectDB, disconnectDB } = require('../config/db');
const Movie = require('../models/Movie');
const { ALL } = require('../data/catalog-additions');

const KNOWN_LANGUAGES = { 'Spirited Away': 'ja', 'Parasite': 'ko', 'Oldboy': 'ko' };

const toDoc = (m) => ({
  title: m.title, description: m.description, genre: m.genre, releaseYear: m.year, director: m.director,
  cast: m.cast, keywords: m.keywords, duration: m.duration, originalLanguage: m.language
});

async function addMovies() {
  let added = 0, skipped = 0;
  // Migrate any documents written with the earlier 'language' field name
  await Movie.collection.updateMany({ language: { $exists: true } }, { $rename: { language: 'originalLanguage' } });
  for (const m of ALL) {
    const exists = await Movie.exists({ title: m.title, releaseYear: m.year });
    if (exists) { skipped++; continue; }
    await Movie.create(toDoc(m));
    added++;
  }
  // Older catalog entries were created before the field existed
  await Movie.updateMany({ originalLanguage: { $exists: false } }, { $set: { originalLanguage: 'en' } });
  for (const [title, language] of Object.entries(KNOWN_LANGUAGES)) {
    await Movie.updateOne({ title, originalLanguage: { $in: [null, 'en'] } }, { originalLanguage: language });
  }
  return { added, skipped };
}

if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      const { added, skipped } = await addMovies();
      const total = await Movie.countDocuments();
      const tamil = await Movie.countDocuments({ originalLanguage: 'ta' });
      console.log(`Added ${added} movie(s), skipped ${skipped} already present. Catalog: ${total} movies (${tamil} Tamil).`);
      await disconnectDB();
      process.exit(0);
    } catch (e) {
      console.error('add-movies failed:', e.message);
      await disconnectDB().catch(() => {});
      process.exit(1);
    }
  })();
}

module.exports = { addMovies, toDoc };
