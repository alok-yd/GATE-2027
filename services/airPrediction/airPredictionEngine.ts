import { calculateAIRFromMarks, calculateAIRFromScore } from './data/gateHistoricalData';
import { estimateMarksAndScore } from './marksScoreEstimator';
import { analyzePreparationState } from './preparationAnalyzer';
import {
  AIRPredictionResult,
  MarksEstimation,
  PreparationAnalysis,
  RankScenario,
  RankStability,
} from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const formatAIR = (air: number): string => {
  if (air <= 1) return 'AIR 1';
  if (air <= 10) return `AIR ${air}`;
  if (air <= 100) return `AIR ${air}`;
  if (air <= 1000) return `AIR ${air}`;
  return `AIR ${air.toLocaleString()}`;
};

/**
 * Calculates mathematically derived confidence percentage (0-100%).
 * NO hardcoded static numbers.
 */
const calculateMathematicalConfidence = (
  analysis: PreparationAnalysis,
  marksEst: MarksEstimation
): number => {
  const { dataHealth, dimensions } = analysis;

  // Factor 1: Mock Test Evidence (Max 40 points)
  // Need at least 5 mocks for baseline reliability; 20+ mocks for full confidence
  const totalMocks = dataHealth.totalMocksLogged;
  const fullMocks = dataHealth.fullMocksLogged;
  const mockEvidencePoints =
    clamp(totalMocks / 25, 0, 1) * 25 + clamp(fullMocks / 15, 0, 1) * 15;

  // Factor 2: PYQ Solving Breadth (Max 20 points)
  const pyqs = dataHealth.totalPYQsLogged;
  const pyqEvidencePoints = clamp(pyqs / 1500, 0, 1) * 20;

  // Factor 3: Revision & Syllabus Coverage (Max 20 points)
  const syllabusPoints = (dimensions.knowledgeCoverage.score / 100) * 10;
  const revisionPoints = (dimensions.revisionStrength.score / 100) * 10;

  // Factor 4: Consistency & Habit Stability (Max 10 points)
  const consistencyPoints = (dimensions.consistencyHabit.score / 100) * 10;

  // Factor 5: Spread Penalty (if bounds are very wide, confidence is lower)
  const spread = marksEst.marksUpperBound - marksEst.marksLowerBound;
  const spreadPenalty = clamp((spread - 8) * 1.5, 0, 15);

  const rawConfidence =
    15 + // Minimum base certainty of preparation trajectory
    mockEvidencePoints +
    pyqEvidencePoints +
    syllabusPoints +
    revisionPoints +
    consistencyPoints -
    spreadPenalty;

  return Math.round(clamp(rawConfidence, 15, 96));
};

/**
 * Classifies rank stability based on variance, data volume, and recency.
 */
const determineRankStability = (
  analysis: PreparationAnalysis,
  confidence: number
): RankStability => {
  const { dataHealth } = analysis;
  if (dataHealth.totalMocksLogged < 2) return 'PRELIMINARY';
  if (confidence >= 80 && dataHealth.fullMocksLogged >= 5) return 'HIGHLY_STABLE';
  if (confidence >= 55) return 'MODERATE';
  return 'VOLATILE';
};

/**
 * Generates explainability drivers (Positive, Limiting, Uncertainty).
 */
const extractExplainabilityDrivers = (
  analysis: PreparationAnalysis,
  marksEst: MarksEstimation
): { positiveDrivers: string[]; limitingFactors: string[]; uncertaintySources: string[] } => {
  const { dimensions, subjectReadiness, dataHealth } = analysis;

  const positiveDrivers: string[] = [];
  const limitingFactors: string[] = [];
  const uncertaintySources: string[] = [];

  // Positive drivers
  if (dimensions.knowledgeCoverage.score >= 80) {
    positiveDrivers.push(
      `Strong syllabus coverage (${dimensions.knowledgeCoverage.score}%) provides a broad question-attempt ceiling.`
    );
  }
  if (dimensions.pyqMastery.score >= 65) {
    positiveDrivers.push(
      `Solid problem solving foundation with ${dataHealth.totalPYQsLogged} PYQs solved across key subjects.`
    );
  }
  if (dimensions.consistencyHabit.score >= 70) {
    positiveDrivers.push(
      `Consistent daily execution with active ${dataHealth.currentStreak}-day streak protects momentum.`
    );
  }
  if (dimensions.revisionStrength.score >= 60) {
    positiveDrivers.push(
      `Structured revision cycles completed ensure long-term retention of core formulas and theorems.`
    );
  }
  if (positiveDrivers.length === 0) {
    positiveDrivers.push(
      'Active preparation framework established; steady baseline across primary GATE CSE subjects.'
    );
  }

  // Limiting factors
  const weakSubjects = subjectReadiness
    .filter((s) => s.status === 'CRITICAL_GAP' || s.status === 'ATTENTION_NEEDED')
    .slice(0, 2);
  if (weakSubjects.length > 0) {
    limitingFactors.push(
      `Knowledge or PYQ gaps in high-weight subjects (${weakSubjects.map((s) => s.name).join(', ')}) leak marks.`
    );
  }
  if (marksEst.negativeMarkingRiskMarks >= 6) {
    limitingFactors.push(
      `Estimated negative marking risk leaks ~${marksEst.negativeMarkingRiskMarks} marks due to unforced errors.`
    );
  }
  if (dimensions.revisionStrength.score < 50) {
    limitingFactors.push(
      'Pending revision cycles may cause formula recall hesitation under 3-hour exam pressure.'
    );
  }
  if (limitingFactors.length === 0) {
    limitingFactors.push(
      'Maintaining peak precision in 2-mark MSQs and NAT calculation accuracy is the final frontier.'
    );
  }

  // Uncertainty sources
  if (dataHealth.totalMocksLogged < 5) {
    uncertaintySources.push(
      `Only ${dataHealth.totalMocksLogged} mock(s) logged. Prediction interval will tighten substantially after 5+ full mocks.`
    );
  }
  if (dataHealth.fullMocksLogged < 3) {
    uncertaintySources.push(
      'Limited full-length 3-hour mock data; sectional tests do not fully simulate end-of-exam mental fatigue.'
    );
  }
  if (marksEst.marksUpperBound - marksEst.marksLowerBound > 12) {
    uncertaintySources.push(
      'Wide marks spread reflects preliminary stage of test logging and variable question selection strategy.'
    );
  }
  if (uncertaintySources.length === 0) {
    uncertaintySources.push(
      'Variability stems purely from real GATE paper difficulty shifts (moderate vs tough paper normalizations).'
    );
  }

  return {
    positiveDrivers: positiveDrivers.slice(0, 3),
    limitingFactors: limitingFactors.slice(0, 3),
    uncertaintySources: uncertaintySources.slice(0, 3),
  };
};

/**
 * Predicts AIR with multi-model ensemble, scenarios, and confidence metrics.
 */
export const predictAIR = (analysis: PreparationAnalysis): AIRPredictionResult => {
  const marksEstimation = estimateMarksAndScore(analysis);

  // Derive AIR using both marks-based curve and score-based curve
  const airFromMarks = calculateAIRFromMarks(marksEstimation.expectedMarks);
  const airFromScore = calculateAIRFromScore(marksEstimation.estimatedScore);
  // Geometric mean ensemble of both interpolation methods
  const medianAIR = Math.max(1, Math.round(Math.sqrt(airFromMarks * airFromScore)));

  // Lower bound marks -> Pessimistic AIR (higher rank number)
  const conservativeMarks = marksEstimation.marksLowerBound;
  const conservativeScore = marksEstimation.scoreLowerBound;
  const upperAIR = Math.max(
    medianAIR + 5,
    Math.round(
      Math.sqrt(
        calculateAIRFromMarks(conservativeMarks) * calculateAIRFromScore(conservativeScore)
      )
    )
  );

  // Upper bound marks -> Optimistic AIR (lower rank number)
  const optimisticMarks = marksEstimation.marksUpperBound;
  const optimisticScore = marksEstimation.scoreUpperBound;
  const lowerAIR = Math.max(
    1,
    Math.round(
      Math.sqrt(calculateAIRFromMarks(optimisticMarks) * calculateAIRFromScore(optimisticScore))
    )
  );

  // Confidence & Stability
  const confidencePercentage = calculateMathematicalConfidence(analysis, marksEstimation);
  const stability = determineRankStability(analysis, confidencePercentage);

  // Scenarios
  const conservativeScenario: RankScenario = {
    id: 'CONSERVATIVE',
    title: 'Conservative Scenario',
    marks: conservativeMarks,
    gateScore: conservativeScore,
    estimatedAIR: upperAIR,
    airDisplay: formatAIR(upperAIR),
    probability: 20,
    description: 'Tough exam paper, higher negative marking penalty, unforced silly mistakes.',
    assumptions: [
      `Negative marking leak: -${marksEstimation.negativeMarkingRiskMarks} marks`,
      'Paper difficulty in top 20th percentile (comparable to GATE 2022/2023)',
      'Hesitation on 2-mark MSQ questions',
    ],
  };

  const expectedScenario: RankScenario = {
    id: 'EXPECTED',
    title: 'Expected Scenario',
    marks: marksEstimation.expectedMarks,
    gateScore: marksEstimation.estimatedScore,
    estimatedAIR: medianAIR,
    airDisplay: formatAIR(medianAIR),
    probability: 60,
    description: 'Current standard trajectory with normal exam distribution and pacing.',
    assumptions: [
      'Performance aligns with recent mock score trend and verified PYQ mastery',
      'Standard GATE paper difficulty profile',
      'Solid time management across Aptitude and core subjects',
    ],
  };

  const highPerformanceScenario: RankScenario = {
    id: 'HIGH_PERFORMANCE',
    title: 'High-Performance Scenario',
    marks: optimisticMarks,
    gateScore: optimisticScore,
    estimatedAIR: lowerAIR,
    airDisplay: formatAIR(lowerAIR),
    probability: 20,
    description: 'Peak execution, zero silly errors, high accuracy in Aptitude & Math, seamless recall.',
    assumptions: [
      'Near-perfect execution in General Aptitude & Engineering Math (24+ marks)',
      'Revision Cycle 2 & 3 fully active during exam recall',
      'Clean calculation verification eliminates unforced error leak',
    ],
  };

  const { positiveDrivers, limitingFactors, uncertaintySources } = extractExplainabilityDrivers(
    analysis,
    marksEstimation
  );

  return {
    medianAIR,
    airDisplay: formatAIR(medianAIR),
    lowerAIR,
    upperAIR,
    likelyRangeDisplay: `${formatAIR(lowerAIR)} – ${formatAIR(upperAIR)}`,
    confidencePercentage,
    stability,
    marksEstimation,
    scenarios: {
      conservative: conservativeScenario,
      expected: expectedScenario,
      highPerformance: highPerformanceScenario,
    },
    positiveDrivers,
    limitingFactors,
    uncertaintySources,
    timestamp: new Date().toISOString(),
  };
};
