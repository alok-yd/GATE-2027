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
const STORE_NAME = 'attachments';
const DATABASE_VERSION = 1;

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mentor_attachment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support secure local image storage.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the AI Mentor attachment store.'));
    request.onblocked = () => reject(new Error('AI Mentor image storage is blocked by another browser tab. Close the other tab and retry.'));
  });

export const saveMentorAttachment = async (
  blob: Blob,
  name: string,
  mimeType: string,
  kind: AttachmentKind
): Promise<MentorStoredAttachment> => {
  const id = createId();
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        id,
        blob,
        name,
        mimeType,
        kind,
        createdAt: new Date().toISOString(),
      } satisfies StoredAttachmentRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save this image.'));
      transaction.onabort = () => reject(transaction.error || new Error('Image storage was interrupted.'));
    });
  } finally {
    database.close();
  }

  return { id, name, mimeType, kind };
};

export const readMentorAttachment = async (id: string): Promise<Blob | null> => {
  if (!id) return null;
  const database = await openDatabase();

  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => {
        const record = request.result as StoredAttachmentRecord | undefined;
        resolve(record?.blob instanceof Blob ? record.blob : null);
      };
      request.onerror = () => reject(request.error || new Error('Could not load the saved image.'));
    });
  } finally {
    database.close();
  }
};

export const deleteMentorAttachment = async (id: string): Promise<void> => {
  if (!id) return;
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not remove the saved image.'));
      transaction.onabort = () => reject(transaction.error || new Error('Image removal was interrupted.'));
    });
  } finally {
    database.close();
  }
};

export const deleteMentorAttachments = async (ids: string[]): Promise<void> => {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      uniqueIds.forEach((id) => store.delete(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not remove this conversation’s saved images.'));
      transaction.onabort = () => reject(transaction.error || new Error('Image cleanup was interrupted.'));
    });
  } finally {
    database.close();
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
