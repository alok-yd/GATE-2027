import { StudentPresenceController } from '../components/focus/controllers/StudentPresenceController';
import { CalibrationEngine } from '../components/focus/perception/CalibrationEngine';
import { StudentPresenceEngine } from '../components/focus/perception/StudentPresenceEngine';
import { StudentPresenceEvidence } from '../components/focus/types';

let passed = 0;
let total = 0;

function assert(condition: boolean, name: string, detail?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✓ [PASS] ${name}`);
  } else {
    console.error(`✗ [FAIL] ${name} ${detail ? `- ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

console.log('==================================================');
console.log('STUDENT PRESENCE & TEMPORAL FILTER TESTS');
console.log('==================================================\n');

// 1. Initial State to PRESENT
const controller = new StudentPresenceController();
const t0 = 100000;

const presentEvidence: StudentPresenceEvidence = {
  genericPersonDetected: true,
  studentFaceDetected: true,
  faceMatchConfidence: 0.92,
  faceDetectionConfidence: 0.90,
  poseConfidence: 0.85,
  temporalConfidence: 0.95,
  headPose: { pitch: 5, yaw: 2, roll: 0 },
  isReadingOrWritingPaper: false,
  timestamp: t0,
};

controller.update(presentEvidence, t0);
assert(controller.isStudentPresent() === true, 'CASE 1: Controller transitions to PRESENT when student detected');
assert(controller.getState() === 'PRESENT', 'CASE 1: State is PRESENT');

// 2. Momentary loss enters VERIFYING grace period
const absentEvidence: StudentPresenceEvidence = {
  genericPersonDetected: false,
  studentFaceDetected: false,
  faceMatchConfidence: 0.0,
  faceDetectionConfidence: 0.0,
  poseConfidence: 0.0,
  temporalConfidence: 0.0,
  headPose: { pitch: 0, yaw: 0, roll: 0 },
  isReadingOrWritingPaper: false,
  timestamp: t0 + 500,
};

controller.update(absentEvidence, t0 + 500);
assert(controller.getState() === 'VERIFYING', 'CASE 2: State enters VERIFYING grace period on signal loss (500ms)');
assert(controller.isStudentPresent() === false, 'CASE 2: Not verified present during verification grace');

// 3. Quick return within grace period restores PRESENT without timer interruption
controller.update(presentEvidence, t0 + 1200);
assert(controller.getState() === 'PRESENT', 'CASE 3: Quick return within 2000ms grace immediately restores PRESENT');

// 4. Continued absence confirms AWAY after grace period (> 2000ms)
controller.update(absentEvidence, t0 + 2000); // loss started at t0 + 2000
controller.update(absentEvidence, t0 + 3500); // loss continued for 1500ms
assert(controller.getState() === 'VERIFYING', 'CASE 4.1: Still VERIFYING at 1.5s into grace');
controller.update(absentEvidence, t0 + 4500); // loss continued for 2500ms > 2000ms
assert(controller.getState() === 'AWAY', 'CASE 4.2: Confirms AWAY after 2.5s exceeding 2000ms grace period');

// 5. Return from AWAY requires return confirmation (> 1000ms)
controller.update(presentEvidence, t0 + 5000);
assert(controller.getState() === 'AWAY', 'CASE 5.1: Remains AWAY initially upon return');
controller.update(presentEvidence, t0 + 6200); // 1200ms of stable presence > 1000ms
assert(controller.getState() === 'PRESENT', 'CASE 5.2: Confirms PRESENT after stable return confirmation');

// 6. Paper / PYQ Study Protection
const presenceEngine = new StudentPresenceEngine();
// Simulate face looking down at desk (pitch = -25 deg)
const mockFaceLandmarks = Array(478).fill(null).map((_, i) => ({ x: 0.5, y: 0.5, z: 0 }));
mockFaceLandmarks[1] = { x: 0.5, y: 0.65, z: 0 }; // Nose shifted downward toward chin (pitch down)
mockFaceLandmarks[33] = { x: 0.4, y: 0.4, z: 0 }; // Left eye
mockFaceLandmarks[263] = { x: 0.6, y: 0.4, z: 0 }; // Right eye
mockFaceLandmarks[152] = { x: 0.5, y: 0.8, z: 0 }; // Chin

const paperEvidence = presenceEngine.evaluate(
  { faceLandmarks: [mockFaceLandmarks] },
  { landmarks: [[{ x: 0.5, y: 0.5, visibility: 0.9 }, { x: 0.5, y: 0.5, visibility: 0.9 }, ...Array(31).fill({ x: 0.5, y: 0.5, visibility: 0.9 })]] },
  null,
  t0 + 10000
);
assert(paperEvidence.isReadingOrWritingPaper === true, 'CASE 6.1: Recognized head-down paper study posture');
assert(paperEvidence.studentFaceDetected === true, 'CASE 6.2: Maintained presence during paper study');

// 7. Facial Geometric Baseline & Other Person Rejection
const calibrationEngine = new CalibrationEngine();
const baselineVector = [0.40, 0.45, 0.22, 0.35, 0.48, 0.90, 0.85, 0.28];
calibrationEngine.saveCalibration({
  calibratedAt: Date.now(),
  faceVector: baselineVector,
  sampleCount: 10,
  qualityScore: 0.95,
});

// Student's own face (slight variance 2%)
const studentFaceVector = [0.405, 0.448, 0.221, 0.352, 0.481, 0.902, 0.851, 0.282];
const studentConfidence = calibrationEngine.computeMatchConfidence(studentFaceVector);
assert(studentConfidence >= 0.85, 'CASE 7.1: Calibrated student face produces high confidence');

// Foreign person face (noticeable difference in eye spacing and face height)
const otherPersonVector = [0.30, 0.35, 0.15, 0.25, 0.40, 0.70, 0.70, 0.20];
const otherConfidence = calibrationEngine.computeMatchConfidence(otherPersonVector);
assert(otherConfidence < 0.65, 'CASE 7.2: Different person fails student baseline verification threshold');

console.log(`\n==================================================`);
console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
console.log(`==================================================`);
