<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Achiever GATE 2027 Prep Tracker

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set the server-side `NEMOTRON_API_BASE_URL`, `NEMOTRON_API_KEY`, and `NEMOTRON_MODEL` values.
3. Run the frontend and AI gateway together:
   `npm run dev:full`
4. Or run them separately:
   `npm run dev:api`
   `npm run dev`

## AI mentor features

- `/mentor` opens the AI mentor chat for concepts, problems, AIR forecast, and study plans.
- `/analytics` opens smart alerts, weakness ROI, AIR prediction, and mock score tracking.
- `/tests` opens the AIR-1 test performance dashboard with score trajectory and test logs.
- `/revision` opens the AIR-1 revision control room from the master planner.
- If the Nemotron endpoint is not configured or unavailable, the app keeps local deterministic fallbacks for existing study, health, focus, and speaking features.
