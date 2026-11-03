/**
 * Small connected-component fallback for local face-presence detection.
 *
 * It identifies one face-like skin-colour region only. It does not count
 * people, infer identity, analyse posture, or determine whether the user is
 * studying. Native browser FaceDetector is preferred when available.
 */
export interface SkinFaceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  area: number;
}

interface GridComponent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sumX: number;
  sumY: number;
  area: number;
}

export function findSkinFaceRegions(
  skinMask: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  sampleSize = 2
): SkinFaceRegion[] {
  if (
    gridWidth <= 0 ||
    gridHeight <= 0 ||
    skinMask.length < gridWidth * gridHeight
  ) {
    return [];
  }

  const visited = new Uint8Array(gridWidth * gridHeight);
  const stack: number[] = [];
  let largest: GridComponent | null = null;

  for (let start = 0; start < skinMask.length; start += 1) {
    if (!skinMask[start] || visited[start]) continue;

    visited[start] = 1;
    stack.push(start);

    let minX = gridWidth;
    let maxX = -1;
    let minY = gridHeight;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    let area = 0;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % gridWidth;
      const y = Math.floor(index / gridWidth);

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      area += 1;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

          const neighbor = ny * gridWidth + nx;
          if (skinMask[neighbor] && !visited[neighbor]) {
            visited[neighbor] = 1;
            stack.push(neighbor);
          }
        }
      }
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const aspectRatio = width / Math.max(1, height);
    const centerY = sumY / Math.max(1, area);

    // Keep one compact, upper-frame region large enough to plausibly be a face.
    if (
      area < 14 ||
      width < 5 ||
      height < 6 ||
      aspectRatio < 0.35 ||
      aspectRatio > 1.65 ||
      centerY > gridHeight * 0.9
    ) {
      continue;
    }

    if (!largest || area > largest.area) {
      largest = { minX, maxX, minY, maxY, sumX, sumY, area };
    }
  }

  if (!largest) return [];

  const width = largest.maxX - largest.minX + 1;
  const height = largest.maxY - largest.minY + 1;
  return [{
    x: largest.minX * sampleSize,
    y: largest.minY * sampleSize,
    width: width * sampleSize,
    height: height * sampleSize,
    centerX: (largest.sumX / largest.area) * sampleSize,
    centerY: (largest.sumY / largest.area) * sampleSize,
    area: largest.area,
  }];
}
