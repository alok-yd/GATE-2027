import { SignalConflictLog } from '../../types';
import { SignalValidationReport } from './SignalValidator';
import { PersonPresenceResult } from './PersonPresenceEngine';

export interface ResolvedSignalScores {
  faceScore: number;         // 0 to 100
  headPoseScore: number;     // 0 to 100
  eyeGazeScore: number;      // 0 to 100
  deskActivityScore: number; // 0 to 100
  lightingScore: number;     // 0 to 100
  activeConflicts: SignalConflictLog[];
  resolvedExplanation: string;
}

export class ConflictResolver {
  private conflictHistory: SignalConflictLog[] = [];

  resolve(
    validation: SignalValidationReport,
    presence: PersonPresenceResult,
    rawHeadPoseScore: number,
    rawEyeGazeScore: number,
    rawDeskScore: number,
    isLookingDown: boolean,
    isPhoneSuspected: boolean
  ): ResolvedSignalScores {
    const now = validation.timestamp || Date.now();
    const activeConflicts: SignalConflictLog[] = [];

    let faceScore = 0;
    let headPoseScore = rawHeadPoseScore;
    let eyeGazeScore = rawEyeGazeScore;
    let deskActivityScore = rawDeskScore;
    const lightingScore = Math.round(validation.visionQuality.value * 100);

    // 1. Resolve Face Sensor Discrepancy (Face Presence = 0 vs Head Pose / Gaze = High)
    if (!validation.facePresence.value && presence.isPersonPresent) {
      // Conflict: Face detector dropped skin envelope, but body & pose confirm presence
      const conflictLog: SignalConflictLog = {
        id: 'sc_' + now,
        timestamp: now,
        description: 'Face envelope dropped during head-down study or shadow; person presence confirmed by pose/desk geometry',
        detectorSignals: {
          faceDetector: 'FAIL (skin < 4%)',
          poseDetector: `PASS (${validation.headPose.value.pitch}° pitch)`,
          bodyDetector: 'PASS (seated centroid stable)',
          recentFrames: 'PASS (active workstation presence)'
        },
        resolvedState: presence.state
      };
      activeConflicts.push(conflictLog);
      this.conflictHistory.push(conflictLog);
      if (this.conflictHistory.length > 20) this.conflictHistory.shift();

      // Resolved Face Score: normalize to reasonable presence score (75-85) instead of 0!
      faceScore = presence.state === 'PERSON_PRESENT' ? 88 : 78;
    } else if (validation.facePresence.value) {
      faceScore = validation.facePresence.confidence >= 0.80 ? 100 : 80;
    } else {
      faceScore = 0;
      // If person is truly absent, head pose and gaze must NOT remain 98 / 95!
      headPoseScore = 0;
      eyeGazeScore = 0;
    }

    // 2. Specificity Rule: Phone Detection > Generic Desk Motion
    // If phone interaction is suspected, desk activity should not be treated as generic paper writing
    if (isPhoneSuspected && isLookingDown) {
      // Mute generic desk writing score to prevent phone from masquerading as paper writing
      deskActivityScore = Math.min(deskActivityScore, 30);
    }

    const resolvedExplanation = activeConflicts.length > 0
      ? activeConflicts[0].description
      : (presence.isPersonPresent ? 'All sensory signals consistent and validated' : 'Confirmed workstation departure');

    return {
      faceScore,
      headPoseScore,
      eyeGazeScore,
      deskActivityScore,
      lightingScore,
      activeConflicts,
      resolvedExplanation
    };
  }

  getConflictHistory(): SignalConflictLog[] {
    return this.conflictHistory;
  }
}

export const conflictResolver = new ConflictResolver();
