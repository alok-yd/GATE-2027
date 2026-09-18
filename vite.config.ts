import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function aiGatewayDevPlugin(apiKey: string): Plugin {
  return {
    name: 'ai-gateway-dev-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/ai')) {
          return next();
        }

        if (req.url === '/api/ai/status' && req.method === 'GET') {
          const primaryModel = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3.6-flash';
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              gateway: 'achiever-vite-gemini-gateway',
              primaryProvider: 'gemini',
              primaryModel,
              configured: Boolean(apiKey && apiKey.length > 5),
              fallbackProvider: 'application-local-deterministic',
              metrics: {
                requestCount: 1,
                successCount: 1,
                failureCount: 0,
                averageLatencyMs: 180,
                lastError: null,
              },
            })
          );
          return;
        }

        if (req.url === '/api/ai/chat' && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          req.on('end', async () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const body = raw ? JSON.parse(raw) : {};
              const prompt = (body.prompt || '').trim();
              const system = (body.system || '').trim();

              if (!prompt) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'prompt is required' }));
                return;
              }

              const key = (apiKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
              if (!key) {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'missing_api_key', detail: 'Gemini API key is not configured' }));
                return;
              }

              const primaryModel = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-3.6-flash';
              const fallbackModels = [
                process.env.GEMINI_FALLBACK_MODEL || process.env.VITE_GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
                'gemini-3.8-flash',
              ];
              const modelChain = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];
              const wantsJson = prompt.toLowerCase().includes('json') || system.toLowerCase().includes('json');

              let lastError: { status: number; message: string } | null = null;
              let successResult: { content: string; model: string; provider: string; usage: unknown } | null = null;

              for (const currentModel of modelChain) {
                try {
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
                  const generationConfig: Record<string, unknown> = {
                    temperature: 0.4,
                    maxOutputTokens: 4096,
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

                  const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });

                  const data = await geminiRes.json().catch(() => null);
                  if (!geminiRes.ok) {
                    const errorMsg = data?.error?.message || `Gemini API returned ${geminiRes.status}`;
                    lastError = { status: geminiRes.status, message: errorMsg };
                    // If model is not available / deprecated / 503 high demand / 404, continue to next fallback
                    if (
                      geminiRes.status === 404 ||
                      geminiRes.status === 503 ||
                      errorMsg.includes('no longer available') ||
                      errorMsg.includes('high demand')
                    ) {
                      continue;
                    }
                    break;
                  }

                  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (typeof content !== 'string' || !content.trim()) {
                    lastError = { status: 502, message: 'Gemini returned empty text' };
                    continue;
                  }

                  successResult = {
                    content: content.trim(),
                    model: currentModel,
                    provider: 'gemini',
                    usage: data.usageMetadata || null,
                  };
                  break;
                } catch (err: unknown) {
                  lastError = { status: 500, message: err instanceof Error ? err.message : String(err) };
                }
              }

              if (successResult) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(successResult));
              } else {
                res.statusCode = lastError?.status || 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'gemini_error', detail: lastError?.message || 'Model execution failed' }));
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'gateway_exception', detail: message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
    const aiGatewayPort = env.ACHIEVER_AI_GATEWAY_PORT || '8787';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/ai-external': {
            target: `http://127.0.0.1:${aiGatewayPort}`,
            changeOrigin: true,
          },
        },
      },
      plugins: [react(), aiGatewayDevPlugin(geminiKey)],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

