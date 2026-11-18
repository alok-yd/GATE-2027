# ACHIEVER secure authentication and multi-user setup

Firebase project: `gate-2027-a8850`

This release makes Firebase Authentication mandatory before the private ACHIEVER application is mounted. It supports Google sign-in and Firebase Phone Authentication (SMS OTP). Both methods authenticate against the existing named Firebase app `achiever-cloud-sync`, so the user UID is the same identity that owns the existing Cloud Firestore records and Cloud Storage files.

## What the application uses

This repository uses **Cloud Firestore**, not Firebase Realtime Database, for cross-device app-data synchronization:

- Profile: `users/{uid}`
- Synchronized application records: `users/{uid}/appData/{recordId}`
- Optional large-record chunks: `users/{uid}/appData/{recordId}/chunks/{chunkId}`
- AI Mentor binary attachments: Firebase Storage `users/{uid}/ai-mentor/{attachmentId}`

There are no `getDatabase()` / Realtime Database references in the application. No Realtime Database schema or rules were changed or added. The existing Firestore structure is reused; no new user-data tables or destructive database migration are required.

## Firebase Console setup

In Firebase Console, select project `gate-2027-a8850`.

### 1. Enable Authentication providers

Under **Authentication → Sign-in method**:

1. Enable **Google** and configure the project support email.
2. Enable **Phone**.
3. Under **Authentication → Settings → Authorized domains**, make sure the production hostname `gate-2027.onrender.com` and `localhost` are authorized. Add any custom ACHIEVER domain you use.
4. Under **Phone → SMS region policy**, allow the regions in which ACHIEVER users will receive OTPs. Configure quotas and monitoring appropriate for your expected usage.

Phone authentication uses Firebase's own `RecaptchaVerifier` challenge. This is distinct from Firebase App Check's reCAPTCHA Enterprise attestation.

For safe testing, configure Firebase Authentication test phone numbers and OTPs in the console. Do not hardcode test OTPs into the application.

### 2. Keep Firebase App Check enabled

The existing App Check integration remains in place on both the default Firebase app and `achiever-cloud-sync`. It uses `ReCaptchaEnterpriseProvider` and automatic token refresh.

Ensure the production static-site environment includes:

```env
VITE_FIREBASE_APPCHECK_SITE_KEY=YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY
```

The application build must be rebuilt after changing this variable. Do not enable App Check enforcement until production requests have been observed and verified in App Check metrics. Phone Auth's SMS reCAPTCHA challenge is separate and must not be removed.

### 3. Enable Cloud Storage

The AI Mentor file system now stores attachment bytes in the existing project's Firebase Storage bucket under the authenticated UID. In **Storage**, confirm the default bucket is provisioned and available. The Firebase configuration currently references `gate-2027-a8850.firebasestorage.app`.

Publish the repository's `storage.rules` file. These rules permit only the owner UID to read, create, update, or delete objects beneath their own `users/{uid}/ai-mentor` path, enforce a 10 MiB per-file limit, and allow-list supported MIME types.

If Cloud Storage has not been enabled for this Firebase project yet, complete the Firebase Console provisioning and billing/location prompts before testing AI Mentor uploads.

## Verify existing Firestore rules and deploy Storage rules

First, open **Firestore Database → Rules** in Firebase Console and verify that the already-published rules enforce `request.auth.uid == userId` for `users/{userId}`, `appData`, and `chunks`. The repository's existing `firestore.rules` is intentionally unchanged by this authentication PR. Do not replace or weaken the existing Firestore rules.

The only new rules file in this PR is `storage.rules`. From the repository root, with Firebase CLI authenticated to an account authorized for project `gate-2027-a8850`:

```bash
npx firebase-tools login
npx firebase-tools deploy --only storage --project gate-2027-a8850
```

This command deploys only the new owner-scoped `storage.rules`. The existing `firestore.rules` file and its UID-owner checks are intentionally unchanged, as are Authentication providers and App Check enforcement. The Storage rules deployment must complete successfully before claiming production AI Mentor file isolation is enforced.

The existing Firestore rule structure remains unchanged under `users/{uid}`: it already requires `auth.uid == userId` for the user's profile, `appData` records and `chunks`. Storage has a new equivalent UID ownership check for AI Mentor file objects.

## User sign-in and data behaviour

1. Open ACHIEVER. Until Firebase Auth restores a session or the user signs in, the protected application is not rendered.
2. Choose **Continue with Google** or **Continue with Phone Number**.
3. Google uses Firebase `GoogleAuthProvider`; popup-blocked environments use redirect fallback.
4. Phone sign-in uses an invisible Firebase `RecaptchaVerifier`, SMS OTP confirmation, and a resend cooldown. OTP values are held only in the transient UI/auth confirmation flow; they are not written to localStorage, Firestore, or application records.
5. Once authenticated, ACHIEVER creates/merges the minimal profile at `users/{uid}` and activates that UID's private browser-storage namespace.
6. Cloud Sync reads and writes the signed-in UID's existing Firestore documents. Sign out deactivates the private UI and local namespace but does not delete cloud data.

Google and phone accounts are not automatically merged. If Firebase reports that a credential is already associated with another provider/account, sign in with the existing method first. Account linking should be performed only after explicit verification and reauthentication; ACHIEVER does not merge two UIDs or their data automatically.

## Existing data preservation and migration

The old version used unprefixed browser-local keys and an optional Google Cloud Sync identity. A local browser record is not inherently proof of who owns it.

The application therefore applies this rule:

- When the previous Cloud Sync UID marker proves the owner, existing unprefixed records are copied and verified into that UID's local namespace, with a separate local rollback snapshot retained before the old unprefixed records are removed.
- When no previous UID proves ownership, the legacy records are quarantined under a separate unassigned prefix and are not uploaded to, or displayed as, the first person who signs in.
- The old global pending-write timestamps are attached only to a previously recorded owner UID. Unowned pending timestamps are cleared so they cannot accidentally overwrite another account's cloud record.
- Existing Firestore records already stored under a user's UID remain in that user's Firestore path and are reconciled through the existing Cloud Sync process.
- Old AI Mentor IndexedDB blobs are read only when a previous Cloud Sync UID proves the same owner. New attachments are stored in UID-specific IndexedDB caches and in the owner's Firebase Storage path.

The application does not automatically assign unknown legacy data to a new registrant. If legacy data was quarantined, preserve the browser/device and arrange an owner-verification process before any manual migration. Do not copy the unassigned snapshot to an account just because it was the first account to sign in.

## Browser storage isolation

ACHIEVER keeps its existing logical localStorage keys for backward compatibility, but an early-installed adapter stores private values under UID-specific physical keys. It activates the namespace before importing or mounting the application modules. It also deactivates the previous namespace before an account switch and remounts the protected application tree for a new UID.

This is a browser cache boundary, not a replacement for Firebase security rules. Firestore and Storage rules are the actual server-side ownership boundary. Gemini/API keys and browser-only controls remain excluded from Cloud Sync.

The repository's `.gitignore` already excludes `.env`, `.env.local`, and `.env.*` while allowing `.env.example`. No authentication tokens, OTPs, real reCAPTCHA keys, or service-account credentials should be committed.

## Backend API protection

The only repository Node backend is `server/ai-gateway.mjs`. Its private chat, vision, image-generation, document-analysis, and web-search routes now require a Firebase ID token. The server verifies the token signature and project/issuer/expiry claims and does not trust a client-supplied UID. Public health/capability/status endpoints expose only service configuration/health information, not user records.

The AI Mentor client sends the short-lived ID token from the signed-in Firebase session in the Authorization header. Never add Firebase Admin service-account credentials to frontend code.

## Security verification checklist

After deployment, verify with two separate test accounts:

| Test | Expected result |
|---|---|
| Open ACHIEVER signed out | Only authentication screen is shown |
| Google sign-in | Firebase session is restored and the matching UID profile is loaded |
| Phone sign-in | SMS OTP is required; invalid/expired OTP is rejected |
| Read/write `users/A` as UID B | Denied by Firestore rules |
| Read/write Storage `users/A/ai-mentor/*` as UID B | Denied by Storage rules |
| Write a private app key while signed out | Blocked by the local UID-aware adapter |
| Sign out and sign in as another user in the same browser | Previous user's data is not shown |
| Same UID on another device | Cloud Firestore records and Storage attachments are retrieved for that UID |
| Use an AI gateway private endpoint without a Firebase ID token | HTTP 401 |
| Use an AI gateway private endpoint with an expired/invalid token | HTTP 401 |

Use Firebase Rules Playground or the Firebase Emulator Suite for rule checks where possible. A successful TypeScript/Vite build does not prove that production rules have been published or that SMS, Google OAuth, cross-device sync, or two-account isolation have been tested.

## Manual operations that remain

- Enable Google and Phone providers in Firebase Authentication.
- Ensure authorized domains and phone SMS region policy are configured.
- Ensure Firebase Storage is provisioned.
- Add `VITE_FIREBASE_APPCHECK_SITE_KEY` to the Render static app's environment and deploy a new build.
- Confirm the existing Firestore owner-only rules are already published without modification, and deploy the new Firebase Storage rules with the Firebase CLI command above.
- Register a localhost App Check debug token in Firebase Console when doing local development.
- Run real Google/phone sign-in, OTP, two-account isolation, Firestore/Storage-denial, and cross-device smoke tests.

Do not enable Firebase App Check enforcement until the reCAPTCHA Enterprise App Check metrics have been verified. Never publish open Firestore or Storage rules to make a test pass.
