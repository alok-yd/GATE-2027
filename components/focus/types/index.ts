/**
 * Strict TypeScript types for the GATE 2027 AI Focus Timer Subsystem
 * Production-quality architecture with zero 'any' types
 */

export type CameraHealthState = 
  | 'INITIALIZING'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'RECOVERING'
  | 'FAILED';

export interface CameraHealth {
  state: CameraHealthState;
  streamActive: boolean;
  trackState: string;
  videoReady: boolean;
  lastFrameAt: number;
  frameCount: number;
  frameFreshnessMs: number;
  brightnessQuality: number;
  freezeDetected: boolean;
  errorCount: number;
  recoveryCount: number;
  errorMessage?: string;
}

export type StudentPresenceState = 
  | 'UNKNOWN'
  | 'VERIFYING'
  | 'PRESENT'
  | 'AWAY'
  | 'RECOVERING';

export interface HeadPose {
  pitch: number; // Down / Up (-90 to +90 deg)
  yaw: number;   // Left / Right (-90 to +90 deg)
  roll: number;  // Tilt (-90 to +90 deg)
}

export interface StudentPresenceEvidence {
  genericPersonDetected: boolean;
  studentFaceDetected: boolean;
  faceMatchConfidence: number;
  faceDetectionConfidence: number;
  poseConfidence: number;
  temporalConfidence: number;
  headPose: HeadPose;
  isReadingOrWritingPaper: boolean;
  timestamp: number;
}

export type DeviceInteractionState = 
  | 'NO_DEVICE_USE'
  | 'DEVICE_CANDIDATE'
  | 'DEVICE_CONFIRMED'
  | 'DEVICE_IN_USE'
  | 'DEVICE_RECOVERY';

export interface BoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface DeviceInteractionEvidence {
  deviceDetected: boolean;
  deviceConfidence: number;
  bbox: BoundingBox | null;
  handInteractionConfidence: number;
  proximityConfidence: number;
  movementConfidence: number;
  persistenceMs: number;
  timestamp: number;
}

export type DetectorType = 'face' | 'pose' | 'hands' | 'object';

export type ModelHealthState = 
  | 'UNINITIALIZED'
  | 'LOADING'
  | 'READY'
  | 'DEGRADED'
  | 'ERROR'
  | 'RECOVERING';

export interface DetectorHealth {
  detector: DetectorType;
  state: ModelHealthState;
  lastInferenceAt: number;
  inferenceCount: number;
  averageLatencyMs: number;
  errorCount: number;
  errorMessage?: string;
}

export type SegmentReason = 
  | 'study_verified'
  | 'away'
  | 'device_use'
  | 'manual_pause'
  | 'monitoring_error';

export interface FocusSegment {
  id: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  reason: SegmentReason;
}

export type FocusEventType = 
  | 'STUDENT_PRESENT'
  | 'STUDENT_AWAY'
  | 'DEVICE_DETECTED'
  | 'DEVICE_IN_USE'
  | 'DEVICE_CLEARED'
  | 'MONITORING_DEGRADED'
  | 'MONITORING_RECOVERED'
  | 'TIMER_STARTED'
  | 'TIMER_PAUSED'
  | 'TIMER_RESUMED'
  | 'SESSION_START'
  | 'SESSION_STOP';

export interface FocusEvent {
  id: string;
  timestamp: number;
  type: FocusEventType;
  description: string;
  confidence?: number;
}

export type StudyMode = 'screen' | 'paper' | 'mixed';

export type SessionState = 'IDLE' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type PauseReason = 
  | 'STUDENT_AWAY'
  | 'DEVICE_IN_USE'
  | 'MANUAL_PAUSE'
  | 'MONITORING_UNAVAILABLE';

export interface FocusSession {
  id: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  subject: string;
  topic: string;
  studyMode: StudyMode;
  targetDurationMinutes: number;
  totalSessionMs: number;
  verifiedFocusMs: number;
  awayMs: number;
  deviceUseMs: number;
  manualPauseMs: number;
  monitoringErrorMs: number;
  focusScore: number;
  efficiencyPercentage: number;
  segments: FocusSegment[];
  events: FocusEvent[];
  state: SessionState;
  pauseReason?: PauseReason;
  isSimulation?: boolean;
}

export interface StudentCalibration {
  calibratedAt: number;
  faceVector: number[]; // 12-point facial landmark distance ratio vector
  sampleCount: number;
  qualityScore: number;
  studentName?: string;
}

export interface TimerGateInputs {
  studentPresent: boolean;
  deviceInUse: boolean;
  monitoringHealthy: boolean;
  manualPause: boolean;
}

export interface TimerGateState {
  isOpen: boolean;
  pauseReason: PauseReason | null;
  studentPresent: boolean;
  deviceInUse: boolean;
  monitoringHealthy: boolean;
  manualPause: boolean;
  lastEvaluatedAt: number;
}

export interface FocusSettings {
  selectedCameraId: string;
  cameraResolution: '720p' | '480p' | '360p';
  detectionFps: number;
  presenceThreshold: number;
  deviceThreshold: number;
  backgroundMonitoring: boolean;
  showDiagnostics: boolean;
  motivationalMessages: boolean;
  simulationMode: boolean;
}

export interface SimulationState {
  enabled: boolean;
  simulatedStudentPresent: boolean;
  simulatedDeviceInUse: boolean;
  simulatedCameraFailure: boolean;
  simulatedStaleFrame: boolean;
}
