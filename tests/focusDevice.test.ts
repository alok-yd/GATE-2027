import { DeviceInteractionController } from '../components/focus/controllers/DeviceInteractionController';
import { DeviceDetectorEngine } from '../components/focus/perception/DeviceDetectorEngine';
import { DeviceInteractionEvidence } from '../components/focus/types';

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
console.log('DEVICE INTERACTION & PHONE-ON-DESK TESTS');
console.log('==================================================\n');

const controller = new DeviceInteractionController();
const t0 = 200000;

// 1. Phone lying on desk (detected, but hand interaction = 0)
const phoneOnDeskEvidence: DeviceInteractionEvidence = {
  deviceDetected: true,
  deviceConfidence: 0.85,
  bbox: { originX: 0.1, originY: 0.8, width: 0.15, height: 0.15 },
  handInteractionConfidence: 0.0, // Hands are away from phone
  proximityConfidence: 0.0,
  movementConfidence: 0.0,
  persistenceMs: 5000,
  timestamp: t0,
};

controller.update(phoneOnDeskEvidence, t0);
assert(controller.isDeviceInUse() === false, 'CASE 1.1: Phone on desk does NOT mark device in use');
assert(controller.getState() === 'NO_DEVICE_USE', 'CASE 1.2: State remains NO_DEVICE_USE for phone on desk');

// 2. Phone picked up in hand (hand overlap detected)
const phoneInHandEvidence: DeviceInteractionEvidence = {
  deviceDetected: true,
  deviceConfidence: 0.90,
  bbox: { originX: 0.4, originY: 0.5, width: 0.15, height: 0.20 },
  handInteractionConfidence: 0.95, // Hand grasping phone
  proximityConfidence: 0.40,
  movementConfidence: 0.30,
  persistenceMs: 100,
  timestamp: t0 + 100,
};

controller.update(phoneInHandEvidence, t0 + 100);
assert(controller.getState() === 'DEVICE_CANDIDATE', 'CASE 2.1: Phone pickup triggers DEVICE_CANDIDATE');
assert(controller.isDeviceInUse() === false, 'CASE 2.2: Timer not immediately paused on candidate frame');

// 3. Momentary touch (releases after 300ms < 1200ms confirm threshold)
const noPhoneEvidence: DeviceInteractionEvidence = {
  deviceDetected: false,
  deviceConfidence: 0,
  bbox: null,
  handInteractionConfidence: 0,
  proximityConfidence: 0,
  movementConfidence: 0,
  persistenceMs: 0,
  timestamp: t0 + 400,
};

controller.update(noPhoneEvidence, t0 + 400);
assert(controller.getState() === 'NO_DEVICE_USE', 'CASE 3: Momentary touch cleans up without false device pause');

// 4. Sustained phone usage confirms DEVICE_IN_USE (> 1200ms)
controller.update(phoneInHandEvidence, t0 + 1000); // start candidate at 1000ms
controller.update(phoneInHandEvidence, t0 + 1800); // 800ms
assert(controller.getState() === 'DEVICE_CANDIDATE', 'CASE 4.1: Still candidate at 800ms');
controller.update(phoneInHandEvidence, t0 + 2500); // 1500ms > 1200ms
assert(controller.getState() === 'DEVICE_IN_USE', 'CASE 4.2: Confirmed DEVICE_IN_USE after 1500ms persistence');
assert(controller.isDeviceInUse() === true, 'CASE 4.3: isDeviceInUse() is true, pausing verified timer');

// 5. Phone put down enters DEVICE_RECOVERY
controller.update(noPhoneEvidence, t0 + 3000);
assert(controller.getState() === 'DEVICE_RECOVERY', 'CASE 5.1: Enters DEVICE_RECOVERY when phone put down');
assert(controller.isDeviceInUse() === false, 'CASE 5.2: In-use flag drops to allow resumption sequence');

// 6. Recovery confirmed after 2000ms
controller.update(noPhoneEvidence, t0 + 4000); // 1000ms into recovery
assert(controller.getState() === 'DEVICE_RECOVERY', 'CASE 6.1: Remains in recovery at 1000ms');
controller.update(noPhoneEvidence, t0 + 5200); // 2200ms > 2000ms
assert(controller.getState() === 'NO_DEVICE_USE', 'CASE 6.2: Transitioned back to NO_DEVICE_USE after full recovery');

// 7. DeviceDetectorEngine geometric bounding box overlap check
const deviceEngine = new DeviceDetectorEngine();
// Phone at (0.4, 0.4) to (0.6, 0.6)
const mockObjectResult = {
  detections: [{
    categories: [{ categoryName: 'cell phone', score: 0.88 }],
    boundingBox: { originX: 0.4, originY: 0.4, width: 0.2, height: 0.2 }
  }]
};
// Hand point at (0.45, 0.45) - inside phone bbox
const mockHandResultIn = {
  landmarks: [[{ x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }, { x: 0.45, y: 0.45 }]]
};
// Hand point at (0.8, 0.8) - far away from phone
const mockHandResultAway = {
  landmarks: [[{ x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }, { x: 0.85, y: 0.85 }]]
};

const evalHolding = deviceEngine.evaluate(mockObjectResult, mockHandResultIn, null, t0 + 10000);
assert(evalHolding.handInteractionConfidence >= 0.80, 'CASE 7.1: Detected hand overlap with phone bbox');

const evalOnDesk = deviceEngine.evaluate(mockObjectResult, mockHandResultAway, null, t0 + 10100);
assert(evalOnDesk.handInteractionConfidence === 0, 'CASE 7.2: Zero hand interaction when hand is distant from phone');

console.log(`\n==================================================`);
console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
console.log(`==================================================`);
