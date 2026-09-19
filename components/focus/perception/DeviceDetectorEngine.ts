import { BoundingBox, DeviceInteractionEvidence } from '../types';
import { FocusConfig } from '../storage/FocusConfig';

interface Point2D {
  x: number;
  y: number;
}

export class DeviceDetectorEngine {
  private firstDetectedAt: number = 0;
  private lastBbox: BoundingBox | null = null;
  private lastEvidence: DeviceInteractionEvidence = {
    deviceDetected: false,
    deviceConfidence: 0,
    bbox: null,
    handInteractionConfidence: 0,
    proximityConfidence: 0,
    movementConfidence: 0,
    persistenceMs: 0,
    timestamp: 0,
  };

  /**
   * Evaluates phone detection alongside hand and face positions to differentiate
   * between a phone resting harmlessly on the desk vs actively in use.
   */
  public evaluate(
    objectResult: any,
    handResult: any,
    faceResult: any,
    now: number = Date.now()
  ): DeviceInteractionEvidence {
    let deviceDetected = false;
    let deviceConfidence = 0;
    let primaryBbox: BoundingBox | null = null;

    // 1. Detect cell phone bounding boxes from ObjectDetector
    if (objectResult?.detections) {
      for (const d of objectResult.detections) {
        const cat = d.categories?.[0];
        const isPhone = cat && (cat.categoryName === 'cell phone' || cat.categoryName === 'mobile phone');
        if (isPhone && cat.score >= FocusConfig.DEVICE_DETECTION_CONFIDENCE) {
          deviceDetected = true;
          deviceConfidence = Math.max(deviceConfidence, cat.score);
          if (d.boundingBox) {
            primaryBbox = {
              originX: d.boundingBox.originX,
              originY: d.boundingBox.originY,
              width: d.boundingBox.width,
              height: d.boundingBox.height,
            };
          }
          break;
        }
      }
    }

    if (!deviceDetected || !primaryBbox) {
      this.firstDetectedAt = 0;
      this.lastBbox = null;
      this.lastEvidence = {
        deviceDetected: false,
        deviceConfidence: 0,
        bbox: null,
        handInteractionConfidence: 0,
        proximityConfidence: 0,
        movementConfidence: 0,
        persistenceMs: 0,
        timestamp: now,
      };
      return this.lastEvidence;
    }

    // 2. Track persistence
    if (this.firstDetectedAt === 0) {
      this.firstDetectedAt = now;
    }
    const persistenceMs = now - this.firstDetectedAt;

    // 3. Movement calculation
    let movementConfidence = 0;
    if (this.lastBbox) {
      const dx = Math.abs(primaryBbox.originX - this.lastBbox.originX);
      const dy = Math.abs(primaryBbox.originY - this.lastBbox.originY);
      const shift = Math.sqrt(dx * dx + dy * dy);
      // Small jitter is normal, larger shift indicates hand movement
      if (shift > 0.02) {
        movementConfidence = Math.min(1.0, shift * 10);
      }
    }
    this.lastBbox = { ...primaryBbox };

    // 4. Hand interaction: Check overlap/distance between hand landmarks and phone BBox
    let handInteractionConfidence = 0;
    if (handResult?.landmarks && handResult.landmarks.length > 0) {
      for (const hand of handResult.landmarks) {
        // Key landmarks: wrist (0), index base (5), index tip (8), thumb tip (4), pinky base (17)
        const checkPoints: Point2D[] = [hand[0], hand[4], hand[5], hand[8], hand[17]];
        for (const pt of checkPoints) {
          if (!pt) continue;
          const distToBbox = this.distanceToBoundingBox(pt, primaryBbox);
          if (distToBbox <= 0) {
            // Hand point is directly inside phone bounding box
            handInteractionConfidence = 0.95;
            break;
          } else if (distToBbox < FocusConfig.DEVICE_HAND_INTERACTION_PROXIMITY) {
            // Hand point is closely grasping or hovering near phone
            const proximityFactor = 1.0 - (distToBbox / FocusConfig.DEVICE_HAND_INTERACTION_PROXIMITY);
            handInteractionConfidence = Math.max(handInteractionConfidence, proximityFactor * 0.85);
          }
        }
        if (handInteractionConfidence >= 0.90) break;
      }
    }

    // 5. Face proximity: Check if phone is held up near face (e.g. phone call or selfie position)
    let proximityConfidence = 0;
    if (faceResult?.faceLandmarks && faceResult.faceLandmarks[0]) {
      const nose = faceResult.faceLandmarks[0][1];
      if (nose) {
        const distToFace = this.distanceToBoundingBox(nose, primaryBbox);
        if (distToFace < FocusConfig.DEVICE_FACE_PROXIMITY) {
          proximityConfidence = 1.0 - (distToFace / FocusConfig.DEVICE_FACE_PROXIMITY);
        }
      }
    }

    this.lastEvidence = {
      deviceDetected: true,
      deviceConfidence,
      bbox: primaryBbox,
      handInteractionConfidence: Math.round(handInteractionConfidence * 100) / 100,
      proximityConfidence: Math.round(proximityConfidence * 100) / 100,
      movementConfidence: Math.round(movementConfidence * 100) / 100,
      persistenceMs,
      timestamp: now,
    };

    return this.lastEvidence;
  }

  /**
   * Helper: Euclidean distance from normalized point to rectangular bounding box
   */
  private distanceToBoundingBox(pt: Point2D, bbox: BoundingBox): number {
    const minX = bbox.originX;
    const maxX = bbox.originX + bbox.width;
    const minY = bbox.originY;
    const maxY = bbox.originY + bbox.height;

    // If inside
    if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
      return 0;
    }

    const dx = Math.max(0, minX - pt.x, pt.x - maxX);
    const dy = Math.max(0, minY - pt.y, pt.y - maxY);
    return Math.sqrt(dx * dx + dy * dy);
  }

  public getLastEvidence(): DeviceInteractionEvidence {
    return this.lastEvidence;
  }
}
