/**
 * Lightweight, privacy-preserving face-region heuristic.
 *
 * This is not a neural face-recognition model: it groups skin-colour pixels
 * into face-sized connected regions. It is deliberately used only for
 * presence/second-person cues; no identity is inferred or stored.
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
  sampleSize: number = 2
): SkinFaceRegion[] {
  if (
    gridWidth <= 0 ||
    gridHeight <= 0 ||
    skinMask.length < gridWidth * gridHeight
  ) {
    return [];
  }

  const visited = new Uint8Array(gridWidth * gridHeight);
  const components: GridComponent[] = [];
  const stack: number[] = [];

  // 8-connected components tolerate small gaps from glasses, shadows and
  // low-resolution sampling better than counting one large skin bounding box.
  for (let start = 0; start < skinMask.length; start++) {
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
      area++;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
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

    // Reject tiny hand fragments, long horizontal desk surfaces, and regions
    // deep in the desk area. A face-like region is usually compact and upper-frame.
    if (
      area < 14 ||
      width < 5 ||
      height < 6 ||
      aspectRatio < 0.35 ||
      aspectRatio > 1.65 ||
      centerY > gridHeight * 0.82
    ) {
      continue;
    }

    components.push({
      minX,
      maxX,
      minY,
      maxY,
      sumX,
      sumY,
      area
    });
  }

  components.sort((a, b) => b.area - a.area);
  if (components.length === 0) return [];

  const toRegion = (component: GridComponent): SkinFaceRegion => {
    const width = component.maxX - component.minX + 1;
    const height = component.maxY - component.minY + 1;
    return {
      x: component.minX * sampleSize,
      y: component.minY * sampleSize,
      width: width * sampleSize,
      height: height * sampleSize,
      centerX: (component.sumX / component.area) * sampleSize,
      centerY: (component.sumY / component.area) * sampleSize,
      area: component.area
    };
  };

  const primary = components[0];
  const primaryWidth = primary.maxX - primary.minX + 1;
  const primaryHeight = primary.maxY - primary.minY + 1;
  const primaryCenterX = primary.sumX / primary.area;
  const primaryCenterY = primary.sumY / primary.area;

  // Count a second person only when another sizeable, face-like region is
  // spatially separate and at a comparable height/scale to the main face.
  const secondary = components.slice(1).find(candidate => {
    const width = candidate.maxX - candidate.minX + 1;
    const height = candidate.maxY - candidate.minY + 1;
    const centerX = candidate.sumX / candidate.area;
    const centerY = candidate.sumY / candidate.area;
    const horizontalDistance = Math.abs(centerX - primaryCenterX);
    const verticalDistance = Math.abs(centerY - primaryCenterY);

    return (
      // A conversation partner at the same desk should be a nearby,
      // similarly-sized foreground face. Small distant classroom faces,
      // posters and skin-coloured background fragments are not interaction cues.
      candidate.area >= Math.max(28, primary.area * 0.58) &&
      width >= primaryWidth * 0.68 &&
      height >= primaryHeight * 0.68 &&
      horizontalDistance >= Math.max(8, primaryWidth * 0.65) &&
      horizontalDistance <= primaryWidth * 2.25 &&
      verticalDistance <= primaryHeight * 0.65 &&
      centerY <= gridHeight * 0.78
    );
  });

  return secondary
    ? [toRegion(primary), toRegion(secondary)]
    : [toRegion(primary)];
}
