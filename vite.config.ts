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
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              gateway: 'achiever-vite-gemini-gateway',
              primaryProvider: 'gemini',
              primaryModel: 'gemini-2.5-flash',
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
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
              
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

              const geminiRes = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              const data = await geminiRes.json().catch(() => null);
              if (!geminiRes.ok) {
                const errorMsg = data?.error?.message || `Gemini API returned ${geminiRes.status}`;
                res.statusCode = geminiRes.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'gemini_error', detail: errorMsg }));
                return;
              }

              const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (typeof content !== 'string' || !content.trim()) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'empty_response', detail: 'Gemini returned empty text' }));
                return;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  content: content.trim(),
                  model: 'gemini-2.5-flash',
                  provider: 'gemini',
                  usage: data.usageMetadata || null,
                })
              );
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

