import { PersonPresenceEngine } from '../components/focus/services/focus/PersonPresenceEngine';
import { shouldTimerRun, FocusSessionController } from '../components/focus/services/FocusSessionController';
import { FocusConfig } from '../components/focus/constants/FocusConfig';
import { VisionData, TimerGateState } from '../components/focus/types';

function runTests() {
  console.log('========================================================');
  console.log('AI FOCUS TIMER PRESENCE & GATE VERIFICATION TESTS');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  const baseVision = (timestamp: number = Date.now()): VisionData => ({
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
    cameraHealthy: true,
    cameraHealthConfidence: 1.0,
    studentFaceVerified: false,
    faceMatchConfidence: 0.0,
    genericPersonDetected: false,
    timestamp
  });

  // TEST 1: shouldTimerRun Authoritative Logic
  console.log('--- TEST 1: Authoritative shouldTimerRun Logic ---');
  assert(
    shouldTimerRun({ manualPause: false, monitoringHealthy: true, studentPresent: true, deviceInUse: false }) === true,
    'Timer runs ONLY when studentPresent=true, healthy=true, deviceInUse=false, pause=false'
  );
  assert(
    shouldTimerRun({ manualPause: false, monitoringHealthy: true, studentPresent: false, deviceInUse: false }) === false,
    'Timer MUST pause when studentPresent=false'
  );
  assert(
    shouldTimerRun({ manualPause: false, monitoringHealthy: true, studentPresent: true, deviceInUse: true }) === false,
    'Timer MUST pause when deviceInUse=true'
  );
  assert(
    shouldTimerRun({ manualPause: true, monitoringHealthy: true, studentPresent: true, deviceInUse: false }) === false,
    'Timer MUST pause when manualPause=true'
  );
  assert(
    shouldTimerRun({ manualPause: false, monitoringHealthy: false, studentPresent: true, deviceInUse: false }) === false,
    'Timer MUST pause when monitoringHealthy=false'
  );

  // TEST 2: Initial Session State is AWAY (not RUNNING)
  console.log('\n--- TEST 2: Session Initial State ---');
  const controller = new FocusSessionController();
  const initialState = controller.getState();
  assert(initialState.gate.studentPresent === false, 'Initial state studentPresent is false');
  assert(initialState.gate.verifiedTimerAllowed === false, 'Initial state timer gate is blocked (verifiedTimerAllowed === false)');
  assert(initialState.gate.highLevelState === 'AWAY', 'Initial state highLevelState is AWAY');

  // TEST 3: Empty Desk / Room (Zero Detection)
  console.log('\n--- TEST 3: Empty Room / Empty Desk ---');
  const presenceEngine = new PersonPresenceEngine();
  let t = 1000000;
  let emptyVision = baseVision(t);
  let decision = presenceEngine.evaluateStudentPresence(emptyVision, undefined, t);
  assert(decision.present === false, 'Empty room evaluates present === false');
  assert(decision.presenceState === 'STUDENT_AWAY', 'Empty room state is STUDENT_AWAY');
  assert(decision.confidence >= 0.90, 'Empty room absence confidence is high');

  // TEST 4: Student Arrives & Return Stabilization (1.5s window)
  console.log('\n--- TEST 4: Student Arrives & Return Stabilization ---');
  t += 100;
  let studentArrivesVision: VisionData = {
    ...baseVision(t),
    facePresent: true,
    confidence: 0.92,
    studentFaceVerified: true,
    faceMatchConfidence: 0.90,
    genericPersonDetected: true,
    bodyPostureStable: true,
    timestamp: t
  };

  // 1st frame: should be stabilizing return (NOT immediately open timer)
  let returnFrame1 = presenceEngine.evaluateStudentPresence(studentArrivesVision, undefined, t);
  assert(returnFrame1.present === false, 'First return frame MUST NOT immediately allow timer (present === false)');
  assert(returnFrame1.isReturnStabilizing === true, 'Return stabilizing flag is true');
  assert(returnFrame1.presenceState === 'PRESENCE_UNCERTAIN', 'State during return stabilization is PRESENCE_UNCERTAIN');

  // Advance time by 800ms (still within 1.5s returnConfirmMs)
  t += 800;
  studentArrivesVision.timestamp = t;
  let returnFrame2 = presenceEngine.evaluateStudentPresence(studentArrivesVision, undefined, t);
  assert(returnFrame2.present === false, 'After 800ms return still stabilizing (present === false)');

  // Advance time past 1500ms (1600ms total)
  t += 800;
  studentArrivesVision.timestamp = t;
  let returnFrameConfirmed = presenceEngine.evaluateStudentPresence(studentArrivesVision, undefined, t);
  assert(returnFrameConfirmed.present === true, 'After 1.5s continuous student presence, student is confirmed present');
  assert(returnFrameConfirmed.presenceState === 'STUDENT_PRESENT', 'Presence state is now STUDENT_PRESENT');

  // TEST 5: Other Person Walks Into Frame (Student Absent)
  console.log('\n--- TEST 5: Other Person Enters Frame (Student Absent) ---');
  // Student leaves first
  t += 3000;
  let emptyVision2 = baseVision(t);
  presenceEngine.evaluateStudentPresence(emptyVision2, undefined, t);
  t += 3000;
  emptyVision2.timestamp = t;
  let awayConfirmed = presenceEngine.evaluateStudentPresence(emptyVision2, undefined, t);
  assert(awayConfirmed.presenceState === 'STUDENT_AWAY', 'Student away confirmed');

  // Roommate enters: generic person detected, but NOT verified student
  t += 500;
  let otherPersonVision: VisionData = {
    ...baseVision(t),
    facePresent: true,
    confidence: 0.88,
    studentFaceVerified: false, // NOT matching student baseline!
    faceMatchConfidence: 0.35,
    genericPersonDetected: true,
    bodyPostureStable: true,
    timestamp: t
  };
  let otherPersonDecision = presenceEngine.evaluateStudentPresence(otherPersonVision, undefined, t);
  assert(otherPersonDecision.present === false, 'Other person in camera frame DOES NOT mark student present');
  assert(otherPersonDecision.presenceState === 'STUDENT_AWAY', 'State remains STUDENT_AWAY with other person in frame');
  assert(otherPersonDecision.evidence.genericPersonDetected === true, 'genericPersonDetected is true');
  assert(otherPersonDecision.evidence.studentFaceDetected === false, 'studentFaceDetected is false');

  // TEST 6: Student Looking Down / PYQ Solving Posture
  console.log('\n--- TEST 6: Looking Down / PYQ Solving Posture ---');
  // Confirm student returns first
  t += 2000;
  let verifiedStudentVision: VisionData = {
    ...baseVision(t),
    facePresent: true,
    confidence: 0.94,
    studentFaceVerified: true,
    faceMatchConfidence: 0.92,
    genericPersonDetected: true,
    bodyPostureStable: true,
    timestamp: t
  };
  presenceEngine.evaluateStudentPresence(verifiedStudentVision, undefined, t);
  t += 1600;
  verifiedStudentVision.timestamp = t;
  presenceEngine.evaluateStudentPresence(verifiedStudentVision, undefined, t);

  // Now student tilts head down to notebook (headPitch down, face occluded or looking down)
  t += 500;
  let pyqVision: VisionData = {
    ...baseVision(t),
    facePresent: false, // Face landmarks occluded by downward tilt
    confidence: 0.0,
    headPitch: -28,
    isLookingDown: true,
    genericPersonDetected: true, // Torso / shoulders in study zone
    bodyPostureStable: true,
    inStudyZone: true,
    timestamp: t
  };
  let pyqDecision = presenceEngine.evaluateStudentPresence(pyqVision, undefined, t);
  assert(pyqDecision.present === true, 'Looking down / PYQ solving posture keeps student present');
  assert(pyqDecision.presenceState === 'STUDENT_PRESENT', 'PYQ solving maintains STUDENT_PRESENT state');

  // TEST 7: Stale Evidence (> 2500ms) Invalidation
  console.log('\n--- TEST 7: Stale Evidence Invalidation ---');
  t += 1000;
  let freshVision = { ...verifiedStudentVision, timestamp: t };
  presenceEngine.evaluateStudentPresence(freshVision, undefined, t);

  // Now camera stops updating, time jumps 3000ms forward
  let staleNow = t + 3000;
  let staleDecision = presenceEngine.evaluateStudentPresence(freshVision, undefined, staleNow);
  assert(staleDecision.present === false, 'Stale evidence (> 2500ms) forces present === false');
  assert(staleDecision.presenceState === 'STUDENT_AWAY', 'Stale evidence forces STUDENT_AWAY');

  // TEST 8: Session Controller Gating with Stale Evidence & Absence
  console.log('\n--- TEST 8: Session Controller State Integration ---');
  controller.updatePerceptionState({
    studentPresent: true,
    presenceConfidence: 0.95,
    cameraHealthy: true,
    deviceInUse: false,
    manualPause: false,
    evidenceTimestamp: Date.now()
  });
  assert(controller.getState().gate.verifiedTimerAllowed === true, 'Controller allows timer when student confirmed');

  // Simulate stale evidence fed to controller
  controller.updatePerceptionState({
    studentPresent: true,
    evidenceTimestamp: Date.now() - 3500 // 3.5 seconds old!
  });
  assert(controller.getState().gate.verifiedTimerAllowed === false, 'Controller blocks timer on stale evidence timestamp');
  assert(controller.getState().gate.studentPresent === false, 'Controller marks studentPresent false on stale evidence');

  // TEST 9: Focus Score Never Overrides Student Absence
  console.log('\n--- TEST 9: Focus Score Invariant ---');
  controller.updatePerceptionState({
    studentPresent: false,
    presenceConfidence: 0.0,
    cameraHealthy: true,
    deviceInUse: false,
    manualPause: false,
    evidenceTimestamp: Date.now()
  });
  const gateState = controller.getState().gate;
  assert(gateState.verifiedTimerAllowed === false, 'Timer strictly blocked when student is absent');
  assert(shouldTimerRun(gateState) === false, 'shouldTimerRun returns false regardless of external scores');

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
