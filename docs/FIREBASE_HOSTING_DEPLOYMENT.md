# Deploy ACHIEVER to Firebase Hosting

Firebase project: `gate-2027-a8850`  
Hosting site shown in Firebase Console: `gate-2027-a8850`  
Production URL: `https://gate-2027-a8850.web.app`

## Repository configuration

The repository is already linked to Firebase through `.firebaserc`. Its default project alias is `gate-2027-a8850`.

The root `firebase.json` configures Firebase Hosting to publish Vite's production output from `dist/` and rewrites application routes to `/index.html` for React Router. The existing Firestore and Storage rule file references are preserved.

Do not run `firebase init` again for this setup. It is unnecessary and can overwrite the Hosting configuration.


## Deploy without installing VS Code or Firebase CLI

A manual GitHub Actions workflow is included at `.github/workflows/deploy-firebase-hosting.yml`. It builds the app on GitHub-hosted runners and deploys to the live Firebase Hosting channel. You only need a browser for this path.

### One-time secure GitHub setup

1. In Google Cloud Console, select project `gate-2027-a8850` and open **IAM & Admin → Service Accounts**.
2. Create a dedicated service account such as `github-firebase-hosting-deploy`.
3. Grant it the **Firebase Hosting Admin** role. Do not use a personal account key or grant broad Owner access. The Firebase Hosting deploy action requires a service-account JSON key stored as a GitHub Actions secret. See the official action's [service-account instructions](https://github.com/FirebaseExtended/action-hosting-deploy/blob/main/docs/service-account.md).
4. Create a JSON key for that service account and download it. Treat this file as a password: never commit it, paste it into chat, or upload it anywhere except the repository's encrypted Actions secret.
5. Open GitHub repository **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FIREBASE_SERVICE_ACCOUNT_GATE_2027_A8850`
   - Secret: paste the complete JSON key file contents.
6. Optionally add these repository Actions secrets if you need the respective capabilities:
   - `VITE_AI_GATEWAY_URL`: the real public base URL of the existing Render Node AI Gateway (not the frontend URL). The gateway code appends `/api/ai` itself. Leave unset only if you accept that server-backed AI Mentor gateway calls will not be routed from Firebase Hosting.
   - `VITE_FIREBASE_APPCHECK_SITE_KEY`: the reCAPTCHA Enterprise site key registered for this Firebase project, if App Check is configured for production.

### Run the deployment

1. Open the repository's **Actions** tab.
2. Select **Deploy ACHIEVER to Firebase Hosting**.
3. Click **Run workflow**, keep branch `main`, then run it.
4. Wait for the workflow to complete successfully.
5. Open `https://gate-2027-a8850.web.app`.

The workflow deploys Hosting only; it does not publish Firestore or Storage rules, change Authentication providers, or deploy the separate Node AI Gateway. It is deliberately manual-triggered so an unconfigured secret cannot cause every normal push to fail. After the first successful deployment, automatic deployments on pushes can be enabled separately if desired.

## First deployment from Windows PowerShell

Run these commands from the repository root (the directory containing `package.json`):

```powershell
git pull origin main
npm ci
npm install -g firebase-tools
firebase login
firebase projects:list
npm run build
firebase deploy --only hosting --project gate-2027-a8850
```

If Firebase CLI is already installed, skip its global install. Confirm that `gate-2027-a8850` appears in the project list before deploying.

The command deploys **Hosting only**. It does not publish Firestore or Storage rules and does not modify Authentication providers.

## Subsequent deployments

After pulling the latest code:

```powershell
npm ci
npm run build
firebase deploy --only hosting --project gate-2027-a8850
```

## Firebase Authentication authorized domains

In Firebase Console, open **Authentication → Settings → Authorized domains** and add the Firebase Hosting domains that users will open:

- `gate-2027-a8850.web.app`
- `gate-2027-a8850.firebaseapp.com`

Keep any existing production domains that are still used.

## Important: the AI gateway is a separate backend

This repository builds a Vite static frontend. Firebase Hosting serves the generated frontend files; it does not execute `server/ai-gateway.mjs`.

The existing Render blueprint defines a separate Node service named `achiever-ai-gateway`. To keep private AI Mentor routes working from the Firebase-hosted frontend, build with `VITE_AI_GATEWAY_URL` set to the **actual public base URL** of that Render Node service (the app adds `/api/ai` automatically):

```powershell
$env:VITE_AI_GATEWAY_URL = "https://YOUR-ACTUAL-RENDER-GATEWAY-HOST"
npm run build
firebase deploy --only hosting --project gate-2027-a8850
```

Replace the placeholder with the URL shown in the Render dashboard. Do not guess the service URL. The Render gateway must retain its Firebase ID-token verification and allow the Firebase Hosting origins in `ACHIEVER_ALLOWED_ORIGINS`.

Keep provider secrets such as `GEMINI_API_KEY`, `TAVILY_API_KEY`, and `BRAVE_SEARCH_API_KEY` in the **Render Node gateway's environment**, not in `VITE_*` frontend variables or committed files.

If Firebase App Check enforcement is enabled, also provide the registered reCAPTCHA Enterprise site key as `VITE_FIREBASE_APPCHECK_SITE_KEY` at build time. Do not enable enforcement until App Check is correctly configured and production traffic is verified in Firebase Console.

## Verification after deployment

1. Open `https://gate-2027-a8850.web.app`.
2. Test a deep link such as `/mentor` and refresh the page; it should still load the SPA.
3. Test Firebase sign-in and confirm the Hosting domain is authorized.
4. Test Cloud Firestore sync and AI Mentor gateway operations.
5. Inspect browser developer tools for failed API requests and App Check diagnostics.

A successful Hosting deployment proves that the static frontend was published; it does not, by itself, prove that Authentication providers, Firestore/Storage rules, App Check, or the separate AI gateway are configured correctly.
