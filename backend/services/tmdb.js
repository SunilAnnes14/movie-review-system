const Movie = require('../models/Movie');
const { httpError } = require('../utils/http');

/**
 * TMDB integration (https://developer.themoviedb.org/docs).
 * Credentials come from the environment: TMDB_READ_TOKEN (v4 bearer, preferred) or TMDB_API_KEY (v3).
 * Responses are cached in memory; failures degrade gracefully to the local catalog.
 */

// Overridable for integration tests against a local TMDB contract mock
const BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const TTL_MS = Number(process.env.TMDB_CACHE_TTL_MS) || 30 * 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map();

const isConfigured = () => !!(process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY);

const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
};
const GENRE_IDS = Object.fromEntries(Object.entries(GENRES).map(([id, name]) => [name.toLowerCase(), id]));

async function request(path, params = {}) {
  if (!isConfigured()) throw httpError(503, 'TMDB is not configured. Set TMDB_READ_TOKEN or TMDB_API_KEY in backend/.env');

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const headers = { Accept: 'application/json' };
  if (process.env.TMDB_READ_TOKEN) headers.Authorization = `Bearer ${process.env.TMDB_READ_TOKEN}`;
  else url.searchParams.set('api_key', process.env.TMDB_API_KEY);

  const key = url.toString().replace(/api_key=[^&]+/, '');
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    throw httpError(502, 'Could not reach TMDB. Please try again shortly.');
  }
  if (res.status === 401) throw httpError(502, 'TMDB rejected the configured credentials');
  if (res.status === 404) throw httpError(404, 'Movie not found on TMDB');
  if (res.status === 429) throw httpError(503, 'TMDB rate limit reached, try again in a moment');
  if (!res.ok) throw httpError(502, `TMDB error (${res.status})`);

  const data = await res.json();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { data, expires: Date.now() + TTL_MS });
  return data;
}

const image = (path, size = 'w500') => (path ? `${IMG}/${size}${path}` : '');

// Light summary used for search / trending lists
function summarize(m) {
  return {
    tmdbId: m.id,
    title: m.title || m.name,
    overview: m.overview || '',
    poster: image(m.poster_path, 'w342'),
    backdrop: image(m.backdrop_path, 'w1280'),
    releaseDate: m.release_date || '',
    releaseYear: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    genre: (m.genre_ids || (m.genres || []).map(g => g.id)).map(id => GENRES[id]).filter(Boolean),
    tmdbRating: m.vote_average || 0,
    popularity: m.popularity || 0,
    language: m.original_language || 'en'
  };
}

async function search(query, page = 1) {
  const data = await request('/search/movie', { query, page, include_adult: 'false' });
  return { results: (data.results || []).map(summarize), page: data.page, totalPages: data.total_pages };
}

async function trending(window = 'week') {
  const data = await request(`/trending/movie/${window === 'day' ? 'day' : 'week'}`);
  return (data.results || []).map(summarize);
}

async function discoverByGenre(genreName, page = 1) {
  const id = GENRE_IDS[String(genreName).toLowerCase()];
  if (!id) return [];
  const data = await request('/discover/movie', { with_genres: id, sort_by: 'vote_average.desc', 'vote_count.gte': 500, page });
  return (data.results || []).map(summarize);
}

async function details(tmdbId) {
  const m = await request(`/movie/${Number(tmdbId)}`, { append_to_response: 'credits,keywords,videos' });
  const director = (m.credits?.crew || []).find(c => c.job === 'Director');
  const trailer = (m.videos?.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
  return {
    ...summarize(m),
    genre: (m.genres || []).map(g => GENRES[g.id] || g.name),
    director: director?.name || 'Unknown',
    cast: (m.credits?.cast || []).slice(0, 10).map(c => c.name),
    characters: (m.credits?.cast || []).slice(0, 10).map(c => c.character).filter(Boolean),
    keywords: (m.keywords?.keywords || []).slice(0, 25).map(k => k.name),
    duration: m.runtime || 120,
    trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : '',
    tagline: m.tagline || ''
  };
}

/** Import (or refresh) a TMDB movie into the CineVault catalog and return the Movie document. */
async function importMovie(tmdbId, userId) {
  const existing = await Movie.findOne({ tmdbId: Number(tmdbId) });
  if (existing) return existing;

  const d = await details(tmdbId);
  const year = d.releaseYear || new Date().getFullYear();
  return Movie.create({
    title: d.title,
    description: (d.overview || 'No synopsis available yet.').slice(0, 2000),
    genre: d.genre.length ? d.genre : ['Drama'],
    releaseYear: Math.min(Math.max(year, 1888), 2030),
    director: d.director,
    cast: d.cast,
    characters: d.characters,
    keywords: d.keywords,
    poster: d.poster,
    backdrop: d.backdrop,
    trailer: d.trailer,
    duration: d.duration,
    tmdbId: d.tmdbId,
    tmdbRating: d.tmdbRating,
    popularity: d.popularity,
    releaseDate: d.releaseDate,
    originalLanguage: d.language,
    addedBy: userId
  });
}

module.exports = { isConfigured, search, trending, discoverByGenre, details, importMovie, GENRES };
