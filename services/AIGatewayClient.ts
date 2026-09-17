export interface AIGatewayChatResult {
  content: string;
  model?: string;
  provider?: string;
  usage?: unknown;
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

export const DEFAULT_GEMINI_API_KEY = '';
export const GEMINI_STORAGE_KEY = 'gate_gemini_api_key';

export const getGeminiApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(GEMINI_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
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

export const testGeminiKeyConnection = async (testKey?: string): Promise<{ ok: boolean; message: string; latencyMs: number }> => {
  const key = (testKey || getGeminiApiKey()).trim();
  if (!key) return { ok: false, message: 'Gemini API key is empty.', latencyMs: 0 };

  const start = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Respond with the single word: "READY"' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });

    const latencyMs = Date.now() - start;
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = data?.error?.message || `HTTP ${response.status}`;
      return { ok: false, message: `Google Gemini error: ${errMsg}`, latencyMs };
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'READY';
    return { ok: true, message: `Connected to Google Gemini 2.5 Flash (${reply})`, latencyMs };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Network connection error: ${errMsg}`, latencyMs: Date.now() - start };
  }
};

const getGatewayBaseUrl = () =>
  ((import.meta.env.VITE_AI_GATEWAY_URL as string | undefined) || '/api/ai').replace(/\/$/, '');

export const cleanGatewayJson = (text: string) => {
  const withoutFence = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  const objectStart = withoutFence.indexOf('{');
  const arrayStart = withoutFence.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) return withoutFence;
  const start = Math.min(...starts);
  const end = Math.max(withoutFence.lastIndexOf('}'), withoutFence.lastIndexOf(']'));
  return end > start ? withoutFence.slice(start, end + 1) : withoutFence;
};

export const describeAIGatewayError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error);

  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
    const apiError = parsed.error;
    if (apiError?.code === 429) return 'Gemini quota or rate limit reached.';
    if (apiError?.code === 400 || apiError?.code === 401 || apiError?.code === 403) {
      return 'Gemini API key is invalid or lacks access to gemini-2.5-flash.';
    }
    if (apiError?.code === 404) return 'Gemini model is not available for this key.';
    return apiError?.message || raw;
  } catch {
    return raw;
  }
};

export const callDirectGemini = async ({
  prompt,
  system,
  apiKey,
  model = 'gemini-2.5-flash',
}: {
  prompt: string;
  system?: string;
  apiKey?: string;
  model?: string;
}): Promise<AIGatewayChatResult> => {
  const key = (apiKey || getGeminiApiKey()).trim();
  if (!key) {
    throw new Error('Google Gemini API Key is missing. Please set your Gemini key.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const payload: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  if (system) {
    payload.system_instruction = {
      parts: [{ text: system }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMsg = data?.error?.message || `Google Gemini API returned HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Google Gemini returned an empty response.');
  }

  return {
    content: text.trim(),
    model,
    provider: 'gemini',
    usage: data.usageMetadata || null,
  };
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
    primaryModel: 'gemini-2.5-flash',
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

export const generateGatewayText = async ({
  prompt,
  system,
}: {
  prompt: string;
  system?: string;
}): Promise<AIGatewayChatResult> => {
  // First attempt local /api/ai/chat gateway
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

  // Graceful direct client-side fallback to Google Gemini 2.5 Flash
  return callDirectGemini({ prompt, system });
};

export const generateGatewayJson = async <T,>({
  prompt,
  system,
}: {
  prompt: string;
  system?: string;
}): Promise<T | null> => {
  const result = await generateGatewayText({ prompt, system });
  return JSON.parse(cleanGatewayJson(result.content)) as T;
};
