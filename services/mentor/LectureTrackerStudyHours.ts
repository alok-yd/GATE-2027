import { cloudAuth, getCloudSyncState, persistCloudSyncableRecordsNow, readCloudSyncableRecordsNow } from '../CloudSyncService';
import { getActiveUserStorageUid } from '../UserScopedStorage';
import { StorageService } from '../../components/focus/services/storage';

const DAILY_TARGET_PREFIX = 'gate_daily_target_';
const AUDIT_KEY = 'gate_lecture_tracker_study_hours_audit_v1';
const PENDING_IMPORT_KEY = 'achiever_pending_study_hours_import_v1';
const MAX_IMPORT_DATES = 400;
const MAX_RANGE_DAYS = 366;

export interface StudyHoursBreakdownItem {
  subject?: string;
  topic?: string;
  durationMinutes: number;
  sourceLine?: string;
  sourceName?: string;
}
export interface DailyStudyHoursRecord {
  date: string;
  totalMinutes: number;
  breakdown?: StudyHoursBreakdownItem[];
  sourceDetails?: string;
}
export interface ParsedStudyHoursImport {
  records: DailyStudyHoursRecord[];
  warnings: string[];
  invalidRecords: number;
  duplicateRecords: number;
  sourceName: string;
}
type StudyHoursSource = 'manual' | 'imported';
type ImportUpdateMode = 'upsert' | 'create_missing_only' | 'update_existing_only';
interface StoredDailyTarget extends Record<string, unknown> {
  date?: string;
  hoursStudied?: number;
  hoursStudiedSource?: 'ai_focus' | 'manual' | 'imported';
  manualHoursStudied?: number;
  importedHoursStudied?: number;
}
interface Candidate {
  date: string;
  durationMinutes: number;
  kind: 'daily_total' | 'session';
  subject?: string;
  topic?: string;
  sourceLine?: string;
}
interface PendingImport {
  id: string;
  uid: string;
  createdAt: string;
  expiresAt: number;
  source: string;
  sourceDetails: string;
  updateMode: ImportUpdateMode;
  records: DailyStudyHoursRecord[];
  preview: Array<{
    date: string;
    previousMinutes: number | null;
    importedMinutes: number;
    action: 'Insert' | 'Update' | 'Skip';
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const normaliseKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
  return parsed.getFullYear() === parts[0] && parsed.getMonth() === parts[1] - 1 && parsed.getDate() === parts[2];
};
const parseDateValue = (input: unknown): string | null => {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const value = String(input).trim();
  if (!value) return null;
  let match = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) {
    const result = match[1] + '-' + String(Number(match[2])).padStart(2, '0') + '-' + String(Number(match[3])).padStart(2, '0');
    return validDate(result) ? result : null;
  }
  match = value.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](20\d{2})\b/);
  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    if (day <= 12 && month > 12) { const swap = day; day = month; month = swap; }
    const result = match[3] + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    return validDate(result) ? result : null;
  }
  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
    october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  match = value.match(/\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(20\d{2})\b/i);
  if (match && months[match[2].toLowerCase()]) {
    const result = match[3] + '-' + String(months[match[2].toLowerCase()]).padStart(2, '0') + '-' + String(Number(match[1])).padStart(2, '0');
    return validDate(result) ? result : null;
  }
  match = value.match(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (match && months[match[1].toLowerCase()]) {
    const result = match[3] + '-' + String(months[match[1].toLowerCase()]).padStart(2, '0') + '-' + String(Number(match[2])).padStart(2, '0');
    return validDate(result) ? result : null;
  }
  return null;
};
const parseDurationText = (value: string): number | null => {
  const text = value.toLowerCase();
  let total = 0;
  let found = false;
  const hours = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/g;
  const minutes = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/g;
  let match: RegExpExecArray | null;
  while ((match = hours.exec(text))) { total += Number(match[1]) * 60; found = true; }
  while ((match = minutes.exec(text))) { total += Number(match[1]); found = true; }
  if (!found && !/\bT\d{1,2}:\d{2}/.test(text)) {
    const clock = text.match(/\b(\d{1,2}):([0-5]\d)\b/);
    if (clock) { total = Number(clock[1]) * 60 + Number(clock[2]); found = true; }
  }
  return found && Number.isFinite(total) ? Math.round(total) : null;
};
const numericMinutes = (value: unknown, unit: 'hours' | 'minutes'): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(unit === 'hours' ? value * 60 : value);
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = parseDurationText(value);
  if (parsed !== null) return parsed;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? Math.round(unit === 'hours' ? numeric * 60 : numeric) : null;
};
const getField = (object: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const wanted = normaliseKey(name);
    const found = Object.keys(object).find((key) => normaliseKey(key) === wanted);
    if (found) return { key: found, value: object[found] };
  }
  return null;
};
const durationFromObject = (object: Record<string, unknown>) => {
  const minuteField = getField(object, ['total_studied_minutes', 'totalStudyMinutes', 'studyMinutes', 'durationMinutes', 'studyDurationMinutes', 'totalMinutes', 'minutesStudied']);
  const hourField = getField(object, ['total_studied_hours', 'totalStudiedHours', 'hoursStudied', 'totalHours', 'studyHours', 'hours']);
  const durationField = getField(object, ['studyDuration', 'totalDuration', 'duration']);
  if (minuteField || hourField) {
    const minuteValue = minuteField ? numericMinutes(minuteField.value, 'minutes') : 0;
    const hourValue = hourField ? numericMinutes(hourField.value, 'hours') : 0;
    if (minuteValue === null || hourValue === null || minuteValue < 0 || hourValue < 0) return null;
    const hasSubject = Boolean(getField(object, ['subject', 'course']));
    const totalLike = Boolean((minuteField && /total|studied/i.test(minuteField.key)) || (hourField && /total|studied/i.test(hourField.key)) || !hasSubject);
    return { minutes: minuteValue + hourValue, totalLike };
  }
  if (durationField && typeof durationField.value === 'string') {
    const parsed = parseDurationText(durationField.value);
    if (parsed !== null) return { minutes: parsed, totalLike: Boolean(/total/i.test(durationField.key) || !getField(object, ['subject', 'course'])) };
  }
  return null;
};
const collectJsonCandidates = (
  value: unknown, candidates: Candidate[], warnings: string[],
  inheritedDate: string | null = null, inheritedSubject = '', inheritedTopic = '', path = 'root'
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonCandidates(item, candidates, warnings, inheritedDate, inheritedSubject, inheritedTopic, path + '[' + index + ']'));
    return;
  }
  if (!isRecord(value)) return;
  const dateField = getField(value, ['date', 'studyDate', 'study_date', 'recordDate', 'recordedDate', 'day']);
  const date = (dateField ? parseDateValue(dateField.value) : null) || inheritedDate;
  const subjectField = getField(value, ['subject', 'course']);
  const topicField = getField(value, ['topic', 'chapter', 'unit']);
  const subject = typeof subjectField?.value === 'string' ? subjectField.value.trim() : inheritedSubject;
  const topic = typeof topicField?.value === 'string' ? topicField.value.trim() : inheritedTopic;
  const duration = durationFromObject(value);
  if (duration) {
    if (!date) warnings.push(path + ': a duration was found but no valid date was supplied.');
    else if (duration.minutes < 0 || duration.minutes > 1440) warnings.push(path + ': duration is outside the valid 0–24 hour daily range.');
    else candidates.push({
      date,
      durationMinutes: duration.minutes,
      kind: duration.totalLike ? 'daily_total' : 'session',
      subject: subject || undefined,
      topic: topic || undefined,
      sourceLine: JSON.stringify(value).slice(0, 500),
    });
  }
  Object.entries(value).forEach(([key, child]) => {
    if (child && typeof child === 'object') {
      collectJsonCandidates(child, candidates, warnings, parseDateValue(key) || date, subject, topic, path + '.' + key);
    }
  });
};
const parseTextCandidates = (text: string, warnings: string[]): Candidate[] => {
  const candidates: Candidate[] = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || /^(?:date|subject|topic|study duration|duration|page\s+\d+)$/i.test(line)) return;
    const dateMatch = line.match(/\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/) ||
      line.match(/\b\d{1,2}[/. -]\d{1,2}[/. -]20\d{2}\b/) ||
      line.match(/\b\d{1,2}\s+[a-z]{3,9}\.?[,]?\s+20\d{2}\b/i) ||
      line.match(/\b[a-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2}\b/i);
    if (!dateMatch) return;
    const date = parseDateValue(dateMatch[0]);
    if (!date) { warnings.push('Line ' + (index + 1) + ': an unrecognised or invalid date was found.'); return; }
    const duration = parseDurationText(line);
    if (duration === null) {
      if (/\b(?:study|studied|duration|total)\b/i.test(line)) warnings.push('Line ' + (index + 1) + ': the dated row has no readable duration.');
      return;
    }
    if (duration < 0 || duration > 1440) { warnings.push('Line ' + (index + 1) + ': duration is outside the valid 0–24 hour daily range.'); return; }
    const withoutDate = line.replace(dateMatch[0], ' ');
    const withoutDuration = withoutDate
      .replace(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/ig, ' ')
      .replace(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/ig, ' ')
      .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const cells = withoutDuration.split(/[|;\t]+/)
      .map((cell) => cell.replace(/^[\s,:–—-]+|[\s,:–—-]+$/g, '').trim()).filter(Boolean);
    const descriptive = cells.filter((cell) => !/^(?:date|subject|topic|duration|study duration|daily total|total)$/i.test(cell));
    const totalLike = /\b(daily\s+total|total\s+(?:studied\s+)?hours?|overall\s+total|day\s+total)\b/i.test(line) || descriptive.length === 0;
    candidates.push({
      date,
      durationMinutes: duration,
      kind: totalLike ? 'daily_total' : 'session',
      subject: totalLike ? undefined : descriptive[0],
      topic: !totalLike && descriptive.length > 1 ? descriptive[1] : undefined,
      sourceLine: line.slice(0, 500),
    });
  });
  return candidates;
};
const aggregateCandidates = (candidates: Candidate[], warnings: string[], sourceName: string) => {
  const grouped = new Map<string, { totals: Candidate[]; sessions: Candidate[] }>();
  candidates.forEach((candidate) => {
    const current = grouped.get(candidate.date) || { totals: [], sessions: [] };
    (candidate.kind === 'daily_total' ? current.totals : current.sessions).push(candidate);
    grouped.set(candidate.date, current);
  });
  const records: DailyStudyHoursRecord[] = [];
  let invalidRecords = 0;
  let duplicateRecords = 0;
  for (const [date, group] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let totalMinutes: number;
    let breakdown: StudyHoursBreakdownItem[] = [];
    if (group.totals.length) {
      const uniqueTotals = [...new Map(group.totals.map((item) => [item.durationMinutes, item])).values()];
      if (uniqueTotals.length > 1) {
        invalidRecords += group.totals.length;
        warnings.push(date + ': conflicting daily totals were found; this date was excluded from the import.');
        continue;
      }
      totalMinutes = uniqueTotals[0].durationMinutes;
      duplicateRecords += group.totals.length - 1;
      if (group.sessions.length) warnings.push(date + ': a daily total and individual sessions both exist. The daily total was used; sessions were not added again.');
    } else {
      const uniqueSessions = new Map<string, Candidate>();
      group.sessions.forEach((session) => {
        const signature = [session.durationMinutes, (session.subject || '').toLowerCase(), (session.topic || '').toLowerCase(), (session.sourceLine || '').toLowerCase()].join('|');
        if (uniqueSessions.has(signature)) { duplicateRecords += 1; return; }
        uniqueSessions.set(signature, session);
      });
      const sessions = [...uniqueSessions.values()];
      totalMinutes = sessions.reduce((sum, item) => sum + item.durationMinutes, 0);
      breakdown = sessions.map((item) => ({
        subject: item.subject, topic: item.topic, durationMinutes: item.durationMinutes,
        sourceLine: item.sourceLine, sourceName,
      }));
    }
    if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes > 1440) {
      invalidRecords += 1;
      warnings.push(date + ': the aggregated daily total exceeds 24 hours or is invalid; this date was excluded.');
      continue;
    }
    records.push({ date, totalMinutes, breakdown, sourceDetails: sourceName });
  }
  return { records, invalidRecords, duplicateRecords };
};

export const parseHistoricalStudyHoursDocument = (text: string, sourceName: string): ParsedStudyHoursImport => {
  const warnings: string[] = [];
  const cleanText = text.replace(/\u0000/g, '').trim();
  if (!cleanText) return { records: [], warnings: ['No readable text was extracted from the uploaded document.'], invalidRecords: 0, duplicateRecords: 0, sourceName };
  let candidates: Candidate[] = [];
  const isJson = /\.json$/i.test(sourceName) || /^[{\[]/.test(cleanText);
  if (isJson) {
    try { collectJsonCandidates(JSON.parse(cleanText) as unknown, candidates, warnings); }
    catch (error) {
      return { records: [], warnings: ['The JSON file could not be parsed: ' + (error instanceof Error ? error.message : 'invalid JSON')], invalidRecords: 1, duplicateRecords: 0, sourceName };
    }
  } else candidates = parseTextCandidates(cleanText, warnings);
  const aggregate = aggregateCandidates(candidates, warnings, sourceName);
  if (!aggregate.records.length && !warnings.length) warnings.push('No date-and-duration study records could be identified. The document must contain readable dates and explicit hour/minute values.');
  return {
    records: aggregate.records,
    warnings: warnings.slice(0, 80),
    invalidRecords: aggregate.invalidRecords,
    duplicateRecords: aggregate.duplicateRecords,
    sourceName,
  };
};

const requireCurrentUid = (): string => {
  const uid = cloudAuth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to ACHIEVER before reading or updating private Lecture Tracker study-hour records.');
  if (getActiveUserStorageUid() !== uid) throw new Error('Your private ACHIEVER storage is still being prepared. Reload after sign-in and try again.');
  const state = getCloudSyncState();
  if (!state.authReady || state.user?.uid !== uid) throw new Error('Your authenticated Lecture Tracker cloud data is not ready yet. Wait for account sync to finish and retry.');
  return uid;
};
const parseStoredTarget = (value: string | null): StoredDailyTarget => {
  if (!value) return {};
  try { const parsed: unknown = JSON.parse(value); return isRecord(parsed) ? parsed as StoredDailyTarget : {}; }
  catch { return {}; }
};
const dateRange = (startDate: string, endDate: string): string[] => {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error('Provide a valid date range in YYYY-MM-DD format, with startDate not after endDate.');
  const a = startDate.split('-').map(Number);
  const b = endDate.split('-').map(Number);
  const cursor = new Date(a[0], a[1] - 1, a[2]);
  const finish = new Date(b[0], b[1] - 1, b[2]);
  const dates: string[] = [];
  while (cursor <= finish) {
    dates.push(cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0'));
    cursor.setDate(cursor.getDate() + 1);
    if (dates.length > MAX_RANGE_DAYS) throw new Error('A single study-hour read is limited to ' + MAX_RANGE_DAYS + ' dates.');
  }
  return dates;
};
const displayMinutesFor = (record: StoredDailyTarget, date: string) => {
  const verifiedSeconds = StorageService.getVerifiedStudySecondsForDate(date);
  const verifiedMinutes = Math.round(verifiedSeconds / 60);
  const source: 'ai_focus' | 'manual' | 'imported' =
    record.hoursStudiedSource === 'manual' || record.hoursStudiedSource === 'imported'
      ? record.hoursStudiedSource
      : record.hoursStudiedSource == null && Number(record.hoursStudied || 0) > 0 ? 'manual' : 'ai_focus';
  const storedHours = Number(record.hoursStudied || 0);
  const manualHours = Number(record.manualHoursStudied ?? (source === 'manual' ? storedHours : 0));
  const importedHours = Number(record.importedHoursStudied ?? (source === 'imported' ? storedHours : 0));
  const manualMinutes = source === 'manual' ? Math.round(manualHours * 60) : null;
  const importedMinutes = source === 'imported' ? Math.round(importedHours * 60) : null;
  const totalMinutes = source === 'manual' ? (manualMinutes || 0) : source === 'imported' ? (importedMinutes || 0) : verifiedMinutes;
  return { source, totalMinutes, manualMinutes, importedMinutes, verifiedSeconds };
};

export const getDailyStudyHours = async (startDate: string, endDate: string) => {
  const uid = requireCurrentUid();
  const dates = dateRange(startDate, endDate);
  const keys = dates.map((date) => DAILY_TARGET_PREFIX + date);
  const cloudRecords = await readCloudSyncableRecordsNow(keys);
  const valueByKey = new Map(cloudRecords.map((item) => [item.key, item.value]));
  const days = dates.map((date) => {
    const raw = valueByKey.get(DAILY_TARGET_PREFIX + date) ?? null;
    const stored = parseStoredTarget(raw);
    const measured = displayMinutesFor(stored, date);
    return {
      date, exists: raw !== null, source: measured.source,
      totalStudiedHours: Number((measured.totalMinutes / 60).toFixed(2)),
      totalStudiedMinutes: measured.totalMinutes,
      verifiedStudySeconds: measured.verifiedSeconds,
      verifiedStudyMinutes: Math.round(measured.verifiedSeconds / 60),
      manuallyRecordedMinutes: measured.manualMinutes,
      importedHistoricalMinutes: measured.importedMinutes,
      currentDisplayedTotalHours: Number((measured.totalMinutes / 60).toFixed(2)),
      currentDisplayedTotalMinutes: measured.totalMinutes,
      subjectWiseStudyRecords: Array.isArray(stored.studyHoursBreakdown) ? stored.studyHoursBreakdown : [],
      sourceDetails: isRecord(stored.studyHoursSourceDetails) ? stored.studyHoursSourceDetails : null,
      goalDescription: typeof stored.goalDescription === 'string' ? stored.goalDescription : '',
      subject: typeof stored.subject === 'string' ? stored.subject : '',
      userScopeVerified: Boolean(uid),
    };
  });
  const totalMinutes = days.reduce((sum, day) => sum + day.totalStudiedMinutes, 0);
  return {
    startDate, endDate, timezone: 'Asia/Kolkata', days,
    totalStudiedMinutes: totalMinutes,
    totalStudiedHours: Number((totalMinutes / 60).toFixed(2)),
    sourcePolicy: 'A manual or imported reported whole-day total overrides the displayed daily total; AI Focus verified time is retained and reported separately. The two values are never added together.',
  };
};

const normaliseIncomingRecord = (value: unknown): DailyStudyHoursRecord => {
  if (!isRecord(value)) throw new Error('Each study record must be an object.');
  const date = typeof value.date === 'string' ? value.date.trim() : '';
  if (!validDate(date)) throw new Error('Invalid study date "' + (date || 'missing') + '". Use YYYY-MM-DD.');
  let totalMinutes: number | null = null;
  if (value.totalMinutes != null) totalMinutes = Number(value.totalMinutes);
  else if (value.minutesTotal != null) totalMinutes = Number(value.minutesTotal);
  else {
    const hours = Number(value.hours ?? value.total_studied_hours ?? 0);
    const minutes = Number(value.minutes ?? value.total_studied_minutes ?? 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) throw new Error(date + ': hours and minutes must be numeric.');
    if (hours < 0 || hours > 24) throw new Error(date + ': hours must be between 0 and 24.');
    if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 60) throw new Error(date + ': minutes must be an integer from 0 to 59.');
    totalMinutes = Math.round(hours * 60) + minutes;
  }
  if (!Number.isInteger(totalMinutes) || (totalMinutes as number) < 0 || (totalMinutes as number) > 1440) throw new Error(date + ': daily study duration must be between 0 and 24 hours.');
  const breakdown = Array.isArray(value.breakdown) ? value.breakdown.filter(isRecord).map((item) => ({
    subject: typeof item.subject === 'string' ? item.subject.slice(0, 100) : undefined,
    topic: typeof item.topic === 'string' ? item.topic.slice(0, 160) : undefined,
    durationMinutes: Math.max(0, Math.min(1440, Math.floor(Number(item.durationMinutes) || 0))),
    sourceLine: typeof item.sourceLine === 'string' ? item.sourceLine.slice(0, 500) : undefined,
    sourceName: typeof item.sourceName === 'string' ? item.sourceName.slice(0, 180) : undefined,
  })) : [];
  return { date, totalMinutes: totalMinutes as number, breakdown, sourceDetails: typeof value.sourceDetails === 'string' ? value.sourceDetails.slice(0, 1000) : undefined };
};
const readPendingImport = (): PendingImport | null => {
  try { const raw = sessionStorage.getItem(PENDING_IMPORT_KEY); const parsed: unknown = raw ? JSON.parse(raw) : null; return isRecord(parsed) ? parsed as unknown as PendingImport : null; }
  catch { return null; }
};

export const stageDailyStudyHoursImport = async (
  recordsInput: unknown[], source: string, sourceDetails = '', updateMode: ImportUpdateMode = 'upsert'
) => {
  const uid = requireCurrentUid();
  if (!Array.isArray(recordsInput) || !recordsInput.length) throw new Error('No valid date-wise study records were supplied for import.');
  if (recordsInput.length > MAX_IMPORT_DATES) throw new Error('A single import is limited to ' + MAX_IMPORT_DATES + ' daily records so the database batch can remain atomic.');
  const records = recordsInput.map(normaliseIncomingRecord).sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(records.map((item) => item.date)).size !== records.length) throw new Error('The import contains more than one daily total for the same date. Combine sessions by date before previewing.');
  const keys = records.map((item) => DAILY_TARGET_PREFIX + item.date);
  const existingValues = await readCloudSyncableRecordsNow(keys);
  const existingByKey = new Map(existingValues.map((item) => [item.key, item.value]));
  const preview: PendingImport['preview'] = records.map((item) => {
    const raw = existingByKey.get(DAILY_TARGET_PREFIX + item.date) ?? null;
    const stored = parseStoredTarget(raw);
    const previous = raw === null ? null : displayMinutesFor(stored, item.date).totalMinutes;
    let action: 'Insert' | 'Update' | 'Skip' = raw === null ? 'Insert' : 'Update';
    if (updateMode === 'create_missing_only' && raw !== null) action = 'Skip';
    if (updateMode === 'update_existing_only' && raw === null) action = 'Skip';
    return { date: item.date, previousMinutes: previous, importedMinutes: item.totalMinutes, action };
  });
  const pending: PendingImport = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'study_import_' + Date.now(),
    uid, createdAt: new Date().toISOString(), expiresAt: Date.now() + 45 * 60 * 1000,
    source: source.slice(0, 40), sourceDetails: sourceDetails.slice(0, 1000), updateMode, records, preview,
  };
  sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(pending));
  const writable = preview.filter((item) => item.action !== 'Skip');
  const totalImportedMinutes = writable.reduce((sum, item) => sum + item.importedMinutes, 0);
  return {
    status: 'preview_ready', importId: pending.id, source: pending.source, timezone: 'Asia/Kolkata',
    totalDatesIdentified: records.length,
    newRecords: preview.filter((item) => item.action === 'Insert').length,
    existingRecordsToUpdate: preview.filter((item) => item.action === 'Update').length,
    skippedRecords: preview.filter((item) => item.action === 'Skip').length,
    totalImportedMinutes, totalImportedHours: Number((totalImportedMinutes / 60).toFixed(2)),
    preview: preview.map((item) => ({
      ...item,
      previousHours: item.previousMinutes === null ? null : Number((item.previousMinutes / 60).toFixed(2)),
      importedHours: Number((item.importedMinutes / 60).toFixed(2)),
    })),
    confirmationRequired: true,
    message: 'No records have been changed. Ask the user to review this preview and explicitly confirm before committing the import.',
  };
};

const getAuditRows = (): Array<Record<string, unknown>> => {
  try { const parsed: unknown = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); return Array.isArray(parsed) ? parsed.filter(isRecord) : []; }
  catch { return []; }
};

const writeDailyTargetsAndAudit = async (
  items: Array<{ record: DailyStudyHoursRecord; source: StudyHoursSource; sourceDetails: string; importId?: string }>
) => {
  const keys = items.map((item) => DAILY_TARGET_PREFIX + item.record.date);
  const remote = await readCloudSyncableRecordsNow(keys);
  const previousByKey = new Map(remote.map((item) => [item.key, item.value]));
  const oldValues = new Map<string, string | null>();
  const auditRows = getAuditRows();

  const nextValues = items.map(({ record, source, sourceDetails, importId }) => {
    const key = DAILY_TARGET_PREFIX + record.date;
    const raw = previousByKey.get(key) ?? null;
    const previous = parseStoredTarget(raw);
    oldValues.set(key, localStorage.getItem(key));
    const previousTotal = raw === null ? null : displayMinutesFor(previous, record.date).totalMinutes;
    const verifiedSeconds = StorageService.getVerifiedStudySecondsForDate(record.date);
    const hours = Number((record.totalMinutes / 60).toFixed(2));
    const now = new Date().toISOString();
    const next: StoredDailyTarget = {
      ...previous,
      date: record.date,
      hoursStudied: hours,
      hoursStudiedSource: source,
      manualHoursStudied: source === 'manual' ? hours : Number(previous.manualHoursStudied ?? 0),
      importedHoursStudied: source === 'imported' ? hours : Number(previous.importedHoursStudied ?? 0),
      aiFocusVerifiedSeconds: verifiedSeconds,
      studyHoursSourceDetails: { source, details: sourceDetails.slice(0, 1000), importId: importId || null, updatedAt: now },
      studyHoursBreakdown: (record.breakdown || []).slice(0, 120),
    };
    auditRows.push({
      id: Date.now() + '_' + record.date + '_' + Math.random().toString(36).slice(2, 7),
      date: record.date, timestamp: now,
      originalTotalMinutes: previousTotal,
      updatedTotalMinutes: record.totalMinutes,
      originalSource: previous.hoursStudiedSource || (Number(previous.hoursStudied || 0) > 0 ? 'legacy_manual' : 'ai_focus'),
      updatedSource: source, importSource: sourceDetails.slice(0, 180), importId: importId || null,
    });
    return { key, value: JSON.stringify(next) };
  });

  const oldAudit = localStorage.getItem(AUDIT_KEY);
  oldValues.set(AUDIT_KEY, oldAudit);
  try {
    nextValues.forEach((item) => localStorage.setItem(item.key, item.value));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditRows.slice(-1000)));
    await persistCloudSyncableRecordsNow([...keys, AUDIT_KEY]);
    const verification = await verifyDailyStudyHours(items.map((item) => ({ date: item.record.date, totalMinutes: item.record.totalMinutes })));
    if (!verification.success) throw new Error('The database write completed, but read-back verification found one or more mismatched daily totals.');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('gate-lecture-tracker-study-hours-updated'));
    }
    return verification;
  } catch (error) {
    oldValues.forEach((value, key) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('gate-lecture-tracker-study-hours-updated'));
    }
    throw error;
  }
};

export const upsertDailyStudyHours = async (input: {
  date: string; hours?: number; minutes?: number; totalMinutes?: number;
  source?: StudyHoursSource; sourceDetails?: string; subject?: string; topic?: string;
}) => {
  requireCurrentUid();
  const breakdown = input.subject || input.topic ? [{
    subject: input.subject, topic: input.topic,
    durationMinutes: input.totalMinutes ?? Math.round(Number(input.hours || 0) * 60 + Number(input.minutes || 0)),
  }] : [];
  const record = normaliseIncomingRecord({
    date: input.date, hours: input.hours ?? 0, minutes: input.minutes ?? 0,
    totalMinutes: input.totalMinutes, breakdown,
  });
  const source: StudyHoursSource = input.source === 'imported' ? 'imported' : 'manual';
  const before = await getDailyStudyHours(record.date, record.date);
  const previous = before.days[0];
  await writeDailyTargetsAndAudit([{ record, source, sourceDetails: input.sourceDetails || 'AI Mentor manual update' }]);
  const verification = await verifyDailyStudyHours([{ date: record.date, totalMinutes: record.totalMinutes }]);
  if (!verification.success) throw new Error('Study-hour update could not be verified from the saved database record.');
  return {
    status: previous.exists ? 'updated' : 'created', date: record.date,
    previousTotalHours: previous.currentDisplayedTotalHours,
    savedTotalHours: Number((record.totalMinutes / 60).toFixed(2)),
    savedTotalMinutes: record.totalMinutes, source, verified: true,
    databaseReadBack: verification.results[0] || null,
  };
};

export const verifyDailyStudyHours = async (
  expectedRecords: Array<{ date: string; totalMinutes?: number; hours?: number; minutes?: number }> = [],
  startDate?: string, endDate?: string
) => {
  const expected = expectedRecords.map(normaliseIncomingRecord);
  const firstDate = startDate || expected[0]?.date;
  const lastDate = endDate || expected[expected.length - 1]?.date;
  if (!firstDate || !lastDate) throw new Error('Provide an expected date record or a date range to verify.');
  const summary = await getDailyStudyHours(firstDate, lastDate);
  const expectedByDate = new Map(expected.map((item) => [item.date, item.totalMinutes]));
  const results = summary.days.map((day) => {
    const expectedMinutes = expectedByDate.get(day.date);
    return {
      date: day.date, exists: day.exists,
      expectedMinutes: expectedMinutes ?? null,
      savedMinutes: day.currentDisplayedTotalMinutes,
      matches: expectedMinutes == null ? day.exists : expectedMinutes === day.currentDisplayedTotalMinutes,
      source: day.source,
    };
  });
  const mismatches = results.filter((item) => !item.matches);
  return {
    success: mismatches.length === 0, checkedDates: results.length,
    matchedDates: results.length - mismatches.length, mismatches, results,
    verifiedAgainst: 'Authenticated user Firestore appData read-back',
  };
};

export const commitPendingDailyStudyHoursImport = async () => {
  const uid = requireCurrentUid();
  const pending = readPendingImport();
  if (!pending) throw new Error('There is no pending study-hour import preview in this AI Mentor session. Upload or preview the records again.');
  if (pending.uid !== uid) throw new Error('This pending import belongs to a different authenticated account and cannot be applied.');
  if (pending.expiresAt < Date.now()) {
    sessionStorage.removeItem(PENDING_IMPORT_KEY);
    throw new Error('The import preview expired. Please create a fresh preview before confirming.');
  }
  const writablePreview = pending.preview.filter((item) => item.action !== 'Skip');
  if (!writablePreview.length) {
    sessionStorage.removeItem(PENDING_IMPORT_KEY);
    return { status: 'nothing_to_import', savedRecords: 0, skippedRecords: pending.preview.length };
  }
  const current = await readCloudSyncableRecordsNow(pending.records.map((item) => DAILY_TARGET_PREFIX + item.date));
  const currentByKey = new Map(current.map((item) => [item.key, item.value]));
  const staleDates: string[] = [];
  pending.preview.forEach((item) => {
    const raw = currentByKey.get(DAILY_TARGET_PREFIX + item.date) ?? null;
    const latest = raw === null ? null : displayMinutesFor(parseStoredTarget(raw), item.date).totalMinutes;
    if (latest !== item.previousMinutes) staleDates.push(item.date);
  });
  if (staleDates.length) return {
    status: 'preview_outdated', staleDates,
    message: 'Some dates changed after the preview was created. No records were modified; generate a fresh preview and confirm again.',
  };
  const byDate = new Map(pending.records.map((item) => [item.date, item]));
  const items = writablePreview.map((item) => ({
    record: byDate.get(item.date)!,
    source: 'imported' as const,
    sourceDetails: (pending.source + ': ' + pending.sourceDetails).slice(0, 1000),
    importId: pending.id,
  }));
  const verification = await writeDailyTargetsAndAudit(items);
  if (!verification.success) return {
    status: 'verification_failed', savedRecords: 0,
    failedRecords: items.map((item) => item.record.date), verification,
  };
  sessionStorage.removeItem(PENDING_IMPORT_KEY);
  const totalImportedMinutes = items.reduce((sum, item) => sum + item.record.totalMinutes, 0);
  return {
    status: 'committed', importId: pending.id, savedRecords: items.length,
    skippedRecords: pending.preview.length - items.length,
    totalImportedMinutes, totalImportedHours: Number((totalImportedMinutes / 60).toFixed(2)),
    verification,
    message: 'All imported daily totals were written to the authenticated user’s existing Lecture Tracker records and verified by reading them back from Firestore.',
  };
};
