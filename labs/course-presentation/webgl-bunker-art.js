export const WEBGL_BUNKER_ART_VERSION = "bunker-surface-v1";
export const WEBGL_BUNKER_GUARD_CELLS = 1;
export const WEBGL_BUNKER_MAX_ANGLE_STEP_RADIANS = 7 * Math.PI / 180;

const TAU = Math.PI * 2;
const EPSILON = 1e-8;
const BUNKER_STYLES = Object.freeze(["soft-pot", "revetted-pot"]);

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const mix = (from, to, amount) => from + (to - from) * amount;

const cross2 = (leftX, leftZ, rightX, rightZ) =>
  leftX * rightZ - leftZ * rightX;

const finitePoint = (point, label) => {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    throw new TypeError(`${label} must contain finite x-z coordinates`);
  }
  return point;
};

const pointOnSegment = (point, start, end) => {
  const edgeX = end.x - start.x;
  const edgeZ = end.z - start.z;
  const pointX = point.x - start.x;
  const pointZ = point.z - start.z;
  if (Math.abs(cross2(edgeX, edgeZ, pointX, pointZ)) > 1e-7) return false;
  const projection = pointX * edgeX + pointZ * edgeZ;
  return projection >= -1e-7 &&
    projection <= edgeX * edgeX + edgeZ * edgeZ + 1e-7;
};

const pointInOrOnPolygon = (points, point) => {
  let inside = false;
  for (let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index, index += 1) {
    const start = points[previous];
    const end = points[index];
    if (pointOnSegment(point, start, end)) return true;
    if (
      end.z > point.z !== start.z > point.z &&
      point.x <
        ((start.x - end.x) * (point.z - end.z)) / (start.z - end.z) +
          end.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const segmentsIntersect = (firstStart, firstEnd, secondStart, secondEnd) => {
  const firstSide = (point) => cross2(
    firstEnd.x - firstStart.x,
    firstEnd.z - firstStart.z,
    point.x - firstStart.x,
    point.z - firstStart.z,
  );
  const secondSide = (point) => cross2(
    secondEnd.x - secondStart.x,
    secondEnd.z - secondStart.z,
    point.x - secondStart.x,
    point.z - secondStart.z,
  );
  const firstA = firstSide(secondStart);
  const firstB = firstSide(secondEnd);
  const secondA = secondSide(firstStart);
  const secondB = secondSide(firstEnd);
  if (
    firstA * firstB < -1e-12 &&
    secondA * secondB < -1e-12
  ) {
    return true;
  }
  return (
    (Math.abs(firstA) <= 1e-7 &&
      pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (Math.abs(firstB) <= 1e-7 &&
      pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (Math.abs(secondA) <= 1e-7 &&
      pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (Math.abs(secondB) <= 1e-7 &&
      pointOnSegment(firstEnd, secondStart, secondEnd))
  );
};

const polygonsOverlap = (first, second) =>
  first.some((point) => pointInOrOnPolygon(second, point)) ||
  second.some((point) => pointInOrOnPolygon(first, point)) ||
  first.some((start, firstIndex) =>
    second.some((secondStart, secondIndex) =>
      segmentsIntersect(
        start,
        first[(firstIndex + 1) % first.length],
        secondStart,
        second[(secondIndex + 1) % second.length],
      )
    )
  );

const finiteNormal = (normal, label) => {
  if (
    !normal ||
    !Number.isFinite(normal.x) ||
    !Number.isFinite(normal.y) ||
    !Number.isFinite(normal.z)
  ) {
    throw new TypeError(`${label} must contain a finite normal`);
  }
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (Math.abs(length - 1) > 1e-4) {
    throw new RangeError(`${label} must be normalized`);
  }
  return normal;
};

const normalizeAngle = (angle) => {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
};

const raySegmentDistance = (center, direction, start, end) => {
  const edgeX = end.x - start.x;
  const edgeZ = end.z - start.z;
  const offsetX = start.x - center.x;
  const offsetZ = start.z - center.z;
  const denominator = cross2(direction.x, direction.z, edgeX, edgeZ);
  if (Math.abs(denominator) <= EPSILON) return null;
  const distance = cross2(offsetX, offsetZ, edgeX, edgeZ) / denominator;
  const edgeProgress = cross2(
    offsetX,
    offsetZ,
    direction.x,
    direction.z,
  ) / denominator;
  if (
    distance <= EPSILON ||
    edgeProgress < -EPSILON ||
    edgeProgress > 1 + EPSILON
  ) {
    return null;
  }
  return distance;
};

const rayPolygonDistance = (center, direction, points) => {
  const distances = [];
  for (let index = 0; index < points.length; index += 1) {
    const candidate = raySegmentDistance(
      center,
      direction,
      points[index],
      points[(index + 1) % points.length],
    );
    if (
      candidate !== null &&
      distances.every((distance) => Math.abs(distance - candidate) > 1e-6)
    ) {
      distances.push(candidate);
    }
  }
  if (distances.length !== 1) {
    throw new RangeError("Bunker footprint must be star-shaped around its center");
  }
  return distances[0];
};

const rayRectangleDistance = (center, direction, rectangle) => {
  const candidates = [];
  if (Math.abs(direction.x) > EPSILON) {
    for (const x of [rectangle.minimumX, rectangle.maximumX]) {
      const distance = (x - center.x) / direction.x;
      const z = center.z + direction.z * distance;
      if (
        distance > EPSILON &&
        z >= rectangle.minimumZ - EPSILON &&
        z <= rectangle.maximumZ + EPSILON
      ) {
        candidates.push(distance);
      }
    }
  }
  if (Math.abs(direction.z) > EPSILON) {
    for (const z of [rectangle.minimumZ, rectangle.maximumZ]) {
      const distance = (z - center.z) / direction.z;
      const x = center.x + direction.x * distance;
      if (
        distance > EPSILON &&
        x >= rectangle.minimumX - EPSILON &&
        x <= rectangle.maximumX + EPSILON
      ) {
        candidates.push(distance);
      }
    }
  }
  const distance = Math.min(...candidates);
  if (!Number.isFinite(distance)) {
    throw new RangeError("Bunker guard rectangle does not contain its center");
  }
  return distance;
};

const uniqueClockwiseAngles = (center, points, perimeterPoints) => {
  const angles = [
    ...points.map((point) => Math.atan2(point.z - center.z, point.x - center.x)),
    ...perimeterPoints.map((point) =>
      Math.atan2(point.z - center.z, point.x - center.x)
    ),
  ].map(normalizeAngle).sort((left, right) => right - left);
  const unique = [];
  for (const angle of angles) {
    if (unique.every((candidate) => Math.abs(candidate - angle) > 1e-7)) {
      unique.push(angle);
    }
  }
  if (
    unique.length > 1 &&
    Math.abs(unique[0] - unique.at(-1) - TAU) <= 1e-7
  ) {
    unique.pop();
  }
  const subdivided = [];
  for (let index = 0; index < unique.length; index += 1) {
    const current = unique[index];
    const next = index + 1 < unique.length
      ? unique[index + 1]
      : unique[0] - TAU;
    const span = current - next;
    const segments = Math.max(
      1,
      Math.ceil(span / WEBGL_BUNKER_MAX_ANGLE_STEP_RADIANS),
    );
    for (let segment = 0; segment < segments; segment += 1) {
      subdivided.push(normalizeAngle(current - span * segment / segments));
    }
  }
  return Object.freeze(subdivided);
};

const pushVertex = (vertices, point, heightAt, normalAt) => {
  const y = heightAt(point.x, point.z);
  const normal = finiteNormal(normalAt(point), "Bunker relief vertex");
  if (!Number.isFinite(y)) {
    throw new RangeError("Bunker relief height must be finite");
  }
  vertices.push(Object.freeze({
    x: point.x,
    y,
    z: point.z,
    normal,
  }));
  return vertices.length - 1;
};

const pushRingTriangles = (indices, innerStart, outerStart, count) => {
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(
      innerStart + index,
      outerStart + index,
      innerStart + next,
      innerStart + next,
      outerStart + index,
      outerStart + next,
    );
  }
};

const buildPatch = ({
  bunker,
  bunkerIndex,
  points,
  perimeterPoints,
  rectangle,
  cellBounds,
  coarseHeightAt,
  coarseNormalAt,
  normalAt,
  surfaceHeightAt,
}) => {
  const center = finitePoint({ x: bunker.x, z: bunker.z }, "Bunker center");
  const angles = uniqueClockwiseAngles(center, points, perimeterPoints);
  if (angles.length < 3) {
    throw new RangeError("Bunker relief requires at least three angular samples");
  }
  const samples = angles.map((angle) => {
    const direction = Object.freeze({ x: Math.cos(angle), z: Math.sin(angle) });
    const footprintDistance = rayPolygonDistance(center, direction, points);
    const rectangleDistance = rayRectangleDistance(center, direction, rectangle);
    if (rectangleDistance <= footprintDistance + 1e-5) {
      throw new RangeError("Bunker guard must extend beyond the exact footprint");
    }
    return Object.freeze({ direction, footprintDistance, rectangleDistance });
  });

  const sandVertices = [];
  const sandIndices = [];
  const centerIndex = pushVertex(
    sandVertices,
    center,
    surfaceHeightAt,
    normalAt,
  );
  const sandFractions = Object.freeze([
    bunker.floorRadius * 0.5,
    bunker.floorRadius,
    mix(bunker.floorRadius, 0.8, 0.25),
    mix(bunker.floorRadius, 0.8, 0.5),
    mix(bunker.floorRadius, 0.8, 0.75),
    0.8,
    0.9,
    1,
  ]);
  const sandRingStarts = sandFractions.map((fraction) => {
    const start = sandVertices.length;
    for (const sample of samples) {
      pushVertex(sandVertices, {
        x: center.x + sample.direction.x * sample.footprintDistance * fraction,
        z: center.z + sample.direction.z * sample.footprintDistance * fraction,
      }, surfaceHeightAt, normalAt);
    }
    return start;
  });
  for (let index = 0; index < samples.length; index += 1) {
    sandIndices.push(
      centerIndex,
      sandRingStarts[0] + index,
      sandRingStarts[0] + ((index + 1) % samples.length),
    );
  }
  for (let ring = 0; ring < sandRingStarts.length - 1; ring += 1) {
    pushRingTriangles(
      sandIndices,
      sandRingStarts[ring],
      sandRingStarts[ring + 1],
      samples.length,
    );
  }

  const collarVertices = [];
  const collarIndices = [];
  const collarRingStarts = [0, 1].map((progress) => {
    const start = collarVertices.length;
    for (const sample of samples) {
      const distance = mix(
        sample.footprintDistance,
        sample.rectangleDistance,
        progress,
      );
      const point = {
        x: center.x + sample.direction.x * distance,
        z: center.z + sample.direction.z * distance,
      };
      pushVertex(
        collarVertices,
        point,
        progress === 1 ? coarseHeightAt : surfaceHeightAt,
        progress === 1 ? coarseNormalAt : normalAt,
      );
    }
    return start;
  });
  for (let ring = 0; ring < collarRingStarts.length - 1; ring += 1) {
    pushRingTriangles(
      collarIndices,
      collarRingStarts[ring],
      collarRingStarts[ring + 1],
      samples.length,
    );
  }

  return Object.freeze({
    bunkerIndex,
    style: bunker.style,
    angleCount: samples.length,
    cellBounds: Object.freeze({ ...cellBounds }),
    rectangle: Object.freeze({ ...rectangle }),
    collarVertices: Object.freeze(collarVertices),
    collarIndices: Object.freeze(collarIndices),
    sandVertices: Object.freeze(sandVertices),
    sandIndices: Object.freeze(sandIndices),
  });
};

export function createWebglBunkerPatches(world, {
  columns,
  rows,
  coarseHeightAt,
  excludedSurfaceGroups = [],
  normalAt,
  coarseNormalAt = normalAt,
  surfaceHeightAt = world?.surfaceElevationAt,
} = {}) {
  const bunkers = world?.bunkers ?? [];
  const bunkerPoints = world?.bunkerPoints ?? [];
  if (
    !world?.bounds ||
    !Array.isArray(bunkers) ||
    !Array.isArray(bunkerPoints) ||
    !Array.isArray(excludedSurfaceGroups) ||
    bunkers.length !== bunkerPoints.length ||
    typeof surfaceHeightAt !== "function" ||
    !Number.isInteger(columns) ||
    columns <= 0 ||
    !Number.isInteger(rows) ||
    rows <= 0 ||
    typeof coarseHeightAt !== "function" ||
    typeof coarseNormalAt !== "function" ||
    typeof normalAt !== "function"
  ) {
    throw new TypeError("WebGL bunker art requires a complete world and grid");
  }
  const spanX = world.bounds.maximumX - world.bounds.minimumX;
  const spanZ = world.bounds.maximumZ - world.bounds.minimumZ;
  if (!(spanX > 0) || !(spanZ > 0)) {
    throw new RangeError("WebGL bunker art requires positive world bounds");
  }
  const stepX = spanX / columns;
  const stepZ = spanZ / rows;
  const occupiedCells = new Set();
  excludedSurfaceGroups.forEach((points, groupIndex) => {
    if (!Array.isArray(points) || points.length < 3) {
      throw new RangeError(
        `WebGL bunker exclusion group ${groupIndex} is invalid`,
      );
    }
    points.forEach((point, pointIndex) =>
      finitePoint(point, `Bunker exclusion point ${groupIndex}:${pointIndex}`)
    );
  });
  const patches = bunkers.map((bunker, bunkerIndex) => {
    if (
      !BUNKER_STYLES.includes(bunker?.style) ||
      !Number.isFinite(bunker.floorRadius) ||
      bunker.floorRadius <= 0 ||
      bunker.floorRadius >= 0.8
    ) {
      throw new RangeError("WebGL bunker art received an unsupported bunker");
    }
    const points = bunkerPoints[bunkerIndex];
    if (!Array.isArray(points) || points.length < 3) {
      throw new RangeError("WebGL bunker footprint requires at least three points");
    }
    points.forEach((point, index) =>
      finitePoint(point, `Bunker footprint point ${index}`)
    );
    if (excludedSurfaceGroups.some((group) => polygonsOverlap(points, group))) {
      throw new RangeError("WebGL bunker footprints must not overlap water");
    }
    const minimumX = Math.min(...points.map(({ x }) => x));
    const maximumX = Math.max(...points.map(({ x }) => x));
    const minimumZ = Math.min(...points.map(({ z }) => z));
    const maximumZ = Math.max(...points.map(({ z }) => z));
    const firstColumn = clamp(
      Math.floor((minimumX - world.bounds.minimumX) / stepX) -
        WEBGL_BUNKER_GUARD_CELLS,
      0,
      columns - 1,
    );
    const lastColumn = clamp(
      Math.floor((maximumX - world.bounds.minimumX) / stepX) +
        WEBGL_BUNKER_GUARD_CELLS,
      0,
      columns - 1,
    );
    const firstRow = clamp(
      Math.floor((minimumZ - world.bounds.minimumZ) / stepZ) -
        WEBGL_BUNKER_GUARD_CELLS,
      0,
      rows - 1,
    );
    const lastRow = clamp(
      Math.floor((maximumZ - world.bounds.minimumZ) / stepZ) +
        WEBGL_BUNKER_GUARD_CELLS,
      0,
      rows - 1,
    );
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const key = `${row}:${column}`;
        if (occupiedCells.has(key)) {
          throw new RangeError("WebGL bunker guard rectangles must not overlap");
        }
        occupiedCells.add(key);
      }
    }
    const cellBounds = { firstColumn, lastColumn, firstRow, lastRow };
    const rectangle = {
      minimumX: world.bounds.minimumX + firstColumn * stepX,
      maximumX: world.bounds.minimumX + (lastColumn + 1) * stepX,
      minimumZ: world.bounds.minimumZ + firstRow * stepZ,
      maximumZ: world.bounds.minimumZ + (lastRow + 1) * stepZ,
    };
    const perimeterPoints = [];
    for (let column = firstColumn; column <= lastColumn + 1; column += 1) {
      const x = world.bounds.minimumX + column * stepX;
      perimeterPoints.push({ x, z: rectangle.minimumZ });
      perimeterPoints.push({ x, z: rectangle.maximumZ });
    }
    for (let row = firstRow + 1; row <= lastRow; row += 1) {
      const z = world.bounds.minimumZ + row * stepZ;
      perimeterPoints.push({ x: rectangle.minimumX, z });
      perimeterPoints.push({ x: rectangle.maximumX, z });
    }
    return buildPatch({
      bunker,
      bunkerIndex,
      points,
      perimeterPoints,
      rectangle,
      cellBounds,
      coarseHeightAt,
      coarseNormalAt,
      normalAt,
      surfaceHeightAt,
    });
  });

  return Object.freeze({
    version: WEBGL_BUNKER_ART_VERSION,
    patches: Object.freeze(patches),
    occupiedCells: Object.freeze([...occupiedCells].sort()),
  });
}
