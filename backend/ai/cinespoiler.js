const { splitSentences } = require('./text');
const llm = require('./llm');
const { SpoilerDetection } = require('../models/AIRecords');

/**
 * CineSpoiler - sentence-level spoiler classifier.
 *
 * Local model: a weighted feature classifier (logistic scoring) over linguistic signals that
 * distinguish *plot revelation* from *opinion*:
 *   + revelation cues ("turns out", "it was all", "in the end", "reveals that"...)
 *   + plot-outcome verbs (dies, killed, survives, betrays, escapes...)
 *   + ending / twist vocabulary near narrative tense
 *   + the movie's own character names (from TMDB credits) combined with outcome verbs
 *   - opinion / evaluation language ("I loved", "great acting", "the score")
 *   - explicit "no spoilers" disclaimers
 * Merely mentioning a movie, actor or character is NOT enough to be flagged.
 *
 * Hybrid mode (when an LLM key is configured): borderline sentences (0.3-0.7) are sent to the
 * LLM for a second opinion. Only the sentences are sent - no user data.
 */

const REVEAL_CUES = [
  /\bturns? out\b/, /\bit (?:was|is) (?:all )?(?:just )?(?:a )?(?:dream|simulation|hallucination|lie)\b/, /\bin the end\b/,
  /\bat the end\b/, /\bthe ending\b/, /\bends with\b/, /\bfinal (?:scene|shot|twist|reveal|act|moments?)\b/,
  /\breveal(?:s|ed)? (?:that|to be|himself|herself|themselves)\b/, /\bplot twist\b/, /\bthe twist (?:is|was)\b/,
  /\bwas (?:actually|really|secretly)\b/, /\bis (?:actually|really|secretly)\b/, /\bthe killer (?:is|was)\b/,
  /\bthe villain (?:is|was)\b/, /\bwe (?:find|learn|discover) (?:out )?that\b/, /\bspoiler\b(?!s?[- ]free)/,
  /\bdoesn'?t (?:survive|make it)\b/, /\bdies at\b/, /\bwho (?:dies|survives)\b/, /\bcliffhanger\b/, /\bpost-credits?\b/,
  /\bwas dead (?:all along|the whole time)\b/, /\ball along\b/, /\bbehind it all\b/, /\bfather of\b/, /\bmother of\b/
];
const OUTCOME_VERBS = /\b(dies|died|death of|killed|kills|murdered|murders|survives|survived|betray(?:s|ed)?|sacrifices?|sacrificed|escapes?|escaped|commits suicide|is arrested|gets? caught|marries|married|wakes up|was the one|is the one|imaginary|returns? (?:home|to earth)|reunites?)\b/;
const OPINION = /\b(i|we) (?:loved|liked|enjoyed|hated|think|thought|felt|found|recommend|adore)\b|\b(acting|performance|performances|cinematography|score|soundtrack|visuals|directing|direction|pacing|screenplay|writing|dialogue|cast) (?:is|was|were|are)\b|\b(must[- ]watch|masterpiece|overrated|underrated|worth (?:it|watching)|highly recommend)\b/;
const DISCLAIMER = /\bno spoilers?\b|\bspoiler[- ]free\b|\bwithout spoil/;

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function scoreSentence(sentence, movie) {
  const s = sentence.toLowerCase();
  const features = [];
  let z = -2.6; // bias: most sentences are not spoilers

  const cueHits = REVEAL_CUES.filter(r => r.test(s)).length;
  if (cueHits) { z += 2.8 + 0.6 * (cueHits - 1); features.push('revelation phrase'); }

  const outcome = OUTCOME_VERBS.test(s);
  if (outcome) { z += 1.5; features.push('plot outcome'); }

  const names = [...(movie?.characters || []), ...(movie?.cast || [])]
    .flatMap(n => String(n).split(/\s*\/\s*/))
    .map(n => n.toLowerCase().trim())
    .filter(n => n.length > 2);
  const firstNames = names.map(n => n.split(' ')[0]).filter(n => n.length > 3);
  const mentionsCharacter = names.some(n => s.includes(n)) || firstNames.some(n => new RegExp(`\\b${n.replace(/[^a-z]/g, '')}\\b`).test(s));
  if (mentionsCharacter && (outcome || cueHits)) { z += 1.3; features.push('character + outcome'); }

  if (/\b(when|after|before|once)\b.*\b(he|she|they|cooper|the hero|the protagonist)\b/.test(s) && outcome) { z += 0.5; features.push('narrative sequence'); }

  if (OPINION.test(s)) { z -= 1.4; features.push('opinion language'); }
  if (DISCLAIMER.test(s)) { z -= 3; features.push('spoiler-free disclaimer'); }
  if (s.split(/\s+/).length < 5) z -= 0.6; // very short sentences rarely reveal plot

  return { probability: Math.round(sigmoid(z) * 100) / 100, features };
}

async function llmVerify(sentences, movie) {
  const result = await llm.json({
    system: 'You classify movie-related sentences as spoilers or not. A spoiler reveals plot events, twists, deaths, identities or endings that a first-time viewer would not know from the trailer. Opinions about quality, acting, music or visuals are NOT spoilers. Merely naming the movie, an actor or a character is NOT a spoiler.',
    prompt: `Movie: ${movie?.title || 'unknown'}\nClassify each sentence:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`,
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: { index: { type: 'integer' }, spoiler: { type: 'boolean' } },
            required: ['index', 'spoiler'],
            additionalProperties: false
          }
        }
      },
      required: ['results'],
      additionalProperties: false
    },
    maxTokens: 1500
  });
  return new Map((result.results || []).map(r => [r.index, r.spoiler]));
}

/**
 * Detect spoilers in a text.
 * @returns {{isSpoiler, score, method, sentences:[{index,text,probability,spoiler,features}], flagged:number[]}}
 */
async function detect(text, movie, { log, threshold = 0.5 } = {}) {
  const sentences = splitSentences(text);
  const scored = sentences.map((textS, index) => ({ index, text: textS, ...scoreSentence(textS, movie) }));
  let method = 'local';

  const borderline = scored.filter(s => s.probability >= 0.3 && s.probability <= 0.7);
  if (borderline.length && llm.available() && process.env.CINESPOILER_LLM !== 'off') {
    try {
      const verdicts = await llmVerify(borderline.map(s => s.text), movie);
      borderline.forEach((s, i) => {
        if (verdicts.has(i)) {
          s.probability = verdicts.get(i) ? Math.max(s.probability, 0.8) : Math.min(s.probability, 0.2);
          s.features.push('LLM verified');
        }
      });
      method = 'hybrid';
    } catch (e) {
      // keep the local verdicts if the LLM is unavailable
    }
  }

  for (const s of scored) s.spoiler = s.probability >= threshold;
  const flagged = scored.filter(s => s.spoiler).map(s => s.index);
  const score = scored.length ? Math.max(...scored.map(s => s.probability)) : 0;
  const result = { isSpoiler: flagged.length > 0, score, method, sentences: scored, flagged };

  if (log) {
    SpoilerDetection.create({
      user: log.user, source: log.source, sourceId: log.sourceId, movie: movie?._id,
      isSpoiler: result.isSpoiler, score, flagged, method
    }).catch(() => {});
  }
  return result;
}

module.exports = { detect, scoreSentence };
