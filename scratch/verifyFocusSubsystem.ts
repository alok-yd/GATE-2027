import { focusEngine } from '../components/focus/services/focusEngine';
import { TimerEngine } from '../components/focus/services/timerEngine';
import { StorageService } from '../components/focus/services/storage';
import { EvaluationEngine } from '../components/focus/services/evaluationEngine';
import { calibrationEngine } from '../components/focus/services/calibrationEngine';
import { VisionData } from '../components/focus/types';

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, msg: string) {
  totalCount++;
  if (condition) {
    console.log(`✓ [PASS] ${msg}`);
    passedCount++;
  } else {
    console.error(`✗ [FAIL] ${msg}`);
    throw new Error(`Test failed: ${msg}`);
  }
}

console.log('==================================================');
console.log('TESTING AI FOCUS TIMER V2 SUBSYSTEM');
console.log('==================================================');

// 1. Initial State
console.log('\n--- 1. Focus Engine Initial State ---');
const initialOutput = focusEngine.getCurrentOutput();
assert(initialOutput !== null, 'Focus engine returns initial output');
assert(initialOutput.state === 'IDLE', `Initial state is IDLE (got ${initialOutput.state})`);
assert(typeof initialOutput.score === 'number', `Initial score is a number (${initialOutput.score})`);

// 2. Vision Data Pipe
console.log('\n--- 2. Vision Data Pipe & Multi-Signal Processing ---');
const mockVisionData: VisionData = {
  timestamp: Date.now(),
  facePresent: true,
  confidence: 0.92,
  headYaw: 2.5,
  headPitch: -8.0,
  headRoll: 0.5,
  eyeOpen: true,
  gazeScore: 0.88,
  handActivity: true,
  bodyPostureStable: true,
  deskActivityScore: 0.75,
  isLookingDown: false,
  lightingLevel: 'normal'
};

focusEngine.updateVision(mockVisionData);
const visionOutput = focusEngine.getCurrentOutput();
assert(visionOutput.facePresent === true, 'Vision update detected face presence');
assert(visionOutput.signalBreakdown.faceScore > 0, 'Signal breakdown includes positive face score');

// 3. Timer Engine Session Lifecycle
console.log('\n--- 3. Timer Engine Session Lifecycle ---');
const testTimer = new TimerEngine(focusEngine);
let lastTick: any = null;
const unsub = testTimer.subscribe((tick) => {
  lastTick = tick;
});

// Start a 25-minute Deep Focus session on Algorithms
testTimer.startSession('Algorithms', 'Dynamic Programming', 1500, 'Deep Focus', 'Solve 3 problems');
assert(lastTick !== null, 'Timer engine emitted tick upon session start');
assert(lastTick.activeSubject === 'Algorithms', 'Active subject is Algorithms');
assert(lastTick.activeTopic === 'Dynamic Programming', 'Active topic is Dynamic Programming');
assert(lastTick.targetSeconds === 1500, 'Target duration is 1500 seconds');

// Pause session
testTimer.pauseSession();
assert(lastTick.state === 'PAUSED', `State changed to PAUSED (got ${lastTick.state})`);

// Resume session
testTimer.resumeSession();
assert(lastTick.state !== 'PAUSED', 'Resumed session state is not PAUSED');

// Change study medium
testTimer.setStudyMedium('Paper / PYQ Study');
assert(testTimer.getStudyMedium() === 'Paper / PYQ Study', 'Study medium changed to Paper / PYQ Study');

// Stop session
const completedSession = testTimer.stopSession();
assert(completedSession !== null, 'Stopping session produced a valid completed FocusSession');
assert(completedSession.subject === 'Algorithms', 'Completed session preserves subject');
unsub();

// 4. Paper Study Mode Verification
console.log('\n--- 4. Paper Study Mode Recognition ---');
focusEngine.setStudyMedium('Paper / PYQ Study');
const paperVisionData: VisionData = {
  timestamp: Date.now(),
  facePresent: true,
  confidence: 0.85,
  headYaw: 1.0,
  headPitch: -28.0, // Looking down at notes/book
  headRoll: 0.0,
  eyeOpen: true,
  gazeScore: 0.70,
  handActivity: true,
  bodyPostureStable: true,
  deskActivityScore: 0.80,
  isLookingDown: true,
  lightingLevel: 'normal'
};
focusEngine.updateVision(paperVisionData);
const paperOutput = focusEngine.getCurrentOutput();
assert(paperOutput.facePresent === true, 'Paper study recognized student presence');
assert(paperOutput.signalBreakdown.headPoseScore > 0, 'Paper study head pitch evaluated correctly');

// 5. Evaluation Engine
console.log('\n--- 5. Evaluation Engine Scoring ---');
const metrics = EvaluationEngine.runAllTests();
assert(metrics !== null, 'Evaluation engine returned benchmark metrics');
assert(typeof metrics.accuracy === 'number', `Accuracy is numeric (${metrics.accuracy})`);
assert(metrics.totalScenarios > 0, `Benchmark evaluated ${metrics.totalScenarios} scenarios`);

// 6. Calibration Engine
console.log('\n--- 6. Calibration Engine ---');
const defaultProfile = calibrationEngine.getProfile();
assert(defaultProfile !== null, 'Calibration engine returned default profile');
assert(typeof defaultProfile.tolerances?.yawTolerance === 'number', 'Calibration profile tolerances defined');

console.log('\n==================================================');
console.log(`RESULTS: ${passedCount}/${totalCount} TESTS PASSED`);
console.log('==================================================\n');
