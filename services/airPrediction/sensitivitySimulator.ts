import { calculateAIRFromMarks, calculateGateScoreFromMarks } from './data/gateHistoricalData';
import { HISTORICAL_COLLEGE_CUTOFFS } from './data/instituteCutoffs';
import {
  AIRPredictionResult,
  CandidateCategory,
  WhatIfParameters,
  WhatIfSimulationResult,
} from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Simulates the impact of concrete preparation improvements on Marks, Score, and AIR.
 */
export const runWhatIfSimulation = (
  currentPrediction: AIRPredictionResult,
  params: WhatIfParameters,
  category: CandidateCategory = 'GEN'
): WhatIfSimulationResult => {
  const currentMarks = currentPrediction.marksEstimation.expectedMarks;
  const currentAIR = currentPrediction.medianAIR;
  const currentScore = currentPrediction.marksEstimation.estimatedScore;

  // Calculate marks delta from parameter improvements
  // 1. Direct mock marks improvement
  const mockMarksGain = params.mockMarksDelta;

  // 2. Silly mistakes saved (directly adds back marks that would otherwise be lost)
  const sillyMarksGain = params.sillyMistakesSaved;

  // 3. PYQ accuracy boost (10% higher PYQ accuracy typically converts to ~3.5 marks on exam day)
  const pyqMarksGain = (params.pyqAccuracyDelta / 10) * 3.5;

  // 4. Revision cycles completion boost (moving from 1 to 3 cycles adds ~4 marks of long-term formula recall)
  const revisionBonus = Math.max(0, params.revisionCyclesComplete - 1) * 2.0;

  const totalMarksDelta = Math.round(
    (mockMarksGain + sillyMarksGain + pyqMarksGain + revisionBonus) * 10
  ) / 10;

  const projectedMarks = clamp(
    Math.round((currentMarks + totalMarksDelta) * 10) / 10,
    15.0,
    98.0
  );

  const projectedScore = calculateGateScoreFromMarks(projectedMarks);
  const projectedAIR = calculateAIRFromMarks(projectedMarks);

  // AIR delta: positive means rank improved (e.g. went from AIR 800 to AIR 300 = +500 ranks improved)
  const airDelta = currentAIR - projectedAIR;

  // Projected range (±15% spread around projected AIR)
  const optAIR = Math.max(1, Math.round(projectedAIR * 0.75));
  const pesAIR = Math.round(projectedAIR * 1.35);
  const projectedRange = `AIR ${optAIR.toLocaleString()} – ${pesAIR.toLocaleString()}`;

  // Find institutes unlocked by this improvement
  const newMatchesUnlocked: string[] = [];
  HISTORICAL_COLLEGE_CUTOFFS.forEach((college) => {
    const cutoff = college.closingScores[category] || college.closingScores.GEN;
    if (currentScore < cutoff && projectedScore >= cutoff) {
      newMatchesUnlocked.push(`${college.shortName} (${college.program})`);
    }
  });

  return {
    projectedMarks,
    projectedScore,
    projectedAIR,
    airDelta,
    marksDelta: totalMarksDelta,
    projectedRange,
    newMatchesUnlocked: newMatchesUnlocked.slice(0, 4),
  };
};
