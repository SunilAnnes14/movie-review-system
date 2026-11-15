const Anthropic = require('@anthropic-ai/sdk');

/**
 * Optional LLM provider (Claude). When ANTHROPIC_API_KEY is not set, `available()` is false
 * and every AI service uses its local algorithm instead. The key never leaves the server.
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
let client = null;

const available = () => !!process.env.ANTHROPIC_API_KEY && process.env.AI_PROVIDER !== 'local';

function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
  return client;
}

class LLMUnavailableError extends Error {
  constructor(message = 'The AI language model is not configured. Set ANTHROPIC_API_KEY in backend/.env to enable this feature.') {
    super(message);
    this.statusCode = 503;
  }
}

/**
 * One Messages API call. Uses server-side refusal fallbacks so a declined request is retried
 * on a fallback model inside the same call.
 */
async function createMessage({ system, messages, tools, maxTokens = 4000, effort = 'low', schema }) {
  if (!available()) throw new LLMUnavailableError();
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default'
  };
  if (tools) params.tools = tools;

  let response;
  try {
    response = await getClient().beta.messages.create(params);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('The configured ANTHROPIC_API_KEY was rejected'), { statusCode: 502 });
    if (error instanceof Anthropic.RateLimitError) throw Object.assign(new Error('AI service is busy, please retry shortly'), { statusCode: 503 });
    if (error instanceof Anthropic.APIError) throw Object.assign(new Error(`AI service error (${error.status || 'network'})`), { statusCode: 502 });
    throw error;
  }
  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('The AI declined this request'), { statusCode: 422 });
  }
  return response;
}

const textOf = (response) => response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

/** Structured JSON completion validated against a JSON schema. */
async function json({ system, prompt, schema, maxTokens = 4000, effort = 'low' }) {
  const response = await createMessage({ system, messages: [{ role: 'user', content: prompt }], schema, maxTokens, effort });
  try {
    return JSON.parse(textOf(response));
  } catch (e) {
    throw Object.assign(new Error('AI returned an unreadable response'), { statusCode: 502 });
  }
}

module.exports = { available, createMessage, json, textOf, LLMUnavailableError, MODEL };
