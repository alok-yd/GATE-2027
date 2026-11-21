# ACHIEVER Community — image and document attachments

## Chat experience

Students can use the paperclip button beside the Community message box to select up to four files for one message. Image attachments appear inline in the conversation; document attachments appear as named, openable file cards. Students can add a text caption or send attachments without a caption.

Supported formats:
- Images: PNG, JPG/JPEG and WEBP.
- Documents: PDF, DOC, DOCX, TXT, Markdown and CSV.
- Maximum size: 10 MB per file; maximum four files per message.

The sender sees a preview before sending and can remove an attachment from the pending list. Failed uploads do not publish a chat message, and successfully uploaded files from a failed send are cleaned up where possible. Deleting a message also attempts to delete that message's attachments.

## Data and access control

Binary files live in Firebase Cloud Storage at:

```text
communityRooms/{roomId}/attachments/{uploaderUid}/{attachmentId}
```

The Firestore chat message contains only attachment metadata and the Storage path. It does not store file bytes or public file URLs.

Storage rules check the requesting user's room membership by calling `firestore.exists()` on:

```text
communityRooms/{roomId}/members/{authenticatedUid}
```

Room members can read attachments for that room. A signed-in member can create files only under their own UID path. Only the original uploader can delete their file. The existing private AI Mentor Storage rules remain unchanged.

Cloud Storage rules that call Firestore require the cross-service permissions prompt to be completed when the Storage rules are first published. Allow the Firebase/Google Cloud prompt to enable the documented service-to-service permission. Do not replace this with public bucket access.

## Important billing prerequisite

The Firebase project screenshot previously showed the Spark plan. As of February 3, 2026, Cloud Storage for Firebase requires the project to be on the Blaze pay-as-you-go plan to access its buckets. The `gate-2027-a8850.firebasestorage.app` bucket therefore cannot be used for message uploads while the project remains on Spark.

The Blaze plan includes the published no-cost Cloud Storage allowance for eligible default buckets, but billing is pay-as-you-go after applicable free quotas. Check the Firebase pricing page and your bucket's location/usage before upgrading. Do not upgrade without reviewing the billing account and spending alerts.

## Deploy rules

1. Upgrade the Firebase project to Blaze if you choose to enable Cloud Storage uploads.
2. In Firebase Console, ensure the default Cloud Storage bucket exists and is active.
3. Publish the updated `storage.rules` file. The existing Storage rules are retained, and the new room-scoped attachment rule is additive.
4. Publish the updated `firestore.rules` file as well; it validates the metadata attached to chat messages.
5. On the first publication, complete the Firebase prompt to authorize Storage Rules to check the Firestore room-membership document.

The repository includes a manual workflow at **Actions → Deploy ACHIEVER Community Storage Rules → Run workflow**. It uses the repository secret `FIREBASE_SERVICE_ACCOUNT_GATE_2027_A8850`; that service account must have the Firebase Rules Admin role. The existing Firestore rules workflow also requires the same configured secret.

Alternatively, from a Firebase CLI-authenticated checkout:

```bash
firebase deploy --only storage --project gate-2027-a8850
firebase deploy --only firestore:rules --project gate-2027-a8850
```

## Verification checklist

- Join a room and attach a JPG/PNG question image.
- Verify it appears inline for another member of the same room.
- Attach a PDF or DOCX and verify the document card opens.
- Try to read the attachment while signed out or as a non-member; access should be denied.
- Verify the upload rejects unsupported formats and files larger than 10 MB.
- Confirm that deleting your own chat message removes its Storage attachments.
