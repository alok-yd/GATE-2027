/**
 * Keeps the existing unprefixed localStorage API used by ACHIEVER modules,
 * while physically separating each account's records on this browser.
 *
 * This is a device-local cache boundary. CloudSyncService remains responsible
 * for syncing eligible logical keys to users/{uid}/appData in Firestore.
 */
const ACTIVE_UID_KEY = 'achiever_cloud_sync_active_uid_v1';
const LEGACY_OWNER_KEY = 'achiever_legacy_data_owner_uid_v1';
const CACHE_PREFIX = '__achiever_user_cache_v1__:';
const UNASSIGNED_PREFIX = '__achiever_unassigned_legacy_v1__:';
const SYSTEM_KEYS = new Set([
  'achiever_cloud_sync_meta_v1',
  'achiever_cloud_sync_device_id_v1',
  ACTIVE_UID_KEY,
  LEGACY_OWNER_KEY,
]);

const nativeStorage = typeof Storage !== 'undefined' ? Storage.prototype : null;
const nativeGetItem = nativeStorage?.getItem;
const nativeSetItem = nativeStorage?.setItem;
const nativeRemoveItem = nativeStorage?.removeItem;
const nativeKey = nativeStorage?.key;
const nativeLengthGetter = nativeStorage
  ? Object.getOwnPropertyDescriptor(nativeStorage, 'length')?.get
  : undefined;

let activeStorageUid: string | null = null;
let storageOperation: Promise<void> = Promise.resolve();

const getStorage = (): Storage => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Browser storage is unavailable. ACHIEVER cannot safely switch accounts on this device.');
  }
  if (!nativeGetItem || !nativeSetItem || !nativeRemoveItem || !nativeKey || !nativeLengthGetter) {
    throw new Error('This browser does not support the required secure account storage operations.');
  }
  return window.localStorage;
};

const rawGet = (storage: Storage, key: string): string | null =>
  nativeGetItem!.call(storage, key);

const rawSet = (storage: Storage, key: string, value: string): void =>
  nativeSetItem!.call(storage, key, value);

const rawRemove = (storage: Storage, key: string): void =>
  nativeRemoveItem!.call(storage, key);

const rawEntries = (storage: Storage): Array<[string, string]> => {
  const length = Number(nativeLengthGetter!.call(storage));
  const entries: Array<[string, string]> = [];
  for (let index = 0; index < length; index += 1) {
    const key = nativeKey!.call(storage, index);
    if (key === null) continue;
    const value = rawGet(storage, key);
    if (value !== null) entries.push([key, value]);
  }
  return entries;
};

const isSystemKey = (key: string): boolean =>
  SYSTEM_KEYS.has(key) ||
  key.startsWith(CACHE_PREFIX) ||
  key.startsWith(UNASSIGNED_PREFIX) ||
  key.startsWith('firebase:') ||
  key.startsWith('firebaseLocalStorage') ||
  /app.?check|recaptcha/i.test(key);

const getUserDataEntries = (storage: Storage): Array<[string, string]> =>
  rawEntries(storage).filter(([key]) => !isSystemKey(key));

const userCachePrefix = (uid: string): string =>
  CACHE_PREFIX + encodeURIComponent(uid) + ':';

const writeSnapshot = (
  storage: Storage,
  prefix: string,
  entries: Array<[string, string]>
): void => {
  const previousKeys = rawEntries(storage)
    .map(([key]) => key)
    .filter((key) => key.startsWith(prefix));

  // Write and verify the complete snapshot before deleting any active records.
  const written: string[] = [];
  try {
    entries.forEach(([logicalKey, value]) => {
      const cacheKey = prefix + encodeURIComponent(logicalKey);
      rawSet(storage, cacheKey, value);
      if (rawGet(storage, cacheKey) !== value) {
        throw new Error('A local record could not be verified after saving.');
      }
      written.push(cacheKey);
    });
  } catch (error) {
    written.forEach((key) => rawRemove(storage, key));
    throw new Error(
      'ACHIEVER could not safely preserve this device’s existing data before switching accounts. ' +
      'Free some browser storage and retry. No active records were intentionally removed. ' +
      (error instanceof Error ? error.message : '')
    );
  }

  // Remove stale cached keys only after the new snapshot has been verified.
  previousKeys.forEach((key) => {
    if (!written.includes(key)) rawRemove(storage, key);
  });
};

const readSnapshot = (storage: Storage, prefix: string): Array<[string, string]> =>
  rawEntries(storage)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [decodeURIComponent(key.slice(prefix.length)), value]);

const clearSnapshot = (storage: Storage, prefix: string): void => {
  rawEntries(storage)
    .filter(([key]) => key.startsWith(prefix))
    .forEach(([key]) => rawRemove(storage, key));
};

const restoreSnapshot = (storage: Storage, uid: string): void => {
  const prefix = userCachePrefix(uid);
  const entries = readSnapshot(storage, prefix);
  entries.forEach(([key, value]) => rawSet(storage, key, value));
  entries.forEach(([key, value]) => {
    if (rawGet(storage, key) !== value) {
      throw new Error('ACHIEVER could not restore all of this account’s local records.');
    }
  });
  clearSnapshot(storage, prefix);
};

const clearActiveUserData = (storage: Storage): void => {
  getUserDataEntries(storage).forEach(([key]) => rawRemove(storage, key));
};

/**
 * Returns the UID, if any, that can be proven as the owner of pre-upgrade
 * attachment blobs in the old non-namespaced IndexedDB store.
 */
export const getLegacyDataOwnerUid = (): string | null => {
  if (typeof window === 'undefined') return null;
  const value = rawGet(getStorage(), LEGACY_OWNER_KEY);
  return value && value !== '__unassigned__' ? value : null;
};

export const hasUnassignedLegacyData = (): boolean => {
  if (typeof window === 'undefined') return false;
  return rawEntries(getStorage()).some(([key]) => key.startsWith(UNASSIGNED_PREFIX));
};

export interface UserStorageActivationResult {
  uid: string;
  quarantinedLegacyData: boolean;
  restoredCachedData: boolean;
}

/**
 * Move the current logical key/value store into the authenticated user's cache
 * before any protected ACHIEVER component is mounted.
 *
 * A prior Cloud Sync ACTIVE_UID_KEY is the only reliable legacy ownership
 * evidence available in the old architecture. With no owner UID, the old data
 * is quarantined and never copied to the first account that signs in.
 */
const activateUserStorageInternal = (uid: string): UserStorageActivationResult => {
  const storage = getStorage();
  const previousUid = rawGet(storage, ACTIVE_UID_KEY);
  const currentEntries = getUserDataEntries(storage);
  let quarantinedLegacyData = false;
  let restoredCachedData = false;

  if (previousUid === uid) {
    // Existing Cloud Sync users retain their already-associated records.
    if (!rawGet(storage, LEGACY_OWNER_KEY)) rawSet(storage, LEGACY_OWNER_KEY, uid);
    if (currentEntries.length > 0) {
      writeSnapshot(storage, userCachePrefix(uid), currentEntries);
    } else if (readSnapshot(storage, userCachePrefix(uid)).length > 0) {
      restoreSnapshot(storage, uid);
      restoredCachedData = true;
    }
  } else {
    if (currentEntries.length > 0) {
      if (previousUid) {
        writeSnapshot(storage, userCachePrefix(previousUid), currentEntries);
      } else {
        // No authenticated owner marker exists; keep this data out of the new account.
        writeSnapshot(storage, UNASSIGNED_PREFIX, currentEntries);
        quarantinedLegacyData = true;
        if (!rawGet(storage, LEGACY_OWNER_KEY)) rawSet(storage, LEGACY_OWNER_KEY, '__unassigned__');
      }
      clearActiveUserData(storage);
    } else if (!previousUid && !rawGet(storage, LEGACY_OWNER_KEY)) {
      // Also quarantine any legacy IndexedDB blobs: there is no reliable owner.
      rawSet(storage, LEGACY_OWNER_KEY, '__unassigned__');
    }

    const cachedEntries = readSnapshot(storage, userCachePrefix(uid));
    if (cachedEntries.length > 0) {
      restoreSnapshot(storage, uid);
      restoredCachedData = true;
    }
  }

  rawSet(storage, ACTIVE_UID_KEY, uid);
  activeStorageUid = uid;
  return { uid, quarantinedLegacyData, restoredCachedData };
};

/** Serialize storage transitions so auth state listeners cannot race each other. */
export const activateUserStorage = async (uid: string): Promise<UserStorageActivationResult> => {
  if (!uid) throw new Error('A verified Firebase UID is required to activate private storage.');
  let result: UserStorageActivationResult | null = null;
  const operation = storageOperation.then(() => {
    if (activeStorageUid === uid) {
      result = { uid, quarantinedLegacyData: false, restoredCachedData: false };
      return;
    }
    result = activateUserStorageInternal(uid);
  });
  storageOperation = operation.catch(() => undefined);
  await operation;
  return result || { uid, quarantinedLegacyData: false, restoredCachedData: false };
};

const deactivateUserStorageInternal = (uid: string): void => {
  const storage = getStorage();
  const activeUid = rawGet(storage, ACTIVE_UID_KEY);
  if (activeUid !== uid) return;
  const entries = getUserDataEntries(storage);
  if (entries.length > 0) {
    writeSnapshot(storage, userCachePrefix(uid), entries);
    clearActiveUserData(storage);
  }
  activeStorageUid = null;
};

export const deactivateUserStorage = async (uid: string): Promise<void> => {
  if (!uid || typeof window === 'undefined') return;
  const operation = storageOperation.then(() => deactivateUserStorageInternal(uid));
  storageOperation = operation.catch(() => undefined);
  await operation;
};
