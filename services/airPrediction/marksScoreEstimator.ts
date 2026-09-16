import { calculateGateScoreFromMarks } from './data/gateHistoricalData';
import { MarksEstimation, PreparationAnalysis } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Estimates GATE marks and corresponding GATE Score (0-1000 scale).
 *
 * ARCHITECTURAL RULE:
 * Exam evidence (Mocks + PYQ mastery) forms the foundational anchor for expected marks.
 * Habit metrics (streak, focus hours, revision) modify the confidence interval, ceiling,
 * and negative-marking risk, but do NOT artificially inflate marks beyond demonstrated
 * problem-solving ability.
 */
export const estimateMarksAndScore = (analysis: PreparationAnalysis): MarksEstimation => {
  const { dimensions, subjectReadiness, dataHealth } = analysis;

  // 1. Exam Performance Base (0 - 100 scale)
  const examScore = dimensions.examPerformance.score;
  const pyqScore = dimensions.pyqMastery.score;
  const knowledgeScore = dimensions.knowledgeCoverage.score;
  const errorScore = dimensions.errorControl.score;
  const revisionScore = dimensions.revisionStrength.score;

  // Base marks estimate:
  // If mocks are logged, they dominate (75% mock performance + 25% PYQ mastery).
  // If no mocks are logged, PYQ mastery + syllabus coverage anchors the marks with an uncertainty discount.
  let rawExpectedMarks = 0;

  if (dataHealth.totalMocksLogged > 0) {
    // Convert exam score (0-100) to expected GATE marks (GATE paper max is 100)
    // Exam score reflects percentage performance in mocks
    const mockComponent = (examScore / 100) * 85; // Mocks are typically ~5-10% harder than real GATE
    const pyqComponent = (pyqScore / 100) * 75;
    rawExpectedMarks = mockComponent * 0.75 + pyqComponent * 0.25;
  } else {
    // Conservative baseline when no mocks have been logged
    const knowledgeComponent = (knowledgeScore / 100) * 65;
    const pyqComponent = (pyqScore / 100) * 65;
    rawExpectedMarks = knowledgeComponent * 0.5 + pyqComponent * 0.5;
  }

  // 2. Syllabus Gap Penalty: calculate marks likely left unattempted in low-coverage high-weight subjects
  const criticalGaps = subjectReadiness.filter(
    (s) => s.syllabusCompletion < 60 && s.examWeight >= 7
  );
  const syllabusGapPenaltyMarks = Math.round(
    criticalGaps.reduce((sum, s) => sum + s.examWeight * 0.35, 0) * 10
  ) / 10;

  // 3. Negative Marking Leak: derived from error control & accuracy
  // Average candidate loses 6-12 marks to negative marking. Strong error control limits this to 2-4 marks.
  const negativeMarkingRiskMarks = Math.round(
    clamp(12 - (errorScore / 100) * 8, 2.0, 14.0) * 10
  ) / 10;

  // Adjust expected marks
  let expectedMarks = rawExpectedMarks - syllabusGapPenaltyMarks * 0.4;
  expectedMarks = Math.round(clamp(expectedMarks, 15.0, 95.0) * 10) / 10;

  // 4. Uncertainty spread (Lower and Upper bounds)
  // Spread narrows when data is abundant and stable, widens when data is sparse.
  let spread = 8.0;
  if (dataHealth.dataQualityRating === 'HIGH') {
    spread = 4.5;
  } else if (dataHealth.dataQualityRating === 'MODERATE') {
    spread = 6.5;
  } else if (dataHealth.dataQualityRating === 'LOW') {
    spread = 9.0;
  } else {
    spread = 12.0; // Preliminary
  }

  // Revision bonus to upper bound (strong revision enables peak retention on exam day)
  const revisionBonus = (revisionScore / 100) * 3.0;

  const marksLowerBound = Math.max(10.0, Math.round((expectedMarks - spread) * 10) / 10);
  const marksUpperBound = Math.min(
    98.0,
    Math.round((expectedMarks + spread + revisionBonus) * 10) / 10
  );

  // 5. Convert Marks to GATE Score (0 - 1000 scale) using historical normalization formula
  const estimatedScore = calculateGateScoreFromMarks(expectedMarks);
  const scoreLowerBound = calculateGateScoreFromMarks(marksLowerBound);
  const scoreUpperBound = calculateGateScoreFromMarks(marksUpperBound);

  return {
    expectedMarks,
    marksLowerBound,
    marksUpperBound,
    estimatedScore,
    scoreLowerBound,
    scoreUpperBound,
    negativeMarkingRiskMarks,
    syllabusGapPenaltyMarks,
  };
};
