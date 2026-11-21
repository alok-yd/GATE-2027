# ACHIEVER Community — Phase 1

## What is included

The Community route is available at `#/community` and appears in the existing desktop and mobile navigation.

The first release provides:

- Sixteen predefined public study rooms for General, PYQ/mock discussions, core CS subjects, Mathematics and GATE DA.
- Authenticated students can discover rooms and join or leave them.
- Only room members can read that room's member directory and messages.
- Real-time room messages using Firestore listeners.
- Replies that retain a short quoted message preview.
- Sender name and profile photo from the signed-in Firebase Authentication profile.
- Message length limits and deletion by the original sender.
- A latest-60-message window and member-list cap to keep reads bounded.
- A simple community-guidelines notice.

## Where data is stored

This feature uses the existing Firebase project `gate-2027-a8850`, the existing authenticated Cloud Sync Firebase app, and the existing Cloud Firestore database.

```text
communityRooms/{roomId}
  members/{uid}
  messages/{messageId}
```

Room metadata is public to authenticated ACHIEVER accounts. Message and member documents are readable only by users whose own UID has a membership document for that room. A signed-in student can create only their own membership record and can remove only their own membership record. Message authors are taken from the authenticated Firebase user; a sender cannot select another UID.

The room seed IDs and their canonical names, descriptions, categories and sort order are allow-listed in `firestore.rules`. Room metadata cannot be modified or deleted by clients. Existing `users/{uid}/appData` rules remain intact.

## Deploying the feature

A frontend deployment alone is not sufficient. Publish the updated Firestore rules before students try to join or send messages.

From a machine with Firebase CLI installed and authorized access:

```bash
firebase deploy --only firestore:rules --project gate-2027-a8850
```

For the browser-only workflow, use **Actions → Deploy ACHIEVER Firestore Rules → Run workflow** after the repository secret `FIREBASE_SERVICE_ACCOUNT_GATE_2027_A8850` is configured. The service account needs both Firebase Hosting Admin (for Hosting deploys) and Firebase Rules Admin (for this rules workflow).

Then run **Actions → Deploy ACHIEVER to Firebase Hosting → Run workflow** to publish the frontend.

The rules deployment is additive: it retains the existing owner-only private app-data rules and adds access rules only under `communityRooms`.

## Current scope and next phase

Phase 1 is group-room messaging. Direct messages, invitation-only private rooms, file/image attachments, reactions, typing indicators, online presence, push notifications, message search, pinned posts and moderator dashboards are not included yet. They should be added as separately scoped features with corresponding security rules and moderation controls.
