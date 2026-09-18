import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadLocalEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(ROOT_DIR, fileName);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;

      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.ACHIEVER_AI_GATEWAY_PORT || 8787);
const HOST = process.env.ACHIEVER_AI_GATEWAY_HOST || '127.0.0.1';
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
const MAX_PROMPT_CHARS = Number(process.env.ACHIEVER_AI_MAX_PROMPT_CHARS || 24000);
const REQUEST_TIMEOUT_MS = Number(process.env.ACHIEVER_AI_TIMEOUT_MS || 120000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.ACHIEVER_AI_RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.ACHIEVER_AI_RATE_LIMIT_MAX || 30);
const CACHE_TTL_MS = Number(process.env.ACHIEVER_AI_CACHE_TTL_MS || 30000);

const modelConfig = {
  reasoning: {
    provider: 'nemotron',
    model: process.env.NEMOTRON_MODEL || DEFAULT_MODEL,
    baseUrl: (process.env.NEMOTRON_API_BASE_URL || '').replace(/\/$/, ''),
  },
  vision: {
    provider: 'browser-local',
    model: 'structured-camera-events',
  },
  speech: {
    provider: 'browser-local',
    model: 'web-speech-api',
  },
  embeddings: {
    provider: 'not-configured',
    model: 'pending-rag-phase',
  },
};

const metrics = {
  requestCount: 0,
  successCount: 0,
  failureCount: 0,
  cacheHitCount: 0,
  totalLatencyMs: 0,
  promptChars: 0,
  completionChars: 0,
  totalTokens: 0,
  lastError: null,
  lastModel: modelConfig.reasoning.model,
};

class AIProvider {
  async generateText() {
    throw new Error('AIProvider.generateText must be implemented.');
  }
}

class GeminiProvider extends AIProvider {
  constructor() {
    super();
    this.apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    this.primaryModel = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3.6-flash';
    this.fallbackModels = [
      process.env.GEMINI_FALLBACK_MODEL || process.env.VITE_GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ];
    this.model = this.primaryModel;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  async generateText({ prompt, system }) {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not configured in environment.');
    }

    const modelChain = [this.primaryModel, ...this.fallbackModels.filter((m) => m !== this.primaryModel)];
    const wantsJson = prompt.toLowerCase().includes('json') || Boolean(system && system.toLowerCase().includes('json'));

    let lastError = null;

    for (const currentModel of modelChain) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${this.apiKey}`;
        const generationConfig = {
          temperature: 0.4,
          maxOutputTokens: 4096,
        };

        if (wantsJson) {
          generationConfig.responseMimeType = 'application/json';
        }

        const payload = {
          contents: [
            { role: 'user', parts: [{ text: prompt }] },
          ],
          generationConfig,
        };

        if (system) {
          payload.system_instruction = {
            parts: [{ text: system }],
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          const providerMessage = data?.error?.message || response.statusText;
          lastError = new Error(`Google Gemini returned HTTP ${response.status}: ${providerMessage}`);
          if (
            response.status === 404 ||
            response.status === 503 ||
            providerMessage.includes('no longer available') ||
            providerMessage.includes('high demand')
          ) {
            continue;
          }
          throw lastError;
        }

        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof content !== 'string' || !content.trim()) {
          lastError = new Error('Google Gemini returned an empty response.');
          continue;
        }

        this.model = currentModel;
        return {
          content: content.trim(),
          model: currentModel,
          provider: 'gemini',
          usage: data.usageMetadata || null,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('All configured Gemini models failed in ai-gateway.');
  }
}

class NemotronProvider extends AIProvider {
  constructor() {
    super();
    this.baseUrl = modelConfig.reasoning.baseUrl;
    this.apiKey = process.env.NEMOTRON_API_KEY || '';
    this.model = modelConfig.reasoning.model;
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async generateText({ prompt, system }) {
    if (!this.isConfigured()) {
      throw new Error('Nemotron endpoint is not configured.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                system ||
                'You are Achiever AI, a concise GATE 2027 study mentor. Use supplied student context only.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 1200,
          stream: false,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const providerMessage = data?.error?.message || data?.message || response.statusText;
        throw new Error(`Nemotron provider returned HTTP ${response.status}: ${providerMessage}`);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Nemotron provider returned an empty response.');
      }

      return {
        content,
        model: this.model,
        provider: 'nemotron',
        usage: data.usage || null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

class FallbackProvider extends AIProvider {
  async generateText() {
    throw new Error('Fallback provider is deterministic in the application layer.');
  }
}

class VisionProvider extends AIProvider {
  async generateText() {
    throw new Error('Vision provider is represented by browser-local structured camera events in this phase.');
  }
}

class EmbeddingProvider extends AIProvider {
  async generateText() {
    throw new Error('Embedding provider is pending the RAG phase.');
  }
}

class SpeechProvider extends AIProvider {
  async generateText() {
    throw new Error('Speech provider is represented by browser-local Web Speech APIs in this phase.');
  }
}

const providers = {
  gemini: new GeminiProvider(),
  nemotron: new NemotronProvider(),
  fallback: new FallbackProvider(),
  vision: new VisionProvider(),
  embedding: new EmbeddingProvider(),
  speech: new SpeechProvider(),
};

function getActiveProvider() {
  if (providers.gemini.isConfigured()) return providers.gemini;
  if (providers.nemotron.isConfigured()) return providers.nemotron;
  return providers.gemini;
}

const responseCache = new Map();
const rateLimitBuckets = new Map();

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) {
      throw new Error('Request body is too large.');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function publicStatus() {
  const averageLatencyMs =
    metrics.requestCount > 0 ? Math.round(metrics.totalLatencyMs / metrics.requestCount) : 0;
  const active = getActiveProvider();
  const isGemini = active instanceof GeminiProvider;
  return {
    gateway: 'achiever-ai-gateway',
    bind: `${HOST}:${PORT}`,
    primaryProvider: isGemini ? 'gemini' : 'nemotron',
    primaryModel: active.model,
    configured: active.isConfigured(),
    fallbackProvider: 'application-local-deterministic',
    modelConfig: {
      reasoning: {
        provider: isGemini ? 'gemini' : 'nemotron',
        model: active.model,
        configured: active.isConfigured(),
      },
      vision: modelConfig.vision,
      speech: modelConfig.speech,
      embeddings: modelConfig.embeddings,
    },
    metrics: {
      requestCount: metrics.requestCount,
      successCount: metrics.successCount,
      failureCount: metrics.failureCount,
      cacheHitCount: metrics.cacheHitCount,
      averageLatencyMs,
      promptChars: metrics.promptChars,
      completionChars: metrics.completionChars,
      totalTokens: metrics.totalTokens,
      lastError: metrics.lastError,
    },
    limits: {
      maxPromptChars: MAX_PROMPT_CHARS,
      rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
      rateLimitMax: RATE_LIMIT_MAX,
      cacheTtlMs: CACHE_TTL_MS,
    },
  };
}

function isPromptInjectionRisk(prompt) {
  const lower = prompt.toLowerCase();
  return [
    'ignore previous instructions',
    'reveal your system prompt',
    'print the api key',
    'show me the secret',
    'exfiltrate',
  ].some((pattern) => lower.includes(pattern));
}

function getRequesterKey(request) {
  return request.socket.remoteAddress || 'unknown';
}

function isRateLimited(request) {
  const key = getRequesterKey(request);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > RATE_LIMIT_MAX;
}

function cacheKeyFor({ prompt, system }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ prompt, system, model: providers.nemotron.model }))
    .digest('hex');
}

function getCachedResponse(key) {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  metrics.cacheHitCount += 1;
  return cached.value;
}

function setCachedResponse(key, value) {
  responseCache.set(key, { createdAt: Date.now(), value });
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
}

function updateUsage(prompt, result) {
  metrics.promptChars += prompt.length;
  metrics.completionChars += result.content.length;
  metrics.lastModel = result.model || providers.nemotron.model;
  if (typeof result.usage?.total_tokens === 'number') {
    metrics.totalTokens += result.usage.total_tokens;
  }
}

async function handleChat(request, response) {
  const started = Date.now();
  metrics.requestCount += 1;

  try {
    if (isRateLimited(request)) {
      sendJson(response, 429, { error: 'rate_limit_exceeded' });
      return;
    }

    const body = await readJson(request);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const system = typeof body.system === 'string' ? body.system.trim() : '';

    if (!prompt) {
      sendJson(response, 400, { error: 'prompt is required' });
      return;
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      sendJson(response, 413, { error: `prompt exceeds ${MAX_PROMPT_CHARS} characters` });
      return;
    }
    if (isPromptInjectionRisk(prompt)) {
      sendJson(response, 400, { error: 'prompt rejected by safety policy' });
      return;
    }

    const cacheKey = cacheKeyFor({ prompt, system });
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      metrics.successCount += 1;
      sendJson(response, 200, { ...cached, cached: true });
      return;
    }

    const active = getActiveProvider();
    const result = await active.generateText({ prompt, system });
    metrics.successCount += 1;
    metrics.lastError = null;
    updateUsage(prompt, result);
    setCachedResponse(cacheKey, result);
    sendJson(response, 200, result);
  } catch (error) {
    metrics.failureCount += 1;
    metrics.lastError = error instanceof Error ? error.message : String(error);
    sendJson(response, 503, {
      error: 'ai_provider_unavailable',
      detail: metrics.lastError,
      fallback: 'Use Achiever local deterministic fallback until Gemini is configured.',
    });
  } finally {
    metrics.totalLatencyMs += Date.now() - started;
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/ai/status') {
    sendJson(response, 200, publicStatus());
    return;
  }

  if (request.method === 'POST' && request.url === '/api/ai/chat') {
    await handleChat(request, response);
    return;
  }

  sendJson(response, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Achiever AI Gateway listening on http://${HOST}:${PORT}`);
});
