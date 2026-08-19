import { pointInCoursePolygon } from "./webgl-terrain-materials.js";
import {
  createVisualWatercourseWorld as createV13WatercourseWorld,
  replaceVisualWatercourseGeometry as replaceV13WatercourseGeometry,
} from "./webgl-watercourse-visual-v13.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "terrain-following-stream-v15";
export const WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS = 0.003;

const WATER_BANK_CLEARANCE_METERS = 0.018;
const WATER_BED_CLEARANCE_METERS = 0.025;
const HEIGHT_SMOOTHING_WEIGHTS = Object.freeze([1, 2, 3, 4, 5, 4, 3, 2, 1]);

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

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

const rawStationHeights = (world, left, right) => left.map((leftPoint, index) => {
  const rightPoint = right[index];
  const centerX = (leftPoint.x + rightPoint.x) * 0.5;
  const centerZ = (leftPoint.z + rightPoint.z) * 0.5;
  return Math.min(
    world.surfaceElevationAt(leftPoint.x, leftPoint.z),
    world.surfaceElevationAt(centerX, centerZ),
    world.surfaceElevationAt(rightPoint.x, rightPoint.z),
  ) - WATER_BANK_CLEARANCE_METERS;
});

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
  const smoothed = total / weightTotal;
  return Math.min(smoothed, height + 0.012);
});

const terrainFollowingGroup = (world, points) => {
  const { left, right } = pairedStations(points);
  const heights = smoothStationHeights(rawStationHeights(world, left, right));
  const nextLeft = left.map((point, index) => Object.freeze({
    x: point.x,
    y: heights[index],
    z: point.z,
  }));
  const nextRight = right.map((point, index) => Object.freeze({
    x: point.x,
    y: heights[index],
    z: point.z,
  }));
  return Object.freeze([...nextLeft, ...[...nextRight].reverse()]);
};

export function createVisualWatercourseWorld(world) {
  const visualWorld = createV13WatercourseWorld(world);
  const groups = visualWorld.waterSurfaceGroups ?? [];
  if (groups.length === 0) return visualWorld;
  const terrainFollowingGroups = Object.freeze(
    groups.map((points) => terrainFollowingGroup(world, points)),
  );
  return Object.freeze({
    ...visualWorld,
    waterSurfacePoints: terrainFollowingGroups[0] ?? Object.freeze([]),
    waterSurfaceGroups: terrainFollowingGroups,
    visualWatercourseVersion: WEBGL_VISUAL_WATERCOURSE_VERSION,
  });
}

const waterBatchFor = (geometry) => geometry.surfaceBatches.find(
  ({ material }) => material === "water",
);

export function replaceVisualWatercourseGeometry(geometry, world) {
  const replaced = replaceV13WatercourseGeometry(geometry, world);
  const waterBatch = waterBatchFor(replaced);
  if (!waterBatch) return replaced;

  let firstWaterVertex = Number.POSITIVE_INFINITY;
  for (
    let index = waterBatch.firstIndex;
    index < waterBatch.firstIndex + waterBatch.indexCount;
    index += 1
  ) {
    firstWaterVertex = Math.min(firstWaterVertex, replaced.indices[index]);
  }
  if (!Number.isInteger(firstWaterVertex)) {
    throw new RangeError("terrain-following stream batch has no vertices");
  }

  const positions = new Float32Array(replaced.positions);
  let vertex = firstWaterVertex;
  for (const points of world.waterSurfaceGroups ?? []) {
    const { left, right } = pairedStations(points);
    for (let index = 0; index < left.length; index += 1) {
      const height = (
        (left[index].y + right[index].y) * 0.5 +
        WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS
      );
      positions[vertex * 3 + 1] = height;
      vertex += 1;
      positions[vertex * 3 + 1] = height;
      vertex += 1;
    }
  }

  if (vertex !== positions.length / 3) {
    throw new RangeError("terrain-following stream vertex range is invalid");
  }
  return Object.freeze({
    ...replaced,
    positions,
  });
}

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

export function createVisualWaterTerrainWorld(world, visualWorld) {
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
        if (!pointInCoursePolygon(groups[index], point)) continue;
        const waterHeight = waterHeightAtPoint(centerlines[index], point);
        height = Math.min(
          height,
          waterHeight - WATER_BED_CLEARANCE_METERS,
        );
      }
      return height;
    },
  });
}
