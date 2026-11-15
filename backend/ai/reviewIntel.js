const { splitSentences, sentiment, readability, keywords, TfIdf, cosine } = require('./text');
const cinespoiler = require('./cinespoiler');
const llm = require('./llm');

/**
 * Review Intelligence - a writing assistant. It NEVER publishes or edits a review by itself:
 * every output is a suggestion the user must explicitly apply.
 *
 * Local analysis (always available): grammar/style fixes, readability, extractive summary,
 * sentiment + rating consistency, themes, aspect analysis (acting / cinematography /
 * screenplay / direction / music), spoiler detection and caption generation.
 * Style rewrites need the LLM; the rewrite prompt forbids changing the reviewer's opinion.
 */

const MISSPELLINGS = {
  teh: 'the', recieve: 'receive', definately: 'definitely', definetly: 'definitely', alot: 'a lot', wierd: 'weird',
  seperate: 'separate', occured: 'occurred', untill: 'until', becuase: 'because', beleive: 'believe', amazng: 'amazing',
  dissapointed: 'disappointed', dissapointing: 'disappointing', cinematograpy: 'cinematography', performace: 'performance',
  charachter: 'character', charachters: 'characters', suprise: 'surprise', suprising: 'surprising', thier: 'their',
  realy: 'really', truely: 'truly', begining: 'beginning', acheive: 'achieve', wich: 'which', freind: 'friend',
  everytime: 'every time', noone: 'no one', villian: 'villain', scenary: 'scenery', masterpeice: 'masterpiece',
  absolutly: 'absolutely', excelent: 'excellent', recomend: 'recommend', reccomend: 'recommend'
};

const ASPECTS = {
  acting: /\b(act(?:ing|or|ors|ress|ed)?|performance[s]?|cast|portray(?:al|s|ed)?|plays?|played|role)\b/i,
  cinematography: /\b(cinematograph\w*|visual[s]?|shot[s]?|camera|lighting|framing|colou?r[s]?|imagery|look[s]? (?:gorgeous|stunning)|effects|vfx|cgi)\b/i,
  screenplay: /\b(screenplay|script|writing|written|dialogue[s]?|plot|story|storytelling|narrative|pacing|twist[s]?|character development|arc)\b/i,
  direction: /\b(direct(?:ion|or|ed|ing)|vision|filmmaking|helm(?:ed)?)\b/i,
  music: /\b(score|soundtrack|music|composer|sound design|zimmer|song[s]?)\b/i
};

const THEMES = {
  'Love & relationships': /\blove|romance|relationship|marriage|couple\b/i,
  'Family': /\bfamily|father|mother|daughter|son|sibling|brother|sister\b/i,
  'Identity': /\bidentity|who (?:he|she|they) (?:is|are)|self|becoming\b/i,
  'Power & corruption': /\bpower|corrupt|control|greed|politic|empire\b/i,
  'Survival': /\bsurviv|desperate|struggle|escape\b/i,
  'Time & memory': /\btime|memory|memories|past|future|nostalgia\b/i,
  'Morality': /\bmoral|ethic|right and wrong|justice|guilt|redemption\b/i,
  'Friendship': /\bfriend|loyal|bond|companions?\b/i,
  'Isolation': /\blonel|isolat|alone|solitude\b/i,
  'Ambition': /\bambition|dream|success|obsess\b/i,
  'Humanity': /\bhuman|humanity|mankind|civili[sz]ation\b/i
};

function grammarFixes(text) {
  const fixes = [];
  let fixed = text;

  const replace = (pattern, replacement, reason) => {
    const before = fixed;
    fixed = fixed.replace(pattern, (...args) => {
      const match = args[0];
      const out = typeof replacement === 'function'
        ? replacement(...args)
        : replacement.replace(/\$(\d)/g, (_, n) => args[Number(n)] ?? ''); // expand $1, $2 from this match's groups
      if (out !== match) fixes.push({ from: match.trim(), to: String(out).trim(), reason });
      return out;
    });
    return before !== fixed;
  };

  for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
    if (!right) continue;
    replace(new RegExp(`\\b${wrong}\\b`, 'gi'), (m) => (m[0] === m[0].toUpperCase() ? right[0].toUpperCase() + right.slice(1) : right), 'Spelling');
  }
  replace(/\bi\b(?=[\s'’,.!?]|$)/g, 'I', 'Capitalise "I"');
  replace(/ {2,}/g, ' ', 'Extra spaces');
  replace(/\s+([,.!?;:])/g, '$1', 'Space before punctuation');
  replace(/([,;:])(?=[A-Za-z])/g, '$1 ', 'Missing space after punctuation');
  replace(/([a-z]{2})([.!?])([A-Z][a-z])/g, '$1$2 $3', 'Missing space after sentence');
  replace(/([!?])\1{1,}/g, '$1', 'Repeated punctuation');
  replace(/\.{4,}/g, '...', 'Ellipsis');
  replace(/\b(\w+) \1\b/gi, '$1', 'Repeated word');
  replace(/(^|[.!?]\s+)([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase(), 'Capitalise sentence start');
  replace(/\b(could|should|would|must) of\b/gi, '$1 have', 'Grammar ("of" → "have")');
  replace(/\bthen (?=(?:the |a |any)?(?:other|rest))/gi, 'than ', '"then" → "than"');
  if (fixed.trim() && !/[.!?…"')\]]$/.test(fixed.trim())) { fixed = fixed.trim() + '.'; fixes.push({ from: '(end)', to: '.', reason: 'Missing final punctuation' }); }

  return { corrected: fixed, fixes };
}

function extractiveSummary(sentences, maxSentences = 2) {
  if (sentences.length <= maxSentences) return sentences.join(' ');
  const tfidf = new TfIdf(sentences);
  const vectors = sentences.map((_, i) => tfidf.docVector(i));
  const centrality = vectors.map((v, i) => vectors.reduce((s, w, j) => (i === j ? s : s + cosine(v, w)), 0));
  // slight lead bias - reviewers often state their verdict early
  const scored = centrality.map((c, i) => ({ i, score: c + (i === 0 ? 0.15 : 0) }));
  const chosen = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences).map(s => s.i).sort((a, b) => a - b);
  return chosen.map(i => sentences[i]).join(' ');
}

function aspectAnalysis(sentences) {
  const out = {};
  for (const [aspect, re] of Object.entries(ASPECTS)) {
    const hits = sentences.filter(s => re.test(s));
    if (!hits.length) { out[aspect] = { mentioned: false }; continue; }
    const sent = sentiment(hits.join(' '));
    out[aspect] = { mentioned: true, sentiment: sent.label, score: sent.score, evidence: hits.slice(0, 2) };
  }
  return out;
}

function caption(sentences, sent, movie) {
  if (!sentences.length) return '';
  const strongest = [...sentences].sort((a, b) => Math.abs(sentiment(b).score) - Math.abs(sentiment(a).score))[0];
  let c = strongest.replace(/\s+/g, ' ').trim();
  if (c.split(' ').length > 14) c = c.split(' ').slice(0, 14).join(' ').replace(/[,;:]$/, '') + '…';
  const tag = sent.label === 'positive' ? '🎬✨' : sent.label === 'negative' ? '🎬👎' : '🎬';
  return `${tag} ${c}${movie?.title && !c.toLowerCase().includes(movie.title.toLowerCase()) ? ` — ${movie.title}` : ''}`;
}

async function analyze(text, { movie, rating } = {}) {
  const clean = String(text || '').trim();
  const sentences = splitSentences(clean);
  const sent = sentiment(clean);
  const grammar = grammarFixes(clean);
  const spoilers = await cinespoiler.detect(clean, movie);
  // Summary and caption are built from the corrected text and never include spoiler sentences
  const correctedCheck = grammar.corrected === clean ? spoilers : await cinespoiler.detect(grammar.corrected, movie);
  const safeSentences = correctedCheck.sentences.filter(x => !x.spoiler).map(x => x.text);

  let ratingConsistency = null;
  if (rating) {
    const expected = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'mixed';
    const consistent = expected === sent.label || sent.label === 'neutral' || (expected === 'mixed' && sent.label !== 'negative' && Math.abs(sent.score) < 0.5);
    ratingConsistency = { rating, textSentiment: sent.label, consistent, note: consistent ? 'Your words match your rating.' : `Your ${rating}★ rating reads ${expected}, but the text sounds ${sent.label}. Double-check that they agree.` };
  }

  return {
    provider: 'local',
    grammar,
    readability: readability(clean),
    summary: extractiveSummary(safeSentences),
    sentiment: sent,
    ratingConsistency,
    themes: Object.entries(THEMES).filter(([, re]) => re.test(clean)).map(([t]) => t).slice(0, 5),
    keywords: keywords(clean, 8),
    aspects: aspectAnalysis(sentences),
    spoilers: { isSpoiler: spoilers.isSpoiler, flagged: spoilers.flagged, sentences: spoilers.sentences.filter(s => s.spoiler).map(s => ({ index: s.index, text: s.text, probability: s.probability })) },
    caption: caption(safeSentences, sent, movie),
    rewriteAvailable: llm.available()
  };
}

const STYLE_GUIDES = {
  casual: 'casual and conversational, like talking to a friend',
  professional: 'polished and professional, like a published film critic',
  critical: 'analytical and critical, examining craft and execution in depth',
  cinematic: 'evocative and cinematic, with vivid, atmospheric language',
  short: 'short and engaging, at most 3 punchy sentences'
};

async function rewrite(text, style, { movie, rating } = {}) {
  if (!STYLE_GUIDES[style]) throw Object.assign(new Error(`Unknown style. Use one of: ${Object.keys(STYLE_GUIDES).join(', ')}`), { statusCode: 400 });
  if (!llm.available()) throw new llm.LLMUnavailableError('Style rewrites need an AI language model. Set ANTHROPIC_API_KEY in backend/.env; all other Review Intelligence tools work locally.');
  const out = await llm.json({
    system: 'You are an editor for movie reviews. Rewrite the review in the requested style. Strict rules: keep the reviewer\'s opinions, verdict and rating sentiment exactly the same; do not add claims, facts or plot details that are not in the original; do not add spoilers; keep it in first person when the original is.',
    prompt: `Movie: ${movie?.title || 'unknown'}${rating ? ` (reviewer rating: ${rating}/5)` : ''}\nStyle: ${STYLE_GUIDES[style]}\n\nOriginal review:\n"""${text}"""`,
    schema: { type: 'object', properties: { rewritten: { type: 'string' }, changes: { type: 'array', items: { type: 'string' } } }, required: ['rewritten', 'changes'], additionalProperties: false },
    maxTokens: 2000
  });
  return { provider: 'llm', style, rewritten: out.rewritten, changes: out.changes || [] };
}

module.exports = { analyze, rewrite, grammarFixes, STYLES: Object.keys(STYLE_GUIDES) };
