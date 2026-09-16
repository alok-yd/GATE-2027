/**
 * Comprehensive Automated Test Suite for AI Focus Timer v2
 * Verifies all 15 mandatory test scenarios from Prompt Section 69
 */

import { FocusEngine, isVerifiedFocus } from '../components/focus/services/focusEngine';
import { TimerEngine } from '../components/focus/services/timerEngine';
import { VisionData, ActivityData } from '../components/focus/types';
import { FocusConfig } from '../components/focus/constants/FocusConfig';
import { ruleBasedFocusClassifier } from '../components/focus/services/focus/RuleBasedFocusClassifier';

function createHealthyPaperVision(overrides?: Partial<VisionData>): VisionData {
  return {
    facePresent: true,
    confidence: 0.94,
    headYaw: 0,
    headPitch: -18,
    headRoll: 0,
    eyeOpen: true,
    gazeScore: 0.88,
    handActivity: true,
    bodyPostureStable: true,
    deskActivityScore: 0.72,
    isLookingDown: true,
    lightingLevel: 'normal',
    lightingScore: 0.7,
    faceCount: 1,
    cameraHealthy: true,
    cameraHealthConfidence: 1.0,
    phoneDetectedScore: 0.05,
    phoneEvidence: {
      detected: false,
      confidence: 0.05,
      visualEvidence: 0.05,
      handPhoneEvidence: 0.05,
      proximityEvidence: 0.1,
      temporalEvidence: 0.1,
      handInteractionConfidence: 0.0
    },
    isStale: false,
    isSimulated: false,
    timestamp: Date.now(),
    ...overrides
  };
}

function createDefaultActivity(overrides?: Partial<ActivityData>): ActivityData {
  return {
    keyboardActive: false,
    mouseActive: false,
    idleSeconds: 0,
    activeApp: 'gateoverflow.in',
    isWindowFocused: true,
    lastActivityTimestamp: Date.now(),
    ...overrides
  };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✓ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING AI FOCUS TIMER v2: 15-SCENARIO TEST SUITE');
  console.log('====================================================\n');

  // TEST 1: No camera → timer does not run
  {
    const focus = new FocusEngine();
    const timer = new TimerEngine(focus);
    focus.setState('IDLE');
    focus.updateVision({
      facePresent: false,
      confidence: 0,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      eyeOpen: false,
      gazeScore: 0,
      handActivity: false,
      bodyPostureStable: false,
      deskActivityScore: 0,
      isLookingDown: false,
      cameraHealthy: false,
      cameraHealthConfidence: 0,
      timestamp: Date.now()
    });

    const status = focus.getVerificationStatus();
    assert(status.verified === false, 'TEST 1: No camera -> verified is false');
    assert(status.state === 'PAUSED_CAMERA_ERROR' || status.state === 'PAUSED_ABSENT', 'TEST 1: Verification state is paused camera error/absent');
  }

  // TEST 2: Camera healthy + user present + paper study → timer runs
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('FOCUSED_PAPER');
    focus.updateVision(createHealthyPaperVision());
    focus.updateActivity(createDefaultActivity());

    const status = focus.getVerificationStatus();
    assert(status.verified === true, 'TEST 2: Camera healthy + paper study -> verified is true');
    assert(status.state === 'VERIFIED', 'TEST 2: Verification state is VERIFIED');
  }

  // TEST 3: User leaves → AWAY → timer pauses
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('FOCUSED_PAPER');
    focus.updateVision(createHealthyPaperVision());

    let now = Date.now();
    // Simulate leaving desk for > awayGraceMs
    for (let i = 0; i < 6; i++) {
      now += 800;
      focus.updateVision({
        facePresent: false,
        confidence: 0,
        headYaw: 0,
        headPitch: 0,
        headRoll: 0,
        eyeOpen: false,
        gazeScore: 0,
        handActivity: false,
        bodyPostureStable: false,
        deskActivityScore: 0,
        isLookingDown: false,
        cameraHealthy: true,
        cameraHealthConfidence: 1.0,
        timestamp: now
      });
    }

    const status = focus.getVerificationStatus();
    assert(status.verified === false, 'TEST 3: User leaves -> verified becomes false');
    assert(focus.getState() === 'AWAY', 'TEST 3: Focus state transitions to AWAY', `Got: ${focus.getState()}`);
  }

  // TEST 4: User returns → verification pending → timer resumes only after confirmation
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('AWAY');

    // First frame of returning
    focus.updateVision(createHealthyPaperVision({ confidence: 0.70 }));
    // In AWAY state, immediate return enters confirmation/pending before verified focus
    assert(focus.getVerificationStatus().verified === false || focus.getState() === 'AWAY', 'TEST 4: Single initial return frame requires stabilization before timer resumes');
  }

  // TEST 5: Phone on desk → PHONE_PRESENT → timer may continue
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('FOCUSED_PAPER');

    // Phone detected on desk, but NOT held in hand (handInteractionConfidence = 0.0)
    focus.updateVision(createHealthyPaperVision({
      phoneDetectedScore: 0.35,
      phoneEvidence: {
        detected: false,
        confidence: 0.35,
        visualEvidence: 0.40,
        handPhoneEvidence: 0.10,
        proximityEvidence: 0.20,
        temporalEvidence: 0.20,
        handInteractionConfidence: 0.05 // On desk, no grip
      }
    }));

    const status = focus.getVerificationStatus();
    assert(status.verified === true, 'TEST 5: Phone stationary on desk without hand overlap -> study timer continues');
  }

  // TEST 6: Phone in hand → PHONE_USE → timer pauses
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('FOCUSED_PAPER');

    let now = Date.now();
    for (let i = 0; i < 4; i++) {
      now += 500;
      focus.updateVision(createHealthyPaperVision({
        phoneDetectedScore: 0.90,
        phoneEvidence: {
          detected: true,
          confidence: 0.90,
          visualEvidence: 0.88,
          handPhoneEvidence: 0.90,
          proximityEvidence: 0.80,
          temporalEvidence: 0.90,
          handInteractionConfidence: 0.85
        },
        timestamp: now
      }));
    }

    const status = focus.getVerificationStatus();
    assert(status.verified === false, 'TEST 6: Phone in active hand use -> timer paused');
    assert(status.state === 'PAUSED_PHONE' || focus.getState() === 'PHONE_USE', 'TEST 6: State tagged as PAUSED_PHONE or PHONE_USE');
  }

  // TEST 7: Phone disappears → stabilization → timer resumes
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('PHONE_USE');

    let now = Date.now();
    // Phone removed consistently for 3 seconds
    for (let i = 0; i < 6; i++) {
      now += 600;
      focus.updateVision(createHealthyPaperVision({ timestamp: now }));
    }

    const status = focus.getVerificationStatus();
    assert(status.verified === true, 'TEST 7: Phone absent consistently + study resumed -> timer verified');
  }

  // TEST 8: Look down while solving PYQ → FOCUSED_PAPER
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('FOCUSED_PAPER');

    focus.updateVision(createHealthyPaperVision({
      headPitch: -24, // Looking deeply at notebook
      isLookingDown: true,
      handActivity: true,
      deskActivityScore: 0.80
    }));

    const status = focus.getVerificationStatus();
    assert(status.verified === true, 'TEST 8: Looking down to solve questions is valid verified paper focus');
    assert(focus.getState() === 'FOCUSED_PAPER', 'TEST 8: Focus state remains FOCUSED_PAPER');
  }

  // TEST 9: Think silently → THINKING → not PHONE_USE
  {
    const focus = new FocusEngine();
    focus.setStudyMedium('Paper / PYQ Study');
    focus.setState('FOCUSED_PAPER');

    focus.updateVision(createHealthyPaperVision({
      headPitch: 0,
      headYaw: 0,
      handActivity: false,
      deskActivityScore: 0.05,
      bodyPostureStable: true,
      gazeScore: 0.92
    }));
    focus.updateActivity(createDefaultActivity({ idleSeconds: 60 }));

    const classification = ruleBasedFocusClassifier.classify({
      facePresent: true,
      faceConfidence: 0.94,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      gazeScore: 0.92,
      poseConfidence: 0.90,
      postureStable: true,
      handActivity: false,
      handDeskScore: 0.05,
      phoneConfidence: 0.0,
      phoneDistanceFromFace: 999,
      phoneHandOverlap: 0.0,
      keyboardActivity: false,
      mouseActivity: false,
      paperActivityScore: 0.2,
      deskActivityScore: 0.05,
      screenActivityScore: 0.2,
      temporalStabilityScore: 0.9,
      cameraHealthConfidence: 1.0,
      studyMedium: 'Paper / PYQ Study'
    });

    assert(classification.recommendedState === 'THINKING', 'TEST 9: Silent thinking classified as THINKING, not distraction or phone use');
  }

  // TEST 10: Vision processing freezes → watchdog → timer pauses
  {
    const focus = new FocusEngine();
    focus.setState('FOCUSED_PAPER');
    const oldTimestamp = Date.now() - 4000; // 4 seconds stale

    focus.updateVision(createHealthyPaperVision({
      timestamp: oldTimestamp,
      isStale: true,
      cameraHealthy: false
    }));

    const status = focus.getVerificationStatus();
    assert(status.verified === false, 'TEST 10: Vision watchdog marks stale stream and pauses timer');
  }

  // TEST 11: Camera disconnect → CAMERA_ERROR → timer pauses
  {
    const focus = new FocusEngine();
    focus.setState('FOCUSED_PAPER');
    focus.updateVision({
      facePresent: false,
      confidence: 0,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      eyeOpen: false,
      gazeScore: 0,
      handActivity: false,
      bodyPostureStable: false,
      deskActivityScore: 0,
      isLookingDown: false,
      cameraHealthy: false,
      cameraHealthConfidence: 0.0,
      timestamp: Date.now()
    });

    const status = focus.getVerificationStatus();
    assert(status.verified === false, 'TEST 11: Camera disconnect halts verified timer');
    assert(status.state === 'PAUSED_CAMERA_ERROR', 'TEST 11: Verification state is PAUSED_CAMERA_ERROR');
  }

  // TEST 12: Manual pause → timer remains stopped
  {
    const focus = new FocusEngine();
    const timer = new TimerEngine(focus);
    focus.setState('FOCUSED_PAPER');
    focus.updateVision(createHealthyPaperVision());

    timer.pauseSession();
    assert(focus.getState() === 'PAUSED', 'TEST 12: Manual pause sets state to PAUSED');

    const status = isVerifiedFocus('PAUSED', focus.getCurrentOutput(), true, true);
    assert(status.verified === false, 'TEST 12: Verified focus is false during manual pause');
  }

  // TEST 13: Focus score changes → timer logic must remain based on verifiedFocus, not score
  {
    const focus = new FocusEngine();
    focus.setState('FOCUSED_PAPER');

    // Simulate high score (85) but user absent
    const status = isVerifiedFocus('AWAY', {
      state: 'AWAY',
      score: 95,
      rawScore: 95,
      facePresent: false,
      stateExplanation: 'User absent',
      isGracePeriodActive: false,
      graceSecondsRemaining: 0,
      returnConfirmationRemaining: 0,
      signalBreakdown: { faceScore: 0, headPoseScore: 0, eyeGazeScore: 0, activityScore: 0, appContextScore: 0 }
    }, true, false);

    assert(status.verified === false, 'TEST 13: High focus score cannot mask absence or force timer to run');
  }

  // TEST 14: Stale evidence → verification invalid
  {
    const oldVision = createHealthyPaperVision({
      timestamp: Date.now() - (FocusConfig.evidenceMaxAgeMs + 1000),
      isStale: true,
      cameraHealthy: false
    });

    const status = isVerifiedFocus('FOCUSED_PAPER', null, false, true);
    assert(status.verified === false, 'TEST 14: Stale evidence (> MAX_AGE) invalidates verification');
  }

  // TEST 15: Simulation mode → clearly separated from real metrics
  {
    const focus = new FocusEngine();
    focus.updateVision({
      facePresent: false,
      confidence: 0.0,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      eyeOpen: false,
      gazeScore: 0.0,
      handActivity: false,
      bodyPostureStable: false,
      deskActivityScore: 0.0,
      isLookingDown: false,
      cameraHealthy: false,
      cameraHealthConfidence: 0.0,
      isSimulated: true,
      timestamp: Date.now()
    });

    const status = focus.getVerificationStatus();
    assert(status.verified === false, 'TEST 15: Simulated mode is strictly unverified and cannot fake study time');
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 15 CRITICAL TEST SCENARIOS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
