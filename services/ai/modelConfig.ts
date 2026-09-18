/**
 * Central AI Model Configuration (GATE 2027 Prep Tracker)
 * Defines primary models, fallback hierarchy, token limits, and capability matrix.
 */

export type AIModelStatus =
  | 'INITIALIZING'
  | 'AVAILABLE'
  | 'FALLBACK'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'ERROR';

export type AIFailureReason =
  | 'MODEL_NOT_FOUND'
  | 'MODEL_NOT_AVAILABLE'
  | 'MODEL_ACCESS_DENIED'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'MALFORMED_OUTPUT'
  | 'UNKNOWN';

export interface AIModelCapability {
  structuredOutput: boolean;
  systemInstructions: boolean;
  tokenContextLimit: number;
  recommendedMaxOutputTokens: number;
  multimodal: boolean;
}

export interface AIModelConfig {
  provider: 'gemini';
  primaryModel: string;
  fallbackModels: string[];
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  capabilities: Record<string, AIModelCapability>;
}

// Default capabilities for supported Gemini Flash models
const DEFAULT_CAPABILITIES: Record<string, AIModelCapability> = {
  'gemini-3.8-flash': {
    structuredOutput: true,
    systemInstructions: true,
    tokenContextLimit: 1048576,
    recommendedMaxOutputTokens: 8192,
    multimodal: true,
  },
  'gemini-3.6-flash': {
    structuredOutput: true,
    systemInstructions: true,
    tokenContextLimit: 1048576,
    recommendedMaxOutputTokens: 8192,
    multimodal: true,
  },
  'gemini-3.5-flash-lite': {
    structuredOutput: true,
    systemInstructions: true,
    tokenContextLimit: 1048576,
    recommendedMaxOutputTokens: 4096,
    multimodal: true,
  },
  'gemini-2.0-flash': {
    structuredOutput: true,
    systemInstructions: true,
    tokenContextLimit: 1048576,
    recommendedMaxOutputTokens: 4096,
    multimodal: true,
  },
};

const getEnvModel = (key: string, defaultVal: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const val = import.meta.env[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return defaultVal;
};

// Configurable model hierarchy
export const AI_MODEL_CONFIG: AIModelConfig = {
  provider: 'gemini',
  primaryModel: getEnvModel('VITE_GEMINI_MODEL', getEnvModel('GEMINI_MODEL', 'gemini-3.6-flash')),
  fallbackModels: [
    getEnvModel('VITE_GEMINI_FALLBACK_MODEL', getEnvModel('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash-lite')),
    'gemini-3.8-flash',
  ],
  maxOutputTokens: 4096, // Increased from 2048 to eliminate JSON truncation
  temperature: 0.4,
  timeoutMs: 30000,
  capabilities: DEFAULT_CAPABILITIES,
};

/**
 * Returns the ordered chain of models to attempt: [primaryModel, ...fallbackModels]
 */
export function getModelAttemptChain(config: AIModelConfig = AI_MODEL_CONFIG): string[] {
  const chain: string[] = [config.primaryModel];
  for (const fallback of config.fallbackModels) {
    if (fallback && !chain.includes(fallback)) {
      chain.push(fallback);
    }
  }
  return chain;
}

/**
 * Classifies an API error message or status code into an AIFailureReason
 */
export function classifyAIFailure(error: unknown, statusCode?: number): AIFailureReason {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (
    statusCode === 503 ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('service unavailable')
  ) {
    return 'MODEL_NOT_AVAILABLE';
  }
  if (statusCode === 429 || msg.includes('quota') || msg.includes('resource_exhausted')) {
    return 'QUOTA_EXCEEDED';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'RATE_LIMIT';
  }
  if (
    statusCode === 404 ||
    msg.includes('is no longer available') ||
    msg.includes('model not found') ||
    msg.includes('not supported')
  ) {
    return 'MODEL_NOT_AVAILABLE';
  }
  if (
    statusCode === 403 ||
    statusCode === 401 ||
    msg.includes('permission_denied') ||
    msg.includes('unauthenticated') ||
    msg.includes('api key not valid') ||
    msg.includes('lacks access') ||
    msg.includes('invalid authentication credentials')
  ) {
    return 'MODEL_ACCESS_DENIED';
  }
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('deadline')) {
    return 'TIMEOUT';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('econnrefused')) {
    return 'NETWORK_ERROR';
  }
  if (msg.includes('json') || msg.includes('parse') || msg.includes('syntaxerror')) {
    return 'MALFORMED_OUTPUT';
  }

  return 'UNKNOWN';
}

/**
 * Clean user-facing friendly error message (avoids leaking provider stack traces)
 */
export function getUserFacingAIMessage(reason: AIFailureReason): string {
  switch (reason) {
    case 'QUOTA_EXCEEDED':
    case 'RATE_LIMIT':
      return 'AI daily query limit reached. Showing local deterministic analysis.';
    case 'MODEL_NOT_AVAILABLE':
    case 'MODEL_ACCESS_DENIED':
      return 'AI analysis is temporarily unavailable for this key. Showing local analysis.';
    case 'TIMEOUT':
    case 'NETWORK_ERROR':
      return 'AI network connection timed out. Showing local analysis.';
    case 'MALFORMED_OUTPUT':
      return 'AI response could not be parsed. Showing verified local analysis.';
    default:
      return 'AI analysis is temporarily unavailable. Showing local analysis.';
  }
}
