// types.ts for AIR Prediction & Preparation Intelligence

export type DimensionLevel = 'CRITICAL' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERY';

export interface PreparationDimension {
  id: string;
  name: string;
  weight: number; // 0 - 100 percentage weight
  score: number; // 0 - 100 normalized score
  level: DimensionLevel;
  primaryMetric: string;
  supportingDetail: string;
  actionableTip: string;
}

export interface SubjectReadiness {
  id: string;
  name: string;
  examWeight: number; // percentage in GATE CSE (e.g. 15 for Aptitude)
  syllabusCompletion: number; // 0 - 100%
  pyqsSolved: number; // raw count
  pyqAccuracy: number | null; // 0 - 100% if available
  testAccuracy: number; // 0 - 100%
  compositeScore: number; // 0 - 100%
  status: 'EXCELLENT' | 'ON_TRACK' | 'ATTENTION_NEEDED' | 'CRITICAL_GAP';
}

export interface PreparationAnalysis {
  overallReadiness: number; // 0 - 100
  dimensions: {
    knowledgeCoverage: PreparationDimension;
    pyqMastery: PreparationDimension;
    examPerformance: PreparationDimension;
    revisionStrength: PreparationDimension;
    consistencyHabit: PreparationDimension;
    focusQuality: PreparationDimension;
    errorControl: PreparationDimension;
    momentumTrajectory: PreparationDimension;
  };
  dimensionList: PreparationDimension[];
  subjectReadiness: SubjectReadiness[];
  dataHealth: {
    totalMocksLogged: number;
    fullMocksLogged: number;
    totalPYQsLogged: number;
    recentStudyHours: number;
    currentStreak: number;
    isMockDataSufficient: boolean;
    dataQualityRating: 'HIGH' | 'MODERATE' | 'LOW' | 'PRELIMINARY';
  };
}

export interface MarksEstimation {
  expectedMarks: number; // e.g. 64.5
  marksLowerBound: number; // conservative e.g. 56.0
  marksUpperBound: number; // optimistic e.g. 72.0
  estimatedScore: number; // GATE score 0 - 1000 scale
  scoreLowerBound: number;
  scoreUpperBound: number;
  negativeMarkingRiskMarks: number; // marks likely lost to negative marking
  syllabusGapPenaltyMarks: number; // marks unattempted due to gaps
}

export interface RankScenario {
  id: 'CONSERVATIVE' | 'EXPECTED' | 'HIGH_PERFORMANCE';
  title: string;
  marks: number;
  gateScore: number;
  estimatedAIR: number;
  airDisplay: string;
  probability: number; // e.g. 20%, 60%, 20%
  description: string;
  assumptions: string[];
}

export type RankStability = 'HIGHLY_STABLE' | 'MODERATE' | 'VOLATILE' | 'PRELIMINARY';

export interface AIRPredictionResult {
  medianAIR: number;
  airDisplay: string;
  lowerAIR: number; // optimistic (lower number is better rank, e.g. 150)
  upperAIR: number; // pessimistic (higher number is worse rank, e.g. 450)
  likelyRangeDisplay: string;
  confidencePercentage: number; // 0 - 100%
  stability: RankStability;
  marksEstimation: MarksEstimation;
  scenarios: {
    conservative: RankScenario;
    expected: RankScenario;
    highPerformance: RankScenario;
  };
  positiveDrivers: string[];
  limitingFactors: string[];
  uncertaintySources: string[];
  timestamp: string;
}

export type CandidateCategory = 'GEN' | 'OBC' | 'SC' | 'ST' | 'EWS';

export type CutoffType =
  | 'DIRECT_COAP' // Direct offer without interview/written test
  | 'WRITTEN_AND_INTERVIEW' // Shortlist for written test + interview
  | 'CCMT_REGULAR' // NITs regular rounds
  | 'CCMT_SPECIAL' // NITs special round
  | 'INSTITUTE_DIRECT'; // Direct offer from autonomous institute (e.g. IIIT-B)

export type CompatibilityStatus =
  | 'HISTORICALLY_ABOVE' // > +25 score above closing
  | 'HISTORICALLY_WITHIN_RANGE' // -10 to +25 score
  | 'BORDERLINE' // -30 to -10 score
  | 'BELOW_HISTORICAL_RANGE'; // < -30 score

export interface CollegeCutoffRecord {
  id: string;
  institute: string;
  shortName: string;
  type: 'IIT' | 'NIT' | 'IIIT' | 'OTHER';
  program: string;
  cutoffType: CutoffType;
  closingScores: Record<CandidateCategory, number>;
  notes?: string;
  interviewWeightage?: string;
}

export interface CollegeMatchResult {
  record: CollegeCutoffRecord;
  targetCategory: CandidateCategory;
  closingScore: number;
  userScore: number;
  delta: number;
  status: CompatibilityStatus;
  statusText: string;
}

export interface WhatIfParameters {
  mockMarksDelta: number; // -10 to +20 marks
  pyqAccuracyDelta: number; // -10% to +20%
  sillyMistakesSaved: number; // 0 to 12 marks
  revisionCyclesComplete: number; // 1, 2, or 3
}

export interface WhatIfSimulationResult {
  projectedMarks: number;
  projectedScore: number;
  projectedAIR: number;
  airDelta: number; // positive means rank jumped up (e.g. +250 ranks improved)
  marksDelta: number;
  projectedRange: string;
  newMatchesUnlocked: string[];
}

export interface PredictionSnapshot {
  date: string;
  expectedMarks: number;
  estimatedScore: number;
  medianAIR: number;
  lowerAIR: number;
  upperAIR: number;
  readinessScore: number;
  confidence: number;
}
