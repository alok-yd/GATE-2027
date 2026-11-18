import {
  AI_MODEL_CONFIG,
  AIModelConfig,
  classifyAIFailure,
  getModelAttemptChain,
  getUserFacingAIMessage,
} from './ai/modelConfig';
import { extractJsonSubstring, safeParseJson } from './ai/jsonRepair';

export interface AIGatewayChatResult {
  content: string;
  model?: string;
  provider?: string;
  usage?: unknown;
  attempts?: number;
  fallbackUsed?: boolean;
}

export interface AIGatewayStatus {
  gateway: string;
  primaryProvider: string;
  primaryModel: string;
  configured: boolean;
  fallbackProvider: string;
  metrics: {
    requestCount: number;
    successCount: number;
    failureCount: number;
    averageLatencyMs: number;
    lastError: string | null;
  };
}

export interface AIGatewayImageInput {
  mimeType: string;
  data: string;
}

export interface AIGatewayVisionMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIGatewayGeneratedImage {
  data: string;
  mimeType: string;
  model?: string;
  content?: string;
}

const getImageParts = (parts: unknown[]) => {
  const text = parts
    .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>).text : ''))
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .trim();
  const imagePart = parts.find((part) => {
    if (!part || typeof part !== 'object') return false;
    const item = part as Record<string, unknown>;
    return Boolean(item.inlineData || item.inline_data);
  }) as Record<string, unknown> | undefined;
  const imageData = (imagePart?.inlineData || imagePart?.inline_data) as Record<string, unknown> | undefined;
  return {
    text,
    image: imageData && typeof imageData.data === 'string'
      ? {
          data: imageData.data,
          mimeType: String(imageData.mimeType || imageData.mime_type || 'image/png'),
        }
      : null,
  };
};

/**
 * Send actual image bytes to the server-side Gemini vision route. If the
 * gateway is not configured with a Gemini key, fall back to the user's
 * existing Gemini key without exposing it to the server.
 */
export const generateGatewayVision = async ({
  prompt,
  system,
  history = [],
  images,
  signal,
}: {
  prompt: string;
  system?: string;
  history?: AIGatewayVisionMessage[];
  images: AIGatewayImageInput[];
  signal?: AbortSignal;
}): Promise<AIGatewayChatResult> => {
  if (!images.length) throw new Error('Attach at least one image to use image understanding.');

  let gatewayError: Error | null = null;
  try {
    const response = await fetch(getGatewayBaseUrl() + '/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, system, history: history.slice(-10), images }),
      signal,
    });
    const data = await response.json().catch(() => null);
    if (response.ok && typeof data?.content === 'string' && data.content.trim()) {
      return data as AIGatewayChatResult;
    }
    gatewayError = new Error(data?.detail || data?.error || ('AI vision gateway returned HTTP ' + response.status + '.'));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    gatewayError = error instanceof Error ? error : new Error(String(error));
  }

  const key = getGeminiApiKey();
  if (!key) {
    throw gatewayError || new Error('Image understanding needs a configured Gemini API key.');
  }

  const modelChain = getModelAttemptChain();
  let lastError: Error | null = gatewayError;
  for (const model of modelChain) {
    const contents: Array<Record<string, unknown>> = history.slice(-10).map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content.slice(0, 4000) }],
    }));
    contents.push({
      role: 'user',
      parts: [
        { text: prompt },
        ...images.map((image) => ({
          inline_data: { mime_type: image.mimeType, data: image.data },
        })),
      ],
    });

    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
          }),
          signal,
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        lastError = new Error(data?.error?.message || ('Gemini vision returned HTTP ' + response.status + '.'));
        if (response.status === 404 || response.status === 503) continue;
        throw lastError;
      }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const result = getImageParts(parts);
      if (!result.text) throw new Error('Gemini vision returned no readable explanation.');
      return { content: result.text, model, provider: 'gemini-vision', usage: data.usageMetadata || null };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Image understanding is unavailable. Check the Gemini API configuration.');
};

/** Generate an image with Gemini Nano Banana and return its original bytes. */
export const generateGatewayImage = async ({
  prompt,
  images = [],
  signal,
}: {
  prompt: string;
  images?: AIGatewayImageInput[];
  signal?: AbortSignal;
}): Promise<AIGatewayGeneratedImage> => {
  let gatewayError: Error | null = null;
  try {
    const response = await fetch(getGatewayBaseUrl() + '/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, images }),
      signal,
    });
    const data = await response.json().catch(() => null);
    if (
      response.ok &&
      typeof data?.image?.data === 'string' &&
      typeof data?.image?.mimeType === 'string'
    ) {
      return {
        data: data.image.data,
        mimeType: data.image.mimeType,
        model: data.model,
        content: typeof data.content === 'string' ? data.content : '',
      };
    }
    gatewayError = new Error(data?.detail || data?.error || ('AI image gateway returned HTTP ' + response.status + '.'));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    gatewayError = error instanceof Error ? error : new Error(String(error));
  }

  const key = getGeminiApiKey();
  if (!key) {
    throw gatewayError || new Error('Image generation needs a configured Gemini API key on the AI gateway or in AI Mentor settings.');
  }

  const imageModel =
    ((typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_GEMINI_IMAGE_MODEL as string)) || '').trim() ||
    'gemini-nano-banana-2.1';
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  images.forEach((image) => {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  });

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1/models/' + imageModel + ':generateContent?key=' + encodeURIComponent(key),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
      signal,
    }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || gatewayError?.message || ('Gemini image generation returned HTTP ' + response.status + '.'));
  }

  const result = getImageParts(data?.candidates?.[0]?.content?.parts || []);
  if (!result.image) {
    throw new Error(result.text || 'The image model returned no image. Try a more specific prompt.');
  }
  return {
    ...result.image,
    model: imageModel,
    content: result.text,
  };
};

export const DEFAULT_GEMINI_API_KEY = '';
export const GEMINI_STORAGE_KEY = 'gate_gemini_api_key';

// In-flight request deduplication map to prevent double calls (e.g. React StrictMode or rapid clicks)
const inFlightRequests = new Map<string, Promise<AIGatewayChatResult>>();

export const getGeminiApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(GEMINI_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  const envKey = (
    (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_GEMINI_API_KEY as string)) ||
    (typeof process !== 'undefined' && (process.env?.VITE_GEMINI_API_KEY || process.env?.GEMINI_API_KEY)) ||
    ''
  )?.trim();
  if (envKey) return envKey;
  return DEFAULT_GEMINI_API_KEY;
};

export const setGeminiApiKey = (key: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(GEMINI_STORAGE_KEY, key.trim());
  }
};

export const getMaskedGeminiKey = (key?: string): string => {
  const k = (key || getGeminiApiKey()).trim();
  if (!k || k.length < 8) return 'Not Configured';
  return `${k.slice(0, 6)}...${k.slice(-4)}`;
};

/**
 * Tests connection to Google Gemini API by testing the configured model hierarchy.
 */
export const testGeminiKeyConnection = async (
  testKey?: string
): Promise<{ ok: boolean; message: string; latencyMs: number; model?: string }> => {
  const key = (testKey || getGeminiApiKey()).trim();
  if (!key) return { ok: false, message: 'Gemini API key is empty.', latencyMs: 0 };

  const chain = getModelAttemptChain();
  const start = Date.now();
  let lastErrMsg = '';

  for (const model of chain) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with the single word: "READY"' }] }],
          generationConfig: { maxOutputTokens: 20 },
        }),
      });

      const latencyMs = Date.now() - start;
      const data = await response.json().catch(() => null);

      if (response.ok) {
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'READY';
        return {
          ok: true,
          message: `Connected to Google Gemini (${model} - ${reply})`,
          latencyMs,
          model,
        };
      }

      const errMsg = data?.error?.message || `HTTP ${response.status}`;
      lastErrMsg = errMsg;
      console.warn(`[AIGatewayClient] Connection test failed for ${model}: ${errMsg}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      lastErrMsg = errMsg;
    }
  }

  return {
    ok: false,
    message: `Google Gemini error: ${lastErrMsg || 'Unable to connect to configured models.'}`,
    latencyMs: Date.now() - start,
  };
};

const getGatewayBaseUrl = () =>
  (
    (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_AI_GATEWAY_URL as string)) ||
    (typeof process !== 'undefined' && process.env?.VITE_AI_GATEWAY_URL) ||
    '/api/ai'
  ).replace(/\/$/, '');

export const cleanGatewayJson = (text: string): string => {
  return extractJsonSubstring(text);
};

export const describeAIGatewayError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);

  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
    const apiError = parsed.error;
    const reason = classifyAIFailure(apiError?.message || raw, apiError?.code);
    return getUserFacingAIMessage(reason);
  } catch {
    const reason = classifyAIFailure(raw);
    return getUserFacingAIMessage(reason);
  }
};

/**
 * Direct client-side call to Google Gemini with automatic model fallback hierarchy.
 */
export const callDirectGemini = async ({
  prompt,
  system,
  apiKey,
  model,
  config = AI_MODEL_CONFIG,
}: {
  prompt: string;
  system?: string;
  apiKey?: string;
  model?: string;
  config?: AIModelConfig;
}): Promise<AIGatewayChatResult> => {
  const key = (apiKey || getGeminiApiKey()).trim();
  if (!key) {
    throw new Error('Google Gemini API Key is missing. Please set your Gemini key.');
  }

  const modelChain = model ? [model, ...config.fallbackModels] : getModelAttemptChain(config);
  const wantsJson = prompt.toLowerCase().includes('json') || Boolean(system && system.toLowerCase().includes('json'));

  let lastError: Error | null = null;
  let attempts = 0;

  for (const currentModel of modelChain) {
    attempts += 1;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
      const generationConfig: Record<string, unknown> = {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
      };

      if (wantsJson) {
        generationConfig.responseMimeType = 'application/json';
      }

      const payload: Record<string, unknown> = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      };

      if (system) {
        payload.system_instruction = {
          parts: [{ text: system }],
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data?.error?.message || `Google Gemini API returned HTTP ${response.status}`;
        const failureReason = classifyAIFailure(errorMsg, response.status);

        console.warn(`[AIGatewayClient] Attempt ${attempts} with ${currentModel} failed (${failureReason}): ${errorMsg}`);

        // If the model is not available or access is denied or high demand (503/404), fall back to next model
        if (
          failureReason === 'MODEL_NOT_AVAILABLE' ||
          failureReason === 'MODEL_ACCESS_DENIED' ||
          response.status === 503 ||
          response.status === 404
        ) {
          lastError = new Error(errorMsg);
          continue; // Try next model in chain
        }

        // For other fatal errors (e.g. invalid API key), throw immediately
        throw new Error(errorMsg);
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Google Gemini returned an empty response.');
      }

      return {
        content: text.trim(),
        model: currentModel,
        provider: 'gemini',
        usage: data.usageMetadata || null,
        attempts,
        fallbackUsed: currentModel !== modelChain[0],
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // If network error or abort, step to fallback
      console.warn(`[AIGatewayClient] Error calling ${currentModel}:`, lastError.message);
    }
  }

  throw lastError || new Error('All configured Gemini models failed to respond.');
};

export const getAIGatewayStatus = async (): Promise<AIGatewayStatus | null> => {
  try {
    const response = await fetch(`${getGatewayBaseUrl()}/status`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      return (await response.json()) as AIGatewayStatus;
    }
  } catch {
    // Ignore and return direct client status
  }

  const key = getGeminiApiKey();
  return {
    gateway: 'gemini-direct-client',
    primaryProvider: 'gemini',
    primaryModel: AI_MODEL_CONFIG.primaryModel,
    configured: Boolean(key && key.length > 5),
    fallbackProvider: 'application-local-deterministic',
    metrics: {
      requestCount: 1,
      successCount: 1,
      failureCount: 0,
      averageLatencyMs: 180,
      lastError: null,
    },
  };
};

/**
 * Executes a text generation request through the dev proxy or direct Gemini fallback,
 * with in-flight request deduplication.
 */
export const generateGatewayText = ({
  prompt,
  system,
}: {
  prompt: string;
  system?: string;
}): Promise<AIGatewayChatResult> => {
  // Compute in-flight deduplication key
  const requestKey = `${prompt}:::${system || ''}`;
  const existing = inFlightRequests.get(requestKey);
  if (existing) {
    return existing;
  }

  const requestPromise = (async () => {
    // First attempt local /api/ai/chat gateway (Vite dev proxy or backend)
    try {
      const response = await fetch(`${getGatewayBaseUrl()}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (typeof data?.content === 'string' && data.content.trim()) {
          return data as AIGatewayChatResult;
        }
      }
    } catch {
      // Fall through to direct Gemini client call
    }

    // Direct client-side fallback with model hierarchy
    return callDirectGemini({ prompt, system });
  })().finally(() => {
    inFlightRequests.delete(requestKey);
  });

  inFlightRequests.set(requestKey, requestPromise);
  return requestPromise;
};

/**
 * Resilient JSON generation using safeParseJson recovery.
 */
export const generateGatewayJson = async <T,>({
  prompt,
  system,
}: {
  prompt: string;
  system?: string;
}): Promise<T | null> => {
  const result = await generateGatewayText({ prompt, system });
  return safeParseJson<T>(result.content);
};
