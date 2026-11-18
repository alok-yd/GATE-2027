# ACHIEVER Firebase Cloud Sync

ACHIEVER Cloud Sync is no longer an optional Google connection. The current authentication flow requires every visitor to sign in with Firebase Authentication using Google or Phone/SMS OTP before the private application is mounted.

Cloud Sync continues to use the existing Cloud Firestore structure:

- Profile: `users/{uid}`
- Local-storage records: `users/{uid}/appData/{recordId}`
- Large-value chunks: `users/{uid}/appData/{recordId}/chunks/{chunkId}`

Firebase Storage holds AI Mentor binary attachments at `users/{uid}/ai-mentor/{attachmentId}`.

## Setup and deployment

Follow the complete current instructions in [FIREBASE_AUTH_AND_MULTI_USER_SETUP.md](./FIREBASE_AUTH_AND_MULTI_USER_SETUP.md), including:

- Enabling Google and Phone providers.
- Firebase authorized domains and SMS region configuration.
- Retaining Firebase App Check and configuring the reCAPTCHA Enterprise Site Key.
- Deploying Firestore owner-only rules and Firebase Storage UID-owner rules.
- Safe handling of device-only legacy records.
- Two-account security checks and cross-device sync verification.

From the repository root, deploy the existing Firestore rules and new Storage rules with:

```bash
npx firebase-tools login
npx firebase-tools deploy --only storage --project gate-2027-a8850
```

## Important architecture note

ACHIEVER uses Cloud Firestore for application synchronization; it does not use Firebase Realtime Database. The existing Firestore `users/{uid}` hierarchy is reused rather than replaced. Local browser storage is partitioned by UID, and server-side Firestore/Storage rules remain the actual ownership boundary.

Legacy browser records without a previous Cloud Sync UID that can prove ownership are quarantined, not assigned to the first person who signs in. Do not copy these records to a new account without independently verifying the legitimate owner.
