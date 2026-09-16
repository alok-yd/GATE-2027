import { HISTORICAL_COLLEGE_CUTOFFS } from './data/instituteCutoffs';
import {
  CandidateCategory,
  CollegeCutoffRecord,
  CollegeMatchResult,
  CompatibilityStatus,
} from './types';

/**
 * Compares the candidate's estimated GATE score against historical closing scores.
 *
 * CRITICAL ARCHITECTURAL RULE:
 * This comparison is strictly a downstream advisory tool.
 * Cutoffs are NEVER fed backwards into the marks or AIR prediction model.
 */
export const evaluateCollegeCompatibility = (
  userScore: number,
  category: CandidateCategory = 'GEN',
  instituteTypeFilter?: 'ALL' | 'IIT' | 'NIT' | 'IIIT'
): CollegeMatchResult[] => {
  let records = HISTORICAL_COLLEGE_CUTOFFS;

  if (instituteTypeFilter && instituteTypeFilter !== 'ALL') {
    records = records.filter((r) => r.type === instituteTypeFilter);
  }

  return records.map((record) => {
    const closingScore = record.closingScores[category] ?? record.closingScores.GEN;
    const delta = userScore - closingScore;

    let status: CompatibilityStatus;
    let statusText: string;

    if (delta >= 25) {
      status = 'HISTORICALLY_ABOVE';
      statusText =
        record.cutoffType === 'DIRECT_COAP'
          ? 'Strong Direct Offer Chance'
          : 'High Probability Shortlist';
    } else if (delta >= -10) {
      status = 'HISTORICALLY_WITHIN_RANGE';
      statusText =
        record.cutoffType === 'DIRECT_COAP'
          ? 'Competitive Range (COAP Rounds 1-5)'
          : 'Competitive Shortlist (Written/Interview)';
    } else if (delta >= -35) {
      status = 'BORDERLINE';
      statusText =
        record.type === 'NIT'
          ? 'Possible in CCMT Special Rounds'
          : 'Borderline for Subsequent Rounds';
    } else {
      status = 'BELOW_HISTORICAL_RANGE';
      statusText = `Score gap of ${Math.abs(delta)} points`;
    }

    return {
      record,
      targetCategory: category,
      closingScore,
      userScore,
      delta,
      status,
      statusText,
    };
  });
};

export const getCollegeCompatibilitySummary = (
  matches: CollegeMatchResult[]
): {
  directOfferCount: number;
  competitiveCount: number;
  borderlineCount: number;
  topMatches: CollegeMatchResult[];
} => {
  const directOfferCount = matches.filter((m) => m.status === 'HISTORICALLY_ABOVE').length;
  const competitiveCount = matches.filter((m) => m.status === 'HISTORICALLY_WITHIN_RANGE').length;
  const borderlineCount = matches.filter((m) => m.status === 'BORDERLINE').length;

  const topMatches = matches
    .filter((m) => m.status === 'HISTORICALLY_ABOVE' || m.status === 'HISTORICALLY_WITHIN_RANGE')
    .slice(0, 6);

  return {
    directOfferCount,
    competitiveCount,
    borderlineCount,
    topMatches,
  };
};
