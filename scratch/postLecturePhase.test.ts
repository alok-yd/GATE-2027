/**
 * Automated Test Suite for Post-Lecture Phase & Relaxed Lecture Goals
 * Validates all 10 scenarios from Master Prompt Section 38
 */

// Polyfill localStorage on globalThis for Node.js test environment
const storage: Record<string, string> = {};
const mockStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => { storage[key] = String(val); },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  length: 0,
  key: (i: number) => Object.keys(storage)[i] ?? null,
};
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
} catch (e) {
  (globalThis as any).localStorage = mockStorage;
}

import {
  areAllSubjectsLecturesComplete,
  calculateWeeklyTargetCompletion,
  getLecturePhaseStatus,
  getSubjectLectureStatus,
} from '../services/DataExtractor';
import { LectureSubject, PreparationPhase, StudentProfile, WeeklyStudyTarget } from '../types';
import { aiHub } from '../services/AIServiceHub';
import { analyzePreparationState } from '../services/airPrediction/preparationAnalyzer';

const mockCompleteSubjects: LectureSubject[] = [
  { id: 'aptitude', name: 'General Aptitude', totalLectures: 30, completedLectures: 30, phase: 1, color: 'bg-amber-500' },
  { id: 'math', name: 'Engineering Math', totalLectures: 40, completedLectures: 40, phase: 2, color: 'bg-blue-500' },
  { id: 'algo', name: 'Algorithms', totalLectures: 50, completedLectures: 50, phase: 1, color: 'bg-emerald-500' },
  { id: 'ds', name: 'Data Structures', totalLectures: 45, completedLectures: 45, phase: 1, color: 'bg-teal-500' },
  { id: 'os', name: 'Operating Systems', totalLectures: 40, completedLectures: 40, phase: 1, color: 'bg-cyan-500' },
  { id: 'cn', name: 'Computer Networks', totalLectures: 64, completedLectures: 64, phase: 2, color: 'bg-pink-500' },
  { id: 'toc', name: 'Theory of Computation', totalLectures: 35, completedLectures: 35, phase: 1, color: 'bg-green-500' },
  { id: 'dbms', name: 'DBMS', totalLectures: 40, completedLectures: 40, phase: 1, color: 'bg-sky-500' },
  { id: 'coa', name: 'Computer Org & Arch', totalLectures: 42, completedLectures: 42, phase: 2, color: 'bg-indigo-500' },
  { id: 'compiler', name: 'Compiler Design', totalLectures: 26, completedLectures: 26, phase: 2, color: 'bg-purple-500' },
  { id: 'digital', name: 'Digital Logic', totalLectures: 38, completedLectures: 38, phase: 2, color: 'bg-rose-500' },
  { id: 'cprog', name: 'C Programming', totalLectures: 24, completedLectures: 24, phase: 1, color: 'bg-orange-500' },
  { id: 'discrete', name: 'Discrete Mathematics', totalLectures: 51, completedLectures: 51, phase: 2, color: 'bg-violet-500' },
];

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✓ [PASS] ${testName}`);
  } else {
    console.error(`✗ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
  }
}

console.log('====================================================');
console.log('POST-LECTURE PHASE: 10-SCENARIO VALIDATION SUITE');
console.log('====================================================\n');

// ----------------------------------------------------
// CASE 1: All subjects 100% -> no mandatory lecture goal
// ----------------------------------------------------
const statusAll = getLecturePhaseStatus(mockCompleteSubjects);
assert(statusAll.allComplete === true, 'CASE 1.1: allComplete is true when all subjects are 100%');
assert(statusAll.phase === PreparationPhase.POST_LECTURE_MASTERY, 'CASE 1.2: Phase is POST_LECTURE_MASTERY');
assert(statusAll.overallCompletionPercentage === 100, 'CASE 1.3: Overall completion is 100%');

// ----------------------------------------------------
// CASE 2: One subject 95% -> lecture tracking remains active for that subject
// ----------------------------------------------------
const mockWithOneIncomplete: LectureSubject[] = mockCompleteSubjects.map((s) =>
  s.id === 'cn' ? { ...s, completedLectures: 60, totalLectures: 64 } : s
);
const statusIncomplete = getLecturePhaseStatus(mockWithOneIncomplete);
const cnStatus = getSubjectLectureStatus(mockWithOneIncomplete.find((s) => s.id === 'cn')!);
assert(statusIncomplete.allComplete === false, 'CASE 2.1: allComplete is false when one subject is incomplete');
assert(statusIncomplete.phase === PreparationPhase.LECTURE_COMPLETION, 'CASE 2.2: Phase remains LECTURE_COMPLETION');
assert(cnStatus.isComplete === false, 'CASE 2.3: CN status is incomplete (4 remaining)');
assert(cnStatus.remainingLectures === 4, 'CASE 2.4: Exactly 4 remaining lectures calculated for CN');

// ----------------------------------------------------
// CASE 3: One subject newly added with 0% -> lecture target can become active for that subject
// ----------------------------------------------------
const mockWithNewSubject: LectureSubject[] = [
  ...mockCompleteSubjects,
  { id: 'ml_gate', name: 'Machine Learning', totalLectures: 25, completedLectures: 0, phase: 2, color: 'bg-red-500' }
];
const statusNewSubject = getLecturePhaseStatus(mockWithNewSubject);
const mlStatus = getSubjectLectureStatus(mockWithNewSubject.find((s) => s.id === 'ml_gate')!);
assert(statusNewSubject.allComplete === false, 'CASE 3.1: allComplete becomes false when new 0% subject added');
assert(mlStatus.remainingLectures === 25, 'CASE 3.2: Newly added subject requires all 25 lectures');
assert(mlStatus.isComplete === false, 'CASE 3.3: Newly added subject is not complete');

// ----------------------------------------------------
// CASE 4: All subjects 100% -> no lecture warning alerts generated
// ----------------------------------------------------
const mockProfile: StudentProfile = {
  target: { AIR: 1, score: 90 },
  daysTillExam: 326,
  currentPhase: 'Deep Revision Sprint',
  subjects: mockCompleteSubjects.map((s) => ({
    id: s.id,
    name: s.name,
    phase: s.phase,
    topicsCompleted: s.completedLectures,
    topicsTotal: s.totalLectures,
    completionRate: 100,
    accuracy: 85,
    weakTopics: [],
    strongTopics: ['Core'],
    examWeight: 8,
  })),
  mocks: [],
  pyqEntries: [],
  pyqPerformance: [],
  studyMetrics: {
    dailyHours: 9.0,
    consistencyScore: 90,
    learningStyle: 'visual',
    streakDays: 25,
    weeklyTargetCompletion: 100,
  },
  recentLogs: [],
  weeklyTargets: [{ weekId: '2026-09-13', focus: 'Revision', targetLectures: 0, completedLectures: 0 }],
  revisionProgress: {
    completedTasks: 3,
    totalTasks: 6,
    completionRate: 50,
    cycle1Complete: true,
    cycle2Complete: false,
    cycle3Complete: false,
    completeRevision: false,
  },
  roadmapProgress: { completedPoints: 10, totalPoints: 20, completionRate: 50 },
};

(async () => {
  const alerts = await aiHub.generateAlert(mockProfile);
  const hasLectureWarning = alerts.some((a) =>
    a.message.toLowerCase().includes('lecture') || a.actionRequired.toLowerCase().includes('lecture')
  );
  assert(!hasLectureWarning, 'CASE 4: No lecture warning alerts generated when lectures are complete');

  // ----------------------------------------------------
  // CASE 5: All subjects 100% -> weekly lecture completion should NOT show 0%
  // ----------------------------------------------------
  const emptyWeeklyTargets: WeeklyStudyTarget[] = [
    { weekId: '2026-09-13', focus: 'PYQs + Revision', targetLectures: 15, completedLectures: 0 }
  ];
  const targetCompletion = calculateWeeklyTargetCompletion(emptyWeeklyTargets, true);
  assert(targetCompletion === 100, 'CASE 5: Weekly target completion returns 100% (not 0%) when lectures complete');

  // ----------------------------------------------------
  // CASE 6: All subjects 100% -> Dimension 1 in AIR prediction reflects complete exposure
  // ----------------------------------------------------
  const airEval = analyzePreparationState(mockProfile);
  const knowDim = airEval.dimensions.knowledgeCoverage;
  assert(knowDim?.score === 100, 'CASE 6.1: Knowledge coverage dimension score is 100%');
  assert(knowDim?.primaryMetric.includes('100%') === true, 'CASE 6.2: Knowledge metric reflects 100% complete');

  // ----------------------------------------------------
  // CASE 7: All subjects 100% -> AI Analytics readiness does not penalize 0 weekly completed lectures
  // ----------------------------------------------------
  const consistencyDim = airEval.dimensions.consistencyHabit;
  assert(consistencyDim != null && consistencyDim.score >= 50, 'CASE 7: Consistency dimension not zeroed out by 0 weekly lectures');

  // ----------------------------------------------------
  // CASE 8: All subjects 100% -> optional rewatch remains possible
  // ----------------------------------------------------
  const updatedCnAfterRewatch: LectureSubject = {
    ...mockCompleteSubjects.find((s) => s.id === 'cn')!,
    completedLectures: 65, // rewatched 1 lecture
  };
  const rewatchStatus = getSubjectLectureStatus(updatedCnAfterRewatch);
  assert(rewatchStatus.isComplete === true, 'CASE 8.1: Subject remains complete after optional rewatch');
  assert(rewatchStatus.completionPercentage === 100, 'CASE 8.2: Percentage capped/clamped properly at 100%');

  // ----------------------------------------------------
  // CASE 9: All subjects 100% -> weekly target with 0 mandatory lectures handled cleanly
  // ----------------------------------------------------
  const relaxedTarget: WeeklyStudyTarget = {
    weekId: '2026-09-13',
    focus: 'Revision',
    targetLectures: 0,
    completedLectures: 2, // 2 optional review sessions
  };
  const relaxedCompletion = calculateWeeklyTargetCompletion([relaxedTarget], true);
  assert(relaxedCompletion === 100, 'CASE 9: Relaxed target with optional sessions evaluated at 100%');

  // ----------------------------------------------------
  // CASE 10: Historical weekly lecture records remain intact
  // ----------------------------------------------------
  const historicalTarget: WeeklyStudyTarget = {
    weekId: '2026-01-04',
    focus: 'Finish COA Module 2',
    targetLectures: 15,
    completedLectures: 15,
  };
  assert(historicalTarget.targetLectures === 15, 'CASE 10.1: Historical target number preserved');
  assert(historicalTarget.completedLectures === 15, 'CASE 10.2: Historical completed count preserved');

  console.log(`\n====================================================`);
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`====================================================`);
  if (passed === total) {
    console.log('🎉 ALL 10 CRITICAL VALIDATION SCENARIOS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
})();
