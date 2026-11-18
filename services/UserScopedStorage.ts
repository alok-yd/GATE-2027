/**
 * Keeps ACHIEVER's existing unprefixed localStorage API while storing every
 * user's values under a UID-specific physical key. The active UID is held in
 * this browser tab's JavaScript context, so another account cannot read the
 * same logical key through a shared unprefixed localStorage slot.
 *
 * Existing pre-authentication records are migrated only when the previous
 * Cloud Sync UID proves their owner. Otherwise they are quarantined.
 */
const ACTIVE_UID_KEY = 'achiever_cloud_sync_active_uid_v1';
const LEGACY_OWNER_KEY = 'achiever_legacy_data_owner_uid_v1';
const CACHE_PREFIX = '__achiever_user_cache_v1__:';
const UNASSIGNED_PREFIX = '__achiever_unassigned_legacy_v1__:';
const LEGACY_BACKUP_PREFIX = '__achiever_legacy_backup_v1__:';
const SYSTEM_KEYS = new Set([
  'achiever_cloud_sync_meta_v1',
  'achiever_cloud_sync_device_id_v1',
  ACTIVE_UID_KEY,
  LEGACY_OWNER_KEY,
]);

const storagePrototype = typeof Storage !== 'undefined' ? Storage.prototype : null;
const nativeGetItem = storagePrototype?.getItem;
const nativeSetItem = storagePrototype?.setItem;
const nativeRemoveItem = storagePrototype?.removeItem;
const nativeClear = storagePrototype?.clear;
const nativeKey = storagePrototype?.key;
const nativeLengthGetter = storagePrototype
  ? Object.getOwnPropertyDescriptor(storagePrototype, 'length')?.get
  : undefined;

let activeStorageUid: string | null = null;
let storageOperation: Promise<void> = Promise.resolve();
let adapterInstalled = false;

const getStorage = (): Storage => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Browser storage is unavailable. ACHIEVER cannot safely switch accounts on this device.');
  }
  if (!nativeGetItem || !nativeSetItem || !nativeRemoveItem || !nativeClear || !nativeKey || !nativeLengthGetter) {
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
  key.startsWith(LEGACY_BACKUP_PREFIX) ||
  key.startsWith('firebase:') ||
  key.startsWith('firebaseLocalStorage') ||
  /app.?check|recaptcha/i.test(key);

const getUserDataEntries = (storage: Storage): Array<[string, string]> =>
  rawEntries(storage).filter(([key]) => !isSystemKey(key));

const userCachePrefix = (uid: string): string =>
  CACHE_PREFIX + encodeURIComponent(uid) + ':';

const legacyBackupPrefix = (uid: string): string =>
  LEGACY_BACKUP_PREFIX + encodeURIComponent(uid) + ':';

const ensureLegacyBackup = (
  storage: Storage,
  uid: string,
  entries: Array<[string, string]>
): void => {
  const backupPrefix = legacyBackupPrefix(uid);
  const alreadyBackedUp = rawEntries(storage).some(([key]) => key.startsWith(backupPrefix));
  if (!alreadyBackedUp && entries.length > 0) {
    writeSnapshot(storage, backupPrefix, entries);
  }
};

const userPhysicalKey = (uid: string, logicalKey: string): string =>
  userCachePrefix(uid) + encodeURIComponent(logicalKey);

const visibleLocalStorageKeys = (storage: Storage): string[] => {
  const prefix = activeStorageUid ? userCachePrefix(activeStorageUid) : '';
  const keys: string[] = [];

  rawEntries(storage).forEach(([physicalKey]) => {
    if (prefix && physicalKey.startsWith(prefix)) {
      try {
        keys.push(decodeURIComponent(physicalKey.slice(prefix.length)));
      } catch {
        // Ignore malformed cache keys rather than exposing physical identifiers.
      }
      return;
    }

    if (
      physicalKey.startsWith(CACHE_PREFIX) ||
      physicalKey.startsWith(UNASSIGNED_PREFIX) ||
      physicalKey.startsWith(LEGACY_BACKUP_PREFIX)
    ) return;
    if (isSystemKey(physicalKey)) keys.push(physicalKey);
  });

  return keys;
};

/**
 * Install before importing application modules. CloudSyncService captures the
 * current Storage methods and therefore also routes its logical key reads and
 * writes through this UID-aware adapter.
 */
export const installUserScopedStorage = (): void => {
  if (adapterInstalled || typeof window === 'undefined' || !storagePrototype) return;
  adapterInstalled = true;

  storagePrototype.getItem = function scopedGetItem(key: string): string | null {
    if (this !== window.localStorage || isSystemKey(String(key))) {
      return nativeGetItem!.call(this, String(key));
    }
    if (!activeStorageUid) return null;
    return rawGet(this, userPhysicalKey(activeStorageUid, String(key)));
  };

  storagePrototype.setItem = function scopedSetItem(key: string, value: string): void {
    const logicalKey = String(key);
    if (this !== window.localStorage || isSystemKey(logicalKey)) {
      nativeSetItem!.call(this, logicalKey, String(value));
      return;
    }
    if (!activeStorageUid) {
      throw new DOMException(
        'Sign in to ACHIEVER before writing private application data.',
        'SecurityError'
      );
    }
    rawSet(this, userPhysicalKey(activeStorageUid, logicalKey), String(value));
  };

  storagePrototype.removeItem = function scopedRemoveItem(key: string): void {
    const logicalKey = String(key);
    if (this !== window.localStorage || isSystemKey(logicalKey)) {
      nativeRemoveItem!.call(this, logicalKey);
      return;
    }
    if (!activeStorageUid) return;
    rawRemove(this, userPhysicalKey(activeStorageUid, logicalKey));
  };

  storagePrototype.clear = function scopedClear(): void {
    if (this !== window.localStorage) {
      nativeClear!.call(this);
      return;
    }
    if (!activeStorageUid) return;
    const prefix = userCachePrefix(activeStorageUid);
    rawEntries(this)
      .filter(([key]) => key.startsWith(prefix))
      .forEach(([key]) => rawRemove(this, key));
  };

  storagePrototype.key = function scopedKey(index: number): string | null {
    if (this !== window.localStorage) return nativeKey!.call(this, index);
    if (!Number.isInteger(index) || index < 0) return null;
    return visibleLocalStorageKeys(this)[index] ?? null;
  };

  Object.defineProperty(storagePrototype, 'length', {
    configurable: true,
    enumerable: true,
    get: function scopedLength(): number {
      if (typeof window === 'undefined' || this !== window.localStorage) {
        return Number(nativeLengthGetter!.call(this));
      }
      return visibleLocalStorageKeys(this).length;
    },
  });
};

const writeSnapshot = (
  storage: Storage,
  prefix: string,
  entries: Array<[string, string]>
): void => {
  const previousKeys = rawEntries(storage)
    .map(([key]) => key)
    .filter((key) => key.startsWith(prefix));

  // Write and verify the complete snapshot before deleting any legacy records.
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

  previousKeys.forEach((key) => {
    if (!written.includes(key)) rawRemove(storage, key);
  });
};

const readSnapshot = (storage: Storage, prefix: string): Array<[string, string]> =>
  rawEntries(storage)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [decodeURIComponent(key.slice(prefix.length)), value]);

const clearActiveUserData = (storage: Storage): void => {
  getUserDataEntries(storage).forEach(([key]) => rawRemove(storage, key));
};

/**
 * The previous Cloud Sync version kept unowned pending writes in one global
 * map. Assign them only to the UID recorded by the old Cloud Sync owner marker;
 * otherwise discard the timestamps so they cannot tombstone another account's
 * Firestore records.
 */
const reconcileLegacyPendingWrites = (storage: Storage, ownerUid: string | null): void => {
  const metaKey = 'achiever_cloud_sync_meta_v1';
  const rawMeta = rawGet(storage, metaKey);
  if (!rawMeta) return;

  try {
    const parsed: unknown = JSON.parse(rawMeta);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const meta = parsed as Record<string, unknown>;
    const pending = meta.pendingBeforeLogin && typeof meta.pendingBeforeLogin === 'object'
      ? meta.pendingBeforeLogin as Record<string, unknown>
      : {};
    const users = meta.users && typeof meta.users === 'object'
      ? meta.users as Record<string, Record<string, { modifiedAt?: number; lastSyncedAt?: number }>>
      : {};

    if (ownerUid) {
      const userMap = users[ownerUid] || {};
      Object.entries(pending).forEach(([key, rawTimestamp]) => {
        const timestamp = Number(rawTimestamp) || 0;
        const previous = userMap[key] || { modifiedAt: 0, lastSyncedAt: 0 };
        userMap[key] = {
          modifiedAt: Math.max(Number(previous.modifiedAt) || 0, timestamp),
          lastSyncedAt: Number(previous.lastSyncedAt) || 0,
        };
      });
      users[ownerUid] = userMap;
    }

    meta.users = users;
    meta.pendingBeforeLogin = {};
    rawSet(storage, metaKey, JSON.stringify(meta));
  } catch (error) {
    console.warn('[ACHIEVER] Legacy pending-write metadata could not be reconciled safely.', error);
  }
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
  // The __unassigned__ owner marker also prevents unknown legacy IndexedDB
  // blobs from being claimed, but by itself does not prove that any files or
  // localStorage records actually exist on this device.
  return rawEntries(getStorage()).some(([key]) => key.startsWith(UNASSIGNED_PREFIX));
};

export const getActiveUserStorageUid = (): string | null => activeStorageUid;

export interface UserStorageActivationResult {
  uid: string;
  quarantinedLegacyData: boolean;
  restoredCachedData: boolean;
}

/**
 * Associate legacy unprefixed data only when the prior Cloud Sync UID is a
 * reliable owner marker. Cached records remain under their UID prefix instead
 * of being copied back to a shared unprefixed key, so multiple tabs cannot
 * expose one account's data to another account.
 */
const activateUserStorageInternal = (uid: string): UserStorageActivationResult => {
  const storage = getStorage();
  const previousUid = rawGet(storage, ACTIVE_UID_KEY);
  const currentEntries = getUserDataEntries(storage);
  let quarantinedLegacyData = false;

  // Pending writes from the old global storage model belong to the previous
  // signed-in UID, never to whichever account happens to log in next.
  reconcileLegacyPendingWrites(storage, previousUid || null);

  if (previousUid === uid) {
    if (!rawGet(storage, LEGACY_OWNER_KEY)) rawSet(storage, LEGACY_OWNER_KEY, uid);
    if (currentEntries.length > 0) {
      ensureLegacyBackup(storage, uid, currentEntries);
      writeSnapshot(storage, userCachePrefix(uid), currentEntries);
      clearActiveUserData(storage);
    }
  } else {
    if (currentEntries.length > 0) {
      if (previousUid) {
        if (!rawGet(storage, LEGACY_OWNER_KEY)) rawSet(storage, LEGACY_OWNER_KEY, previousUid);
        ensureLegacyBackup(storage, previousUid, currentEntries);
        writeSnapshot(storage, userCachePrefix(previousUid), currentEntries);
      } else {
        writeSnapshot(storage, UNASSIGNED_PREFIX, currentEntries);
        quarantinedLegacyData = true;
        if (!rawGet(storage, LEGACY_OWNER_KEY)) rawSet(storage, LEGACY_OWNER_KEY, '__unassigned__');
      }
      clearActiveUserData(storage);
    } else if (previousUid) {
      if (!rawGet(storage, LEGACY_OWNER_KEY)) rawSet(storage, LEGACY_OWNER_KEY, previousUid);
    } else if (!rawGet(storage, LEGACY_OWNER_KEY)) {
      // There may be legacy IndexedDB files even when no localStorage records exist.
      rawSet(storage, LEGACY_OWNER_KEY, '__unassigned__');
    }
  }

  const restoredCachedData = readSnapshot(storage, userCachePrefix(uid)).length > 0;
  rawSet(storage, ACTIVE_UID_KEY, uid);
  activeStorageUid = uid;
  return { uid, quarantinedLegacyData, restoredCachedData };
};

/** Serialize same-tab storage transitions so auth callbacks cannot race. */
export const activateUserStorage = async (uid: string): Promise<UserStorageActivationResult> => {
  if (!uid) throw new Error('A verified Firebase UID is required to activate private storage.');
  let result: UserStorageActivationResult | null = null;
  const operation = storageOperation.then(() => {
    if (activeStorageUid === uid) {
      result = {
        uid,
        quarantinedLegacyData: false,
        restoredCachedData: readSnapshot(getStorage(), userCachePrefix(uid)).length > 0,
      };
      return;
    }
    result = activateUserStorageInternal(uid);
  });
  storageOperation = operation.catch(() => undefined);
  await operation;
  return result || { uid, quarantinedLegacyData: false, restoredCachedData: false };
};

const deactivateUserStorageInternal = (uid: string): void => {
  // User records already live in UID-prefixed keys. Deactivation only removes
  // this tab's logical view; it never copies data into a shared namespace.
  if (activeStorageUid === uid) activeStorageUid = null;
};

export const deactivateUserStorage = async (uid: string): Promise<void> => {
  if (!uid || typeof window === 'undefined') return;
  const operation = storageOperation.then(() => deactivateUserStorageInternal(uid));
  storageOperation = operation.catch(() => undefined);
  await operation;
};
