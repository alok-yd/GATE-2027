import { FocusClassifier, FocusFeatureVector, FocusClassificationResult, FocusState } from '../../types';
import { FocusConfig } from '../../constants/FocusConfig';

export class RuleBasedFocusClassifier implements FocusClassifier {
  classify(features: FocusFeatureVector): FocusClassificationResult {
    const scores: Record<string, number> = {};

    // 1. Absence / Camera check
    if (features.cameraHealthConfidence < 0.25) {
      return {
        recommendedState: 'UNCERTAIN',
        confidence: 0.95,
        explanation: 'Camera feed quality degraded or frozen',
        featureScores: { cameraHealth: features.cameraHealthConfidence }
      };
    }

    if (!features.facePresent || features.faceConfidence < FocusConfig.presenceThreshold) {
      return {
        recommendedState: 'AWAY',
        confidence: 0.96,
        explanation: 'User is not detected in front of workstation',
        featureScores: { faceConfidence: features.faceConfidence }
      };
    }

    // 2. Phone Use check (Distinguishes Phone Present from Phone In Use)
    const isPhoneHeldOrInteracted =
      features.phoneConfidence >= FocusConfig.phoneInUseThreshold ||
      (features.phoneConfidence >= FocusConfig.phoneThreshold && (features.phoneHandOverlap > 0.25 || features.phoneDistanceFromFace < 100));

    if (isPhoneHeldOrInteracted) {
      return {
        recommendedState: 'PHONE_USE',
        confidence: Math.max(0.75, features.phoneConfidence),
        explanation: 'Smartphone / handheld device in active use',
        featureScores: {
          phoneConfidence: features.phoneConfidence,
          handOverlap: features.phoneHandOverlap,
          distanceFromFace: features.phoneDistanceFromFace
        }
      };
    }

    // 3. Paper / PYQ Study check
    // Downward gaze/pitch (-8 to -35 deg) + desk motion or writing activity
    const isDownwardAngle = features.headPitch <= -8 || features.deskActivityScore > 0.45;
    const isPaperEvidenceStrong =
      (features.paperActivityScore >= FocusConfig.paperThreshold) ||
      (isDownwardAngle && (features.handActivity || features.deskActivityScore > 0.35));

    if (isPaperEvidenceStrong && features.studyMedium !== 'Screen Study') {
      return {
        recommendedState: 'FOCUSED_PAPER',
        confidence: Math.min(0.96, 0.70 + features.paperActivityScore * 0.25),
        explanation: 'Verified handwritten PYQ solving & paper notes study',
        featureScores: {
          paperActivityScore: features.paperActivityScore,
          headPitch: features.headPitch,
          deskActivityScore: features.deskActivityScore
        }
      };
    }

    // 4. Thinking state check
    // Head relatively still, stable posture, low movement, gazing slightly upward or forward
    const isPostureStill = features.postureStable && Math.abs(features.headYaw) < 25;
    const isLowPhysicalActivity = !features.keyboardActivity && !features.mouseActivity && !features.handActivity;
    if (isPostureStill && isLowPhysicalActivity && features.gazeScore > 0.65) {
      return {
        recommendedState: 'THINKING',
        confidence: 0.82,
        explanation: 'Cognitive problem-solving & mental derivation pause',
        featureScores: {
          gazeScore: features.gazeScore,
          postureStable: features.postureStable ? 1 : 0
        }
      };
    }

    // 5. Screen Study check
    const isFacingScreen = Math.abs(features.headYaw) <= 25 && features.headPitch >= -12 && features.headPitch <= 15;
    if (isFacingScreen && (features.screenActivityScore >= FocusConfig.screenThreshold || features.keyboardActivity || features.mouseActivity || features.gazeScore >= 0.75)) {
      return {
        recommendedState: 'FOCUSED_SCREEN',
        confidence: Math.min(0.96, 0.75 + features.screenActivityScore * 0.2),
        explanation: 'Verified screen engagement with study lecture / IDE',
        featureScores: {
          screenActivityScore: features.screenActivityScore,
          gazeScore: features.gazeScore,
          headYaw: features.headYaw
        }
      };
    }

    // 6. Mixed Study check
    if (features.studyMedium === 'Mixed Study') {
      return {
        recommendedState: 'FOCUSED_MIXED',
        confidence: 0.85,
        explanation: 'Verified mixed screen & paper study engagement',
        featureScores: {
          screenActivityScore: features.screenActivityScore,
          paperActivityScore: features.paperActivityScore
        }
      };
    }

    // 7. Looking away / Distraction check
    if (Math.abs(features.headYaw) > 32 || features.headPitch > 22) {
      return {
        recommendedState: 'DISTRACTED',
        confidence: 0.88,
        explanation: 'Looking away from workspace or severe head rotation',
        featureScores: {
          headYaw: features.headYaw,
          headPitch: features.headPitch
        }
      };
    }

    // Fallback: Default to appropriate focused medium if within acceptable posture
    const defaultFocusedState: FocusState =
      features.studyMedium === 'Paper / PYQ Study' ? 'FOCUSED_PAPER' : 'FOCUSED_SCREEN';

    return {
      recommendedState: defaultFocusedState,
      confidence: 0.75,
      explanation: 'General study posture in workspace',
      featureScores: { ...scores }
    };
  }
}

export const ruleBasedFocusClassifier = new RuleBasedFocusClassifier();
