/**
 * Resilient JSON repair and parsing utility for LLM structured outputs.
 * Handles markdown fences, commentary, truncated JSON, dangling commas, unclosed brackets/braces.
 */

export interface JsonRepairOptions {
  logWarning?: boolean;
}

/**
 * Strips markdown code blocks and trims whitespace.
 */
export function stripMarkdownFences(text: string): string {
  if (!text) return '';
  return text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (match) => {
      // If there's a code block start, keep only what follows
      return '';
    })
    .replace(/```[\s\S]*$/, '') // Strip trailing code block marker and anything after
    .trim();
}

/**
 * Extracts the outermost JSON substring (starting at first '{' or '[' and ending at last '}' or ']').
 */
export function extractJsonSubstring(text: string): string {
  const stripped = stripMarkdownFences(text);
  const firstBrace = stripped.indexOf('{');
  const firstBracket = stripped.indexOf('[');

  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }

  if (start === -1) return stripped;

  const lastBrace = stripped.lastIndexOf('}');
  const lastBracket = stripped.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);

  if (end > start) {
    return stripped.slice(start, end + 1);
  }

  // If unclosed (e.g. truncated output), return from start to end of string
  return stripped.slice(start);
}

/**
 * Attempts to repair truncated or slightly invalid JSON:
 * 1. Closes open strings
 * 2. Removes trailing commas before closing braces/brackets
 * 3. Adds missing closing brackets and braces
 */
export function repairTruncatedJson(jsonStr: string): string {
  let cleaned = jsonStr.trim();
  if (!cleaned) return '{}';

  // Remove single line JS comments // ... and multi-line comments /* ... */
  cleaned = cleaned.replace(/\/\/[^\n\r]*/g, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Track unclosed quotes, brackets, and braces
  let inString = false;
  let isEscaped = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        stack.push('{');
      } else if (char === '[') {
        stack.push('[');
      } else if (char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
  }

  // If string was truncated mid-quote, close it
  if (inString) {
    cleaned += '"';
  }

  // Remove trailing commas before close or end of string
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  cleaned = cleaned.replace(/,\s*$/g, '');

  // Now close any unclosed brackets and braces in reverse order
  while (stack.length > 0) {
    const expected = stack.pop();
    if (expected === '{') {
      cleaned += '}';
    } else if (expected === '[') {
      cleaned += ']';
    }
  }

  return cleaned;
}

/**
 * Safe JSON parser with multi-stage recovery.
 * 1. Tries standard JSON.parse directly
 * 2. Tries markdown-stripped JSON
 * 3. Tries substring extraction + repair
 * 4. Returns fallback or throws if strict
 */
export function safeParseJson<T>(
  text: string,
  fallback?: T,
  options: JsonRepairOptions = {}
): T {
  if (!text || typeof text !== 'string') {
    if (fallback !== undefined) return fallback;
    throw new Error('safeParseJson: Input text is empty or invalid.');
  }

  // Stage 1: Fast path
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to stage 2
  }

  // Stage 2: Strip markdown code blocks
  const stripped = stripMarkdownFences(text);
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Continue to stage 3
  }

  // Stage 3: Extract JSON slice and attempt structural repair
  const extracted = extractJsonSubstring(text);
  try {
    return JSON.parse(extracted) as T;
  } catch {
    // Continue to repair
  }

  // Stage 4: Structural repair (closing braces, quotes, trailing commas)
  try {
    const repaired = repairTruncatedJson(extracted);
    return JSON.parse(repaired) as T;
  } catch (err) {
    if (options.logWarning) {
      console.warn('safeParseJson: All repair attempts failed on input:', text.slice(0, 200), err);
    }
    if (fallback !== undefined) {
      return fallback;
    }
    throw err;
  }
}
