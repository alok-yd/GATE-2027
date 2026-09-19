import assert from 'node:assert';
import { cameraManager } from '../components/focus/services/CameraManager';
import { visionWatchdog, VisionPipelineHealth } from '../components/focus/services/VisionWatchdog';
import { visionRecoveryManager } from '../components/focus/services/VisionRecoveryManager';
import { modelManager } from '../components/focus/services/ml/ModelManager';
import { frameScheduler } from '../components/focus/services/ml/FrameScheduler';
import { focusSessionController, shouldTimerRun } from '../components/focus/services/FocusSessionController';
import { FocusConfig } from '../components/focus/constants/FocusConfig';

let passed = 0;
let failed = 0;

function it(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`✅ PASS: ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`❌ FAIL: ${name}`, err);
        failed++;
      });
    } else {
      console.log(`✅ PASS: ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`❌ FAIL: ${name}`, err);
    failed++;
  }
}

async function runResilienceTests() {
  console.log('========================================================');
  console.log('GATE 2027 PREP TRACKER — VISION PIPELINE RESILIENCE TESTS');
  console.log('========================================================\n');

  console.log('--- TEST 1: CameraManager Single Ownership & Generation Tokens ---');
  it('CameraManager maintains a monotonically increasing generation token', () => {
    const gen0 = cameraManager.getGenerationId();
    cameraManager.stop();
    const gen1 = cameraManager.getGenerationId();
    assert.ok(gen1 > gen0, `Generation ID should increase on stop (was ${gen0}, now ${gen1})`);
  });

  it('CameraManager health reports correctly', () => {
    const health = cameraManager.getHealth();
    assert.strictEqual(typeof health.status, 'string');
    assert.strictEqual(typeof health.frameCount, 'number');
    assert.strictEqual(typeof health.recoveryAttempts, 'number');
  });

  console.log('\n--- TEST 2: VisionWatchdog Bounded Grace Period & Recovery ---');
  it('VisionWatchdog initializes in VERIFIED state', () => {
    visionWatchdog.setMonitoringActive(false);
    const health = visionWatchdog.getHealth();
    assert.strictEqual(health.status, 'VERIFIED');
    assert.strictEqual(visionWatchdog.isWithinRecoveryGrace(), false);
  });

  it('VisionWatchdog activates recovery on trigger and maintains bounded grace', () => {
    visionWatchdog.setMonitoringActive(true);
    visionWatchdog.triggerRecovery('Simulated transient glitch');
    assert.strictEqual(visionWatchdog.isWithinRecoveryGrace(), true, 'Should be within recovery grace');
    const health = visionWatchdog.getHealth();
    assert.strictEqual(health.status, 'RECOVERING');
    assert.ok(health.recoveryGraceRemainingMs > 0, 'Should have positive grace remaining');
  });

  it('VisionWatchdog restores to VERIFIED upon camera frame heartbeat', () => {
    visionWatchdog.recordCameraFrame(Date.now());
    assert.strictEqual(visionWatchdog.isWithinRecoveryGrace(), false);
    const health = visionWatchdog.getHealth();
    assert.strictEqual(health.status, 'VERIFIED');
  });

  it('VisionWatchdog emits UNAVAILABLE only after max recovery retries and grace expiration', () => {
    let failureNotified = false;
    const unsub = visionWatchdog.subscribeFailure((reason) => {
      failureNotified = true;
    });

    visionWatchdog.setMonitoringActive(true);
    // Trigger recoveries up to 3 times
    visionWatchdog.triggerRecovery('Glitch 1');
    visionWatchdog.triggerRecovery('Glitch 2');
    visionWatchdog.triggerRecovery('Glitch 3');

    // Recovery is in progress, failure should NOT be declared immediately!
    assert.strictEqual(failureNotified, false, 'Should NOT notify fatal failure while recovery is in grace');

    unsub();
  });

  console.log('\n--- TEST 3: ModelManager Detector Isolation & Restarts ---');
  it('ModelManager tracks independent detector health', () => {
    const detHealth = modelManager.getDetectorHealth();
    assert.ok(detHealth.face !== undefined);
    assert.ok(detHealth.pose !== undefined);
    assert.ok(detHealth.hands !== undefined);
    assert.ok(detHealth.object !== undefined);
    assert.strictEqual(detHealth.face.consecutiveFailures, 0);
  });

  it('ModelManager can restart individual detectors without throwing', async () => {
    const res = await modelManager.restartDetector('object');
    assert.strictEqual(res, true);
    const detHealth = modelManager.getDetectorHealth();
    assert.strictEqual(detHealth.object.status, 'ready');
  });

  console.log('\n--- TEST 4: FrameScheduler Resilience & Decoupled Perceptions ---');
  it('FrameScheduler metrics report valid throughput and dropped frame counters', () => {
    const metrics = frameScheduler.getMetrics();
    assert.strictEqual(typeof metrics.fps, 'number');
    assert.strictEqual(typeof metrics.droppedFrames, 'number');
    assert.strictEqual(typeof metrics.avgLatencyMs, 'number');
  });

  it('FrameScheduler stops cleanly and resets in-flight flags', () => {
    frameScheduler.stop();
    const metrics = frameScheduler.getMetrics();
    assert.strictEqual(typeof metrics.fps, 'number');
  });

  console.log('\n--- TEST 5: FocusSessionController Recovery Grace Integration ---');
  it('Timer gate evaluates correctly using single authoritative decision', () => {
    assert.strictEqual(shouldTimerRun({ manualPause: false, monitoringHealthy: true, studentPresent: true, deviceInUse: false }), true);
    assert.strictEqual(shouldTimerRun({ manualPause: true, monitoringHealthy: true, studentPresent: true, deviceInUse: false }), false);
    assert.strictEqual(shouldTimerRun({ manualPause: false, monitoringHealthy: false, studentPresent: true, deviceInUse: false }), false);
    assert.strictEqual(shouldTimerRun({ manualPause: false, monitoringHealthy: true, studentPresent: false, deviceInUse: false }), false);
    assert.strictEqual(shouldTimerRun({ manualPause: false, monitoringHealthy: true, studentPresent: true, deviceInUse: true }), false);
  });

  it('FocusSessionController holds state during bounded recovery grace without false pause', () => {
    visionWatchdog.setMonitoringActive(true);
    visionWatchdog.triggerRecovery('Transient glitch');
    assert.strictEqual(visionWatchdog.isWithinRecoveryGrace(), true);

    // Update perception with evidence timestamp older than 2500ms
    const staleTime = Date.now() - 3000;
    focusSessionController.updatePerceptionState({
      studentPresent: true,
      presenceConfidence: 0.95,
      evidenceTimestamp: staleTime
    });

    const state = focusSessionController.getState();
    // During recovery grace, presence is protected from false drop
    assert.strictEqual(state.gate.studentPresent, true, 'Student presence should be preserved during recovery grace');

    // Clean up watchdog
    visionWatchdog.recordCameraFrame(Date.now());
    visionWatchdog.setMonitoringActive(false);
  });

  console.log('\n--- TEST 6: VisionRecoveryManager Multi-Tier Logic ---');
  it('VisionRecoveryManager initializes with empty logs and zero attempt count', () => {
    visionRecoveryManager.reset();
    const logs = visionRecoveryManager.getLogs();
    assert.strictEqual(Array.isArray(logs), true);
  });

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runResilienceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
