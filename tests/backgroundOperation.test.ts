import { focusEngine } from '../components/focus/services/focusEngine';
import { visionEngine } from '../components/focus/vision/visionEngine';
import { focusSessionController } from '../components/focus/services/FocusSessionController';
import { frameScheduler } from '../components/focus/services/ml/FrameScheduler';
import { focusSessionRepository } from '../components/focus/services/FocusSessionRepository';
import { VisionData } from '../components/focus/types';

async function runBackgroundTests() {
  console.log('========================================================');
  console.log('AI FOCUS BACKGROUND OPERATION & RESILIENCE TESTS');
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

  // TEST 1: Permanent Sensory Pipeline Connectivity
  console.log('--- TEST 1: Permanent Sensory Pipeline Wiring ---');
  let receivedVisionFrames = 0;
  const unsubFocus = focusEngine.subscribe((out) => {
    if (out) receivedVisionFrames++;
  });

  // Emit a sample vision frame directly through visionEngine
  const testFrame: VisionData = {
    facePresent: true,
    confidence: 0.92,
    headYaw: 2,
    headPitch: -5,
    headRoll: 0,
    eyeOpen: true,
    gazeScore: 0.9,
    handActivity: false,
    bodyPostureStable: true,
    deskActivityScore: 0.1,
    isLookingDown: false,
    lightingLevel: 'normal',
    lightingScore: 0.7,
    faceCount: 1,
    cameraHealthy: true,
    cameraHealthConfidence: 1.0,
    studentFaceVerified: true,
    faceMatchConfidence: 0.90,
    genericPersonDetected: true,
    timestamp: Date.now()
  };

  (visionEngine as any).callbacks.forEach((cb: any) => cb(testFrame));

  assert(
    receivedVisionFrames > 0,
    'visionEngine is permanently subscribed to focusEngine at service layer'
  );
  unsubFocus();

  // TEST 2: Background Simulation Ticker (no rAF dependency)
  console.log('\n--- TEST 2: Background Simulation Ticker ---');
  let simFramesCount = 0;
  const unsubSim = visionEngine.subscribe(() => {
    simFramesCount++;
  });

  visionEngine.startSimulation(20);
  assert(visionEngine.isActive() && visionEngine.isSimulating(), 'Simulation mode starts active');

  // Wait 150ms to confirm ticks are arriving via background loop
  await new Promise(resolve => setTimeout(resolve, 150));
  assert(simFramesCount >= 2, `Background ticker dispatched ${simFramesCount} frames without requestAnimationFrame`);

  visionEngine.stop();
  assert(!visionEngine.isActive(), 'visionEngine.stop() stops background loop cleanly');
  unsubSim();

  // TEST 3: Focus Session State Lifecycle in Background
  console.log('\n--- TEST 3: Focus Session Background Lifecycle ---');
  const initialSessionCount = focusSessionRepository.listSessions().length;

  const sessionId = focusSessionController.startSession(
    'Computer Science',
    'Background Resilience',
    3600,
    'Deep Focus',
    'Verify background monitoring',
    'Screen Study'
  );

  assert(focusSessionController.getState().isActive === true, 'Session is active');
  assert(focusSessionController.getState().gate.highLevelState === 'AWAY', 'Initial gate state is AWAY');

  // Feed verified student presence frame
  const now = Date.now();
  focusSessionController.updatePerceptionState({
    studentPresent: true,
    presenceConfidence: 0.95,
    presenceState: 'STUDENT_PRESENT',
    studentFaceVerified: true,
    genericPersonDetected: true,
    cameraHealthy: true,
    deviceInUse: false,
    evidenceTimestamp: now
  });

  assert(focusSessionController.getState().gate.studentPresent === true, 'Student confirmed present');
  assert(focusSessionController.getState().gate.verifiedTimerAllowed === true, 'Timer gate opened for verified student');
  assert(focusSessionController.getState().gate.highLevelState === 'ACTIVE', 'High level state is ACTIVE');

  // Simulate student walking away while app is in background
  const awayTime = Date.now();
  focusSessionController.updatePerceptionState({
    studentPresent: false,
    presenceConfidence: 0.0,
    presenceState: 'STUDENT_AWAY',
    studentFaceVerified: false,
    genericPersonDetected: false,
    cameraHealthy: true,
    deviceInUse: false,
    evidenceTimestamp: awayTime
  });

  assert(focusSessionController.getState().gate.studentPresent === false, 'Student detected away in background');
  assert(focusSessionController.getState().gate.verifiedTimerAllowed === false, 'Timer gate automatically closed');
  assert(focusSessionController.getState().gate.highLevelState === 'AWAY', 'High level state switched to AWAY');

  // Simulate student returning
  const returnTime = Date.now();
  focusSessionController.updatePerceptionState({
    studentPresent: true,
    presenceConfidence: 0.92,
    presenceState: 'STUDENT_PRESENT',
    studentFaceVerified: true,
    genericPersonDetected: true,
    cameraHealthy: true,
    deviceInUse: false,
    evidenceTimestamp: returnTime
  });

  assert(focusSessionController.getState().gate.studentPresent === true, 'Student return verified in background');
  assert(focusSessionController.getState().gate.verifiedTimerAllowed === true, 'Timer gate resumed');
  assert(focusSessionController.getState().gate.highLevelState === 'ACTIVE', 'High level state restored to ACTIVE');

  // Stop session
  const completed = focusSessionController.stopSession(true);
  assert(focusSessionController.getState().isActive === false, 'Session stopped cleanly');
  assert(completed !== null, 'Completed session returned');

  const finalSessionCount = focusSessionRepository.listSessions().length;
  assert(
    finalSessionCount === initialSessionCount + 1,
    `Exactly one session recorded (before: ${initialSessionCount}, after: ${finalSessionCount}) — No duplicates!`
  );

  console.log('\n========================================================');
  console.log(`BACKGROUND TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBackgroundTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
