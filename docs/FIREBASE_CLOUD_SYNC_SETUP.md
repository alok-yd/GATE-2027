# ACHIEVER Firebase Cloud Sync setup

ACHIEVER already has a Firebase project configured:

- Project ID: `gate-2027-a8850`
- Cloud data store: Cloud Firestore
- Sign-in: Google through Firebase Authentication
- Storage model: `users/{uid}/appData/{recordId}` and optional `chunks` subcollections

The Cloud Sync control is intentionally optional. ACHIEVER continues using browser storage when no Google account is connected.

## One-time Firebase Console setup

1. Open the Firebase Console and select project `gate-2027-a8850`.
2. Open **Authentication → Sign-in method**. Confirm that **Google** is enabled. The application uses a dedicated named Firebase app for Cloud Sync, separate from the existing Google Calendar authentication session.
3. Under **Authentication → Settings → Authorized domains**, confirm the deployed ACHIEVER hostname is authorized (for example, `gate-2027.onrender.com`) and that `localhost` is present for local development.
4. Open **Firestore Database**. If the project already has its default `(default)` database, use it; do not create a second database just for this feature. If no database exists, create a **Cloud Firestore — Standard edition** database in production mode.
5. Choose the database location carefully. For users in India, Mumbai (`asia-south1`) is a sensible regional choice when available. Firestore's location cannot be changed after provisioning. If the project already has a database, keep its existing location.
6. Publish the security rules from the repository's root-level `firestore.rules` file. Do not use open/test rules.

## Deploy the repository rules with Firebase CLI

From the repository root:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project gate-2027-a8850
```

The root-level `.firebaserc` and `firebase.json` files are already configured for this project. Alternatively, copy the contents of `firestore.rules` into **Firestore Database → Rules** in the Firebase Console and click **Publish**.

The rules allow a signed-in user to read and write only documents under their own Firebase UID. They do not grant public access.

## First use and migration

1. Deploy the latest ACHIEVER application.
2. Open ACHIEVER on the browser/device that currently contains your study records.
3. Use **Cloud Sync → Connect Google account** and choose the Google account you intend to use on all devices.
4. Keep the page open until the Cloud Sync card reports **Cloud sync active**.
5. Open ACHIEVER on another device and connect the same Google account.

On first connection, supported local tracker data is migrated to that user's Firestore space. Subsequent changes are synchronized automatically. Browser storage remains the local working copy and fallback.

For privacy, a browser already linked to one Google UID will refuse to merge that device's local records into a different Google account. This prevents accidental cross-account data mixing.

## What is synchronized

Persistent local-storage keys beginning with `gate_`, `lectures_`, `ai_focus_timer_`, and `achiever_ai_` are synchronized, subject to exclusions. This covers supported tracker data, PYQ/test records, revision state, health and habit logs, speaking practice, AI Native records, and saved AI Mentor conversations.

The following remain local and are not uploaded:

- Gemini/API keys and other credential-like keys.
- The transient `gate_focus_timer_state` control record.
- The live AI Focus active-session control record.

The verified AI Focus study-time ledger is synchronized with a longer debounce interval to avoid a cloud write for every timer tick.

Large local-storage values are split into Firestore chunk documents. Cloud Storage for binary file uploads is not enabled by this integration.

## Free-tier notes

Firestore's Spark free quota is currently documented as 1 GiB stored data, 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day and 10 GiB/month outbound transfer. If a quota is exceeded on Spark, that service can be unavailable for the remainder of the billing cycle. Monitor Firebase usage before storing large imported datasets.

Reference: https://firebase.google.com/docs/firestore/quotas
