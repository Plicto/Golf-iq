import { pointInCoursePolygon } from "./webgl-terrain-materials.js";
import {
  createVisualWatercourseWorld as createBaseWatercourseWorld,
  replaceVisualWatercourseGeometry as replaceBaseWatercourseGeometry,
} from "./webgl-watercourse-visual-v13.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "contained-stream-v22";
export const WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS = 0.003;

const WATER_BANK_CLEARANCE_METERS = 0.05;
const WATER_BED_CLEARANCE_METERS = 0.055;
const WATER_BANK_BLEND_METERS = 0.9;
const WATER_BANK_RISE_METERS = 0.018;
const POLYGON_BOUNDARY_EPSILON_METERS = 1e-6;
const HEIGHT_SMOOTHING_WEIGHTS = Object.freeze([1, 2, 3, 4, 5, 4, 3, 2, 1]);

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const mix = (from, to, amount) => from + (to - from) * amount;

const smoothstep = (value) => {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
};

const pairedStations = (points) => {
  if (!Array.isArray(points) || points.length < 8 || points.length % 2 !== 0) {
    throw new RangeError("visual stream requires paired banks");
  }
  const stationCount = points.length / 2;
  return Object.freeze({
    left: points.slice(0, stationCount),
    right: [...points.slice(stationCount)].reverse(),
  });
};

const smoothStationHeights = (raw) => raw.map((height, index) => {
  const radius = Math.floor(HEIGHT_SMOOTHING_WEIGHTS.length / 2);
  let total = 0;
  let weightTotal = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const sampleIndex = clamp(index + offset, 0, raw.length - 1);
    const weight = HEIGHT_SMOOTHING_WEIGHTS[offset + radius];
    total += raw[sampleIndex] * weight;
    weightTotal += weight;
  }
  return Math.min(total / weightTotal, height);
});

const pointSegmentDistanceSquared = (point, start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) {
    return (point.x - start.x) ** 2 + (point.z - start.z) ** 2;
  }
  const progress = clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) /
      lengthSquared,
    0,
    1,
  );
  const x = start.x + dx * progress;
  const z = start.z + dz * progress;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
};

const distanceToPolygonBoundary = (polygon, point) => {
  let distanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    distanceSquared = Math.min(
      distanceSquared,
      pointSegmentDistanceSquared(
        point,
        polygon[index],
        polygon[(index + 1) % polygon.length],
      ),
    );
  }
  return Math.sqrt(distanceSquared);
};

const pointOnPolygonBoundary = (polygon, point) =>
  distanceToPolygonBoundary(polygon, point) <=
    POLYGON_BOUNDARY_EPSILON_METERS;

const pointContainedByPolygon = (polygon, point) =>
  pointInCoursePolygon(polygon, point) || pointOnPolygonBoundary(polygon, point);

const containedDistance = (
  polygon,
  centerX,
  centerZ,
  normalX,
  normalZ,
  direction,
  requestedDistance,
) => {
  let distance = Math.max(0.003, requestedDistance);
  for (let attempt = 0; attempt < 28; attempt += 1) {
    const point = {
      x: centerX + normalX * direction * distance,
      z: centerZ + normalZ * direction * distance,
    };
    if (pointContainedByPolygon(polygon, point)) return distance;
    distance *= 0.82;
  }
  const center = { x: centerX, z: centerZ };
  if (!pointContainedByPolygon(polygon, center)) {
    throw new RangeError("visual stream station center escapes gameplay water");
  }
  return 0.003;
};

const reshapeStreamGroup = (world, polygon) => {
  const { left, right } = pairedStations(polygon);
  const nextLeft = [];
  const nextRight = [];

  for (let index = 0; index < left.length; index += 1) {
    const progress = index / (left.length - 1);
    const first = left[index];
    const second = right[index];
    const centerX = (first.x + second.x) * 0.5;
    const centerZ = (first.z + second.z) * 0.5;
    const widthX = second.x - first.x;
    const widthZ = second.z - first.z;
    const width = Math.hypot(widthX, widthZ);
    if (width <= 1e-8) {
      throw new RangeError("visual stream station width is degenerate");
    }
    const normalX = widthX / width;
    const normalZ = widthZ / width;
    const halfWidth = width * 0.5;

    const startBlend = smoothstep(progress / 0.055);
    const endBlend = smoothstep((1 - progress) / 0.065);
    const terminalScale = 0.28 + Math.min(startBlend, endBlend) * 0.72;
    const widthVariation = clamp(
      0.71 +
        Math.sin(progress * Math.PI * 2.55 + 0.52) * 0.075 +
        Math.sin(progress * Math.PI * 7.15 - 0.63) * 0.036,
      0.59,
      0.84,
    );
    const baseHalfWidth = halfWidth * clamp(
      terminalScale * widthVariation,
      0.16,
      0.86,
    );
    const asymmetry = clamp(
      Math.sin(progress * Math.PI * 3.25 + 0.83) * 0.095 +
        Math.sin(progress * Math.PI * 1.35 - 0.31) * 0.035,
      -0.13,
      0.13,
    );
    const leftRequested = Math.min(
      halfWidth * 0.92,
      baseHalfWidth * (1 + asymmetry),
    );
    const rightRequested = Math.min(
      halfWidth * 0.92,
      baseHalfWidth * (1 - asymmetry),
    );
    const leftDistance = containedDistance(
      polygon,
      centerX,
      centerZ,
      normalX,
      normalZ,
      -1,
      leftRequested,
    );
    const rightDistance = containedDistance(
      polygon,
      centerX,
      centerZ,
      normalX,
      normalZ,
      1,
      rightRequested,
    );

    nextLeft.push({
      x: centerX - normalX * leftDistance,
      z: centerZ - normalZ * leftDistance,
    });
    nextRight.push({
      x: centerX + normalX * rightDistance,
      z: centerZ + normalZ * rightDistance,
    });
  }

  const rawHeights = nextLeft.map((leftPoint, index) => {
    const rightPoint = nextRight[index];
    const centerX = (leftPoint.x + rightPoint.x) * 0.5;
    const centerZ = (leftPoint.z + rightPoint.z) * 0.5;
    return Math.min(
      world.surfaceElevationAt(leftPoint.x, leftPoint.z),
      world.surfaceElevationAt(centerX, centerZ),
      world.surfaceElevationAt(rightPoint.x, rightPoint.z),
    ) - WATER_BANK_CLEARANCE_METERS;
  });
  const heights = smoothStationHeights(rawHeights);
  const shapedLeft = nextLeft.map((point, index) => Object.freeze({
    ...point,
    y: heights[index],
  }));
  const shapedRight = nextRight.map((point, index) => Object.freeze({
    ...point,
    y: heights[index],
  }));
  const reshaped = Object.freeze([
    ...shapedLeft,
    ...[...shapedRight].reverse(),
  ]);

  if (reshaped.some((point) => !pointContainedByPolygon(polygon, point))) {
    throw new RangeError("visual stream containment fit failed");
  }
  return reshaped;
};

const waterBatchFor = (geometry) => geometry.surfaceBatches.find(
  ({ material }) => material === "water",
);

const firstWaterVertexFor = (geometry, waterBatch) => {
  let firstWaterVertex = Number.POSITIVE_INFINITY;
  for (
    let index = waterBatch.firstIndex;
    index < waterBatch.firstIndex + waterBatch.indexCount;
    index += 1
  ) {
    firstWaterVertex = Math.min(firstWaterVertex, geometry.indices[index]);
  }
  if (!Number.isInteger(firstWaterVertex)) {
    throw new RangeError("visual stream batch has no vertices");
  }
  return firstWaterVertex;
};

const normalizedWaterNormal = (prior, next, left, right) => {
  const tangentX = next.x - prior.x;
  const tangentY = next.y - prior.y;
  const tangentZ = next.z - prior.z;
  const lateralX = right.x - left.x;
  const lateralZ = right.z - left.z;
  let normalX = tangentY * lateralZ;
  let normalY = tangentZ * lateralX - tangentX * lateralZ;
  let normalZ = -tangentY * lateralX;
  if (normalY < 0) {
    normalX = -normalX;
    normalY = -normalY;
    normalZ = -normalZ;
  }
  const length = Math.hypot(normalX, normalY, normalZ);
  if (length <= 1e-8) {
    return Object.freeze({ x: 0, y: 1, z: 0 });
  }
  return Object.freeze({
    x: normalX / length,
    y: normalY / length,
    z: normalZ / length,
  });
};

const centerlineFor = (points) => {
  const { left, right } = pairedStations(points);
  return Object.freeze(left.map((leftPoint, index) => Object.freeze({
    x: (leftPoint.x + right[index].x) * 0.5,
    y: (leftPoint.y + right[index].y) * 0.5,
    z: (leftPoint.z + right[index].z) * 0.5,
  })));
};

const waterHeightAtPoint = (centerline, point) => {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestHeight = centerline[0].y;
  for (let index = 0; index < centerline.length - 1; index += 1) {
    const start = centerline[index];
    const end = centerline[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const progress = lengthSquared <= 1e-12
      ? 0
      : clamp(
        ((point.x - start.x) * dx + (point.z - start.z) * dz) /
          lengthSquared,
        0,
        1,
      );
    const sampleX = start.x + dx * progress;
    const sampleZ = start.z + dz * progress;
    const distanceSquared =
      (point.x - sampleX) ** 2 + (point.z - sampleZ) ** 2;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestHeight = start.y + (end.y - start.y) * progress;
    }
  }
  return bestHeight;
};

export function createVisualWatercourseWorld(world) {
  const baseWorld = createBaseWatercourseWorld(world);
  if (baseWorld === world) return world;
  const groups = baseWorld.waterSurfaceGroups ?? [];
  if (groups.length === 0) return baseWorld;
  const reshapedGroups = Object.freeze(
    groups.map((points) => reshapeStreamGroup(world, points)),
  );
  const first = reshapedGroups[0] ?? Object.freeze([]);
  return Object.freeze({
    ...baseWorld,
    waterSurfacePoints: first,
    waterSurfaceGroups: reshapedGroups,
    visualWatercourseVersion: WEBGL_VISUAL_WATERCOURSE_VERSION,
  });
}

export function replaceVisualWatercourseGeometry(geometry, world) {
  if (world?.visualWatercourseVersion !== WEBGL_VISUAL_WATERCOURSE_VERSION) {
    return geometry;
  }
  const replaced = replaceBaseWatercourseGeometry(geometry, world);
  const waterBatch = waterBatchFor(replaced);
  if (!waterBatch) return replaced;

  const firstWaterVertex = firstWaterVertexFor(replaced, waterBatch);
  const positions = new Float32Array(replaced.positions);
  const normals = new Float32Array(replaced.normals);
  let vertex = firstWaterVertex;

  for (const points of world.waterSurfaceGroups ?? []) {
    const { left, right } = pairedStations(points);
    const centers = left.map((leftPoint, index) => Object.freeze({
      x: (leftPoint.x + right[index].x) * 0.5,
      y: (leftPoint.y + right[index].y) * 0.5,
      z: (leftPoint.z + right[index].z) * 0.5,
    }));
    for (let index = 0; index < left.length; index += 1) {
      const height =
        (left[index].y + right[index].y) * 0.5 +
        WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS;
      const prior = centers[Math.max(0, index - 1)];
      const next = centers[Math.min(centers.length - 1, index + 1)];
      const normal = normalizedWaterNormal(
        prior,
        next,
        left[index],
        right[index],
      );
      for (let side = 0; side < 2; side += 1) {
        positions[vertex * 3 + 1] = height;
        normals[vertex * 3] = normal.x;
        normals[vertex * 3 + 1] = normal.y;
        normals[vertex * 3 + 2] = normal.z;
        vertex += 1;
      }
    }
  }

  if (vertex !== positions.length / 3) {
    throw new RangeError("visual stream vertex range is invalid");
  }
  return Object.freeze({
    ...replaced,
    positions,
    normals,
  });
}

export function createVisualWaterTerrainWorld(world, visualWorld) {
  if (
    visualWorld?.visualWatercourseVersion !==
      WEBGL_VISUAL_WATERCOURSE_VERSION
  ) {
    return world;
  }
  const groups = visualWorld.waterSurfaceGroups ?? [];
  const centerlines = groups.map(centerlineFor);
  return Object.freeze({
    ...world,
    waterSurfacePoints: Object.freeze([]),
    waterSurfaceGroups: Object.freeze([]),
    surfaceElevationAt: (x, z) => {
      const original = world.surfaceElevationAt(x, z);
      const point = { x, z };
      let height = original;
      for (let index = 0; index < groups.length; index += 1) {
        const waterHeight = waterHeightAtPoint(centerlines[index], point) +
          WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS;
        if (pointInCoursePolygon(groups[index], point)) {
          height = Math.min(
            height,
            waterHeight - WATER_BED_CLEARANCE_METERS,
          );
          continue;
        }
        const bankDistance = distanceToPolygonBoundary(groups[index], point);
        if (bankDistance >= WATER_BANK_BLEND_METERS) continue;
        const bankBlend = 1 - smoothstep(
          bankDistance / WATER_BANK_BLEND_METERS,
        );
        const bankHeight = waterHeight + WATER_BANK_RISE_METERS;
        height = Math.min(
          height,
          mix(original, bankHeight, bankBlend),
        );
      }
      return height;
    },
  });
}
