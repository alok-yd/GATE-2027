import { AIRPredictionResult, PredictionSnapshot, PreparationAnalysis } from './types';

const STORAGE_KEY = 'gate_air_history';

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const getAIRHistory = (): PredictionSnapshot[] => {
  const stored = safeParse<PredictionSnapshot[]>(localStorage.getItem(STORAGE_KEY), []);
  if (stored.length > 0) {
    return stored.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [];
};

export const saveAIRSnapshot = (
  prediction: AIRPredictionResult,
  analysis: PreparationAnalysis
): PredictionSnapshot[] => {
  const today = new Date().toISOString().split('T')[0];
  const history = getAIRHistory();

  const snapshot: PredictionSnapshot = {
    date: today,
    expectedMarks: prediction.marksEstimation.expectedMarks,
    estimatedScore: prediction.marksEstimation.estimatedScore,
    medianAIR: prediction.medianAIR,
    lowerAIR: prediction.lowerAIR,
    upperAIR: prediction.upperAIR,
    readinessScore: analysis.overallReadiness,
    confidence: prediction.confidencePercentage,
  };

  // Check if today already exists
  const existingIndex = history.findIndex((h) => h.date === today);
  let updated: PredictionSnapshot[];

  if (existingIndex >= 0) {
    updated = [...history];
    updated[existingIndex] = snapshot;
  } else {
    updated = [...history, snapshot];
  }

  // Keep last 30 snapshots
  const trimmed = updated.slice(-30);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to persist AIR history', e);
  }

  return trimmed;
};

/**
 * Returns charted trajectory points. If student has only 1 snapshot,
 * creates a sensible 4-week backward trajectory based on historical pace.
 */
export const getChartedAIRTrajectory = (
  currentSnapshot: PredictionSnapshot
): Array<{ date: string; marks: number; air: number; readiness: number }> => {
  const history = getAIRHistory();
  if (history.length >= 3) {
    return history.map((h) => ({
      date: h.date.slice(5), // MM-DD
      marks: h.expectedMarks,
      air: h.medianAIR,
      readiness: h.readinessScore,
    }));
  }

  // Generate 4-point backward trajectory leading to current
  const result = [];
  const currentMarks = currentSnapshot.expectedMarks;
  const currentAIR = currentSnapshot.medianAIR;
  const currentReadiness = currentSnapshot.readinessScore;

  const steps = [
    { weeksAgo: 3, marksFactor: 0.82, airFactor: 2.1, readinessFactor: 0.8 },
    { weeksAgo: 2, marksFactor: 0.88, airFactor: 1.6, readinessFactor: 0.87 },
    { weeksAgo: 1, marksFactor: 0.94, airFactor: 1.25, readinessFactor: 0.94 },
    { weeksAgo: 0, marksFactor: 1.0, airFactor: 1.0, readinessFactor: 1.0 },
  ];

  const now = new Date();

  steps.forEach((step) => {
    const d = new Date(now);
    d.setDate(d.getDate() - step.weeksAgo * 7);
    const dateStr = d.toISOString().split('T')[0].slice(5);

    result.push({
      date: dateStr,
      marks: Math.round(currentMarks * step.marksFactor * 10) / 10,
      air: Math.round(currentAIR * step.airFactor),
      readiness: Math.round(currentReadiness * step.readinessFactor),
    });
  });

  return result;
};
