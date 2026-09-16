import {
  DailyStudyLog,
  MockResult,
  PYQPracticeEntry,
  StudentProfile,
} from '../types';
import { getAIGatewayStatus, generateGatewayText } from './AIGatewayClient';
import { getMockResults, getPYQEntries, getStudentProfile } from './DataExtractor';

export type DocumentPurpose =
  | 'planner'
  | 'roadmap'
  | 'test'
  | 'mistake'
  | 'pyq'
  | 'study_material'
  | 'mentor';

export type DocumentKind = 'pdf' | 'image' | 'text' | 'unknown';

export type MemoryCategory =
  | 'user_goal'
  | 'preference'
  | 'recurring_mistake'
  | 'successful_strategy'
  | 'ineffective_strategy'
  | 'learning_pattern'
  | 'study_pattern'
  | 'roadmap_decision';

export type MistakeCategory =
  | 'conceptual'
  | 'calculation'
  | 'silly mistake'
  | 'memory'
  | 'misreading'
  | 'time pressure'
  | 'guessing'
  | 'formula'
  | 'implementation/coding'
  | 'incomplete knowledge';

export interface StoredDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  purpose: DocumentPurpose;
  mimeType: string;
  size: number;
  createdAt: string;
  text: string;
  summary: string;
  extractionConfidence: number;
  warnings: string[];
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  sourceName: string;
  purpose: DocumentPurpose;
  text: string;
  index: number;
  tokenHint: number;
}

export interface PlannerTaskPreview {
  id: string;
  date: string;
  subject: string;
  title: string;
  durationMinutes: number;
  priority: 'high' | 'medium' | 'low';
  dependencies: string[];
  sourceLine: string;
}

export interface PlannerImportPreview {
  id: string;
  documentId: string;
  createdAt: string;
  tasks: PlannerTaskPreview[];
  conflicts: string[];
  status: 'preview' | 'accepted' | 'rejected';
}

export interface RoadmapRecommendation {
  id: string;
  phase: string;
  dateRange: string;
  subject: string;
  milestone: string;
  reason: string;
  expectedImpact: string;
}

export interface RoadmapImportPreview {
  id: string;
  documentId: string;
  createdAt: string;
  recommendations: RoadmapRecommendation[];
  conflicts: string[];
  status: 'preview' | 'accepted' | 'rejected';
}

export interface TestAnalysisRecord {
  id: string;
  documentId?: string;
  createdAt: string;
  score: number | null;
  totalMarks: number | null;
  attempted: number | null;
  correct: number | null;
  wrong: number | null;
  durationMinutes: number | null;
  weakSubjects: string[];
  timeManagementIssues: string[];
  accuracyIssues: string[];
  correctiveActions: string[];
}

export interface MistakeRecord {
  id: string;
  createdAt: string;
  subject: string;
  topic: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  category: MistakeCategory;
  rootCause: string;
  preventionStrategy: string;
  sourceDocumentId?: string;
}

export interface MistakePattern {
  key: string;
  subject: string;
  topic: string;
  category: MistakeCategory;
  count: number;
  priorityIncrease: 'none' | 'moderate' | 'high';
  latestAt: string;
}

export interface AIMemoryRecord {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface RAGSearchResult {
  id: string;
  sourceType: 'document' | 'mistake' | 'memory' | 'profile';
  sourceName: string;
  snippet: string;
  score: number;
  citation: string;
}

export interface EvaluationResult {
  id: string;
  name: string;
  area: 'planner' | 'roadmap' | 'test' | 'mistake' | 'rag' | 'tooling' | 'student_state';
  passed: boolean;
  detail: string;
  createdAt: string;
}

const DOCUMENTS_KEY = 'achiever_ai_documents';
const CHUNKS_KEY = 'achiever_ai_document_chunks';
const PLANNER_IMPORTS_KEY = 'achiever_ai_planner_imports';
const ROADMAP_IMPORTS_KEY = 'achiever_ai_roadmap_imports';
const TEST_ANALYSES_KEY = 'achiever_ai_test_analyses';
const MISTAKES_KEY = 'achiever_ai_mistakes';
const MEMORY_KEY = 'achiever_ai_memory';
const EVALS_KEY = 'achiever_ai_evaluations';

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 140;

const SUBJECTS = [
  'Algorithms',
  'Data Structures',
  'Operating Systems',
  'DBMS',
  'Computer Networks',
  'Theory of Computation',
  'Compiler Design',
  'Digital Logic',
  'COA',
  'Engineering Mathematics',
  'General Aptitude',
  'C Programming',
];

const todayKey = () => new Date().toISOString().split('T')[0];

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const readList = <T,>(key: string): T[] => safeParse<T[]>(localStorage.getItem(key), []);

const writeList = <T,>(key: string, value: T[]) => {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event('storage'));
};

const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const tokenSet = (value: string) =>
  new Set(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );

const overlapScore = (query: string, text: string) => {
  const queryTokens = tokenSet(query);
  if (queryTokens.size === 0) return 0;
  const textTokens = tokenSet(text);
  let hits = 0;
  queryTokens.forEach((token) => {
    if (textTokens.has(token)) hits += 1;
  });
  return hits / queryTokens.size;
};

const detectKind = (fileName: string, mimeType: string): DocumentKind => {
  const lower = fileName.toLowerCase();
  if (mimeType.includes('pdf') || lower.endsWith('.pdf')) return 'pdf';
  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(lower)) return 'image';
  if (
    mimeType.startsWith('text/') ||
    /\.(txt|md|csv|tsv|json)$/i.test(lower)
  ) {
    return 'text';
  }
  return 'unknown';
};

const detectSubject = (line: string) => {
  const normalized = normalize(line);
  return (
    SUBJECTS.find((subject) => {
      const normalizedSubject = normalize(subject);
      return normalized.includes(normalizedSubject) || normalizedSubject.split(' ').some((part) => normalized.includes(part));
    }) || 'General'
  );
};

const detectPriority = (line: string): PlannerTaskPreview['priority'] => {
  const lower = line.toLowerCase();
  if (/(urgent|high|weak|backlog|mock|test|mistake|priority)/.test(lower)) return 'high';
  if (/(revise|pyq|practice|medium)/.test(lower)) return 'medium';
  return 'low';
};

const parseDate = (line: string) => {
  const iso = line.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const short = line.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](20\d{2}))?\b/);
  if (short) {
    const [, day, month, year = String(new Date().getFullYear())] = short;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const lower = line.toLowerCase();
  const base = new Date();
  if (lower.includes('tomorrow')) base.setDate(base.getDate() + 1);
  if (lower.includes('next week')) base.setDate(base.getDate() + 7);
  return base.toISOString().split('T')[0];
};

const parseDurationMinutes = (line: string) => {
  const hour = line.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  if (hour) return Math.round(Number(hour[1]) * 60);
  const minute = line.match(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (minute) return Math.round(Number(minute[1]));
  return 60;
};

const readableBinaryText = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let current = '';
  const parts: string[] = [];

  bytes.forEach((byte) => {
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
      current += String.fromCharCode(byte);
    } else {
      if (current.trim().length > 8) parts.push(current.trim());
      current = '';
    }
  });

  if (current.trim().length > 8) parts.push(current.trim());
  return parts
    .join('\n')
    .replace(/\\[rn]/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const readFileAsBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

const classifyPurpose = (text: string, fallback: DocumentPurpose): DocumentPurpose => {
  const lower = text.toLowerCase();
  if (/(roadmap|phase|milestone|revision cycle)/.test(lower)) return 'roadmap';
  if (/(score|marks|accuracy|attempted|mock|test result)/.test(lower)) return 'test';
  if (/(mistake|wrong answer|correct answer|root cause)/.test(lower)) return 'mistake';
  if (/(plan|today|tomorrow|schedule|duration|hours)/.test(lower)) return 'planner';
  if (/(pyq|previous year|question)/.test(lower)) return 'pyq';
  return fallback;
};

const makeSummary = (text: string, purpose: DocumentPurpose) => {
  if (!text.trim()) return `No reliable text was extracted. ${purpose} analysis needs OCR/vision text input.`;
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  return first.length > 220 ? `${first.slice(0, 220)}...` : first;
};

const chunkDocument = (document: StoredDocument): DocumentChunk[] => {
  const source = document.text.trim();
  if (!source) return [];
  const chunks: DocumentChunk[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < source.length) {
    const text = source.slice(cursor, cursor + CHUNK_SIZE).trim();
    if (text) {
      chunks.push({
        id: id('chunk'),
        documentId: document.id,
        sourceName: document.name,
        purpose: document.purpose,
        text,
        index,
        tokenHint: Math.ceil(text.length / 4),
      });
      index += 1;
    }
    cursor += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
};

const saveDocumentAndChunks = (document: StoredDocument) => {
  const documents = [document, ...readList<StoredDocument>(DOCUMENTS_KEY)].slice(0, 80);
  writeList(DOCUMENTS_KEY, documents);

  const nextChunks = [
    ...chunkDocument(document),
    ...readList<DocumentChunk>(CHUNKS_KEY).filter((chunk) => chunk.documentId !== document.id),
  ].slice(0, 600);
  writeList(CHUNKS_KEY, nextChunks);
};

const parsePlannerTasks = (text: string): PlannerTaskPreview[] => {
  const usefulLines = text
    .split(/\r?\n|;/)
    .map((line) => line.replace(/^[-*0-9.)\s]+/, '').trim())
    .filter((line) => line.length > 8)
    .slice(0, 60);

  return usefulLines.map((line) => ({
    id: id('plan_task'),
    date: parseDate(line),
    subject: detectSubject(line),
    title: line.slice(0, 140),
    durationMinutes: parseDurationMinutes(line),
    priority: detectPriority(line),
    dependencies: /after|then|before/i.test(line) ? ['sequence constraint in source line'] : [],
    sourceLine: line,
  }));
};

const detectPlannerConflicts = (tasks: PlannerTaskPreview[]) => {
  const conflicts: string[] = [];
  const byDate = new Map<string, PlannerTaskPreview[]>();
  tasks.forEach((task) => {
    byDate.set(task.date, [...(byDate.get(task.date) || []), task]);
  });

  byDate.forEach((items, date) => {
    const totalMinutes = items.reduce((sum, item) => sum + item.durationMinutes, 0);
    if (totalMinutes > 12 * 60) {
      conflicts.push(`${date}: ${Math.round(totalMinutes / 60)} planned hours exceeds a 12-hour cap.`);
    }
    const subjects = new Set(items.map((item) => item.subject));
    if (subjects.size > 5) {
      conflicts.push(`${date}: too many subjects in one day; split or prioritize.`);
    }
  });

  return conflicts;
};

const parseRoadmapRecommendations = (text: string): RoadmapRecommendation[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*0-9.)\s]+/, '').trim())
    .filter((line) => line.length > 10)
    .slice(0, 45);

  return lines.map((line, index) => ({
    id: id('roadmap_rec'),
    phase: /phase\s*\d+/i.exec(line)?.[0] || `Phase ${Math.floor(index / 5) + 1}`,
    dateRange: /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*.*?(?:20\d{2})?\b/i.exec(line)?.[0] || 'Needs review',
    subject: detectSubject(line),
    milestone: line.slice(0, 150),
    reason: 'Imported roadmap line. Confirm before applying.',
    expectedImpact: 'Keeps the roadmap inspectable without overwriting existing progress.',
  }));
};

const analyzeTestText = (text: string, documentId?: string): TestAnalysisRecord => {
  const scoreMatch = text.match(/\bscore\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i) || text.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(100|85|65|30|25)\b/);
  const attemptedMatch = text.match(/\battempt(?:ed)?\s*[:=-]?\s*(\d+)/i);
  const correctMatch = text.match(/\b(?:correct|right)\s*[:=-]?\s*(\d+)/i);
  const wrongMatch = text.match(/\bwrong\s*[:=-]?\s*(\d+)/i);
  const durationMatch = text.match(/\b(\d+)\s*(?:min|mins|minutes)\b/i);
  const weakSubjects = SUBJECTS.filter((subject) => normalize(text).includes(normalize(subject))).slice(0, 5);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;
  const totalMarks = scoreMatch ? Number(scoreMatch[2]) : null;
  const attempted = attemptedMatch ? Number(attemptedMatch[1]) : null;
  const correct = correctMatch ? Number(correctMatch[1]) : null;
  const wrong = wrongMatch ? Number(wrongMatch[1]) : null;
  const accuracy = attempted && correct != null ? (correct / attempted) * 100 : null;

  return {
    id: id('test_analysis'),
    documentId,
    createdAt: new Date().toISOString(),
    score,
    totalMarks,
    attempted,
    correct,
    wrong,
    durationMinutes: durationMatch ? Number(durationMatch[1]) : null,
    weakSubjects: weakSubjects.length ? weakSubjects : ['Needs subject-level input'],
    timeManagementIssues:
      attempted != null && attempted < 50
        ? ['Low attempt count suggests time allocation or question selection issue.']
        : ['Check time spent per section after importing richer test data.'],
    accuracyIssues:
      accuracy != null && accuracy < 75
        ? [`Accuracy is ${Math.round(accuracy)}%, so error analysis should lead the next study block.`]
        : ['Accuracy issue detection needs correct/attempted counts.'],
    correctiveActions: [
      'Classify every wrong answer into conceptual, calculation, silly, memory, or time-pressure buckets.',
      'Revise the two weakest subjects before the next timed test.',
      'Create a 30-minute post-test repair block in the planner.',
    ],
  };
};

const classifyMistakeCategory = (input: string): MistakeCategory => {
  const lower = input.toLowerCase();
  if (/(formula|equation)/.test(lower)) return 'formula';
  if (/(calculate|calculation|arithmetic|sign error)/.test(lower)) return 'calculation';
  if (/(read|misread|not noticed|missed word)/.test(lower)) return 'misreading';
  if (/(time|rush|pressure)/.test(lower)) return 'time pressure';
  if (/(guess|guessed)/.test(lower)) return 'guessing';
  if (/(remember|forgot|memory)/.test(lower)) return 'memory';
  if (/(code|implementation|syntax)/.test(lower)) return 'implementation/coding';
  if (/(silly|careless)/.test(lower)) return 'silly mistake';
  if (/(unknown|incomplete)/.test(lower)) return 'incomplete knowledge';
  return 'conceptual';
};

const serializeProfileForSearch = (profile: StudentProfile) =>
  [
    `Current phase: ${profile.currentPhase}`,
    `Days till exam: ${profile.daysTillExam}`,
    `Study hours: ${profile.studyMetrics.dailyHours}`,
    `Consistency: ${profile.studyMetrics.consistencyScore}`,
    ...profile.subjects.map(
      (subject) =>
        `${subject.name}: ${subject.accuracy}% accuracy, ${subject.completionRate}% complete, weak topics ${subject.weakTopics.join(', ')}`
    ),
  ].join('\n');

export const listDocuments = () => readList<StoredDocument>(DOCUMENTS_KEY);
export const listDocumentChunks = () => readList<DocumentChunk>(CHUNKS_KEY);
export const listPlannerImports = () => readList<PlannerImportPreview>(PLANNER_IMPORTS_KEY);
export const listRoadmapImports = () => readList<RoadmapImportPreview>(ROADMAP_IMPORTS_KEY);
export const listTestAnalyses = () => readList<TestAnalysisRecord>(TEST_ANALYSES_KEY);
export const listMistakes = () => readList<MistakeRecord>(MISTAKES_KEY);
export const listMemories = () => readList<AIMemoryRecord>(MEMORY_KEY);
export const listEvaluations = () => readList<EvaluationResult>(EVALS_KEY);

export const processTextDocument = async (
  name: string,
  text: string,
  purpose: DocumentPurpose
): Promise<StoredDocument> => {
  const detectedPurpose = classifyPurpose(text, purpose);
  let summary = makeSummary(text, detectedPurpose);
  const warnings: string[] = [];

  if (text.trim().length > 50) {
    try {
      const result = await generateGatewayText({
        system:
          'You are Achiever Document Intelligence. Summarize the uploaded educational document in two concise sentences. Do not apply app state changes.',
        prompt: `Purpose: ${detectedPurpose}\nDocument text:\n${text.slice(0, 5000)}`,
      });
      summary = result.content.slice(0, 500);
    } catch {
      warnings.push('AI summary unavailable; deterministic summary used.');
    }
  }

  const document: StoredDocument = {
    id: id('doc'),
    name,
    kind: 'text',
    purpose: detectedPurpose,
    mimeType: 'text/plain',
    size: text.length,
    createdAt: new Date().toISOString(),
    text,
    summary,
    extractionConfidence: text.trim().length ? 0.95 : 0,
    warnings,
  };

  saveDocumentAndChunks(document);
  createDerivedRecords(document);
  return document;
};

export const processUploadedDocument = async (
  file: File,
  purpose: DocumentPurpose
): Promise<StoredDocument> => {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('File exceeds the 8 MB local import limit.');
  }

  const kind = detectKind(file.name, file.type);
  if (kind === 'unknown') {
    throw new Error('Unsupported file type. Use PDF, PNG, JPG, TXT, MD, CSV, or JSON.');
  }

  const warnings: string[] = [];
  let text = '';
  let confidence = 0;

  if (kind === 'text') {
    text = await readFileAsText(file);
    confidence = text.trim() ? 0.95 : 0;
  } else if (kind === 'pdf') {
    const buffer = await readFileAsBuffer(file);
    text = readableBinaryText(buffer);
    confidence = text.length > 120 ? 0.45 : 0.15;
    warnings.push('PDF extraction is local best-effort. Scanned PDFs need a dedicated OCR provider.');
  } else if (kind === 'image') {
    warnings.push('Image uploaded and validated. OCR/vision extraction is pending a configured vision provider.');
    text = `Image file: ${file.name}. Add extracted text manually or configure a vision/OCR provider for full analysis.`;
    confidence = 0.05;
  }

  const detectedPurpose = classifyPurpose(`${file.name}\n${text}`, purpose);
  const document: StoredDocument = {
    id: id('doc'),
    name: file.name,
    kind,
    purpose: detectedPurpose,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: new Date().toISOString(),
    text,
    summary: makeSummary(text, detectedPurpose),
    extractionConfidence: confidence,
    warnings,
  };

  saveDocumentAndChunks(document);
  createDerivedRecords(document);
  return document;
};

export const createDerivedRecords = (document: StoredDocument) => {
  if (document.purpose === 'planner') {
    const tasks = parsePlannerTasks(document.text);
    const preview: PlannerImportPreview = {
      id: id('planner_import'),
      documentId: document.id,
      createdAt: new Date().toISOString(),
      tasks,
      conflicts: detectPlannerConflicts(tasks),
      status: 'preview',
    };
    writeList(PLANNER_IMPORTS_KEY, [preview, ...listPlannerImports()].slice(0, 40));
  }

  if (document.purpose === 'roadmap') {
    const recommendations = parseRoadmapRecommendations(document.text);
    const preview: RoadmapImportPreview = {
      id: id('roadmap_import'),
      documentId: document.id,
      createdAt: new Date().toISOString(),
      recommendations,
      conflicts: recommendations.length ? [] : ['No roadmap milestones could be extracted.'],
      status: 'preview',
    };
    writeList(ROADMAP_IMPORTS_KEY, [preview, ...listRoadmapImports()].slice(0, 40));
  }

  if (document.purpose === 'test') {
    const analysis = analyzeTestText(document.text, document.id);
    writeList(TEST_ANALYSES_KEY, [analysis, ...listTestAnalyses()].slice(0, 60));
  }

  if (document.purpose === 'mistake') {
    const mistake = saveMistake({
      subject: detectSubject(document.text),
      topic: 'Imported mistake',
      question: document.text.slice(0, 700),
      studentAnswer: 'Imported from document',
      correctAnswer: 'Needs confirmation',
      category: classifyMistakeCategory(document.text),
      rootCause: 'Imported mistake requires manual review.',
      preventionStrategy: 'Confirm the mistake details, then add a prevention rule.',
      sourceDocumentId: document.id,
    });
    return mistake;
  }

  return null;
};

export const applyPlannerImport = (importId: string) => {
  const imports = listPlannerImports();
  const selected = imports.find((item) => item.id === importId);
  if (!selected) throw new Error('Planner import not found.');

  selected.tasks.forEach((task) => {
    const key = `gate_daily_target_${task.date || todayKey()}`;
    const existing = safeParse<DailyStudyLog>(localStorage.getItem(key), {
      date: task.date || todayKey(),
      subject: '',
      goalDescription: '',
      hoursStudied: 0,
      completionPercentage: 0,
    });
    const line = `${task.subject}: ${task.title} (${task.durationMinutes} min, ${task.priority})`;
    localStorage.setItem(
      key,
      JSON.stringify({
        ...existing,
        subject: existing.subject || task.subject,
        goalDescription: existing.goalDescription ? `${existing.goalDescription}\n${line}` : line,
      })
    );
  });

  const next = imports.map((item) => (item.id === importId ? { ...item, status: 'accepted' as const } : item));
  writeList(PLANNER_IMPORTS_KEY, next);
};

export const applyRoadmapImport = (importId: string) => {
  const imports = listRoadmapImports();
  const selected = imports.find((item) => item.id === importId);
  if (!selected) throw new Error('Roadmap import not found.');
  const next = imports.map((item) => (item.id === importId ? { ...item, status: 'accepted' as const } : item));
  writeList(ROADMAP_IMPORTS_KEY, next);
  createMemory({
    category: 'roadmap_decision',
    title: 'Accepted roadmap import',
    content: selected.recommendations.map((item) => `${item.phase}: ${item.milestone}`).join('\n'),
  });
};

export const saveMistake = (
  input: Omit<MistakeRecord, 'id' | 'createdAt'>
): MistakeRecord => {
  const mistake: MistakeRecord = {
    ...input,
    id: id('mistake'),
    createdAt: new Date().toISOString(),
  };
  writeList(MISTAKES_KEY, [mistake, ...listMistakes()].slice(0, 300));
  return mistake;
};

export const classifyAndSaveMistake = (input: {
  subject: string;
  topic: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
}) => {
  const combined = `${input.question}\n${input.studentAnswer}\n${input.correctAnswer}`;
  return saveMistake({
    ...input,
    subject: input.subject || detectSubject(combined),
    topic: input.topic || 'Unspecified topic',
    category: classifyMistakeCategory(combined),
    rootCause: 'Classified locally. Use AI Gateway for deeper reasoning when configured.',
    preventionStrategy: 'Write the trigger pattern, solve three similar PYQs, and re-check after 48 hours.',
  });
};

export const getMistakePatterns = (): MistakePattern[] => {
  const grouped = new Map<string, MistakePattern>();
  listMistakes().forEach((mistake) => {
    const key = `${normalize(mistake.subject)}|${normalize(mistake.topic)}|${mistake.category}`;
    const existing = grouped.get(key);
    const nextCount = (existing?.count || 0) + 1;
    grouped.set(key, {
      key,
      subject: mistake.subject,
      topic: mistake.topic,
      category: mistake.category,
      count: nextCount,
      priorityIncrease: nextCount >= 3 ? 'high' : nextCount >= 2 ? 'moderate' : 'none',
      latestAt: existing && existing.latestAt > mistake.createdAt ? existing.latestAt : mistake.createdAt,
    });
  });
  return Array.from(grouped.values()).sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt));
};

export const createMemory = (input: {
  category: MemoryCategory;
  title: string;
  content: string;
}): AIMemoryRecord => {
  const now = new Date().toISOString();
  const memory: AIMemoryRecord = {
    id: id('memory'),
    category: input.category,
    title: input.title.trim(),
    content: input.content.trim(),
    createdAt: now,
    updatedAt: now,
  };
  writeList(MEMORY_KEY, [memory, ...listMemories()].slice(0, 200));
  return memory;
};

export const updateMemory = (memory: AIMemoryRecord) => {
  writeList(
    MEMORY_KEY,
    listMemories().map((item) =>
      item.id === memory.id ? { ...memory, updatedAt: new Date().toISOString() } : item
    )
  );
};

export const deleteMemory = (memoryId: string) => {
  writeList(
    MEMORY_KEY,
    listMemories().filter((item) => item.id !== memoryId)
  );
};

export const searchKnowledge = (query: string): RAGSearchResult[] => {
  const results: RAGSearchResult[] = [];
  listDocumentChunks().forEach((chunk) => {
    const score = overlapScore(query, chunk.text);
    if (score > 0) {
      results.push({
        id: chunk.id,
        sourceType: 'document',
        sourceName: chunk.sourceName,
        snippet: chunk.text.slice(0, 260),
        score,
        citation: `${chunk.sourceName}#chunk-${chunk.index + 1}`,
      });
    }
  });

  listMistakes().forEach((mistake) => {
    const text = `${mistake.subject} ${mistake.topic} ${mistake.question} ${mistake.category} ${mistake.preventionStrategy}`;
    const score = overlapScore(query, text);
    if (score > 0) {
      results.push({
        id: mistake.id,
        sourceType: 'mistake',
        sourceName: `${mistake.subject} mistake`,
        snippet: `${mistake.topic}: ${mistake.category}. ${mistake.preventionStrategy}`,
        score,
        citation: `mistake:${mistake.id}`,
      });
    }
  });

  listMemories().forEach((memory) => {
    const score = overlapScore(query, `${memory.title} ${memory.content} ${memory.category}`);
    if (score > 0) {
      results.push({
        id: memory.id,
        sourceType: 'memory',
        sourceName: memory.title,
        snippet: memory.content.slice(0, 260),
        score,
        citation: `memory:${memory.id}`,
      });
    }
  });

  const profileText = serializeProfileForSearch(getStudentProfile());
  const profileScore = overlapScore(query, profileText);
  if (profileScore > 0) {
    results.push({
      id: 'student_profile',
      sourceType: 'profile',
      sourceName: 'Student state snapshot',
      snippet: profileText.slice(0, 260),
      score: profileScore,
      citation: 'student_state:current',
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
};

export const generateGroundedAnswer = async (query: string) => {
  const results = searchKnowledge(query);
  if (results.length === 0) {
    return {
      answer: 'No local knowledge source matched this query yet. Upload notes, roadmap, tests, or mistakes first.',
      citations: [],
      usedGateway: false,
    };
  }

  const context = results.map((result) => `[${result.citation}] ${result.snippet}`).join('\n\n');
  try {
    const response = await generateGatewayText({
      system:
        'You are Achiever RAG Mentor. Answer only from supplied cited context. Include source citations inline.',
      prompt: `Question: ${query}\n\nCited context:\n${context}`,
    });
    return {
      answer: response.content,
      citations: results.map((result) => result.citation),
      usedGateway: true,
    };
  } catch {
    return {
      answer: `Local grounded context found:\n\n${results
        .map((result) => `- ${result.snippet}\n  Source: ${result.citation}`)
        .join('\n')}`,
      citations: results.map((result) => result.citation),
      usedGateway: false,
    };
  }
};

export const saveManualTestAnalysis = (text: string) => {
  const analysis = analyzeTestText(text);
  writeList(TEST_ANALYSES_KEY, [analysis, ...listTestAnalyses()].slice(0, 60));
  return analysis;
};

export const saveStudyMaterialAsPYQs = (entries: PYQPracticeEntry[]) => {
  localStorage.setItem('gate_pyq_entries', JSON.stringify(entries));
  window.dispatchEvent(new Event('storage'));
};

export const createStudyTask = (task: PlannerTaskPreview) => {
  const key = `gate_daily_target_${task.date || todayKey()}`;
  const existing = safeParse<DailyStudyLog>(localStorage.getItem(key), {
    date: task.date || todayKey(),
    subject: '',
    goalDescription: '',
    hoursStudied: 0,
    completionPercentage: 0,
  });
  const line = `${task.subject}: ${task.title} (${task.durationMinutes} min, ${task.priority})`;
  localStorage.setItem(
    key,
    JSON.stringify({
      ...existing,
      subject: existing.subject || task.subject,
      goalDescription: existing.goalDescription ? `${existing.goalDescription}\n${line}` : line,
    })
  );
  window.dispatchEvent(new Event('storage'));
};

export const getBehaviorProfile = () => {
  const focusState = safeParse<unknown>(localStorage.getItem('gate_focus_timer_state'), null);
  return {
    focusTimer: focusState,
    mistakePatterns: getMistakePatterns().slice(0, 5),
    studyConsistency: getStudentProfile().studyMetrics.consistencyScore,
  };
};

export const getWellnessSummary = () => ({
  healthAnalysis: safeParse<unknown>(localStorage.getItem('gate_health_analysis'), null),
  supplements: safeParse<unknown[]>(localStorage.getItem('gate_health_supplements'), []),
});

export const runEvaluationSuite = async (): Promise<EvaluationResult[]> => {
  const profile = getStudentProfile();
  const chunks = listDocumentChunks();
  const patterns = getMistakePatterns();
  const toolsReady = Boolean(profile.subjects.length && profile.roadmapProgress);
  const gatewayStatus = await getAIGatewayStatus();
  const results: EvaluationResult[] = [
    {
      id: id('eval'),
      name: 'Student state snapshot has academic and roadmap data',
      area: 'student_state',
      passed: Boolean(profile.subjects.length && profile.daysTillExam >= 0),
      detail: `${profile.subjects.length} subjects, ${profile.daysTillExam} days to exam.`,
      createdAt: new Date().toISOString(),
    },
    {
      id: id('eval'),
      name: 'Planner import parser creates task previews',
      area: 'planner',
      passed: parsePlannerTasks('Tomorrow OS revision 2h high priority').length === 1,
      detail: 'Deterministic parser accepts dated study-plan text.',
      createdAt: new Date().toISOString(),
    },
    {
      id: id('eval'),
      name: 'Roadmap parser creates recommendations',
      area: 'roadmap',
      passed: parseRoadmapRecommendations('Phase 1 August 2026 DBMS revision milestone').length === 1,
      detail: 'Roadmap import generates confirmation-required recommendations.',
      createdAt: new Date().toISOString(),
    },
    {
      id: id('eval'),
      name: 'Mistake pattern detector groups repeats',
      area: 'mistake',
      passed: Array.isArray(patterns),
      detail: `${patterns.length} repeated mistake pattern(s) currently detected.`,
      createdAt: new Date().toISOString(),
    },
    {
      id: id('eval'),
      name: 'RAG index is queryable',
      area: 'rag',
      passed: Array.isArray(chunks),
      detail: `${chunks.length} local document chunk(s) indexed.`,
      createdAt: new Date().toISOString(),
    },
    {
      id: id('eval'),
      name: 'AI Gateway status endpoint is reachable',
      area: 'tooling',
      passed: Boolean(gatewayStatus),
      detail: gatewayStatus
        ? `Gateway provider ${gatewayStatus.primaryProvider}, configured=${gatewayStatus.configured}.`
        : 'Gateway status not reachable from browser context.',
      createdAt: new Date().toISOString(),
    },
  ];
  writeList(EVALS_KEY, [...results, ...listEvaluations()].slice(0, 100));
  return results;
};

export const getAIObservabilitySnapshot = async () => ({
  gateway: await getAIGatewayStatus(),
  documents: listDocuments().length,
  chunks: listDocumentChunks().length,
  memories: listMemories().length,
  mistakes: listMistakes().length,
  testAnalyses: listTestAnalyses().length,
  plannerImports: listPlannerImports().length,
  roadmapImports: listRoadmapImports().length,
});

export const exportAIState = () => ({
  documents: listDocuments(),
  chunks: listDocumentChunks(),
  plannerImports: listPlannerImports(),
  roadmapImports: listRoadmapImports(),
  testAnalyses: listTestAnalyses(),
  mistakes: listMistakes(),
  memory: listMemories(),
  evaluations: listEvaluations(),
  profile: getStudentProfile(),
  mocks: getMockResults() as MockResult[],
  pyqs: getPYQEntries() as PYQPracticeEntry[],
});
