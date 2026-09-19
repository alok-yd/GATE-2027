import { TimestampTimerEngine } from '../components/focus/timer/TimestampTimerEngine';
import { TimerGateState } from '../components/focus/types';

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
console.log('TIMESTAMP-BASED TIMER ENGINE SEGMENT MATH TESTS');
console.log('==================================================\n');

const engine = new TimestampTimerEngine();

const openGate: TimerGateState = {
  isOpen: true,
  pauseReason: null,
  studentPresent: true,
  deviceInUse: false,
  monitoringHealthy: true,
  manualPause: false,
  lastEvaluatedAt: 0,
};

const awayGate: TimerGateState = {
  isOpen: false,
  pauseReason: 'STUDENT_AWAY',
  studentPresent: false,
  deviceInUse: false,
  monitoringHealthy: true,
  manualPause: false,
  lastEvaluatedAt: 0,
};

const deviceGate: TimerGateState = {
  isOpen: false,
  pauseReason: 'DEVICE_IN_USE',
  studentPresent: true,
  deviceInUse: true,
  monitoringHealthy: true,
  manualPause: false,
  lastEvaluatedAt: 0,
};

const t0 = 100000000;
engine.start(t0);

// Segment 1: 20 minutes (1,200,000 ms) of verified study
engine.updateGate(openGate, t0);
const t1 = t0 + 20 * 60 * 1000;
const snap1 = engine.getSnapshot(t1);
assert(snap1.verifiedFocusMs === 1200000, 'CASE 1.1: 20 min verified study segment accurately recorded');
assert(snap1.awayMs === 0, 'CASE 1.2: Away time is 0');

// Segment 2: 5 minutes (300,000 ms) away from desk
engine.updateGate(awayGate, t1);
const t2 = t1 + 5 * 60 * 1000;
const snap2 = engine.getSnapshot(t2);
assert(snap2.verifiedFocusMs === 1200000, 'CASE 2.1: Verified study time remained paused during absence');
assert(snap2.awayMs === 300000, 'CASE 2.2: Away time accurately recorded 5 mins (300,000ms)');

// Segment 3: 15 minutes (900,000 ms) of verified study
engine.updateGate(openGate, t2);
const t3 = t2 + 15 * 60 * 1000;
const snap3 = engine.getSnapshot(t3);
assert(snap3.verifiedFocusMs === 2100000, 'CASE 3.1: Total verified time is 35 mins (2,100,000ms)');
assert(snap3.awayMs === 300000, 'CASE 3.2: Away time remains 5 mins');
assert(snap3.totalSessionMs === 40 * 60 * 1000, 'CASE 3.3: Total session duration is exactly 40 mins (2,400,000ms)');

// Segment 4: 2 minutes phone interruption
engine.updateGate(deviceGate, t3);
const t4 = t3 + 2 * 60 * 1000;
const snap4 = engine.getSnapshot(t4);
assert(snap4.deviceUseMs === 120000, 'CASE 4.1: Device interruption accurately recorded 2 mins (120,000ms)');
assert(snap4.verifiedFocusMs === 2100000, 'CASE 4.2: Verified study time paused during phone interaction');

// Stop session
const finalData = engine.stop();
assert(finalData.verifiedFocusMs === 2100000, 'CASE 5: Final verified time matches exactly');
assert(finalData.segments.length >= 3, 'CASE 5.2: Segments preserved in historical sequence');

console.log(`\n==================================================`);
console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
console.log(`==================================================`);
