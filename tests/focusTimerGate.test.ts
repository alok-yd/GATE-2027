import { VerifiedTimerGate } from '../components/focus/controllers/VerifiedTimerGate';

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
console.log('VERIFIED TIMER GATE: AUTHORITATIVE TRUTH TABLE');
console.log('==================================================\n');

// 1. All conditions satisfied
const c1 = VerifiedTimerGate.evaluate({
  studentPresent: true,
  deviceInUse: false,
  monitoringHealthy: true,
  manualPause: false,
});
assert(c1.isOpen === true, 'CASE 1: Timer gate is OPEN when all conditions satisfied');
assert(c1.pauseReason === null, 'CASE 1: Pause reason is null when open');

// 2. Student absent
const c2 = VerifiedTimerGate.evaluate({
  studentPresent: false,
  deviceInUse: false,
  monitoringHealthy: true,
  manualPause: false,
});
assert(c2.isOpen === false, 'CASE 2: Timer gate is CLOSED when student absent');
assert(c2.pauseReason === 'STUDENT_AWAY', 'CASE 2: Pause reason is STUDENT_AWAY');

// 3. Device in use
const c3 = VerifiedTimerGate.evaluate({
  studentPresent: true,
  deviceInUse: true,
  monitoringHealthy: true,
  manualPause: false,
});
assert(c3.isOpen === false, 'CASE 3: Timer gate is CLOSED when device in use');
assert(c3.pauseReason === 'DEVICE_IN_USE', 'CASE 3: Pause reason is DEVICE_IN_USE');

// 4. Monitoring unhealthy (camera stall, freeze, or detector crash)
const c4 = VerifiedTimerGate.evaluate({
  studentPresent: true,
  deviceInUse: false,
  monitoringHealthy: false,
  manualPause: false,
});
assert(c4.isOpen === false, 'CASE 4: Timer gate is CLOSED when monitoring unhealthy');
assert(c4.pauseReason === 'MONITORING_UNAVAILABLE', 'CASE 4: Pause reason is MONITORING_UNAVAILABLE');

// 5. Manual pause
const c5 = VerifiedTimerGate.evaluate({
  studentPresent: true,
  deviceInUse: false,
  monitoringHealthy: true,
  manualPause: true,
});
assert(c5.isOpen === false, 'CASE 5: Timer gate is CLOSED on manual pause');
assert(c5.pauseReason === 'MANUAL_PAUSE', 'CASE 5: Pause reason is MANUAL_PAUSE');

// 6. Multiple blockers: student absent AND phone in use
const c6 = VerifiedTimerGate.evaluate({
  studentPresent: false,
  deviceInUse: true,
  monitoringHealthy: true,
  manualPause: false,
});
assert(c6.isOpen === false, 'CASE 6: Timer gate is CLOSED when multiple blockers active');
assert(c6.pauseReason === 'STUDENT_AWAY', 'CASE 6: Evaluates primary blocker priority');

console.log(`\n==================================================`);
console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
console.log(`==================================================`);
