/**
 * Centralized Focus Perception & Verification Configuration
 * Eliminates scattered magic numbers and unifies threshold governance.
 */

export interface FocusConfigType {
  // Detection Confidence Thresholds
  presenceThreshold: number;
  phoneThreshold: number;
  phoneInUseThreshold: number;
  paperThreshold: number;
  screenThreshold: number;
  thinkingThreshold: number;
  conversationThreshold: number;
  sleepThreshold: number;

  // Temporal & State Latching Durations (ms)
  awayGraceMs: number;
  presenceLossGraceMs: number;
  absenceConfirmMs: number;
  returnConfirmMs: number;
  phoneConfirmMs: number;
  phoneRecoveryMs: number;
  thinkingGraceMs: number;
  returnConfirmationMs: number;

  // Evidence Validity & Watchdog
  evidenceMaxAgeMs: number;
  maxPresenceEvidenceAgeMs: number;
  watchdogTimeoutMs: number;
  visionWatchdogTimeoutMs: number;

  // Student Identification & Verification Thresholds
  studentFaceMatchThreshold: number;

  // Frame Scheduler Target FPS
  cameraTargetFps: number;
  faceFps: number;
  poseFps: number;
  handsFps: number;
  objectFps: number;

  // Tracking & Geometry
  iouThreshold: number;
  maxTrackAgeMs: number;
  handPhoneOverlapThreshold: number;
  facePhoneProximityPx: number;

  // Model CDN URLs
  wasmBaseUrl: string;
  faceModelUrl: string;
  poseModelUrl: string;
  handModelUrl: string;
  objectModelUrl: string;
}

export const FocusConfig: FocusConfigType = {
  // Detection Confidence Thresholds
  presenceThreshold: 0.68,
  phoneThreshold: 0.55,
  phoneInUseThreshold: 0.68,
  paperThreshold: 0.58,
  screenThreshold: 0.58,
  thinkingThreshold: 0.45,
  conversationThreshold: 0.65,
  sleepThreshold: 0.70,

  // Temporal & State Latching Durations (ms)
  awayGraceMs: 2500,
  presenceLossGraceMs: 1200,
  absenceConfirmMs: 2500,
  returnConfirmMs: 1500,
  phoneConfirmMs: 1500,
  phoneRecoveryMs: 2500,
  thinkingGraceMs: 15000,
  returnConfirmationMs: 3000,

  // Evidence Validity & Watchdog
  evidenceMaxAgeMs: 2500,
  maxPresenceEvidenceAgeMs: 2500,
  watchdogTimeoutMs: 3000,
  visionWatchdogTimeoutMs: 3500,

  // Student Identification & Verification Thresholds
  studentFaceMatchThreshold: 0.70,

  // Frame Scheduler Target FPS
  cameraTargetFps: 25,
  faceFps: 12,
  poseFps: 10,
  handsFps: 10,
  objectFps: 6,

  // Tracking & Geometry
  iouThreshold: 0.25,
  maxTrackAgeMs: 2000,
  handPhoneOverlapThreshold: 0.30,
  facePhoneProximityPx: 100,

  // Model Asset URLs
  wasmBaseUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
  faceModelUrl: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  poseModelUrl: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  handModelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  objectModelUrl: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3'
};
