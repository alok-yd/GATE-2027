# Achiever Audit

Generated: 2026-08-11

## Scope

This audit covers the local React/Vite Achiever GATE 2027 prep tracker in this folder. The app is not a git checkout in this workspace, so file changes are tracked by direct filesystem inspection rather than `git diff`.

## Existing Architecture

- Frontend: React 19, TypeScript, Vite, Tailwind-style utility classes, HashRouter routing.
- Runtime state: browser `localStorage` through feature services and extractors.
- Backend: lightweight Node HTTP AI gateway in `server/ai-gateway.mjs`.
- AI frontend boundary: `services/AIGatewayClient.ts` calls `/api/ai`.
- Vite proxy: `/api/ai` routes to the local gateway on port 8787.
- Data model: TypeScript interfaces in `types.ts`; no PostgreSQL schema is present in this local app.

## Existing Routes

- `/`: dashboard
- `/roadmap`: roadmap timeline
- `/tracker`: lecture/tracker workflow
- `/pyq-tracker`: PYQ execution tracker
- `/strategy`: strategy view
- `/focus`: live focus and protocol timer
- `/health`: health, nutrition, SKY practice, wellness guidance
- `/speaking`: speaking coach
- `/tests`: test performance dashboard
- `/revision`: revision control room
- `/mentor`: AI mentor chat
- `/analytics`: AI analytics dashboard

## Preserved Features

- Personalized dashboard and progress cards.
- Roadmap/timeline view.
- Lecture and topic tracker.
- PYQ execution tracker.
- Test performance analytics.
- Revision dashboard.
- AI mentor and analytics surfaces.
- Live focus timer, camera monitor UI, focus protocol state, distraction events.
- Health dashboard, food/diet guidance, wellness alerts, meditation challenge.
- Speaking coach, transcript analysis, milestones, practice logs.

## AI Integration Before Migration

The app had browser-facing Gemini-era AI wiring in several feature paths. That exposed provider-specific assumptions directly in React components and service code.

## AI Integration After Current Phase

- `server/ai-gateway.mjs` provides an OpenAI-compatible Nemotron provider boundary.
- Server-side environment variables are `NEMOTRON_API_BASE_URL`, `NEMOTRON_API_KEY`, and `NEMOTRON_MODEL`.
- Browser code calls only the local gateway client and does not receive provider secrets.
- `AIServiceHub`, health analysis, speaking coach, focus coaching, and voice assistant now route through the gateway where applicable.
- Local deterministic fallback behavior remains for unavailable provider responses.
- Focus camera processing keeps raw frames in the browser and sends only compact structured events when coaching is requested.

## Implemented AI-Native Building Blocks

- AI Gateway client.
- Nemotron provider wrapper.
- Basic model config and public status endpoint.
- Rate limit, prompt length limit, short response cache, and basic metrics.
- Prompt registry.
- Tool registry.
- Student state snapshot engine.
- Orchestrator prompt builder for mentor, planner, roadmap, test, and mistake intents.

## Planned But Not Yet Implemented

- PostgreSQL persistence and migrations.
- Authentication, RBAC, JWT, OAuth, and server-side user isolation.
- RAG, embeddings, vector database, uploaded document storage.
- PDF/image OCR and document intelligence.
- Database-backed AI memory.
- Agent-controlled state mutations with confirmation flows.
- Evaluation datasets and regression evaluation runner.
- Production observability pipeline.
- Realtime backend speech/vision bridge.

## Technical Debt And Risks

- The app is localStorage-first, not database-backed.
- The gateway is intentionally minimal and should move behind a production backend before real deployment.
- Live Nemotron behavior is unverified until valid server-side endpoint variables are supplied.
- Browser speech recognition depends on browser support.
- The production bundle is currently large and would benefit from route-level code splitting.
- Existing visual/UI code contains older generated text and mojibake characters in some labels.

## Recommended Migration Order

1. Keep Phase 1 stable: AI Gateway, provider config, frontend proxy, and local fallback behavior.
2. Add a backend application layer before database writes or agent state mutations.
3. Introduce PostgreSQL models and migrations for AI runs, conversations, messages, memory, documents, and state events.
4. Move tool execution behind authenticated backend services.
5. Add document intelligence and RAG.
6. Add planner, roadmap, test, and mistake agents with schema validation and confirmation previews.
7. Add evals and observability before broadening automated actions.
