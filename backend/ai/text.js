/**
 * Small, dependency-free NLP toolkit used by the local (no-API-key) AI services:
 * tokenisation, stemming, TF-IDF vectors, cosine similarity, sentence splitting,
 * lexicon-based sentiment with negation handling, and readability scoring.
 */

const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has have having he her
here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on
once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves
then there these they this those through to too under until up very was we were what when where which while who whom why
will with would you your yours yourself yourselves also film movie movies films one get got really much even still like
would could make made makes watch watched watching see seen saw lot thing things way story`.split(/\s+/));

function stem(word) {
  if (word.length <= 4) return word;
  return word
    .replace(/(ational|tional)$/, 'tion')
    .replace(/(ness|ment|ments|ingly|edly)$/, '')
    .replace(/(ies)$/, 'y')
    .replace(/(ing|ed|ly|es|s)$/, '');
}

function tokenize(text, { keepStopwords = false, stemming = true } = {}) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/)
    .map(w => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(w => w.length > 1);
  return words
    .filter(w => keepStopwords || !STOPWORDS.has(w))
    .map(w => (stemming ? stem(w) : w));
}

function splitSentences(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  return raw.match(/[^.!?]+(?:[.!?]+|$)/g).map(s => s.trim()).filter(Boolean);
}

// ---------- TF-IDF ----------
class TfIdf {
  constructor(documents = []) {
    this.docs = documents.map(d => tokenize(d));
    this.df = new Map();
    for (const tokens of this.docs) for (const t of new Set(tokens)) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.N = this.docs.length || 1;
  }

  idf(term) {
    return Math.log((1 + this.N) / (1 + (this.df.get(term) || 0))) + 1;
  }

  vector(textOrTokens) {
    const tokens = Array.isArray(textOrTokens) ? textOrTokens : tokenize(textOrTokens);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map();
    for (const [t, c] of tf) vec.set(t, (c / tokens.length) * this.idf(t));
    return normalize(vec);
  }

  docVector(i) {
    return this.vector(this.docs[i]);
  }
}

function normalize(vec) {
  let sum = 0;
  for (const v of vec.values()) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  const out = new Map();
  for (const [k, v] of vec) out.set(k, v / norm);
  return out;
}

// Cosine of two sparse Map vectors
function cosine(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of small) { const w = large.get(k); if (w) dot += v * w; }
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function addScaled(target, vec, scale) {
  for (const [k, v] of vec) target.set(k, (target.get(k) || 0) + v * scale);
  return target;
}

// ---------- Sentiment ----------
const LEXICON = {
  // positive
  amazing: 3, awesome: 3, brilliant: 3, masterpiece: 4, masterful: 3, stunning: 3, beautiful: 3, breathtaking: 3,
  excellent: 3, fantastic: 3, incredible: 3, outstanding: 3, perfect: 3, superb: 3, wonderful: 3, phenomenal: 3,
  great: 2, good: 2, enjoy: 2, enjoyed: 2, enjoyable: 2, love: 3, loved: 3, lovely: 2, fun: 2, funny: 2, gripping: 2,
  compelling: 2, engaging: 2, powerful: 2, moving: 2, touching: 2, emotional: 1, impressive: 2, memorable: 2,
  clever: 2, smart: 2, solid: 1, nice: 1, best: 3, favorite: 2, favourite: 2, thrilling: 2, captivating: 3, riveting: 3,
  hilarious: 3, heartfelt: 2, charming: 2, gorgeous: 3, haunting: 2, intense: 1, epic: 2, iconic: 2, legendary: 3,
  recommend: 2, recommended: 2, unforgettable: 3, genius: 3, satisfying: 2, refreshing: 2, polished: 2, worth: 1,
  // negative
  awful: -3, bad: -2, boring: -3, disappointing: -3, disappointed: -2, dull: -2, terrible: -3, horrible: -3,
  weak: -2, worst: -3, waste: -3, mess: -2, messy: -2, predictable: -2, slow: -1, overrated: -2, confusing: -2,
  forgettable: -2, bland: -2, flat: -2, poor: -2, poorly: -2, hate: -3, hated: -3, annoying: -2, cringe: -2,
  lazy: -2, pointless: -2, stupid: -2, tedious: -2, clumsy: -2, cliche: -1, 'cliché': -1, shallow: -2, wooden: -2,
  unbearable: -3, mediocre: -2, meh: -1, overlong: -1, dragged: -2, drags: -2, generic: -2, underwhelming: -2
};
const NEGATIONS = new Set(['not', 'no', 'never', "n't", 'nothing', 'hardly', 'barely', "isn't", "wasn't", "didn't", "doesn't", "don't", "aren't", "weren't", 'without']);
const INTENSIFIERS = { very: 1.5, really: 1.4, extremely: 1.8, so: 1.3, incredibly: 1.7, truly: 1.4, absolutely: 1.6, quite: 1.2, super: 1.4 };

function sentiment(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z'\s-]/g, ' ').split(/\s+/).filter(Boolean);
  let score = 0, hits = 0;
  const positive = [], negative = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let value = LEXICON[w];
    if (value === undefined) continue;
    const window = words.slice(Math.max(0, i - 3), i);
    if (window.some(x => NEGATIONS.has(x) || x.endsWith("n't"))) value = -value * 0.8;
    const intens = INTENSIFIERS[words[i - 1]];
    if (intens) value *= intens;
    score += value; hits++;
    (value > 0 ? positive : negative).push(w);
  }
  // Normalised to [-1, 1]
  const normalized = hits ? Math.max(-1, Math.min(1, score / (hits * 3))) : 0;
  const label = normalized > 0.15 ? 'positive' : normalized < -0.15 ? 'negative' : (hits ? 'mixed' : 'neutral');
  return { score: Math.round(normalized * 100) / 100, label, positive: [...new Set(positive)], negative: [...new Set(negative)] };
}

// ---------- Readability ----------
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function readability(text) {
  const sentences = splitSentences(text);
  const words = String(text || '').split(/\s+/).filter(w => /[a-z]/i.test(w));
  if (!sentences.length || !words.length) return { score: 0, grade: 'n/a', wordsPerSentence: 0, words: 0, sentences: 0 };
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const wps = words.length / sentences.length;
  const score = Math.round(206.835 - 1.015 * wps - 84.6 * (syl / words.length));
  const grade = score >= 80 ? 'Very easy' : score >= 65 ? 'Easy' : score >= 50 ? 'Fairly readable' : score >= 30 ? 'Difficult' : 'Very difficult';
  return { score: Math.max(0, Math.min(100, score)), grade, wordsPerSentence: Math.round(wps * 10) / 10, words: words.length, sentences: sentences.length };
}

// Top keywords of a text (by frequency, stopwords removed, unstemmed for display)
function keywords(text, limit = 8) {
  const counts = new Map();
  for (const w of tokenize(text, { stemming: false })) if (w.length > 3 && !/^\d+$/.test(w)) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
}

module.exports = { tokenize, stem, splitSentences, TfIdf, cosine, normalize, addScaled, sentiment, readability, keywords, STOPWORDS };
