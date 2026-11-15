const Movie = require('../models/Movie');
const Review = require('../models/Review');
const Watchlist = require('../models/Watchlist');
const User = require('../models/User');
const CircleMember = require('../models/CircleMember');
const cinematch = require('./cinematch');
const tmdb = require('../services/tmdb');
const llm = require('./llm');
const { escapeRegex } = require('../utils/http');

/**
 * CineBot - movie assistant with retrieval-augmented generation.
 *
 * With an LLM configured, Claude answers through a tool loop: it must retrieve movie
 * metadata (catalog / TMDB), the user's history (only if the user allows it) or CineMatch
 * results before making factual claims. Without an LLM, a local intent router answers from
 * the same retrieval functions - every movie it mentions comes from the database or TMDB.
 */

const MAX_TOOL_ROUNDS = 6;

// ---------------- Retrieval functions (shared by both modes) ----------------

async function searchCatalog({ query, genre, director, actor, keyword, language, limit = 8 } = {}) {
  const q = {};
  if (language && /^[a-z]{2}$/i.test(language)) q.originalLanguage = language.toLowerCase();
  if (query) q.$or = [{ title: { $regex: escapeRegex(query), $options: 'i' } }, { description: { $regex: escapeRegex(query), $options: 'i' } }, { keywords: { $regex: escapeRegex(query), $options: 'i' } }];
  if (genre) q.genre = { $regex: `^${escapeRegex(genre)}$`, $options: 'i' };
  if (director) q.director = { $regex: escapeRegex(director), $options: 'i' };
  if (actor) q.cast = { $regex: escapeRegex(actor), $options: 'i' };
  if (keyword) q.$and = [{ $or: [{ keywords: { $regex: escapeRegex(keyword), $options: 'i' } }, { description: { $regex: escapeRegex(keyword), $options: 'i' } }] }];
  const movies = await Movie.find(q).sort({ averageRating: -1, tmdbRating: -1 }).limit(Math.min(limit, 15)).lean();
  return movies.map(m => cinematch.movieCard(m));
}

async function findMovieByTitle(title) {
  if (!title) return null;
  const exact = await Movie.findOne({ title: { $regex: `^${escapeRegex(title)}$`, $options: 'i' } }).lean();
  if (exact) return exact;
  const partial = await Movie.findOne({ title: { $regex: escapeRegex(title), $options: 'i' } }).lean();
  if (partial) return partial;
  if (tmdb.isConfigured()) {
    try {
      const { results } = await tmdb.search(title);
      if (results[0]) return { ...(await tmdb.details(results[0].tmdbId)), _id: null, fromTmdb: true };
    } catch (e) { /* TMDB unavailable */ }
  }
  return null;
}

async function movieDetails(id, spoilerFree) {
  const m = await Movie.findById(id).lean();
  if (!m) return null;
  return {
    _id: m._id, title: m.title, releaseYear: m.releaseYear, director: m.director, cast: m.cast, genre: m.genre,
    synopsis: m.description, keywords: spoilerFree ? (m.keywords || []).slice(0, 8) : m.keywords,
    runtimeMinutes: m.duration, communityRating: m.averageRating, reviewCount: m.reviewCount, tmdbRating: m.tmdbRating
  };
}

async function userHistory(user) {
  if (user.privacy?.allowHistoryForAI === false) return { permitted: false, note: 'The user has disabled use of their viewing history for AI features.' };
  const [reviews, vault] = await Promise.all([
    Review.find({ userId: user._id }).populate('movieId', 'title genre').sort({ rating: -1 }).limit(15).lean(),
    Watchlist.find({ userId: user._id }).populate('movieId', 'title genre').sort({ updatedAt: -1 }).limit(15).lean()
  ]);
  return {
    permitted: true,
    favoriteGenres: user.favoriteGenres,
    rated: reviews.filter(r => r.movieId).map(r => ({ title: r.movieId.title, rating: r.rating })),
    vault: vault.filter(v => v.movieId).map(v => ({ title: v.movieId.title, status: v.status }))
  };
}

async function circleRecommendations(user, circleName) {
  const memberships = await CircleMember.find({ user: user._id, status: 'active' }).populate('circle', 'name').lean();
  const circles = memberships.filter(m => m.circle).map(m => m.circle);
  if (!circles.length) return { error: 'The user is not a member of any CineCircle yet.' };
  const circle = (circleName && circles.find(c => c.name.toLowerCase().includes(circleName.toLowerCase()))) || circles[0];
  const rec = await cinematch.recommendForCircle(circle._id, { limit: 6 });
  return { circle: circle.name, compatibility: rec.compatibility, items: rec.items.map(i => ({ movie: i.movie, groupMatch: i.groupMatch, reasons: i.reasons })) };
}

// ---------------- LLM mode ----------------

const TOOLS = [
  {
    name: 'search_catalog',
    description: 'Search the MoviQ movie catalog. Use for any question about specific movies, genres, directors, actors or themes (e.g. keyword "twist").',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text title/synopsis search' },
        genre: { type: 'string' }, director: { type: 'string' }, actor: { type: 'string' },
        keyword: { type: 'string', description: 'Theme keyword such as twist, heist, time travel' },
        language: { type: 'string', description: 'ISO 639-1 original language, e.g. ta for Tamil, ja for Japanese' },
        limit: { type: 'integer' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'search_tmdb',
    description: 'Search The Movie Database for movies that are not in the local catalog.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }
  },
  {
    name: 'get_movie_details',
    description: 'Get full metadata for a catalog movie by its _id (synopsis, cast, keywords, ratings). Call this before explaining or describing a specific movie.',
    input_schema: { type: 'object', properties: { movie_id: { type: 'string' } }, required: ['movie_id'], additionalProperties: false }
  },
  {
    name: 'recommend_for_me',
    description: 'Personalised CineMatch recommendations for the current user. Optionally restrict to a genre or bias towards a seed movie ("movies like X").',
    input_schema: { type: 'object', properties: { genre: { type: 'string' }, like_movie_id: { type: 'string' }, limit: { type: 'integer' } }, additionalProperties: false }
  },
  {
    name: 'get_my_history',
    description: "The current user's ratings and vault (only available if they allowed it).",
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'recommend_for_circle',
    description: "Group CineMatch recommendations for one of the user's CineCircles.",
    input_schema: { type: 'object', properties: { circle_name: { type: 'string' } }, additionalProperties: false }
  }
];

async function runTool(name, input, ctx) {
  const remember = (movies) => { for (const m of movies || []) if (m && (m._id || m.tmdbId)) ctx.movies.set(String(m._id || `tmdb:${m.tmdbId}`), m); };
  switch (name) {
    case 'search_catalog': { const r = await searchCatalog(input); remember(r); return r.length ? r.map(m => ({ ...m, description: m.description?.slice(0, 300) })) : { results: [], note: 'No catalog matches.' }; }
    case 'search_tmdb': {
      if (!tmdb.isConfigured()) return { error: 'TMDB is not configured on this server.' };
      const { results } = await tmdb.search(input.query);
      const top = results.slice(0, 6);
      remember(top);
      return top;
    }
    case 'get_movie_details': {
      const d = await movieDetails(input.movie_id, ctx.spoilerFree).catch(() => null);
      if (d) remember([cinematch.movieCard({ ...d, description: d.synopsis, averageRating: d.communityRating })]);
      return d || { error: 'Movie not found' };
    }
    case 'recommend_for_me': {
      const r = await cinematch.recommendForUser(ctx.user._id, { limit: Math.min(input.limit || 6, 10), genre: input.genre, seedMovieId: input.like_movie_id });
      remember(r.items.map(i => i.movie));
      return { strategy: r.strategy, items: r.items.map(i => ({ movie: { _id: i.movie._id, title: i.movie.title, year: i.movie.releaseYear, genre: i.movie.genre }, match: i.match, reasons: i.reasons.map(x => x.text) })) };
    }
    case 'get_my_history': return userHistory(ctx.user);
    case 'recommend_for_circle': {
      const r = await circleRecommendations(ctx.user, input.circle_name);
      remember((r.items || []).map(i => i.movie));
      return r.items ? { ...r, items: r.items.map(i => ({ title: i.movie.title, _id: i.movie._id, groupMatch: i.groupMatch, reasons: i.reasons })) } : r;
    }
    default: return { error: `Unknown tool ${name}` };
  }
}

function systemPrompt(user, spoilerFree) {
  return [
    'You are CineBot, the movie assistant inside MoviQ, a social movie platform.',
    'Ground every factual claim about a specific movie in tool results. If the tools return nothing, say you could not find it rather than guessing. Never invent movies, cast, dates or plot details.',
    'Prefer recommending movies that exist in the catalog (search_catalog / recommend_for_me) so the user can open them; use search_tmdb for titles missing from the catalog.',
    spoilerFree
      ? 'SPOILER-FREE MODE IS ON: never reveal twists, deaths, endings or late plot developments. If asked to explain an ending, explain themes and ideas without revealing events, and tell the user they can turn off spoiler-free mode for a full explanation.'
      : 'Spoiler-free mode is OFF: the user has explicitly allowed spoilers. Still warn briefly before major reveals.',
    `The user is ${user.name}. Their onboarding genres: ${(user.favoriteGenres || []).join(', ') || 'not set'}.`,
    'Be concise (under 170 words), friendly and specific. Use short paragraphs or a short list. Mention movie titles exactly as the tools return them.',
    'On the very last line write "FOLLOWUPS:" followed by 2-3 short follow-up questions the user might ask next, separated by " | ".'
  ].join('\n');
}

async function chatLLM(user, history, message, spoilerFree) {
  const ctx = { user, spoilerFree, movies: new Map() };
  const messages = [
    ...history.slice(-10).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 2000) })),
    { role: 'user', content: message }
  ];
  // The conversation must start with a user turn
  while (messages.length && messages[0].role !== 'user') messages.shift();

  let response;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    response = await llm.createMessage({ system: systemPrompt(user, spoilerFree), messages, tools: TOOLS, maxTokens: 4000, effort: 'low' });
    if (response.stop_reason !== 'tool_use') break;
    messages.push({ role: 'assistant', content: response.content });
    const results = await Promise.all(response.content.filter(b => b.type === 'tool_use').map(async (b) => {
      try {
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input || {}, ctx)).slice(0, 12000) };
      } catch (e) {
        return { type: 'tool_result', tool_use_id: b.id, content: `Error: ${e.message}`, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: results });
  }

  let text = llm.textOf(response);
  let followUps = [];
  const idx = text.lastIndexOf('FOLLOWUPS:');
  if (idx >= 0) {
    followUps = text.slice(idx + 10).split('|').map(s => s.trim()).filter(Boolean).slice(0, 3);
    text = text.slice(0, idx).trim();
  }
  const lower = text.toLowerCase();
  let movies = [...ctx.movies.values()].filter(m => m.title && lower.includes(m.title.toLowerCase()));
  if (!movies.length) movies = [...ctx.movies.values()].slice(0, 4);
  return { reply: text, movies: dedupe(movies).slice(0, 8), followUps, provider: 'llm' };
}

// ---------------- Local mode ----------------

const MOODS = {
  happy: ['Comedy', 'Animation', 'Adventure'], sad: ['Drama', 'Romance'], excited: ['Action', 'Adventure', 'Sci-Fi'],
  scared: ['Horror', 'Thriller'], thoughtful: ['Drama', 'Sci-Fi', 'Mystery'], romantic: ['Romance', 'Drama'],
  bored: ['Action', 'Thriller', 'Comedy'], tense: ['Thriller', 'Crime', 'Mystery'], relaxed: ['Comedy', 'Animation', 'Family'],
  adventurous: ['Adventure', 'Fantasy', 'Sci-Fi'], nostalgic: ['Family', 'Animation', 'Adventure']
};
const GENRE_WORDS = { 'sci-fi': 'Sci-Fi', 'science fiction': 'Sci-Fi', scifi: 'Sci-Fi', thriller: 'Thriller', thrillers: 'Thriller', drama: 'Drama', dramas: 'Drama', comedy: 'Comedy', comedies: 'Comedy', horror: 'Horror', action: 'Action', romance: 'Romance', romantic: 'Romance', crime: 'Crime', mystery: 'Mystery', animation: 'Animation', animated: 'Animation', adventure: 'Adventure', fantasy: 'Fantasy', war: 'War', western: 'Western', documentary: 'Documentary', family: 'Family', history: 'History', psychological: 'Thriller' };

function detectGenre(text) {
  for (const [w, g] of Object.entries(GENRE_WORDS)) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) return g;
  return null;
}

const listMovies = (movies) => movies.map(m => `• **${m.title}** (${m.releaseYear || '—'})${m.director ? ` — ${m.director}` : ''}`).join('\n');

async function chatLocal(user, message, spoilerFree) {
  const text = message.trim();
  const lower = text.toLowerCase();
  const genre = detectGenre(lower);

  // "movies like X" / "similar to X"
  const like = lower.match(/(?:movies?|films?|something)?\s*(?:like|similar to)\s+["']?([^"'?.!]+)/i);
  if (like && !/\bi (?:like|liked)\b/.test(lower.slice(0, like.index + 6))) {
    const title = text.slice(like.index).replace(/^.*?(?:like|similar to)\s+/i, '').replace(/["'?.!]/g, '').trim();
    const seed = await findMovieByTitle(title);
    if (!seed) return { reply: `I couldn't find "${title}" in MoviQ${tmdb.isConfigured() ? ' or TMDB' : ''}. Try the exact title?`, movies: [], followUps: ['Show trending movies', 'Recommend something for me'] };
    let items;
    if (seed._id) items = (await cinematch.similarMovies(seed._id, 6)).map(s => s.movie);
    else items = await searchCatalog({ genre: seed.genre?.[0], limit: 6 });
    return {
      reply: `Here are movies with a similar profile to **${seed.title}** (matching genres, filmmakers, cast and themes):\n\n${listMovies(items)}`,
      movies: items, followUps: [`Recommend more ${seed.genre?.[0] || ''} movies`.replace(/\s+/g, ' '), 'Suggest something for my CineCircle']
    };
  }

  // explain the ending
  const ending = lower.match(/(?:explain|meaning of|understand)\s+(?:the\s+)?(?:ending|end)\s+(?:of\s+)?["']?([^"'?.!]+)/i);
  if (ending) {
    const movie = await findMovieByTitle(ending[1].trim());
    if (!movie) return { reply: `I couldn't find "${ending[1].trim()}" to look up.`, movies: [], followUps: [] };
    const card = movie._id ? [cinematch.movieCard(movie)] : [];
    const base = `**${movie.title}** (${movie.releaseYear}, dir. ${movie.director}).\n\nSynopsis: ${movie.description || movie.overview}`;
    const note = spoilerFree
      ? '\n\nSpoiler-free mode is on, so I won\'t reveal the ending. Turn it off if you want a full explanation.'
      : '';
    return { reply: `${base}${note}\n\nA detailed interpretation of the ending needs the AI language model, which isn't configured on this server - I only share facts I can retrieve.`, movies: card, followUps: [`Movies like ${movie.title}`] };
  }

  // circle / group
  if (/\b(circle|group|friends|movie night)\b/.test(lower)) {
    const r = await circleRecommendations(user, null);
    if (r.error) return { reply: `${r.error} Create or join one in CineCircle, then ask again!`, movies: [], followUps: ['Recommend something for me'] };
    return {
      reply: `For **${r.circle}** (taste compatibility ${r.compatibility}%), Group CineMatch suggests:\n\n${r.items.map(i => `• **${i.movie.title}** — ${i.groupMatch}% group match${i.reasons[0] ? `: ${i.reasons[0]}` : ''}`).join('\n')}`,
      movies: r.items.map(i => i.movie), followUps: ['Why these movies?', 'Show my Movie DNA']
    };
  }

  // language (e.g. "Tamil movies", "best Tamil thrillers")
  const LANGS = { tamil: ['ta', 'Tamil'], japanese: ['ja', 'Japanese'], korean: ['ko', 'Korean'], portuguese: ['pt', 'Portuguese'], brazilian: ['pt', 'Portuguese'] };
  const langWord = Object.keys(LANGS).find(w => new RegExp(`\\b${w}\\b`).test(lower));
  if (langWord) {
    const [code, name] = LANGS[langWord];
    const items = await searchCatalog({ language: code, genre: genre || undefined, limit: 8 });
    const fallback = items.length ? items : await searchCatalog({ language: code, limit: 8 });
    return fallback.length
      ? { reply: `${name} ${genre && items.length ? genre.toLowerCase() + ' ' : ''}movies in MoviQ:

${listMovies(fallback)}`, movies: fallback, followUps: [`Movies like ${fallback[0].title}`, 'Recommend something for me'] }
      : { reply: `There are no ${name} movies in the catalog yet.`, movies: [], followUps: [] };
  }

  // unexpected endings / twists
  if (/\b(twists?|twisty|unexpected endings?|surprise endings?|shocking endings?|mind[- ]bending|mind[- ]?blowing)\b/.test(lower)) {
    const found = [];
    for (const kw of ['twist', 'mind', 'dream', 'identity', 'mystery', 'surpris']) {
      if (found.length >= 6) break;
      found.push(...await searchCatalog({ keyword: kw, limit: 6 }));
    }
    if (found.length < 3) found.push(...await searchCatalog({ genre: 'Thriller', limit: 6 }));
    const all = dedupe(found).slice(0, 6);
    return { reply: all.length ? `Movies known for twists and mind-bending storytelling (no spoilers!):\n\n${listMovies(all)}` : 'I could not find twist-tagged movies in the catalog yet.', movies: all, followUps: ['Suggest underrated thrillers', 'Recommend something for me'] };
  }

  // director / actor ("Christopher Nolan movies", "films by Greta Gerwig")
  const dir = lower.match(/(?:by|from|directed by|starring|with)\s+([a-z .'-]+?)(?:\s+movies?|\s+films?|$|\?)/i) || lower.match(/([a-z .'-]+?)\s+(?:movies|films)\b/i);
  if (dir) {
    const name = dir[1].replace(/\b(recommend|suggest|show|find|list|me|some|the|best|good|any|all|top|great)\b/g, '').replace(/\s+/g, ' ').trim();
    if (name.length > 3 && !detectGenre(name)) {
      const byDirector = await searchCatalog({ director: name, limit: 8 });
      if (byDirector.length) return { reply: `Movies directed by **${byDirector[0].director}** in MoviQ:\n\n${listMovies(byDirector)}`, movies: byDirector, followUps: [`Movies like ${byDirector[0].title}`] };
      const byActor = await searchCatalog({ actor: name, limit: 8 });
      if (byActor.length) return { reply: `Movies featuring **${name}**:\n\n${listMovies(byActor)}`, movies: byActor, followUps: [] };
    }
  }

  // mood
  const mood = Object.keys(MOODS).find(m => lower.includes(m)) || (/\bmood\b/.test(lower) ? 'thoughtful' : null);
  if (mood) {
    const g = MOODS[mood];
    const r = await cinematch.recommendForUser(user._id, { limit: 12 });
    const items = r.items.filter(i => i.movie.genre.some(x => g.includes(x))).slice(0, 5).map(i => i.movie);
    return { reply: `Feeling ${mood}? ${g.join(', ')} movies fit that mood. Picked from your CineMatch profile:\n\n${listMovies(items)}`, movies: items, followUps: ['Something lighter', 'Something more intense'] };
  }

  // underrated
  if (/\b(underrated|hidden gem|lesser known)\b/.test(lower)) {
    const q = genre ? { genre: { $regex: `^${escapeRegex(genre)}$`, $options: 'i' } } : {};
    const movies = await Movie.find(q).lean();
    const items = movies.map(m => ({ m, s: (m.averageRating || m.tmdbRating / 2 || 0) - Math.log10(1 + (m.reviewCount || 0) + (m.popularity || 0) / 50) }))
      .sort((a, b) => b.s - a.s).slice(0, 6).map(x => cinematch.movieCard(x.m));
    return { reply: `Highly rated ${genre ? genre.toLowerCase() + ' ' : ''}movies with less buzz:\n\n${listMovies(items)}`, movies: items, followUps: ['Recommend something for me'] };
  }

  // personal recommendations (default for "recommend", "suggest", "watch history", or a genre)
  if (/\b(recommend|suggest|watch|what should|history|for me|pick)\b/.test(lower) || genre) {
    const r = await cinematch.recommendForUser(user._id, { limit: 6, genre });
    if (!r.items.length) return { reply: 'I have no new movies to recommend right now - try adding more to the catalog from Discover.', movies: [], followUps: [] };
    const intro = user.privacy?.allowHistoryForAI === false ? 'Based on your onboarding preferences (history use is off):' : `Based on your ratings and vault (${r.strategy} strategy):`;
    return { reply: `${intro}\n\n${r.items.map(i => `• **${i.movie.title}** — ${i.match}% match${i.reasons[0] ? `: ${i.reasons[0].text}` : ''}`).join('\n')}`, movies: r.items.map(i => i.movie), followUps: ['Why these?', 'Suggest a movie for my mood'] };
  }

  // plain title search
  const found = await searchCatalog({ query: text.replace(/[?!.]/g, ''), limit: 5 });
  if (found.length) return { reply: `Here's what I found in MoviQ:\n\n${listMovies(found)}`, movies: found, followUps: [`Movies like ${found[0].title}`] };

  return {
    reply: 'I can recommend movies like a title you love, suggest picks for your mood or CineCircle, list a director\'s films or find movies with twists. What would you like?',
    movies: [],
    followUps: ['Recommend movies like Inception', 'Suggest a movie for my mood: thoughtful', 'Recommend Christopher Nolan movies']
  };
}

function dedupe(movies) {
  const seen = new Set();
  return movies.filter(m => { const k = String(m._id || m.tmdbId || m.title); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function chat(userId, { message, history = [], spoilerFree = true }) {
  const user = await User.findById(userId).lean();
  if (llm.available()) {
    try {
      return await chatLLM(user, history, message, spoilerFree);
    } catch (e) {
      if (e.statusCode !== 503) throw e;
    }
  }
  return { ...(await chatLocal(user, message, spoilerFree)), provider: 'local' };
}

module.exports = { chat, searchCatalog };
