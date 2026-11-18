import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage';
import { cloudAuth, cloudStorage } from '../CloudSyncService';
import { getLegacyDataOwnerUid } from '../UserScopedStorage';
import type { MentorStoredAttachment } from './MentorStorage';

type AttachmentKind = MentorStoredAttachment['kind'];

interface StoredAttachmentRecord {
  id: string;
  blob: Blob;
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  createdAt: string;
}

const DATABASE_NAME = 'achiever_ai_mentor_attachment_store';
const LEGACY_DATABASE_NAME = DATABASE_NAME;
const STORE_NAME = 'attachments';
const DATABASE_VERSION = 1;

const requireUid = (): string => {
  const uid = cloudAuth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to ACHIEVER before storing or opening private AI Mentor files.');
  return uid;
};

const userDatabaseName = (uid: string): string =>
  DATABASE_NAME + '__' + encodeURIComponent(uid);

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'mentor_attachment_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

const openDatabase = (databaseName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support local AI Mentor attachment caching.'));
      return;
    }

    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the AI Mentor attachment store.'));
    request.onblocked = () => reject(new Error('AI Mentor file storage is blocked by another browser tab. Close the other tab and retry.'));
  });

const cacheAttachment = async (
  uid: string,
  record: StoredAttachmentRecord
): Promise<void> => {
  const database = await openDatabase(userDatabaseName(uid));
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not cache this AI Mentor file.'));
      transaction.onabort = () => reject(transaction.error || new Error('AI Mentor file caching was interrupted.'));
    });
  } finally {
    database.close();
  }
};

const readFromDatabase = async (databaseName: string, id: string): Promise<Blob | null> => {
  let database: IDBDatabase;
  try {
    database = await openDatabase(databaseName);
  } catch {
    return null;
  }
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => {
        const record = request.result as StoredAttachmentRecord | undefined;
        resolve(record?.blob instanceof Blob ? record.blob : null);
      };
      request.onerror = () => reject(request.error || new Error('Could not read the saved AI Mentor file.'));
    });
  } finally {
    database.close();
  }
};

const removeFromDatabase = async (databaseName: string, ids: string[]): Promise<void> => {
  let database: IDBDatabase;
  try {
    database = await openDatabase(databaseName);
  } catch {
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      ids.forEach((id) => store.delete(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not remove local AI Mentor file cache entries.'));
      transaction.onabort = () => reject(transaction.error || new Error('Local AI Mentor file cleanup was interrupted.'));
    });
  } finally {
    database.close();
  }
};

const userStoragePath = (uid: string, id: string) =>
  'users/' + uid + '/ai-mentor/' + id;

export const saveMentorAttachment = async (
  blob: Blob,
  name: string,
  mimeType: string,
  kind: AttachmentKind
): Promise<MentorStoredAttachment> => {
  const uid = requireUid();
  const id = createId();
  const storagePath = userStoragePath(uid, id);
  const fileRef = ref(cloudStorage, storagePath);

  // Binary files live in the user's Firebase Storage namespace, not only in
  // IndexedDB, so the same authenticated user can retrieve them on other devices.
  await uploadBytes(fileRef, blob, {
    contentType: mimeType || blob.type || 'application/octet-stream',
    customMetadata: {
      uid,
      originalName: name.slice(0, 180),
      attachmentKind: kind,
    },
  });

  try {
    await cacheAttachment(uid, {
      id,
      blob,
      name,
      mimeType,
      kind,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    // The cloud copy is authoritative. An IndexedDB cache failure must not
    // discard an upload that can still be retrieved from the user's account.
    console.warn('[AI Mentor] File uploaded; local cache unavailable.', error);
  }

  return { id, name, mimeType, kind, size: blob.size };
};

export const readMentorAttachment = async (id: string): Promise<Blob | null> => {
  if (!id) return null;
  const uid = requireUid();
  const cached = await readFromDatabase(userDatabaseName(uid), id);
  if (cached) return cached;

  // Old releases kept files in a single browser database. It is readable only
  // when a prior authenticated Cloud Sync UID proves the legacy owner's identity.
  if (getLegacyDataOwnerUid() === uid) {
    const legacy = await readFromDatabase(LEGACY_DATABASE_NAME, id);
    if (legacy) {
      try {
        await cacheAttachment(uid, {
          id,
          blob: legacy,
          name: 'legacy-ai-mentor-attachment',
          mimeType: legacy.type || 'application/octet-stream',
          kind: legacy.type.startsWith('image/') ? 'image' : 'document',
          createdAt: new Date().toISOString(),
        });
      } catch {
        // The verified owner can still read the old browser-local blob.
      }
      return legacy;
    }
  }

  try {
    return await getBlob(ref(cloudStorage, userStoragePath(uid, id)));
  } catch (error) {
    console.warn('[AI Mentor] Cloud attachment could not be retrieved for the signed-in UID.', error);
    return null;
  }
};

export const deleteMentorAttachment = async (id: string): Promise<void> => {
  if (!id) return;
  const uid = requireUid();
  await removeFromDatabase(userDatabaseName(uid), [id]);

  try {
    await deleteObject(ref(cloudStorage, userStoragePath(uid, id)));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'storage/object-not-found') {
      console.warn('[AI Mentor] Cloud file deletion failed for the current account.', error);
    }
  }

  if (getLegacyDataOwnerUid() === uid) {
    await removeFromDatabase(LEGACY_DATABASE_NAME, [id]);
  }
};

export const deleteMentorAttachments = async (ids: string[]): Promise<void> => {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;
  const uid = requireUid();
  await removeFromDatabase(userDatabaseName(uid), uniqueIds);

  await Promise.all(uniqueIds.map(async (id) => {
    try {
      await deleteObject(ref(cloudStorage, userStoragePath(uid, id)));
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'storage/object-not-found') {
        console.warn('[AI Mentor] Cloud file cleanup failed for the current account.', error);
      }
    }
  }));

  if (getLegacyDataOwnerUid() === uid) {
    await removeFromDatabase(LEGACY_DATABASE_NAME, uniqueIds);
  }
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const separator = dataUrl.indexOf(',');
      if (separator < 0) {
        reject(new Error('Could not encode the selected image.'));
        return;
      }
      resolve(dataUrl.slice(separator + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected image.'));
    reader.readAsDataURL(blob);
  });

export const base64ToBlob = (data: string, mimeType: string): Blob => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};
