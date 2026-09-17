import { PhoneDisambiguationResult, VisionData, ActivityData, DeviceStatus, DeviceInteractionEvidence } from '../../types';
import { PoseAnalysisResult } from './analyzers/PoseAnalyzer';
import { HandAnalysisResult } from './analyzers/HandAnalyzer';

export type PhoneState = 'NO_DEVICE_USE' | 'DEVICE_USE_CANDIDATE' | 'DEVICE_USE_CONFIRMED' | 'DEVICE_IN_USE';

export class PhoneDisambiguation {
  private phonePersistenceHistory: number[] = [];
  private currentState: PhoneState = 'NO_DEVICE_USE';
  private stateEnteredTimestamp: number = Date.now();
  private interactionStartTimestamp: number | null = null;
  private cleanFramesDurationMs: number = 0;
  private lastEvaluationTime: number = 0;

  disambiguate(
    vision: VisionData,
    pose: PoseAnalysisResult,
    hand: HandAnalysisResult,
    activity: ActivityData,
    now: number = Date.now()
  ): PhoneDisambiguationResult {
    let dt = this.lastEvaluationTime === 0 ? 500 : now - this.lastEvaluationTime;
    if (dt < 0 || dt > 5000) {
      dt = 500;
    }
    this.lastEvaluationTime = now;

    // 1. Multi-signal device presence detection
    const visualEvidence = vision.phoneEvidence?.visualEvidence ?? vision.phoneDetectedScore ?? 0.0;
    const handOverlap = vision.phoneEvidence?.handInteractionConfidence ?? 0.0;
    const nearFace = !!vision.phoneEvidence?.nearFace || (vision.phoneEvidence?.faceProximityConfidence ?? 0) >= 0.70;
    const isOnDesk = !!vision.phoneEvidence?.isOnDesk;
    const isHeldInHand = !!vision.phoneEvidence?.isHeldInHand;
    const handEvidence = vision.phoneEvidence?.handPhoneEvidence ?? (hand.handActivity ? 0.25 : 0.0);
    const proximityEvidence = nearFace ? 0.95 : (isHeldInHand ? 0.80 : (vision.phoneEvidence?.proximityEvidence ?? 0.2));

    // Device detected in visual frame?
    const deviceDetected = visualEvidence >= 0.45 || (vision.phoneEvidence?.detected ?? false);

    // 2. Hand / Device Interaction Confirmation (Rule 2 & Section 10-12)
    // Writing with pen strongly suppresses device interaction
    const isPenWriting = hand.isWritingBurst && !nearFace;

    // Hand interaction confidence requires physical overlap/contact with the device
    const handInteractionConfidence = Math.max(handOverlap, isHeldInHand ? 0.85 : 0.0, handEvidence > 0.45 && !isPenWriting ? handEvidence : 0.0);

    // Candidate for actual device usage:
    // Device must be detected AND student must be physically interacting with it (held or near face)
    const hasMeaningfulInteraction = (handInteractionConfidence >= 0.35 || nearFace || isHeldInHand) && !isPenWriting;
    const rawInteractionCandidate = deviceDetected && hasMeaningfulInteraction;

    // 3. Temporal rolling history of interaction
    const instantInteractionScore = rawInteractionCandidate ? (nearFace ? 0.95 : Math.max(0.65, handInteractionConfidence)) : 0.0;
    this.phonePersistenceHistory.push(instantInteractionScore);
    if (this.phonePersistenceHistory.length > 8) this.phonePersistenceHistory.shift();

    const smoothedInteraction = this.phonePersistenceHistory.reduce((a, b) => a + b, 0) / this.phonePersistenceHistory.length;

    // 4. Temporal State Machine: NO_DEVICE_USE -> CANDIDATE -> CONFIRMED -> IN_USE (Section 13)
    if (rawInteractionCandidate) {
      this.cleanFramesDurationMs = 0;
      if (this.interactionStartTimestamp === null) {
        this.interactionStartTimestamp = now;
      }
      const continuousDuration = now - this.interactionStartTimestamp;

      if (continuousDuration >= 1500) {
        this.currentState = 'DEVICE_IN_USE';
      } else if (continuousDuration >= 800) {
        this.currentState = 'DEVICE_USE_CONFIRMED';
      } else {
        this.currentState = 'DEVICE_USE_CANDIDATE';
      }
    } else {
      this.interactionStartTimestamp = null;
      // 5. Device Use Recovery (Section 14)
      // When interaction stops, require 1500ms stabilization before exiting DEVICE_IN_USE
      this.cleanFramesDurationMs += dt;

      if (this.currentState === 'DEVICE_IN_USE') {
        if (this.cleanFramesDurationMs >= 1500) {
          this.currentState = 'NO_DEVICE_USE';
          this.phonePersistenceHistory = [];
        }
      } else if (this.currentState === 'DEVICE_USE_CONFIRMED' || this.currentState === 'DEVICE_USE_CANDIDATE') {
        if (this.cleanFramesDurationMs >= 800) {
          this.currentState = 'NO_DEVICE_USE';
          this.phonePersistenceHistory = [];
        }
      }
    }

    // 6. Authoritative Device Status Decision (Section 10-11)
    const deviceInUse = this.currentState === 'DEVICE_IN_USE';
    let deviceStatus: DeviceStatus = 'NOT_DETECTED';

    if (deviceInUse) {
      deviceStatus = 'DEVICE_IN_USE';
    } else if (deviceDetected) {
      deviceStatus = 'DEVICE_PRESENT';
    } else {
      deviceStatus = 'NOT_DETECTED';
    }

    // Paper confidence (for study activity analytics)
    let paperScore = 0.0;
    if (isPenWriting) {
      paperScore = 0.85;
    } else if (pose.isLookingDown && !deviceInUse) {
      paperScore = 0.60;
    }

    let dominantObject: 'PHONE' | 'PAPER' | 'NONE' = 'NONE';
    let reason = '';

    if (deviceStatus === 'DEVICE_IN_USE') {
      dominantObject = 'PHONE';
      reason = `Device interaction confirmed in active use (${nearFace ? 'near face' : 'held in hand'}). Focus paused.`;
    } else if (deviceStatus === 'DEVICE_PRESENT') {
      dominantObject = 'PHONE';
      reason = 'Device present on desk (no active interaction). Focus timer continues.';
    } else if (paperScore >= 0.50) {
      dominantObject = 'PAPER';
      reason = 'Paper study / note-taking active.';
    } else {
      dominantObject = 'NONE';
      reason = 'Clear study workstation.';
    }

    const deviceInteractionEvidence: DeviceInteractionEvidence = {
      deviceDetected,
      deviceConfidence: visualEvidence,
      handInteractionConfidence,
      proximityConfidence: proximityEvidence,
      persistenceMs: this.currentState !== 'NO_DEVICE_USE' ? (now - this.stateEnteredTimestamp) : 0,
      bbox: vision.phoneEvidence?.bbox,
      timestamp: now,
      isOnDesk: isOnDesk || (deviceDetected && !hasMeaningfulInteraction),
      isHeldInHand,
      nearFace
    };

    return {
      isPhone: deviceInUse, // True ONLY when device is actually in use!
      phoneConfidence: deviceInUse ? Math.max(0.85, smoothedInteraction) : (deviceDetected ? 0.40 : 0.0),
      paperConfidence: paperScore,
      dominantObject,
      handGripConfidence: handInteractionConfidence,
      aspectRatioMatch: visualEvidence > 0.40,
      reason,
      deviceInUse,
      deviceStatus,
      deviceInteractionEvidence,
      phoneEvidence: {
        detected: deviceDetected,
        confidence: visualEvidence,
        visualEvidence,
        handPhoneEvidence: handInteractionConfidence,
        proximityEvidence,
        temporalEvidence: smoothedInteraction,
        bbox: vision.phoneEvidence?.bbox,
        handInteractionConfidence,
        faceProximityConfidence: nearFace ? 0.95 : 0.10,
        persistenceMs: deviceInteractionEvidence.persistenceMs,
        timestamp: now,
        isOnDesk: deviceInteractionEvidence.isOnDesk,
        isHeldInHand,
        nearFace,
        deviceStatus
      }
    };
  }

  reset(): void {
    this.phonePersistenceHistory = [];
    this.currentState = 'NO_DEVICE_USE';
    this.stateEnteredTimestamp = Date.now();
    this.cleanFramesDurationMs = 0;
    this.lastEvaluationTime = 0;
  }
}

export const phoneDisambiguation = new PhoneDisambiguation();
