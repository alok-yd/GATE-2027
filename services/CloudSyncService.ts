import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
  type Unsubscribe as AuthUnsubscribe,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe as FirestoreUnsubscribe,
} from 'firebase/firestore';
import { firebaseConfig } from '../firebase';

const CLOUD_APP_NAME = 'achiever-cloud-sync';
const cloudApp =
  getApps().find((candidate) => candidate.name === CLOUD_APP_NAME) ??
  initializeApp(firebaseConfig, CLOUD_APP_NAME);

/**
 * A separate named Firebase app keeps Cloud Sync authentication independent
 * from the existing Google Calendar auth session and its calendar permission.
 */
export const cloudAuth = getAuth(cloudApp);
export const cloudDb = getFirestore(cloudApp);

export type CloudSyncStatus =
  | 'local'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface CloudSyncUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface CloudSyncState {
  user: CloudSyncUser | null;
  status: CloudSyncStatus;
  authReady: boolean;
  lastSyncedAt: number | null;
  pendingWrites: number;
  message: string;
}

interface KeySyncMeta {
  modifiedAt: number;
  lastSyncedAt: number;
}

interface LocalSyncMeta {
  pendingBeforeLogin: Record<string, number>;
  users: Record<string, Record<string, KeySyncMeta>>;
}

interface PendingWrite {
  key: string;
  value: string | null;
  modifiedAt: number;
}

interface CloudRecord {
  key: string;
  value?: string;
  deleted?: boolean;
  chunked?: boolean;
  chunkCount?: number;
  updatedAtClient?: number;
  writerId?: string;
}

const originalSetItem: Storage['setItem'] =
  typeof Storage !== 'undefined' ? Storage.prototype.setItem : function () {};
const originalRemoveItem: Storage['removeItem'] =
  typeof Storage !== 'undefined' ? Storage.prototype.removeItem : function () {};
const originalClear: Storage['clear'] =
  typeof Storage !== 'undefined' ? Storage.prototype.clear : function () {};

const META_KEY = 'achiever_cloud_sync_meta_v1';
const DEVICE_ID_KEY = 'achiever_cloud_sync_device_id_v1';
const ACTIVE_UID_KEY = 'achiever_cloud_sync_active_uid_v1';
const SCHEMA_VERSION = 1;
const INLINE_VALUE_LIMIT_BYTES = 450_000;
const CHUNK_CHAR_LIMIT = 100_000;
const NORMAL_WRITE_DEBOUNCE_MS = 800;
const VERIFIED_FOCUS_DEBOUNCE_MS = 15_000;
const VERIFIED_FOCUS_LEDGER_KEY = 'gate_ai_focus_verified_study_time_v1';

const listeners = new Set<(state: CloudSyncState) => void>();
let state: CloudSyncState = {
  user: null,
  status: 'local',
  authReady: false,
  lastSyncedAt: null,
  pendingWrites: 0,
  message: 'Your data is stored on this device. Connect Google to enable cloud sync.',
};

let authUnsubscribe: AuthUnsubscribe | null = null;
let recordsUnsubscribe: FirestoreUnsubscribe | null = null;
let currentUser: User | null = null;
let syncReady = false;
let bootstrapping = false;
let applyingRemote = false;
let authGeneration = 0;
let syncInFlight: Promise<void> | null = null;
let lastSyncedAt = 0;

const pendingWrites = new Map<string, PendingWrite>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readLocalMeta = (): LocalSyncMeta => {
  try {
    const raw = window.localStorage.getItem(META_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(parsed)) return { pendingBeforeLogin: {}, users: {} };
    return {
      pendingBeforeLogin: isRecord(parsed.pendingBeforeLogin)
        ? parsed.pendingBeforeLogin as Record<string, number>
        : {},
      users: isRecord(parsed.users)
        ? parsed.users as Record<string, Record<string, KeySyncMeta>>
        : {},
    };
  } catch {
    return { pendingBeforeLogin: {}, users: {} };
  }
};

const writeLocalMeta = (meta: LocalSyncMeta): void => {
  try {
    originalSetItem.call(window.localStorage, META_KEY, JSON.stringify(meta));
  } catch (error) {
    console.warn('[ACHIEVER Cloud Sync] Could not persist local sync metadata.', error);
  }
};

const getDeviceId = (): string => {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    originalSetItem.call(window.localStorage, DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `device_${Date.now()}`;
  }
};

const deviceId = typeof window !== 'undefined' ? getDeviceId() : 'server';

const isCloudSyncableKey = (key: string): boolean => {
  const allowedPrefix =
    key.startsWith('gate_') ||
    key.startsWith('lectures_') ||
    key.startsWith('ai_focus_timer_') ||
    key.startsWith('achiever_ai_');

  if (!allowedPrefix) return false;

  // API keys, credentials and live timer control state must remain local.
  if (
    /api.?key|access.?token|refresh.?token|secret|password|credential|oauth|cloud.?sync.?meta|device.?id/i.test(key) ||
    key === 'gate_focus_timer_state' ||
    key === 'ai_focus_timer_active_session_v1'
  ) {
    return false;
  }

  return true;
};

const listLocalRecords = (): Map<string, string> => {
  const records = new Map<string, string>();
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !isCloudSyncableKey(key)) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) records.set(key, value);
    }
  } catch (error) {
    console.warn('[ACHIEVER Cloud Sync] Could not enumerate local records.', error);
  }
  return records;
};

const byteLength = (value: string): number =>
  typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(value).length
    : value.length * 2;

const splitIntoChunks = (value: string): string[] => {
  const chunks: string[] = [];
  let current = '';
  for (const character of value) {
    if (current.length + character.length > CHUNK_CHAR_LIMIT && current) {
      chunks.push(current);
      current = '';
    }
    current += character;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
};

const recordIdForKey = (key: string): string =>
  encodeURIComponent(key).replace(/%/g, '_');

const recordsCollection = (uid: string) =>
  collection(cloudDb, 'users', uid, 'appData');

const recordDocument = (uid: string, key: string) =>
  doc(recordsCollection(uid), recordIdForKey(key));

const profileDocument = (uid: string) =>
  doc(cloudDb, 'users', uid);

const safeUpdatedAt = (record: CloudRecord): number =>
  Number.isFinite(Number(record.updatedAtClient))
    ? Number(record.updatedAtClient)
    : 0;

const updateState = (patch: Partial<CloudSyncState>): void => {
  state = { ...state, ...patch, pendingWrites: pendingWrites.size };
  listeners.forEach((listener) => listener(state));
};

const setUserState = (user: User | null): void => {
  updateState({
    user: user
      ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        }
      : null,
  });
};

const userKeyMeta = (uid: string, key: string): KeySyncMeta => {
  const meta = readLocalMeta();
  const stored = meta.users[uid]?.[key];
  return {
    modifiedAt: Number(stored?.modifiedAt) || 0,
    lastSyncedAt: Number(stored?.lastSyncedAt) || 0,
  };
};

const saveKeyMeta = (
  uid: string,
  key: string,
  patch: Partial<KeySyncMeta>
): void => {
  const meta = readLocalMeta();
  const userMap = meta.users[uid] || {};
  const previous = userMap[key] || { modifiedAt: 0, lastSyncedAt: 0 };
  userMap[key] = {
    modifiedAt: patch.modifiedAt ?? previous.modifiedAt,
    lastSyncedAt: patch.lastSyncedAt ?? previous.lastSyncedAt,
  };
  meta.users[uid] = userMap;
  delete meta.pendingBeforeLogin[key];
  writeLocalMeta(meta);
};

const clearPendingTimers = (): void => {
  pendingTimers.forEach((timer) => window.clearTimeout(timer));
  pendingTimers.clear();
  pendingWrites.clear();
};

const scheduleLocalWrite = (write: PendingWrite): void => {
  if (!currentUser) return;
  pendingWrites.set(write.key, write);
  const existing = pendingTimers.get(write.key);
  if (existing) window.clearTimeout(existing);
  const delay = write.key === VERIFIED_FOCUS_LEDGER_KEY
    ? VERIFIED_FOCUS_DEBOUNCE_MS
    : NORMAL_WRITE_DEBOUNCE_MS;
  const timer = window.setTimeout(() => {
    pendingTimers.delete(write.key);
    void flushKey(write.key);
  }, delay);
  pendingTimers.set(write.key, timer);
  updateState({ status: 'syncing' });
};

const markWriteSynced = (uid: string, key: string, modifiedAt: number): void => {
  const meta = readLocalMeta();
  const userMap = meta.users[uid] || {};
  const previous = userMap[key] || { modifiedAt, lastSyncedAt: 0 };
  userMap[key] = {
    modifiedAt: Math.max(previous.modifiedAt, modifiedAt),
    lastSyncedAt: Math.max(previous.lastSyncedAt, modifiedAt),
  };
  meta.users[uid] = userMap;
  delete meta.pendingBeforeLogin[key];
  writeLocalMeta(meta);
  lastSyncedAt = Date.now();
};

const writeCloudRecord = async (
  uid: string,
  key: string,
  value: string | null,
  modifiedAt: number
): Promise<void> => {
  const reference = recordDocument(uid, key);
  const existingSnapshot = await getDoc(reference);
  const previousChunkCount = Number(existingSnapshot.data()?.chunkCount || 0);
  const chunked = value !== null && byteLength(value) > INLINE_VALUE_LIMIT_BYTES;
  const chunks = chunked && value !== null ? splitIntoChunks(value) : [];

  if (chunks.length > 450) {
    throw new Error(`The saved record "${key}" is too large to sync safely.`);
  }

  const batch = writeBatch(cloudDb);
  const chunksCollection = collection(reference, 'chunks');

  if (chunked) {
    chunks.forEach((chunk, index) => {
      batch.set(doc(chunksCollection, String(index).padStart(4, '0')), {
        index,
        value: chunk,
        updatedAtClient: modifiedAt,
      });
    });
  }

  for (let index = chunks.length; index < previousChunkCount; index += 1) {
    batch.delete(doc(chunksCollection, String(index).padStart(4, '0')));
  }

  const rootRecord: Record<string, unknown> = {
    key,
    deleted: value === null,
    chunked,
    chunkCount: chunks.length,
    updatedAtClient: modifiedAt,
    updatedAt: serverTimestamp(),
    writerId: deviceId,
    schemaVersion: SCHEMA_VERSION,
  };

  if (value !== null && !chunked) rootRecord.value = value;
  batch.set(reference, rootRecord, { merge: true });
  await batch.commit();
};

const readCloudRecordValue = async (
  reference: QueryDocumentSnapshot<DocumentData>,
  record: CloudRecord
): Promise<string> => {
  if (!record.chunked) return typeof record.value === 'string' ? record.value : '';
  const chunksSnapshot = await getDocs(collection(reference.ref, 'chunks'));
  const chunks = chunksSnapshot.docs
    .sort((left, right) => Number(left.data().index) - Number(right.data().index))
    .map((chunk) => String(chunk.data().value ?? ''));
  if (record.chunkCount && chunks.length !== record.chunkCount) {
    throw new Error(`Cloud data for "${record.key}" is incomplete. Reconnect and sync again.`);
  }
  return chunks.join('');
};

const applyRemoteRecord = async (
  uid: string,
  reference: QueryDocumentSnapshot<DocumentData>,
  record: CloudRecord,
  allowUploadPendingLocal = true
): Promise<void> => {
  if (!record.key || !isCloudSyncableKey(record.key)) return;

  const localValue = window.localStorage.getItem(record.key);
  const meta = userKeyMeta(uid, record.key);
  const localMeta = readLocalMeta();
  const pendingBeforeLogin = Number(localMeta.pendingBeforeLogin[record.key]) || 0;
  const localModifiedAt = Math.max(meta.modifiedAt, pendingBeforeLogin);
  const remoteUpdatedAt = safeUpdatedAt(record);
  const hasPendingLocalChange =
    localModifiedAt > meta.lastSyncedAt &&
    localModifiedAt > 0;

  if (
    allowUploadPendingLocal &&
    hasPendingLocalChange &&
    localValue !== null &&
    localModifiedAt > remoteUpdatedAt
  ) {
    await writeCloudRecord(uid, record.key, localValue, localModifiedAt);
    markWriteSynced(uid, record.key, localModifiedAt);
    return;
  }

  if (
    allowUploadPendingLocal &&
    hasPendingLocalChange &&
    localValue === null &&
    localModifiedAt > remoteUpdatedAt
  ) {
    await writeCloudRecord(uid, record.key, null, localModifiedAt);
    markWriteSynced(uid, record.key, localModifiedAt);
    return;
  }

  applyingRemote = true;
  try {
    if (record.deleted) {
      originalRemoveItem.call(window.localStorage, record.key);
    } else {
      const value = await readCloudRecordValue(reference, record);
      originalSetItem.call(window.localStorage, record.key, value);
    }
  } finally {
    applyingRemote = false;
  }

  saveKeyMeta(uid, record.key, {
    modifiedAt: remoteUpdatedAt,
    lastSyncedAt: remoteUpdatedAt,
  });
};

const flushKey = async (key: string): Promise<void> => {
  const user = currentUser;
  const write = pendingWrites.get(key);
  if (!user || !write) return;

  try {
    await writeCloudRecord(user.uid, write.key, write.value, write.modifiedAt);
    markWriteSynced(user.uid, write.key, write.modifiedAt);

    if (pendingWrites.get(key)?.modifiedAt === write.modifiedAt) {
      pendingWrites.delete(key);
    }
    updateState({
      status: pendingWrites.size ? 'syncing' : 'synced',
      message: pendingWrites.size
        ? 'Some recent changes are still syncing.'
        : 'All selected ACHIEVER records are synced.',
    });
  } catch (error) {
    console.error('[ACHIEVER Cloud Sync] Write failed.', error);
    updateState({
      status: navigator.onLine ? 'error' : 'offline',
      message: error instanceof Error ? error.message : 'Cloud write failed. Your local data remains safe.',
    });
  }
};

const flushAllPending = async (): Promise<void> => {
  for (const key of Array.from(pendingWrites.keys())) {
    const timer = pendingTimers.get(key);
    if (timer) window.clearTimeout(timer);
    pendingTimers.delete(key);
    await flushKey(key);
  }
};

const mergeInitialCloudData = async (user: User): Promise<void> => {
  const [profileSnapshot, recordsSnapshot] = await Promise.all([
    getDoc(profileDocument(user.uid)),
    getDocs(recordsCollection(user.uid)),
  ]);

  const localRecords = listLocalRecords();
  const remoteByKey = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  recordsSnapshot.docs.forEach((record) => {
    const key = String(record.data().key || '');
    if (key) remoteByKey.set(key, record);
  });

  const isFirstMigration =
    !profileSnapshot.exists() &&
    recordsSnapshot.empty;

  if (isFirstMigration) {
    for (const [key, value] of localRecords) {
      const meta = readLocalMeta();
      const modifiedAt = Math.max(
        Number(meta.pendingBeforeLogin[key]) || 0,
        Number(meta.users[user.uid]?.[key]?.modifiedAt) || 0,
        Date.now()
      );
      await writeCloudRecord(user.uid, key, value, modifiedAt);
      markWriteSynced(user.uid, key, modifiedAt);
    }
  } else {
    for (const remoteSnapshot of recordsSnapshot.docs) {
      const record = remoteSnapshot.data() as CloudRecord;
      await applyRemoteRecord(user.uid, remoteSnapshot, record);
    }

    // Preserve legacy local records that have never existed in the cloud.
    for (const [key, value] of localRecords) {
      if (remoteByKey.has(key)) continue;
      const modifiedAt = Math.max(
        userKeyMeta(user.uid, key).modifiedAt,
        Number(readLocalMeta().pendingBeforeLogin[key]) || 0,
        Date.now()
      );
      // A local key absent from the cloud collection is legacy or was created
      // on this device while offline. Tombstones remain as remote documents.
      await writeCloudRecord(user.uid, key, value, modifiedAt);
      markWriteSynced(user.uid, key, modifiedAt);
    }
  }

  await setDoc(profileDocument(user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    cloudSyncVersion: SCHEMA_VERSION,
    cloudSyncInitialisedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Reconcile local writes that happened while the initial cloud read was in flight.
  const latestMeta = readLocalMeta();
  const latestLocal = listLocalRecords();
  for (const [key, value] of latestLocal) {
    const keyMeta = latestMeta.users[user.uid]?.[key];
    const pending = Math.max(
      Number(keyMeta?.modifiedAt) || 0,
      Number(latestMeta.pendingBeforeLogin[key]) || 0
    );
    if (pending > (Number(keyMeta?.lastSyncedAt) || 0)) {
      await writeCloudRecord(user.uid, key, value, pending);
      markWriteSynced(user.uid, key, pending);
    }
  }
};

const handleRemoteSnapshot = (
  user: User,
  snapshot: { docChanges: () => Array<{ doc: QueryDocumentSnapshot<DocumentData> }> }
): void => {
  snapshot.docChanges().forEach((change) => {
    const reference = change.doc;
    const record = reference.data() as CloudRecord;
    if (!record.key || !isCloudSyncableKey(record.key)) return;

    if (record.writerId === deviceId) {
      markWriteSynced(user.uid, record.key, safeUpdatedAt(record));
      return;
    }

    void applyRemoteRecord(user.uid, reference, record).catch((error) => {
      console.error('[ACHIEVER Cloud Sync] Could not apply remote data.', error);
      updateState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not apply a cloud update.',
      });
    });
  });
};

const startUserSync = async (user: User): Promise<void> => {
  const generation = ++authGeneration;
  if (syncInFlight) {
    // Do not allow an earlier account's initial migration to continue into the next account.
    try {
      await syncInFlight;
    } catch {
      // The next user starts with a clean sync attempt.
    }
  }
  if (currentUser?.uid !== user.uid || generation !== authGeneration) return;

  const activeUid = window.localStorage.getItem(ACTIVE_UID_KEY);
  if (activeUid && activeUid !== user.uid) {
    throw new Error(
      'This browser already contains ACHIEVER records linked to another Google account. Sign in with the original account to avoid mixing private study data.'
    );
  }

  syncReady = false;
  updateState({
    status: navigator.onLine ? 'syncing' : 'offline',
    message: 'Connecting securely to your private ACHIEVER cloud space…',
    lastSyncedAt,
  });

  const task = (async () => {
    await mergeInitialCloudData(user);
    if (currentUser?.uid !== user.uid || generation !== authGeneration) return;

    originalSetItem.call(window.localStorage, ACTIVE_UID_KEY, user.uid);

    if (recordsUnsubscribe) recordsUnsubscribe();
    recordsUnsubscribe = onSnapshot(
      recordsCollection(user.uid),
      (snapshot) => handleRemoteSnapshot(user, snapshot),
      (error) => {
        console.error('[ACHIEVER Cloud Sync] Live sync listener failed.', error);
        updateState({
          status: navigator.onLine ? 'error' : 'offline',
          message: error.message || 'Cloud sync listener failed.',
        });
      }
    );

    syncReady = true;
    await flushAllPending();
    updateState({
      status: pendingWrites.size ? 'syncing' : 'synced',
      message: pendingWrites.size
        ? 'Some recent changes are still syncing.'
        : 'Cloud sync is active for this Google account.',
      lastSyncedAt: lastSyncedAt || Date.now(),
    });
  })();

  syncInFlight = task;
  try {
    await task;
  } finally {
    if (syncInFlight === task) syncInFlight = null;
  }
};

const handleAuthUser = (user: User | null): void => {
  authGeneration += 1;
  syncReady = false;
  currentUser = user;
  clearPendingTimers();

  if (recordsUnsubscribe) {
    recordsUnsubscribe();
    recordsUnsubscribe = null;
  }

  setUserState(user);

  if (!user) {
    updateState({
      status: 'local',
      authReady: true,
      pendingWrites: 0,
      lastSyncedAt: null,
      message: 'Cloud sync is disconnected. Your existing local records remain available.',
    });
    return;
  }

  updateState({
    status: 'connecting',
    authReady: true,
    message: 'Signed in. Preparing your private cloud sync…',
  });
  void startUserSync(user).catch((error) => {
    console.error('[ACHIEVER Cloud Sync] Initial sync failed.', error);
    updateState({
      status: navigator.onLine ? 'error' : 'offline',
      message: error instanceof Error ? error.message : 'Could not connect to Cloud Firestore.',
    });
  });
};

const onLocalStorageMutation = (key: string, value: string | null): void => {
  if (!isCloudSyncableKey(key) || applyingRemote) return;

  const modifiedAt = Date.now();
  const meta = readLocalMeta();

  if (currentUser) {
    const userMap = meta.users[currentUser.uid] || {};
    const previous = userMap[key] || { modifiedAt: 0, lastSyncedAt: 0 };
    userMap[key] = { ...previous, modifiedAt };
    meta.users[currentUser.uid] = userMap;
  } else {
    meta.pendingBeforeLogin[key] = modifiedAt;
  }

  writeLocalMeta(meta);

  if (currentUser && syncReady) {
    scheduleLocalWrite({ key, value, modifiedAt });
  }
};

// Keep the original Storage methods available for applying remote changes without
// generating a new outbound write or a sync loop.
const storageMutationBridge = (
  key: string,
  value: string | null
): void => onLocalStorageMutation(key, value);

const installStorageMutationBridgeOnce = (): void => {
  if (storagePatchInstalled || typeof window === 'undefined' || typeof Storage === 'undefined') return;
  storagePatchInstalled = true;

  Storage.prototype.setItem = function patchedSetItem(key: string, value: string): void {
    originalSetItem.call(this, key, value);
    try {
      if (this === window.localStorage) storageMutationBridge(String(key), String(value));
    } catch {
      // Ignore inaccessible storage contexts.
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key: string): void {
    originalRemoveItem.call(this, key);
    try {
      if (this === window.localStorage) storageMutationBridge(String(key), null);
    } catch {
      // Ignore inaccessible storage contexts.
    }
  };

  Storage.prototype.clear = function patchedClear(): void {
    let keysToDelete: string[] = [];
    try {
      if (this === window.localStorage) keysToDelete = Array.from(listLocalRecords().keys());
    } catch {
      // Ignore inaccessible storage contexts.
    }
    originalClear.call(this);
    keysToDelete.forEach((key) => storageMutationBridge(key, null));
  };
};

const startService = (): void => {
  if (authUnsubscribe || typeof window === 'undefined') return;
  installStorageMutationBridgeOnce();

  authUnsubscribe = onAuthStateChanged(cloudAuth, handleAuthUser);
  window.addEventListener('online', () => {
    if (currentUser) void flushAllPending();
  });
  window.addEventListener('offline', () => {
    updateState({
      status: currentUser ? 'offline' : 'local',
      message: 'You are offline. Changes are saved locally and will sync when connectivity returns.',
    });
  });
};

export const subscribeCloudSync = (
  listener: (nextState: CloudSyncState) => void
): (() => void) => {
  listeners.add(listener);
  listener(state);
  startService();
  return () => listeners.delete(listener);
};

export const getCloudSyncState = (): CloudSyncState => state;

export const signInForCloudSync = async (): Promise<CloudSyncUser> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  updateState({
    status: 'connecting',
    message: 'Opening secure Google sign-in…',
  });

  const credential = await signInWithPopup(cloudAuth, provider);
  return {
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: credential.user.displayName,
    photoURL: credential.user.photoURL,
  };
};

export const signOutFromCloudSync = async (): Promise<void> => {
  await signOut(cloudAuth);
};

export const syncCloudDataNow = async (): Promise<void> => {
  if (!currentUser) throw new Error('Connect your Google account before syncing.');
  updateState({ status: 'syncing', message: 'Syncing recent ACHIEVER changes…' });
  await flushAllPending();
  await mergeInitialCloudData(currentUser);
  updateState({
    status: pendingWrites.size ? 'syncing' : 'synced',
    message: pendingWrites.size
      ? 'Some local changes are still waiting to sync.'
      : 'Manual cloud sync completed.',
    lastSyncedAt: lastSyncedAt || Date.now(),
  });
};

// Exported for verification and small unit tests without exposing stored values.
export const isCloudSyncableStorageKey = isCloudSyncableKey;
