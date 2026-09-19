import { FocusSettings } from '../types';

/**
 * Centralized Configuration and Thresholds for GATE 2027 AI Focus Timer
 * No magic numbers scattered across components
 */
export const FocusConfig = {
  // Storage keys
  STORAGE_KEY_SESSIONS: 'gate_focus_sessions_v2',
  STORAGE_KEY_ACTIVE_SESSION: 'gate_focus_active_session_v2',
  STORAGE_KEY_CALIBRATION: 'gate_focus_student_calibration_v2',
  STORAGE_KEY_SETTINGS: 'gate_focus_settings_v2',
  STORAGE_VERSION: 2,

  // Camera & Freshness Thresholds
  CAMERA_DEFAULT_WIDTH: 640,
  CAMERA_DEFAULT_HEIGHT: 480,
  MAX_FRAME_AGE_MS: 2500,        // Stale frame timeout
  FREEZE_VARIATION_THRESHOLD: 2, // Min pixel difference across sampled region
  FREEZE_CHECK_INTERVAL_FRAMES: 30,
  MAX_CAMERA_RECOVERY_ATTEMPTS: 3,
  CAMERA_RECOVERY_BACKOFF_MS: [500, 1500, 3000],

  // Model Inference Targets (FPS)
  FPS_TARGET_FACE: 12,           // ~83ms
  FPS_TARGET_POSE: 10,           // ~100ms
  FPS_TARGET_HANDS: 10,          // ~100ms
  FPS_TARGET_OBJECT: 8,          // ~125ms
  MAX_INFERENCE_AGE_MS: 3500,    // Watchdog considers model stalled
  ADAPTIVE_LOAD_HIGH_MS: 85,     // Down-throttle inference when loop exceeds this
  ADAPTIVE_LOAD_LOW_MS: 40,      // Up-throttle inference when loop runs quickly

  // Presence & Identity Thresholds
  PRESENCE_CONFIDENCE_THRESHOLD: 0.50,
  STUDENT_MATCH_THRESHOLD: 0.65,       // Landmark distance similarity to student baseline
  PRESENCE_LOSS_GRACE_MS: 2000,        // Transition from PRESENT -> VERIFYING -> AWAY
  PRESENCE_RETURN_CONFIRM_MS: 1000,    // Transition from AWAY -> VERIFYING -> PRESENT
  PAPER_STUDY_PITCH_MIN_DEG: -40,      // Head pitch range for looking down at notes
  PAPER_STUDY_PITCH_MAX_DEG: -10,

  // Device & Phone Interaction Thresholds
  DEVICE_DETECTION_CONFIDENCE: 0.40,   // Min confidence for cell phone bounding box
  DEVICE_HAND_INTERACTION_PROXIMITY: 0.18, // Normalized distance between hand and phone bbox
  DEVICE_FACE_PROXIMITY: 0.25,         // Phone held up near face
  DEVICE_USE_CONFIRM_MS: 1200,         // Temporal confirmation before pausing timer
  DEVICE_RECOVERY_MS: 2000,            // Time phone must be absent before resuming timer

  // Default Subsystem Settings
  DEFAULT_SETTINGS: {
    selectedCameraId: '',
    cameraResolution: '480p',
    detectionFps: 10,
    presenceThreshold: 0.50,
    deviceThreshold: 0.45,
    backgroundMonitoring: true,
    showDiagnostics: true,
    motivationalMessages: true,
    simulationMode: false,
  } as FocusSettings,
};

export function safeGetStorageItem(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function safeRemoveStorageItem(key: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {}
}
