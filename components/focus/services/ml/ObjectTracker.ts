import { BoundingBox, TrackedObject } from '../../types';
import { FocusConfig } from '../../constants/FocusConfig';

export interface RawDetection {
  label: 'cell phone' | 'person' | 'laptop' | 'book' | 'tablet' | 'notebook' | 'other';
  confidence: number;
  bbox: BoundingBox;
}

export class ObjectTracker {
  private activeTracks: Map<string, TrackedObject> = new Map();
  private nextTrackId: number = 1;

  update(
    detections: RawDetection[],
    handBboxes: BoundingBox[] = [],
    faceCentroid?: { x: number; y: number },
    now: number = Date.now()
  ): TrackedObject[] {
    const matchedTrackIds = new Set<string>();

    for (const det of detections) {
      const centroid = {
        x: det.bbox.x + det.bbox.width / 2,
        y: det.bbox.y + det.bbox.height / 2
      };

      // Match against existing tracks with same label using IoU & centroid proximity
      let bestTrackId: string | null = null;
      let highestScore = 0;

      for (const [trackId, track] of this.activeTracks.entries()) {
        if (track.label !== det.label) continue;
        const iou = this.calculateIoU(det.bbox, track.bbox);
        const dist = Math.hypot(centroid.x - track.centroid.x, centroid.y - track.centroid.y);
        const score = iou * 0.7 + (1 / (1 + dist / 50)) * 0.3;

        if (score > highestScore && (iou >= FocusConfig.iouThreshold || dist < 60)) {
          highestScore = score;
          bestTrackId = trackId;
        }
      }

      // Check hand overlap
      let maxHandOverlap = 0;
      for (const hBox of handBboxes) {
        const overlap = this.calculateIoU(det.bbox, hBox);
        if (overlap > maxHandOverlap) maxHandOverlap = overlap;
      }

      // Check near face
      let isNearFace = false;
      if (faceCentroid) {
        const distToFace = Math.hypot(centroid.x - faceCentroid.x, centroid.y - faceCentroid.y);
        isNearFace = distToFace < FocusConfig.facePhoneProximityPx;
      }

      // Check on desk (in lower half of frame)
      const isOnDesk = centroid.y > 55 && !isNearFace;
      const isHeldInHand = maxHandOverlap > FocusConfig.handPhoneOverlapThreshold || isNearFace;

      if (bestTrackId) {
        const existing = this.activeTracks.get(bestTrackId)!;
        const dt = Math.max(1, now - existing.lastSeen) / 1000;
        const vx = (centroid.x - existing.centroid.x) / dt;
        const vy = (centroid.y - existing.centroid.y) / dt;

        existing.bbox = det.bbox;
        existing.centroid = centroid;
        existing.velocity = { vx: Number(vx.toFixed(1)), vy: Number(vy.toFixed(1)) };
        existing.confidence = det.confidence;
        existing.lastSeen = now;
        existing.ageMs = now - existing.firstSeen;
        existing.handOverlapScore = maxHandOverlap;
        existing.isHeldInHand = isHeldInHand;
        existing.nearFace = isNearFace;
        existing.isOnDesk = isOnDesk && !isHeldInHand;

        matchedTrackIds.add(bestTrackId);
      } else {
        const newId = `trk_${det.label.replace(/\s+/g, '_')}_${this.nextTrackId++}`;
        const newTrack: TrackedObject = {
          trackId: newId,
          label: det.label,
          confidence: det.confidence,
          bbox: det.bbox,
          centroid,
          velocity: { vx: 0, vy: 0 },
          ageMs: 0,
          firstSeen: now,
          lastSeen: now,
          isHeldInHand,
          nearFace: isNearFace,
          isOnDesk: isOnDesk && !isHeldInHand,
          handOverlapScore: maxHandOverlap
        };
        this.activeTracks.set(newId, newTrack);
        matchedTrackIds.add(newId);
      }
    }

    // Prune stale tracks
    for (const [trackId, track] of this.activeTracks.entries()) {
      if (!matchedTrackIds.has(trackId)) {
        if (now - track.lastSeen > FocusConfig.maxTrackAgeMs) {
          this.activeTracks.delete(trackId);
        }
      }
    }

    return Array.from(this.activeTracks.values());
  }

  getPhoneTracks(): TrackedObject[] {
    return Array.from(this.activeTracks.values()).filter(t => t.label === 'cell phone');
  }

  reset(): void {
    this.activeTracks.clear();
  }

  private calculateIoU(a: BoundingBox, b: BoundingBox): number {
    const xA = Math.max(a.x, b.x);
    const yA = Math.max(a.y, b.y);
    const xB = Math.min(a.x + a.width, b.x + b.width);
    const yB = Math.min(a.y + a.height, b.y + b.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    if (interArea <= 0) return 0;

    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const unionArea = areaA + areaB - interArea;

    return unionArea > 0 ? Number((interArea / unionArea).toFixed(3)) : 0;
  }
}

export const objectTracker = new ObjectTracker();
