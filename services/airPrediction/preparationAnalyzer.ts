import { StudentProfile } from '../../types';
import {
  DimensionLevel,
  PreparationAnalysis,
  PreparationDimension,
  SubjectReadiness,
} from './types';

// Safe parse helper
const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getLevelFromScore = (score: number): DimensionLevel => {
  if (score >= 85) return 'MASTERY';
  if (score >= 70) return 'PROFICIENT';
  if (score >= 50) return 'DEVELOPING';
  return 'CRITICAL';
};

/**
 * Analyzes the complete preparation state of the student across 8 dimensions.
 */
export const analyzePreparationState = (profile: StudentProfile): PreparationAnalysis => {
  const subjects = profile.subjects || [];
  const mocks = profile.mocks || [];
  const pyqs = profile.pyqPerformance || [];
  const revision = profile.revisionProgress;
  const metrics = profile.studyMetrics;

  // Read additional signals from local storage safely
  const focusSessions = safeParse<any[]>(localStorage.getItem('gate_focus_sessions'), []);
  const mistakePatterns = safeParse<any[]>(localStorage.getItem('gate_mistake_patterns'), []);
  const streakRaw = safeParse<{ currentStreak: number }>(
    localStorage.getItem('gate_streak_data'),
    { currentStreak: metrics.streakDays || 0 }
  );
  const currentStreak = Number(streakRaw.currentStreak || metrics.streakDays || 0);

  // -------------------------------------------------------------
  // 1. Knowledge Coverage (Weight 15%)
  // Exam-weighted syllabus completion
  // -------------------------------------------------------------
  const totalExamWeight = subjects.reduce((sum, s) => sum + (s.examWeight || 5), 0) || 100;
  const weightedCompletionSum = subjects.reduce((sum, s) => {
    const rate = s.topicsTotal > 0 ? (s.topicsCompleted / s.topicsTotal) * 100 : 0;
    return sum + rate * (s.examWeight || 5);
  }, 0);
  const rawKnowledgeScore = weightedCompletionSum / totalExamWeight;
  const knowledgeScore = Math.round(clamp(rawKnowledgeScore, 0, 100));

  const knowledgeDimension: PreparationDimension = {
    id: 'knowledge-coverage',
    name: 'Knowledge & Syllabus Coverage',
    weight: 15,
    score: knowledgeScore,
    level: getLevelFromScore(knowledgeScore),
    primaryMetric: `${knowledgeScore}% Weighted Syllabus Covered`,
    supportingDetail: `${subjects.filter((s) => s.completionRate >= 90).length}/${subjects.length} subjects completed.`,
    actionableTip:
      knowledgeScore >= 90
        ? 'Syllabus coverage is stellar. Keep all subjects fresh via spaced revision.'
        : 'Prioritize high-weight pending subjects (Engineering Math, Aptitude, OS, Algorithms).',
  };

  // -------------------------------------------------------------
  // 2. PYQ Mastery (Weight 20%)
  // Target: 200+ PYQs per subject (2000 total target benchmark)
  // -------------------------------------------------------------
  const totalPYQsSolved = pyqs.reduce((sum, s) => sum + (s.totalSolved || 0), 0);
  const targetPerSubject = 180;
  const subjectCoverageRatios = pyqs.map((s) => clamp(s.totalSolved / targetPerSubject, 0, 1));
  const avgCoverageRatio =
    subjectCoverageRatios.length > 0
      ? subjectCoverageRatios.reduce((a, b) => a + b, 0) / subjectCoverageRatios.length
      : 0;

  // Breadth penalty: check weakest subject
  const minSolvedSubject =
    pyqs.length > 0 ? Math.min(...pyqs.map((s) => s.totalSolved)) : 0;
  const weakestSubjectRatio = clamp(minSolvedSubject / 100, 0, 1);

  // Accuracy bonus if logged
  const subjectsWithAccuracy = pyqs.filter((s) => s.accuracy != null);
  const avgPYQAccuracy =
    subjectsWithAccuracy.length > 0
      ? subjectsWithAccuracy.reduce((sum, s) => sum + (s.accuracy || 0), 0) /
        subjectsWithAccuracy.length
      : 75; // neutral assumption if accuracy not logged

  const pyqVolumeScore = avgCoverageRatio * 60 + weakestSubjectRatio * 20;
  const pyqQualityScore = (avgPYQAccuracy / 100) * 20;
  const pyqScore = Math.round(clamp(pyqVolumeScore + pyqQualityScore, 0, 100));

  const pyqDimension: PreparationDimension = {
    id: 'pyq-mastery',
    name: 'PYQ Depth & Problem Mastery',
    weight: 20,
    score: pyqScore,
    level: getLevelFromScore(pyqScore),
    primaryMetric: `${totalPYQsSolved} Total PYQs Solved`,
    supportingDetail: `Weakest subject has ${minSolvedSubject} PYQs. Subject coverage index: ${Math.round(avgCoverageRatio * 100)}%.`,
    actionableTip:
      minSolvedSubject < 50
        ? `Solve at least 50 PYQs in your least-practiced subject to avoid exam blindspots.`
        : `Target 200+ PYQs across every subject to ensure full question-pattern familiarity.`,
  };

  // -------------------------------------------------------------
  // 3. Exam Performance (Weight 30%)
  // Mocks logged, Full Mocks vs Sectional, recency-weighted score %
  // -------------------------------------------------------------
  const totalMocks = mocks.length;
  const fullMocks = mocks.filter((m) => m.testType === 'FULL' || m.totalMarks >= 100);
  const now = Date.now();

  let recencyWeightedAverageMarksPercent = 0;
  let scoreVariance = 0;
  let testAccuracy = 0;

  if (totalMocks > 0) {
    // Exponential recency decay: lambda = 0.03 per day
    let totalWeight = 0;
    let weightedScoreSum = 0;

    const scoresNormalized: number[] = [];

    mocks.forEach((mock) => {
      const mockDate = mock.date ? new Date(mock.date).getTime() : now;
      const daysAgo = Math.max(0, (now - mockDate) / (1000 * 60 * 60 * 24));
      const decayWeight = Math.exp(-0.03 * daysAgo);
      const percent = (mock.score / Math.max(mock.totalMarks, 1)) * 100;

      scoresNormalized.push(percent);
      weightedScoreSum += percent * decayWeight;
      totalWeight += decayWeight;
    });

    recencyWeightedAverageMarksPercent = totalWeight > 0 ? weightedScoreSum / totalWeight : 0;

    // Calculate variance / standard deviation
    const mean = scoresNormalized.reduce((a, b) => a + b, 0) / scoresNormalized.length;
    const variance =
      scoresNormalized.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      scoresNormalized.length;
    scoreVariance = Math.sqrt(variance);

    // Accuracy from mocks
    const totalAttempted = mocks.reduce(
      (sum, m) => sum + Number(m.rightQuestions || 0) + Number(m.wrongQuestions || 0),
      0
    );
    const totalRight = mocks.reduce((sum, m) => sum + Number(m.rightQuestions || 0), 0);
    testAccuracy =
      totalAttempted > 0
        ? Math.round((totalRight / totalAttempted) * 100)
        : Math.round(recencyWeightedAverageMarksPercent);
  } else {
    // If no mocks logged, estimate from subject accuracies with cautious penalty
    const subjectAccAvg =
      subjects.length > 0
        ? subjects.reduce((sum, s) => sum + s.accuracy, 0) / subjects.length
        : 50;
    recencyWeightedAverageMarksPercent = Math.max(25, subjectAccAvg - 12);
    testAccuracy = recencyWeightedAverageMarksPercent;
    scoreVariance = 15;
  }

  // Volume factor (need full mocks for high score)
  const mockVolumeFactor = clamp(totalMocks / 35, 0, 1) * 0.5 + clamp(fullMocks.length / 20, 0, 1) * 0.5;
  const examPerformanceScore = Math.round(
    clamp(
      recencyWeightedAverageMarksPercent * 0.7 +
        mockVolumeFactor * 20 +
        (testAccuracy > 80 ? 10 : testAccuracy > 65 ? 5 : 0),
      15,
      100
    )
  );

  const examDimension: PreparationDimension = {
    id: 'exam-performance',
    name: 'Mock & Exam Simulation Performance',
    weight: 30,
    score: examPerformanceScore,
    level: getLevelFromScore(examPerformanceScore),
    primaryMetric: `${totalMocks} Mocks (${fullMocks.length} Full) | ${Math.round(recencyWeightedAverageMarksPercent)}% Avg`,
    supportingDetail: `Recent accuracy: ${testAccuracy}%. Score stability index: ±${Math.round(scoreVariance)} marks.`,
    actionableTip:
      totalMocks < 5
        ? 'Log at least 5 full-length mocks under strict exam conditions to stabilize prediction.'
        : 'Analyze time distribution and negative marking leak in the last 30 minutes of mocks.',
  };

  // -------------------------------------------------------------
  // 4. Revision Strength (Weight 10%)
  // Revision cycles, error logs, formula sheets
  // -------------------------------------------------------------
  const revTasksCompleted = revision?.completedTasks || 0;
  const revTasksTotal = revision?.totalTasks || 6;
  const cycle1 = revision?.cycle1Complete ? 35 : 0;
  const cycle2 = revision?.cycle2Complete ? 35 : 0;
  const cycle3 = revision?.cycle3Complete ? 30 : 0;
  const cyclesScore = cycle1 + cycle2 + cycle3;
  const taskRateScore = (revTasksCompleted / Math.max(revTasksTotal, 1)) * 100;
  const revisionScore = Math.round(clamp(Math.max(cyclesScore, taskRateScore), 0, 100));

  const revisionDimension: PreparationDimension = {
    id: 'revision-strength',
    name: 'Revision Depth & Cycles Completed',
    weight: 10,
    score: revisionScore,
    level: getLevelFromScore(revisionScore),
    primaryMetric: `${revTasksCompleted}/${revTasksTotal} Revision Cycles & Tasks Complete`,
    supportingDetail: `Cycle 1: ${revision?.cycle1Complete ? 'Done' : 'Pending'} | Cycle 2: ${revision?.cycle2Complete ? 'Done' : 'Pending'} | Cycle 3: ${revision?.cycle3Complete ? 'Done' : 'Pending'}`,
    actionableTip: revision?.cycle2Complete
      ? 'Outstanding revision pace. Continue quick weekly recall cycles.'
      : 'Complete Revision Cycle 2 for core subjects before attempting full-length mocks.',
  };

  // -------------------------------------------------------------
  // 5. Consistency & Habit (Weight 10%)
  // Streak continuity, daily hours, target completion
  // -------------------------------------------------------------
  const streakScore = clamp(currentStreak / 60, 0, 1) * 50;
  const targetScore = clamp(metrics.weeklyTargetCompletion / 80, 0, 1) * 25;
  const dailyHoursScore = clamp(metrics.dailyHours / 8.0, 0, 1) * 25;
  const consistencyScore = Math.round(clamp(streakScore + targetScore + dailyHoursScore, 10, 100));

  const consistencyDimension: PreparationDimension = {
    id: 'consistency-habit',
    name: 'Daily Execution Consistency & Streak',
    weight: 10,
    score: consistencyScore,
    level: getLevelFromScore(consistencyScore),
    primaryMetric: `${currentStreak} Day Streak | ${metrics.dailyHours}h Daily Avg`,
    supportingDetail: `Weekly target completion: ${metrics.weeklyTargetCompletion}%. Consistent habit index: ${consistencyScore}/100.`,
    actionableTip:
      currentStreak < 14
        ? 'Protect your daily 90-minute minimum study block to build an unbreakable streak.'
        : 'Great habit rhythm! Protect recovery and sleep to avoid burnout.',
  };

  // -------------------------------------------------------------
  // 6. Focus Quality & Depth (Weight 5%)
  // AI Focus sessions, distraction count, deep work hours
  // -------------------------------------------------------------
  let avgFocusRating = 75;
  let totalFocusedMinutes = 0;
  let deepRatio = 0.7;

  if (focusSessions.length > 0) {
    const scores = focusSessions
      .map((s) => s.averageFocusScore || s.focusScore || 75)
      .filter((s) => typeof s === 'number');
    if (scores.length > 0) {
      avgFocusRating = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    totalFocusedMinutes = focusSessions.reduce(
      (sum, s) => sum + Math.round((s.focusedSeconds || s.duration || 0) / 60),
      0
    );
    const paperMinutes = focusSessions.reduce(
      (sum, s) => sum + Math.round((s.paperFocusedSeconds || 0) / 60),
      0
    );
    deepRatio = totalFocusedMinutes > 0 ? (paperMinutes + totalFocusedMinutes * 0.5) / totalFocusedMinutes : 0.7;
  }

  const focusScore = Math.round(
    clamp(avgFocusRating * 0.6 + clamp(totalFocusedMinutes / 600, 0, 1) * 30 + deepRatio * 10, 20, 100)
  );

  const focusDimension: PreparationDimension = {
    id: 'focus-quality',
    name: 'Deep Work Focus & Attention Quality',
    weight: 5,
    score: focusScore,
    level: getLevelFromScore(focusScore),
    primaryMetric: `${Math.round(avgFocusRating)}% Average Focus Score`,
    supportingDetail: `${focusSessions.length} verified AI focus sessions logged (${Math.round(totalFocusedMinutes / 60)}h total deep work).`,
    actionableTip:
      focusSessions.length < 5
        ? 'Use the AI Focus Timer during PYQ sessions to train exam focus stamina.'
        : 'Keep distraction count below 3 per session to build 3-hour GATE exam concentration.',
  };

  // -------------------------------------------------------------
  // 7. Error Control & Retention (Weight 5%)
  // Mistake log analysis: silly mistakes vs conceptual mistakes
  // -------------------------------------------------------------
  let errorScore = 70;
  const sillyErrors = mistakePatterns.filter((m) =>
    (m.type || '').toLowerCase().includes('silly') || (m.type || '').toLowerCase().includes('calc')
  ).length;
  const conceptualErrors = mistakePatterns.filter((m) =>
    (m.type || '').toLowerCase().includes('concept')
  ).length;

  if (mistakePatterns.length > 0) {
    // If student logs mistakes, they are actively managing errors!
    // But high silly error proportion indicates execution leakage
    const sillyRatio = sillyErrors / mistakePatterns.length;
    errorScore = Math.round(clamp(85 - sillyRatio * 30 + Math.min(15, mistakePatterns.length), 30, 95));
  } else {
    // If no mistakes logged, neutral assumption
    errorScore = 65;
  }

  const errorDimension: PreparationDimension = {
    id: 'error-control',
    name: 'Error Log Discipline & Silly Mistake Control',
    weight: 5,
    score: errorScore,
    level: getLevelFromScore(errorScore),
    primaryMetric: `${mistakePatterns.length} Error Log Entries`,
    supportingDetail: `${sillyErrors} calculation/silly errors logged. ${conceptualErrors} conceptual errors identified.`,
    actionableTip:
      mistakePatterns.length < 5
        ? 'Log every incorrect question from your tests in the error notebook to eliminate repeat errors.'
        : 'Review your error log before every mock to avoid repeat calculation traps.',
  };

  // -------------------------------------------------------------
  // 8. Momentum & Trajectory (Weight 5%)
  // Recent improvements, velocity in mocks and study
  // -------------------------------------------------------------
  let momentumScore = 70;
  if (mocks.length >= 2) {
    const recent = mocks.slice(-3);
    const firstOfRecent = recent[0];
    const lastOfRecent = recent[recent.length - 1];
    const scoreDiff =
      (lastOfRecent.score / Math.max(lastOfRecent.totalMarks, 1)) * 100 -
      (firstOfRecent.score / Math.max(firstOfRecent.totalMarks, 1)) * 100;

    momentumScore = Math.round(clamp(65 + scoreDiff * 1.5 + (currentStreak > 7 ? 10 : 0), 25, 98));
  } else {
    momentumScore = Math.round(clamp(55 + (currentStreak > 7 ? 15 : 0), 30, 90));
  }

  const momentumDimension: PreparationDimension = {
    id: 'momentum-trajectory',
    name: 'Preparation Trajectory & Momentum',
    weight: 5,
    score: momentumScore,
    level: getLevelFromScore(momentumScore),
    primaryMetric: momentumScore >= 75 ? 'Accelerating Upward' : 'Stable Trajectory',
    supportingDetail: `Recent score trend and study consistency indicate ${momentumScore >= 75 ? 'positive growth' : 'consolidation phase'}.`,
    actionableTip: 'Maintain current velocity by keeping a strict weekly mock & analysis cadence.',
  };

  // -------------------------------------------------------------
  // Overall Readiness (Composite 0-100)
  // -------------------------------------------------------------
  const dimensionList: PreparationDimension[] = [
    knowledgeDimension,
    pyqDimension,
    examDimension,
    revisionDimension,
    consistencyDimension,
    focusDimension,
    errorDimension,
    momentumDimension,
  ];

  const overallReadiness = Math.round(
    dimensionList.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0)
  );

  // -------------------------------------------------------------
  // Subject Readiness Breakdown
  // -------------------------------------------------------------
  const subjectReadiness: SubjectReadiness[] = subjects.map((sub) => {
    const matchingPYQ = pyqs.find(
      (p) =>
        p.subject.toLowerCase().includes(sub.name.toLowerCase()) ||
        sub.name.toLowerCase().includes(p.subject.toLowerCase())
    );
    const solved = matchingPYQ?.totalSolved || 0;
    const pyqAcc = matchingPYQ?.accuracy ?? null;
    const testAcc = sub.accuracy || 70;

    // Composite subject readiness
    const syllabusComp = sub.topicsTotal > 0 ? (sub.topicsCompleted / sub.topicsTotal) * 100 : 0;
    const pyqVolumeComp = clamp(solved / 150, 0, 1) * 100;
    const compositeScore = Math.round(
      syllabusComp * 0.3 + (pyqAcc ?? testAcc) * 0.4 + pyqVolumeComp * 0.3
    );

    let status: SubjectReadiness['status'] = 'ON_TRACK';
    if (compositeScore >= 85) status = 'EXCELLENT';
    else if (compositeScore >= 70) status = 'ON_TRACK';
    else if (compositeScore >= 50) status = 'ATTENTION_NEEDED';
    else status = 'CRITICAL_GAP';

    return {
      id: sub.id,
      name: sub.name,
      examWeight: sub.examWeight || 5,
      syllabusCompletion: Math.round(syllabusComp),
      pyqsSolved: solved,
      pyqAccuracy: pyqAcc,
      testAccuracy: testAcc,
      compositeScore,
      status,
    };
  });

  // Data health indicators
  const isMockDataSufficient = totalMocks >= 5 && fullMocks.length >= 2;
  let dataQualityRating: 'HIGH' | 'MODERATE' | 'LOW' | 'PRELIMINARY' = 'PRELIMINARY';
  if (totalMocks >= 10 && fullMocks.length >= 5 && totalPYQsSolved >= 800) {
    dataQualityRating = 'HIGH';
  } else if (totalMocks >= 4 && totalPYQsSolved >= 300) {
    dataQualityRating = 'MODERATE';
  } else if (totalMocks >= 1 || totalPYQsSolved >= 100) {
    dataQualityRating = 'LOW';
  }

  return {
    overallReadiness,
    dimensions: {
      knowledgeCoverage: knowledgeDimension,
      pyqMastery: pyqDimension,
      examPerformance: examDimension,
      revisionStrength: revisionDimension,
      consistencyHabit: consistencyDimension,
      focusQuality: focusDimension,
      errorControl: errorDimension,
      momentumTrajectory: momentumDimension,
    },
    dimensionList,
    subjectReadiness,
    dataHealth: {
      totalMocksLogged: totalMocks,
      fullMocksLogged: fullMocks.length,
      totalPYQsLogged: totalPYQsSolved,
      recentStudyHours: metrics.dailyHours,
      currentStreak,
      isMockDataSufficient,
      dataQualityRating,
    },
  };
};
