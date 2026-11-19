import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { cloudAuth, cloudDb, commitCloudSyncableRecordsNow, flushCloudSyncWritesNow } from '../CloudSyncService';
import { getActiveUserStorageUid } from '../UserScopedStorage';
import { StorageService } from '../../components/focus/services/storage';
import { listDocuments } from '../AINativeServices';

export type StudyHoursSource = 'ai_mentor' | 'manual' | 'imported_json' | 'imported_pdf';
export type StudyHoursImportMode = 'replace' | 'skip_existing';
export type ImportedStudyRecordType = 'session' | 'daily_total' | 'unknown';

export interface StudyHoursInputRecord {
  date: string;
  hours: number;
  minutes?: number;
  subject?: string;
  topic?: string;
  recordType?: ImportedStudyRecordType;
  sourceDetails?: string;
}

interface DailyTargetRecord {
  date: string;
  subject?: string;
  goalDescription?: string;
  hoursStudied?: number;
  completionPercentage?: number;
  hoursStudiedSource?: 'ai_focus' | 'manual';
  manualHoursStudied?: number;
  aiFocusVerifiedSeconds?: number;
  studyHoursOverride?: {
    source: StudyHoursSource;
    sourceDetails: string;
    importedAt: string;
    importId?: string;
    verifiedSecondsAtImport: number;
    subjectBreakdown?: Array<{ subject: string; minutes: number; topic?: string }>;
  };
  [key: string]: unknown;
}

interface NormalizedStudyRecord {
  date: string;
  totalMinutes: number;
  totalHours: number;
  subjectBreakdown: Array<{ subject: string; minutes: number; topic?: string }>;
  sourceDetails: string;
  recordType: ImportedStudyRecordType;
}

interface PreviewRow extends NormalizedStudyRecord {
  previousHours: number;
  action: 'insert' | 'update' | 'skip';
  existingRecord: boolean;
}

interface StoredImportPreview {
  id: string;
  uid: string;
  createdAt: string;
  expiresAt: number;
  source: StudyHoursSource;
  mode: StudyHoursImportMode;
  rows: PreviewRow[];
  invalidRecords: Array<{ index: number; reason: string }>;
  conflicts: string[];
  status: 'pending' | 'committed';
}

const DAILY_KEY_PREFIX = 'gate_daily_target_';
const AUDIT_KEY = 'gate_daily_study_hours_audit_v1';
// Pending confirmation state is private per-UID browser storage, not shared cloud data.
const PENDING_IMPORT_KEY = '__achiever_study_hours_pending_import_v1';
const MAX_IMPORT_SOURCE_ROWS = 2000;
const MAX_IMPORT_DATES = 365;
const MAX_AUDIT_ROWS = 500;
const PREVIEW_TTL_MS = 30 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const currentUid = (): string => {
  const user = cloudAuth.currentUser;
  if (!user?.uid) {
    throw new Error('Sign in to your ACHIEVER account before managing Lecture Tracker study hours.');
  }
  if (getActiveUserStorageUid() !== user.uid) {
    throw new Error('The private storage for this Firebase account is not active. Refresh ACHIEVER and retry.');
  }
  return user.uid;
};

const todayInKolkata = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day;
};

const parseDocumentDate = (input: unknown): string | null => {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const value = String(input).trim();
  if (isValidIsoDate(value)) return value;

  let match = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  if (match) {
    const [, day, month, year] = match;
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  const monthMap: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  };
  match = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\.?[,]?\s+(20\d{2})\b/);
  if (match) {
    const [, day, monthName, year] = match;
    const month = monthMap[monthName.toLowerCase()];
    if (!month) return null;
    const iso = `${year}-${month}-${day.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  match = value.match(/\b([A-Za-z]+)\s+(\d{1,2})[,]?\s+(20\d{2})\b/);
  if (match) {
    const [, monthName, day, year] = match;
    const month = monthMap[monthName.toLowerCase()];
    if (!month) return null;
    const iso = `${year}-${month}-${day.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
};

const parseDurationTextMinutes = (value: unknown): number | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 60);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 60);

  // Clock-style values such as "1:30" or "01:30:00" mean HH:MM[:SS].
  const clock = text.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (clock) {
    const seconds = Number(clock[3] || 0);
    return Number(clock[1]) * 60 + Number(clock[2]) + (seconds >= 30 ? 1 : 0);
  }

  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const minutes = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (!hours && !minutes) return null;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0));
};

const parseMinuteField = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 24 * 60 ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const minutes = Number(text);
    return Number.isInteger(minutes) && minutes <= 24 * 60 ? minutes : null;
  }
  const duration = parseDurationTextMinutes(text);
  return duration != null && duration <= 24 * 60 ? duration : null;
};

const durationMinutesFromInput = (hoursValue: unknown, minutesValue: unknown): number | null => {
  const hours = Number(hoursValue);
  const minutes = minutesValue == null || minutesValue === '' ? 0 : Number(minutesValue);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0) return null;
  if (!Number.isInteger(minutes) || minutes > 59) return null;
  if (!Number.isInteger(hours) && minutes > 0) return null;
  const total = Math.round(hours * 60) + minutes;
  if (total > 24 * 60) return null;
  return total;
};

const roundHours = (minutes: number): number => Number((minutes / 60).toFixed(4));
const dailyKey = (date: string): string => `${DAILY_KEY_PREFIX}${date}`;

const getDailyTarget = (date: string): DailyTargetRecord | null => {
  const value = safeParse<unknown>(localStorage.getItem(dailyKey(date)), null);
  return isRecord(value) ? value as DailyTargetRecord : null;
};

const getCloudDailyTarget = async (date: string): Promise<DailyTargetRecord | null | undefined> => {
  const key = dailyKey(date);
  const reference = doc(collection(cloudDb, 'users', currentUid(), 'appData'), encodeURIComponent(key));
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return undefined;
  const root = snapshot.data();
  if (root.deleted) return null;

  let rawValue = typeof root.value === 'string' ? root.value : '';
  if (root.chunked) {
    const chunkSnapshot = await getDocs(collection(reference, 'chunks'));
    const chunks = chunkSnapshot.docs
      .sort((left, right) => Number(left.data().index) - Number(right.data().index))
      .map((chunk) => String(chunk.data().value ?? ''));
    const expectedChunks = Number(root.chunkCount);
    if (!Number.isInteger(expectedChunks) || expectedChunks < 1 || chunks.length !== expectedChunks) {
      throw new Error(`The existing daily record for ${date} is incomplete in Firebase. Refresh cloud sync before changing it.`);
    }
    rawValue = chunks.join('');
  }
  if (!rawValue) {
    throw new Error(`The existing daily record for ${date} has no readable value in Firebase. No update was made.`);
  }
  const parsed = safeParse<unknown>(rawValue, null);
  if (!isRecord(parsed)) {
    throw new Error(`The existing daily record for ${date} is not valid JSON in Firebase. No update was made.`);
  }
  return parsed as DailyTargetRecord;
};

const getManualDisplayedHours = (record: DailyTargetRecord | null): number => {
  if (!record || record.hoursStudiedSource !== 'manual') return 0;
  const value = Number(record.manualHoursStudied ?? record.hoursStudied ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

const getDisplayedHours = (record: DailyTargetRecord | null, verifiedSeconds: number): number => {
  if (record?.hoursStudiedSource === 'manual') return getManualDisplayedHours(record);
  return Number((verifiedSeconds / 3600).toFixed(4));
};

const getAuditRows = (): Array<Record<string, unknown>> => {
  const parsed = safeParse<unknown>(localStorage.getItem(AUDIT_KEY), []);
  return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
};

const getCloudAuditRows = async (uid: string): Promise<Array<Record<string, unknown>>> => {
  const reference = doc(collection(cloudDb, 'users', uid, 'appData'), encodeURIComponent(AUDIT_KEY));
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return getAuditRows();
  if (snapshot.data().deleted) return [];

  const root = snapshot.data();
  let rawValue = typeof root.value === 'string' ? root.value : '';
  if (root.chunked) {
    const chunkSnapshot = await getDocs(collection(reference, 'chunks'));
    const chunks = chunkSnapshot.docs
      .sort((left, right) => Number(left.data().index) - Number(right.data().index))
      .map((chunk) => String(chunk.data().value ?? ''));
    const expectedChunks = Number(root.chunkCount);
    if (!Number.isInteger(expectedChunks) || expectedChunks < 1 || chunks.length !== expectedChunks) {
      throw new Error('The Lecture Tracker study-hour audit history is incomplete in Firebase. Refresh cloud sync before modifying it.');
    }
    rawValue = chunks.join('');
  }
  const parsed = safeParse<unknown>(rawValue, null);
  if (!Array.isArray(parsed)) {
    throw new Error('The Lecture Tracker study-hour audit history is unreadable in Firebase. No update was made.');
  }
  return parsed.filter(isRecord);
};

const makeAuditEntry = (input: {
  id: string;
  date: string;
  source: StudyHoursSource;
  sourceDetails: string;
  previousHours: number;
  newHours: number;
  previousSource: string;
  importId?: string;
  timestamp: string;
}) => ({
  ...input,
  sourceDetails: input.sourceDetails.slice(0, 180),
  action: input.previousSource === 'missing' ? 'insert' : 'update',
  note: 'Historical whole-day total override. AI Focus verified-time ledger remains unchanged.',
});

const verifyCloudAuditEntries = async (uid: string, expectedIds: string[]): Promise<boolean> => {
  const reference = doc(collection(cloudDb, 'users', uid, 'appData'), encodeURIComponent(AUDIT_KEY));
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return false;
  const root = snapshot.data();
  if (root.deleted) return false;

  let rawValue = typeof root.value === 'string' ? root.value : '';
  if (root.chunked) {
    const chunkSnapshot = await getDocs(collection(reference, 'chunks'));
    const chunks = chunkSnapshot.docs
      .sort((left, right) => Number(left.data().index) - Number(right.data().index))
      .map((chunk) => String(chunk.data().value ?? ''));
    const expectedChunks = Number(root.chunkCount);
    if (!Number.isInteger(expectedChunks) || expectedChunks < 1 || chunks.length !== expectedChunks) return false;
    rawValue = chunks.join('');
  }
  const entries = safeParse<unknown>(rawValue, null);
  if (!Array.isArray(entries)) return false;
  return expectedIds.every((id) => entries.some((entry) => isRecord(entry) && entry.id === id));
};

const verifyCloudRecord = async (
  uid: string,
  date: string,
  expectedMinutes?: number
): Promise<{ date: string; exists: boolean; verified: boolean; savedHours: number | null; message: string }> => {
  const key = dailyKey(date);
  const snapshot = await getDoc(doc(collection(cloudDb, 'users', uid, 'appData'), encodeURIComponent(key)));
  if (!snapshot.exists()) {
    return { date, exists: false, verified: false, savedHours: null, message: 'No corresponding cloud record exists.' };
  }
  const data = snapshot.data();
  if (data.deleted) {
    return { date, exists: false, verified: false, savedHours: null, message: 'The cloud record is marked deleted.' };
  }
  let rawValue = typeof data.value === 'string' ? data.value : '';
  if (data.chunked) {
    const chunkSnapshot = await getDocs(collection(snapshot.ref, 'chunks'));
    const chunks = chunkSnapshot.docs
      .sort((left, right) => Number(left.data().index) - Number(right.data().index))
      .map((chunk) => String(chunk.data().value ?? ''));
    const expectedChunks = Number(data.chunkCount);
    if (!Number.isInteger(expectedChunks) || expectedChunks < 1 || chunks.length !== expectedChunks) {
      return { date, exists: true, verified: false, savedHours: null, message: 'The cloud record is incomplete because one or more chunks are missing.' };
    }
    rawValue = chunks.join('');
  }
  if (!rawValue) {
    return { date, exists: true, verified: false, savedHours: null, message: 'The cloud record has no readable JSON value.' };
  }
  const record = safeParse<unknown>(rawValue, null);
  if (!isRecord(record)) {
    return { date, exists: true, verified: false, savedHours: null, message: 'The saved cloud record is not valid daily study-log JSON.' };
  }
  const hours = Number(record.hoursStudiedSource === 'manual'
    ? (record.manualHoursStudied ?? record.hoursStudied)
    : StorageService.getVerifiedStudySecondsForDate(date) / 3600);
  const savedMinutes = Number.isFinite(hours) ? Math.round(hours * 60) : NaN;
  const verified = expectedMinutes == null
    ? Number.isFinite(savedMinutes)
    : Number.isFinite(savedMinutes) && savedMinutes === expectedMinutes;
  return {
    date,
    exists: true,
    verified,
    savedHours: Number.isFinite(hours) ? Number(hours.toFixed(4)) : null,
    message: verified ? 'Cloud record was read back and matches the requested total.' : 'Cloud record does not match the requested total.',
  };
};

export const getDailyStudyHours = async (input: {
  startDate?: string;
  endDate?: string;
} = {}) => {
  const uid = currentUid();
  const today = todayInKolkata();
  const endDate = input.endDate || today;
  if (!isValidIsoDate(endDate)) {
    throw new Error('Provide a valid endDate in YYYY-MM-DD format.');
  }
  const startDate = input.startDate || (() => {
    const date = new Date(`${endDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 29);
    return date.toISOString().slice(0, 10);
  })();

  if (!isValidIsoDate(startDate) || startDate > endDate) {
    throw new Error('Provide a valid date range in YYYY-MM-DD format, with startDate on or before endDate.');
  }
  if (endDate > today) throw new Error('Future dates are not accepted for historical study-hour records.');
  const rangeDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
  if (rangeDays > 3650) throw new Error('A single history query can cover at most 10 years.');

  const logsByDate = new Map<string, DailyTargetRecord>();
  const localKeys = new Set<string>();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    const match = key.match(/^gate_daily_target_(\d{4}-\d{2}-\d{2})$/);
    if (!match) continue;
    const date = match[1];
    if (date < startDate || date > endDate) continue;
    const value = safeParse<unknown>(localStorage.getItem(key), null);
    if (isRecord(value)) {
      localKeys.add(date);
      logsByDate.set(date, value as DailyTargetRecord);
    }
  }

  // Flush pending daily-target writes in this range before reading Firestore.
  // The cloud copy is canonical; the UID-private browser cache is used only
  // when a date has no corresponding cloud record yet.
  await flushCloudSyncWritesNow(Array.from(localKeys).map(dailyKey));

  const dailyPrefix = DAILY_KEY_PREFIX;
  const cloudQuery = query(
    collection(cloudDb, 'users', uid, 'appData'),
    where('key', '>=', `${dailyPrefix}${startDate}`),
    where('key', '<=', `${dailyPrefix}${endDate}`)
  );
  const cloudSnapshot = await getDocs(cloudQuery);
  const cloudDates = new Set<string>();
  for (const cloudRecordSnapshot of cloudSnapshot.docs) {
    const cloudRecord = cloudRecordSnapshot.data();
    const key = String(cloudRecord.key || '');
    const match = key.match(/^gate_daily_target_(\d{4}-\d{2}-\d{2})$/);
    if (!match) continue;
    const date = match[1];
    if (cloudRecord.deleted) {
      logsByDate.delete(date);
      continue;
    }
    cloudDates.add(date);

    let rawValue = typeof cloudRecord.value === 'string' ? cloudRecord.value : '';
    if (cloudRecord.chunked) {
      const chunkSnapshot = await getDocs(collection(cloudRecordSnapshot.ref, 'chunks'));
      const chunks = chunkSnapshot.docs
        .sort((left, right) => Number(left.data().index) - Number(right.data().index))
        .map((chunk) => String(chunk.data().value ?? ''));
      const expectedChunks = Number(cloudRecord.chunkCount);
      if (!Number.isInteger(expectedChunks) || expectedChunks < 1 || chunks.length !== expectedChunks) {
        throw new Error(`Cloud history for ${date} is incomplete. Reconnect and sync again before relying on this total.`);
      }
      rawValue = chunks.join('');
    }

    const parsed = safeParse<unknown>(rawValue, null);
    if (isRecord(parsed)) {
      // Firestore is authoritative even if a local copy was stale.
      logsByDate.set(date, parsed as DailyTargetRecord);
    }
  }

  const allDates = new Set<string>();
  const dateCursor = new Date(`${startDate}T00:00:00.000Z`);
  for (let offset = 0; offset < rangeDays; offset += 1) {
    allDates.add(dateCursor.toISOString().slice(0, 10));
    dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
  }
  const records = Array.from(allDates)
    .sort()
    .map((date) => {
      const stored = logsByDate.get(date) || null;
      const verifiedSeconds = StorageService.getVerifiedStudySecondsForDate(date);
      const hasVerifiedSessions = verifiedSeconds > 0;
      const hasRecord = Boolean(stored) || hasVerifiedSessions;
      const source = stored?.hoursStudiedSource || (hasVerifiedSessions ? 'ai_focus_ledger_only' : 'missing');
      const manualHours = getManualDisplayedHours(stored);
      const verifiedHours = Number((verifiedSeconds / 3600).toFixed(4));
      const displayedHours = hasRecord ? getDisplayedHours(stored, verifiedSeconds) : null;
      return {
        date,
        totalStudiedHours: displayedHours,
        totalStudiedMinutes: displayedHours == null ? null : Math.round(displayedHours * 60),
        verifiedStudySeconds: verifiedSeconds,
        verifiedStudyHours: verifiedHours,
        manuallyRecordedHours: manualHours,
        importedHistoricalHours: stored?.studyHoursOverride?.source?.startsWith('imported_')
          ? manualHours
          : null,
        storedHoursField: stored && Number.isFinite(Number(stored.hoursStudied))
          ? Number(Number(stored.hoursStudied).toFixed(4))
          : null,
        storedHoursFieldInterpretation: stored?.hoursStudiedSource === 'manual'
          ? 'This field is the active manual/imported whole-day override.'
          : 'This raw legacy field is not used by the current Tracker display. The display uses the separate AI Focus verified-time ledger.',
        studyHoursSource: source,
        sourceDetails: stored?.studyHoursOverride?.sourceDetails || null,
        subject: stored?.subject || null,
        goalDescription: stored?.goalDescription || null,
        hasDailyLog: Boolean(stored),
        hasVerifiedStudySessions: hasVerifiedSessions,
        recordStatus: hasRecord ? 'recorded' : 'missing',
        cloudRecordExists: cloudDates.has(date),
        note: stored?.hoursStudiedSource === 'manual'
          ? 'The displayed daily total uses the saved manual/imported whole-day override. Verified AI Focus time is reported separately and is not added again.'
          : hasVerifiedSessions
            ? 'The displayed daily total uses the AI Focus verified-time ledger. The raw stored hoursStudied field is reported for diagnosis but is not automatically reclassified as manual time.'
            : stored
              ? 'A daily log exists, but the current display uses AI Focus verified time; no verified session time is recorded for this date.'
              : 'No daily log or verified AI Focus session record was found for this date. This is missing data, not proof that no study took place.',
      };
    });

  return {
    uid,
    timezone: 'Asia/Kolkata',
    range: { startDate, endDate, days: rangeDays },
    totals: {
      displayedStudyHours: Number(records.reduce((sum, row) => sum + (row.totalStudiedHours ?? 0), 0).toFixed(2)),
      verifiedStudyHours: Number(records.reduce((sum, row) => sum + row.verifiedStudyHours, 0).toFixed(2)),
      manuallyRecordedHours: Number(records.reduce((sum, row) => sum + row.manuallyRecordedHours, 0).toFixed(2)),
      daysWithRecords: records.filter((row) => row.recordStatus === 'recorded').length,
      missingDays: records.filter((row) => row.recordStatus === 'missing').length,
    },
    records,
    dataPolicy: [
      'The canonical daily targets are read from the authenticated users/{uid}/appData Firestore collection; the private per-user browser cache is used as a fallback for writes that are still syncing.',
      'AI Focus verified time comes only from its persistent verified ledger; imported totals never edit that ledger.',
      'When a manual/imported whole-day total is active, it is displayed as the day total and verified time is shown separately to avoid double-counting.',
      'A missing or unlabelled historical number is not silently reclassified as a verified or manually confirmed duration.',
    ],
  };
};

export const verifyDailyStudyHours = async (input: {
  dates?: string[];
  expectedRecords?: Array<{ date: string; hours: number; minutes?: number }>;
}) => {
  const uid = currentUid();
  const dates = Array.from(new Set([
    ...(input.dates || []),
    ...(input.expectedRecords || []).map((record) => record.date),
  ]));
  if (!dates.length || dates.length > 365) throw new Error('Provide between 1 and 365 dates to verify.');
  const expectedByDate = new Map<string, number>();
  (input.expectedRecords || []).forEach((record) => {
    if (!isValidIsoDate(record.date)) throw new Error(`Invalid verification date: ${record.date}`);
    const minutes = durationMinutesFromInput(record.hours, record.minutes);
    if (minutes == null) throw new Error(`Invalid expected duration for ${record.date}.`);
    expectedByDate.set(record.date, minutes);
  });
  const checks = await Promise.all(dates.map((date) => {
    if (!isValidIsoDate(date)) throw new Error(`Invalid verification date: ${date}`);
    return verifyCloudRecord(uid, date, expectedByDate.get(date));
  }));
  return {
    uid,
    checkedAt: new Date().toISOString(),
    successful: checks.filter((check) => check.verified).length,
    failed: checks.filter((check) => !check.verified).length,
    checks,
  };
};

export const upsertDailyStudyHours = async (input: {
  date: string;
  hours: number;
  minutes?: number;
  source?: StudyHoursSource;
  sourceDetails?: string;
}) => {
  const uid = currentUid();
  const { date } = input;
  if (!isValidIsoDate(date) || date > todayInKolkata()) {
    throw new Error('Enter a valid historical or current date in YYYY-MM-DD format.');
  }
  const totalMinutes = durationMinutesFromInput(input.hours, input.minutes);
  if (totalMinutes == null) {
    throw new Error('Duration must be non-negative, no more than 24 hours, and use integer minutes from 0 to 59.');
  }

  const source = input.source || 'ai_mentor';
  const sourceDetails = String(input.sourceDetails || 'Explicit single-date update requested in AI Mentor.').slice(0, 2000);
  await flushCloudSyncWritesNow([dailyKey(date), AUDIT_KEY]);
  const key = dailyKey(date);
  const cloudPrevious = await getCloudDailyTarget(date);
  const previous = cloudPrevious === undefined ? getDailyTarget(date) : cloudPrevious;
  const verifiedSeconds = StorageService.getVerifiedStudySecondsForDate(date);
  const previousDisplayedHours = getDisplayedHours(previous, verifiedSeconds);
  const now = new Date().toISOString();
  const importId = `single_${date}_${Date.now()}`;
  const totalHours = roundHours(totalMinutes);
  const updated: DailyTargetRecord = {
    ...(previous || {
      date,
      subject: '',
      goalDescription: '',
      completionPercentage: 0,
    }),
    date,
    hoursStudied: totalHours,
    hoursStudiedSource: 'manual',
    manualHoursStudied: totalHours,
    aiFocusVerifiedSeconds: verifiedSeconds,
    studyHoursOverride: {
      source,
      sourceDetails,
      importedAt: now,
      importId,
      verifiedSecondsAtImport: verifiedSeconds,
    },
  };

  const audit = await getCloudAuditRows(uid);
  const nextAudit = [
    ...audit.filter((entry) => entry.id !== `${importId}:${date}`),
    makeAuditEntry({
      id: `${importId}:${date}`,
      date,
      source,
      sourceDetails,
      previousHours: previousDisplayedHours,
      newHours: totalHours,
      previousSource: previous ? String(previous.hoursStudiedSource || 'legacy_or_unlabelled') : 'missing',
      importId,
      timestamp: now,
    }),
  ].slice(-MAX_AUDIT_ROWS);

  await commitCloudSyncableRecordsNow([
    { key, value: JSON.stringify(updated) },
    { key: AUDIT_KEY, value: JSON.stringify(nextAudit) },
  ]);
  const verification = await verifyCloudRecord(uid, date, totalMinutes);
  const auditTrailSaved = await verifyCloudAuditEntries(uid, [`${importId}:${date}`]);
  const fullyVerified = verification.verified && auditTrailSaved;
  return {
    status: fullyVerified ? 'saved_and_verified' : 'verification_failed',
    date,
    previousHours: previousDisplayedHours,
    savedHours: totalHours,
    verifiedStudyHoursPreserved: Number((verifiedSeconds / 3600).toFixed(4)),
    source,
    firebaseUid: uid,
    verification,
    auditTrailSaved,
    message: fullyVerified
      ? 'The Lecture Tracker daily record and its audit entry were written to Firebase and read back successfully.'
      : 'The daily record or its audit entry failed read-back verification. Do not report success.',
  };
};

const normalizeInputRow = (row: StudyHoursInputRecord, index: number): NormalizedStudyRecord => {
  const date = parseDocumentDate(row.date);
  if (!date) throw new Error(`Record ${index + 1}: date must include a valid day, month and year.`);
  if (date > todayInKolkata()) throw new Error(`Record ${index + 1}: future date ${date} is not allowed.`);
  const totalMinutes = durationMinutesFromInput(row.hours, row.minutes);
  if (totalMinutes == null) throw new Error(`Record ${index + 1}: invalid or greater-than-24-hour duration.`);
  return {
    date,
    totalMinutes,
    totalHours: roundHours(totalMinutes),
    subjectBreakdown: row.subject?.trim()
      ? [{ subject: row.subject.trim().slice(0, 100), minutes: totalMinutes, ...(row.topic?.trim() ? { topic: row.topic.trim().slice(0, 160) } : {}) }]
      : [],
    sourceDetails: String(row.sourceDetails || '').trim().slice(0, 500),
    recordType: row.recordType === 'daily_total' || row.recordType === 'session' || row.recordType === 'unknown'
      ? row.recordType
      : 'unknown',
  };
};

export const previewBulkDailyStudyHours = async (input: {
  records: StudyHoursInputRecord[];
  source: StudyHoursSource;
  mode?: StudyHoursImportMode;
  sourceDetails?: string;
}) => {
  const uid = currentUid();
  if (!Array.isArray(input.records) || input.records.length === 0 || input.records.length > MAX_IMPORT_SOURCE_ROWS) {
    throw new Error(`Provide between 1 and ${MAX_IMPORT_SOURCE_ROWS} extracted study rows.`);
  }
  const mode: StudyHoursImportMode = input.mode === 'skip_existing' ? 'skip_existing' : 'replace';
  const invalidRecords: Array<{ index: number; reason: string }> = [];
  const parsedRows: NormalizedStudyRecord[] = [];
  input.records.forEach((row, index) => {
    try {
      if (!isRecord(row)) throw new Error('Record must be an object.');
      parsedRows.push(normalizeInputRow(row, index));
    } catch (error) {
      invalidRecords.push({ index: index + 1, reason: error instanceof Error ? error.message : String(error) });
    }
  });

  const grouped = new Map<string, NormalizedStudyRecord[]>();
  parsedRows.forEach((row) => grouped.set(row.date, [...(grouped.get(row.date) || []), row]));
  if (grouped.size > MAX_IMPORT_DATES) throw new Error(`This import contains more than ${MAX_IMPORT_DATES} unique dates.`);

  const conflicts: string[] = [];
  const rows: PreviewRow[] = [];
  const dates = Array.from(grouped.keys()).sort();

  // Compare with the authenticated user's latest Firestore daily records.
  // Pending local writes are flushed first so they cannot be missed or overwritten.
  await flushCloudSyncWritesNow(dates.map(dailyKey));
  const previousByDate = new Map<string, DailyTargetRecord | null>();
  await Promise.all(dates.map(async (date) => {
    const cloudRecord = await getCloudDailyTarget(date);
    previousByDate.set(date, cloudRecord === undefined ? getDailyTarget(date) : cloudRecord);
  }));

  for (const date of dates) {
    const dayRows = grouped.get(date) || [];
    const explicitTotals = dayRows.filter((row) => row.recordType === 'daily_total');
    let totalMinutes = 0;
    let chosenRows: NormalizedStudyRecord[] = [];

    if (explicitTotals.length) {
      const totalValues = Array.from(new Set(explicitTotals.map((row) => row.totalMinutes)));
      if (totalValues.length > 1) {
        conflicts.push(`${date}: conflicting explicit daily totals (${totalValues.join(', ')} minutes). This date was not staged.`);
        continue;
      }
      totalMinutes = totalValues[0];
      chosenRows = [
        ...explicitTotals.slice(0, 1),
        ...dayRows.filter((row) => row.recordType === 'session' && row.subjectBreakdown.length > 0),
      ];
      if (dayRows.length > explicitTotals.length) {
        conflicts.push(`${date}: an explicit daily total was used; accompanying subject/session rows are retained as a breakdown only and are not added again.`);
      }
    } else {
      const signatures = new Set<string>();
      const uniqueRows = dayRows.filter((row) => {
        const signature = [row.totalMinutes, row.subjectBreakdown[0]?.subject || '', row.subjectBreakdown[0]?.topic || '', row.sourceDetails].join('|');
        if (signatures.has(signature)) return false;
        signatures.add(signature);
        return true;
      });
      chosenRows = uniqueRows;
      totalMinutes = uniqueRows.reduce((sum, row) => sum + row.totalMinutes, 0);
    }

    if (totalMinutes > 24 * 60) {
      conflicts.push(`${date}: combined duration exceeds 24 hours. This date was not staged.`);
      continue;
    }

    const cloudPrevious = previousByDate.get(date);
    const previous = cloudPrevious === undefined ? getDailyTarget(date) : cloudPrevious;
    const verifiedSeconds = StorageService.getVerifiedStudySecondsForDate(date);
    const previousHours = getDisplayedHours(previous, verifiedSeconds);
    const existingRecord = Boolean(previous);
    const shouldSkip = mode === 'skip_existing' && existingRecord;
    rows.push({
      date,
      totalMinutes,
      totalHours: roundHours(totalMinutes),
      subjectBreakdown: chosenRows.flatMap((row) => row.subjectBreakdown),
      sourceDetails: [
        input.sourceDetails || '',
        ...chosenRows.map((row) => row.sourceDetails),
      ].filter(Boolean).join(' | ').slice(0, 2000),
      recordType: explicitTotals.length ? 'daily_total' : chosenRows.length > 1 ? 'session' : chosenRows[0]?.recordType || 'unknown',
      previousHours,
      action: shouldSkip ? 'skip' : existingRecord ? 'update' : 'insert',
      existingRecord,
    });
  }

  if (!rows.length) {
    return {
      status: 'no_valid_records',
      inserted: 0,
      updated: 0,
      skipped: 0,
      invalidRecords,
      conflicts,
      message: 'No valid date-wise study-hour totals were prepared. No tracker data was changed.',
    };
  }

  const now = new Date().toISOString();
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `study_import_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const preview: StoredImportPreview = {
    id,
    uid,
    createdAt: now,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
    source: (['ai_mentor', 'manual', 'imported_json', 'imported_pdf'].includes(input.source) ? input.source : 'manual'),
    mode,
    rows,
    invalidRecords,
    conflicts,
    status: 'pending',
  };
  localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(preview));
  window.dispatchEvent(new Event('storage'));

  return {
    status: 'preview_ready',
    previewId: id,
    expiresInMinutes: 30,
    mode,
    summary: {
      sourceRecords: input.records.length,
      validDateRows: parsedRows.length,
      uniqueDates: rows.length,
      newRecords: rows.filter((row) => row.action === 'insert').length,
      updates: rows.filter((row) => row.action === 'update').length,
      skippedExisting: rows.filter((row) => row.action === 'skip').length,
      totalImportedHours: Number(rows.filter((row) => row.action !== 'skip').reduce((sum, row) => sum + row.totalHours, 0).toFixed(2)),
      invalidRecords: invalidRecords.length,
      conflicts: conflicts.length,
    },
    rows: rows.slice(0, 60).map((row) => ({
      date: row.date,
      previousHours: row.previousHours,
      importedHours: row.totalHours,
      action: row.action,
      subjectBreakdown: row.subjectBreakdown,
      note: row.sourceDetails || undefined,
    })),
    omittedPreviewRows: Math.max(0, rows.length - 60),
    invalidRecords: invalidRecords.slice(0, 40),
    conflicts: conflicts.slice(0, 40),
    confirmationRequired: true,
    message: 'This is a preview only. No Lecture Tracker record has been changed. Ask the user to confirm before calling bulk_upsert_daily_study_hours.',
  };
};

export const commitBulkDailyStudyHours = async (input: { previewId?: string } = {}) => {
  const uid = currentUid();
  const preview = safeParse<unknown>(localStorage.getItem(PENDING_IMPORT_KEY), null);
  if (!isRecord(preview) || preview.uid !== uid || preview.status !== 'pending') {
    throw new Error('No pending study-hour import preview exists for this signed-in account. Create a new preview first.');
  }
  const staged = preview as unknown as StoredImportPreview;
  if (input.previewId && input.previewId !== staged.id) {
    throw new Error('The supplied preview ID does not match the latest pending import for this account.');
  }
  if (staged.expiresAt < Date.now()) {
    throw new Error('The import preview expired. Recreate the preview before confirming.');
  }

  const eligibleRows = staged.rows.filter((row) => row.action !== 'skip');
  if (!eligibleRows.length) {
    localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify({
      ...staged,
      status: 'committed',
    } satisfies StoredImportPreview));
    return {
      status: 'no_changes',
      previewId: staged.id,
      inserted: 0,
      updated: 0,
      skipped: staged.rows.length,
      totalDates: staged.rows.length,
      totalImportedHours: 0,
      verifiedDates: [],
      failedDates: [],
      auditTrailSaved: true,
      message: 'All records were skipped because the selected import mode preserves existing daily records. No database changes were made.',
    };
  }
  if (eligibleRows.length > MAX_IMPORT_DATES) {
    throw new Error('The pending import is larger than the supported 365 daily records.');
  }

  // Flush earlier app edits, then re-read every affected date from the
  // authenticated cloud account. Never apply a stale preview over newer data.
  await flushCloudSyncWritesNow([
    ...eligibleRows.map((row) => dailyKey(row.date)),
    AUDIT_KEY,
  ]);
  const cloudPreviousRecords = new Map<string, DailyTargetRecord | null | undefined>();
  await Promise.all(eligibleRows.map(async (row) => {
    cloudPreviousRecords.set(row.date, await getCloudDailyTarget(row.date));
  }));

  const now = new Date().toISOString();
  const auditRows = await getCloudAuditRows(uid);
  const nextAudit = [...auditRows];
  const auditIds = new Set(nextAudit.map((entry) => String(entry.id || '')));
  const cloudRecords: Array<{ key: string; value: string }> = [];
  const committedRows: Array<{ date: string; hours: number; minutes: number }> = [];
  const latestRows: PreviewRow[] = [];

  for (const row of eligibleRows) {
    const cloudPrevious = cloudPreviousRecords.get(row.date);
    const previous = cloudPrevious === undefined ? getDailyTarget(row.date) : cloudPrevious || null;
    const verifiedSeconds = StorageService.getVerifiedStudySecondsForDate(row.date);
    const previousHours = getDisplayedHours(previous, verifiedSeconds);
    const totalHours = roundHours(row.totalMinutes);
    const importId = staged.id;
    const alreadyApplied = Boolean(
      previous?.studyHoursOverride?.importId === importId &&
      Math.round(getManualDisplayedHours(previous) * 60) === row.totalMinutes
    );
    if (!alreadyApplied && (
      Boolean(previous) !== row.existingRecord ||
      Math.round(previousHours * 60) !== Math.round(row.previousHours * 60)
    )) {
      throw new Error(`The Lecture Tracker record for ${row.date} changed after the preview was created. No bulk records were written. Create and review a fresh preview before confirming again.`);
    }
    const sourceDetails = [row.sourceDetails, `Imported via AI Mentor from ${staged.source}.`].filter(Boolean).join(' ').slice(0, 2000);
    if (!alreadyApplied) {
      const updated: DailyTargetRecord = {
        ...(previous || {
          date: row.date,
          subject: '',
          goalDescription: '',
          completionPercentage: 0,
        }),
        date: row.date,
        hoursStudied: totalHours,
        hoursStudiedSource: 'manual',
        manualHoursStudied: totalHours,
        aiFocusVerifiedSeconds: verifiedSeconds,
        studyHoursOverride: {
          source: staged.source,
          sourceDetails,
          importedAt: now,
          importId,
          verifiedSecondsAtImport: verifiedSeconds,
          subjectBreakdown: row.subjectBreakdown,
        },
      };
      cloudRecords.push({ key: dailyKey(row.date), value: JSON.stringify(updated) });
    }
    const auditId = `${importId}:${row.date}`;
    if (!auditIds.has(auditId)) {
      nextAudit.push(makeAuditEntry({
        id: auditId,
        date: row.date,
        source: staged.source,
        sourceDetails,
        previousHours: alreadyApplied ? row.previousHours : previousHours,
        newHours: totalHours,
        previousSource: alreadyApplied
          ? (row.existingRecord ? 'legacy_or_unlabelled' : 'missing')
          : previous ? String(previous.hoursStudiedSource || 'legacy_or_unlabelled') : 'missing',
        importId,
        timestamp: now,
      }));
      auditIds.add(auditId);
    }
    committedRows.push({ date: row.date, hours: Math.floor(row.totalMinutes / 60), minutes: row.totalMinutes % 60 });
    latestRows.push({ ...row, previousHours: alreadyApplied ? row.previousHours : previousHours });
  }

  const trimmedAudit = nextAudit.slice(-MAX_AUDIT_ROWS);
  cloudRecords.push({ key: AUDIT_KEY, value: JSON.stringify(trimmedAudit) });

  if (cloudRecords.length) {
    await commitCloudSyncableRecordsNow(cloudRecords);
  }

  const verification = await verifyDailyStudyHours({
    expectedRecords: committedRows,
  });
  const verifiedDates = verification.checks.filter((check) => check.verified).map((check) => check.date);
  const auditTrailSaved = await verifyCloudAuditEntries(
    uid,
    committedRows.map((row) => `${staged.id}:${row.date}`)
  );
  const fullyVerified = verification.failed === 0 && auditTrailSaved;
  // Keep the preview pending after a failed read-back so the same confirmed
  // import can be retried idempotently. Mark it committed only after all checks pass.
  localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify({
    ...staged,
    status: fullyVerified ? 'committed' : 'pending',
  } satisfies StoredImportPreview));
  return {
    status: fullyVerified ? 'saved_and_verified' : 'partial_verification_failure',
    previewId: staged.id,
    mode: staged.mode,
    inserted: latestRows.filter((row) => !row.existingRecord).length,
    updated: latestRows.filter((row) => row.existingRecord).length,
    skipped: staged.rows.filter((row) => row.action === 'skip').length,
    totalDates: staged.rows.length,
    totalImportedHours: Number(committedRows.reduce((sum, row) => sum + row.hours + row.minutes / 60, 0).toFixed(2)),
    verifiedDates,
    failedDates: verification.checks.filter((check) => !check.verified),
    auditTrailSaved,
    firebaseUid: uid,
    message: fullyVerified
      ? 'Bulk study-hour records and the complete audit trail were written atomically to the authenticated Firebase user and read back successfully.'
      : 'Some daily records or audit entries did not pass read-back verification. Do not report the entire import as successful.',
  };
};

const JSON_DATE_KEYS = ['date', 'studyDate', 'study_date', 'logDate', 'log_date', 'studyDay', 'study_day'];
const JSON_HOUR_KEYS = [
  'total_studied_hours', 'totalStudiedHours', 'hoursStudied', 'hours_studied',
  'studiedHours', 'studied_hours', 'studyHours', 'study_hours', 'totalHours', 'total_hours', 'hours',
  'durationHours', 'duration_hours', 'duration', 'studyDuration', 'study_duration', 'totalDuration', 'total_duration',
];
const JSON_MINUTE_KEYS = [
  'total_studied_minutes', 'totalStudiedMinutes', 'minutesStudied', 'minutes_studied',
  'studyMinutes', 'study_minutes', 'totalMinutes', 'total_minutes', 'minutes',
  'durationMinutes', 'duration_minutes',
];

const findKey = (object: Record<string, unknown>, keys: string[]) =>
  keys.find((key) => Object.prototype.hasOwnProperty.call(object, key));

const parseStudyRowsFromJson = (rawText: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      validJson: false,
      records: [] as StudyHoursInputRecord[],
      invalidRecords: [{ path: '$', reason: 'The document is not valid JSON.' }],
      message: 'The document is not valid JSON.',
    };
  }
  const records: StudyHoursInputRecord[] = [];
  const invalidRecords: Array<{ path: string; reason: string }> = [];
  let recordLimitReached = false;
  const visit = (value: unknown, path: string): void => {
    if (records.length + invalidRecords.length >= MAX_IMPORT_SOURCE_ROWS) {
      recordLimitReached = true;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    const dateKey = findKey(value, JSON_DATE_KEYS);
    const hourKey = findKey(value, JSON_HOUR_KEYS);
    const minuteKey = findKey(value, JSON_MINUTE_KEYS);
    if (dateKey && (hourKey || minuteKey)) {
      const date = parseDocumentDate(value[dateKey]);
      const hoursValue = hourKey ? parseDurationTextMinutes(value[hourKey]) : 0;
      const minuteValue = minuteKey ? parseMinuteField(value[minuteKey]) : 0;
      if (!date) {
        invalidRecords.push({ path, reason: `Invalid or ambiguous date in field "${dateKey}".` });
        return;
      }
      if (hoursValue == null || minuteValue == null) {
        invalidRecords.push({ path, reason: 'A study duration is missing, negative, or not in a supported hours/minutes format.' });
        return;
      }
      const hourFieldIsWholeDuration = Boolean(hourKey && /(total|studied|study)/i.test(hourKey));
      const minuteFieldIsWholeDuration = Boolean(minuteKey && /(total|studied|study)/i.test(minuteKey));
      // Files often serialize the same whole-day duration in both hours and
      // minutes. Do not add those duplicate representations together.
      const totalMinutes = hourFieldIsWholeDuration && minuteFieldIsWholeDuration
        ? hoursValue
        : hoursValue + minuteValue;
      if (totalMinutes > 24 * 60) {
        invalidRecords.push({ path, reason: 'Combined duration exceeds 24 hours.' });
        return;
      }
      const subjectValue = value.subject ?? value.course ?? value.subjectName ?? value.subject_name;
      const topicValue = value.topic ?? value.chapter ?? value.unit;
      const typeValue = String(value.recordType ?? value.record_type ?? value.type ?? '').toLowerCase();
      const isDailyTotal = /daily.?total|summary|whole.?day|total/i.test(typeValue) ||
        /total_studied|totalStudied|total_hours|totalHours/i.test(hourKey || '') ||
        /total_studied|totalStudied|total_minutes|totalMinutes/i.test(minuteKey || '');
      records.push({
        date,
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
        ...(typeof subjectValue === 'string' ? { subject: subjectValue } : {}),
        ...(typeof topicValue === 'string' ? { topic: topicValue } : {}),
        recordType: isDailyTotal ? 'daily_total' : subjectValue ? 'session' : 'unknown',
        sourceDetails: `JSON row; fields: ${[dateKey, hourKey, minuteKey].filter(Boolean).join(', ')}`,
      });
      return;
    }
    Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
  };
  visit(parsed, '$');
  return {
    validJson: true,
    records,
    invalidRecords,
    recordLimitReached,
    message: recordLimitReached
      ? `The JSON contains more than ${MAX_IMPORT_SOURCE_ROWS} candidate rows. The displayed structured extraction is incomplete; split the source before importing.`
      : records.length
        ? 'Structured study-hour rows were extracted from the JSON document.'
        : 'The JSON is valid, but no objects with both a date and study duration were identified.',
  };
};

export const getUploadedStudyHoursDocument = (input: {
  documentName?: string;
  documentId?: string;
  startOffset?: number;
  maxChars?: number;
} = {}) => {
  currentUid();
  const documents = listDocuments();
  let matches = documents;
  if (input.documentId) matches = matches.filter((document) => document.id === input.documentId);
  if (input.documentName) {
    const requested = input.documentName.trim().toLowerCase();
    matches = matches.filter((document) => document.name.toLowerCase() === requested);
  }
  if (!input.documentId && !input.documentName) {
    return {
      status: 'needs_document_name',
      candidates: documents.slice(0, 12).map((document) => ({ id: document.id, name: document.name, kind: document.kind })),
      message: 'Specify the uploaded study-record PDF or JSON by its exact displayed file name.',
    };
  }
  if (matches.length === 0) {
    return {
      status: 'not_found',
      message: 'No indexed AI Mentor document matched that file name or ID. Reattach the file or check its exact name.',
    };
  }
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      candidates: matches.map((document) => ({ id: document.id, name: document.name, createdAt: document.createdAt })),
      message: 'More than one indexed document has this name. Select the exact document ID.',
    };
  }

  const document = matches[0];
  const isJson = document.name.toLowerCase().endsWith('.json');
  const jsonExtraction = isJson ? parseStudyRowsFromJson(document.text) : null;
  const requestedOffset = Number.isFinite(Number(input.startOffset)) ? Math.floor(Number(input.startOffset)) : 0;
  const startOffset = Math.max(0, Math.min(document.text.length, requestedOffset));
  const maxChars = Math.max(5000, Math.min(40000, Math.floor(Number(input.maxChars) || 30000)));
  const extractedText = document.text.slice(startOffset, startOffset + maxChars);
  const nextOffset = startOffset + extractedText.length;
  return {
    status: document.text.trim() ? 'ready' : 'no_readable_text',
    document: {
      id: document.id,
      name: document.name,
      kind: document.kind,
      extractionConfidence: document.extractionConfidence,
      warnings: document.warnings,
      sourceTextComplete: document.extractionConfidence >= 0.8 &&
        !document.warnings?.some((warning) => /index limit.*truncated|text.*truncated|unreadable|multimodal extraction was unavailable/i.test(warning)) &&
        !/\[unreadable(?: region)?\]/i.test(document.text),
      textLength: document.text.length,
      startOffset,
      extractedText,
      truncated: nextOffset < document.text.length,
      nextOffset: nextOffset < document.text.length ? nextOffset : null,
    },
    ...(jsonExtraction ? {
      json: {
        validJson: jsonExtraction.validJson,
        records: jsonExtraction.records,
        extractedRecordCount: jsonExtraction.records.length,
        invalidRecords: jsonExtraction.invalidRecords,
        recordLimitReached: jsonExtraction.recordLimitReached,
        message: jsonExtraction.message,
      },
    } : {}),
    message: document.warnings?.length
      ? 'Review the extraction warnings before treating ambiguous rows as facts. The original uploaded attachment is retained separately.'
      : 'The indexed document text is ready for source-grounded extraction.',
  };
};
