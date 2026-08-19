import { pointInCoursePolygon } from "./webgl-terrain-materials.js";
import {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  createVisualWatercourseWorld as createV13WatercourseWorld,
  replaceVisualWatercourseGeometry,
} from "./webgl-watercourse-visual-v13.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "natural-stream-v14";
export {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  replaceVisualWatercourseGeometry,
};

const TERRAIN_EDGE_DROP_METERS = 0.0015;
const TERRAIN_BED_DEPTH_METERS = 0.035;
const TERRAIN_INNER_BLEND_METERS = 0.75;
const TERRAIN_OUTER_BLEND_METERS = 0.9;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const mix = (from, to, amount) => from + (to - from) * amount;

const smoothstep = (value) => {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
};

const pointSegmentDistance = (point, start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) {
    return Math.hypot(point.x - start.x, point.z - start.z);
  }
  const progress = clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) /
      lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    point.x - (start.x + dx * progress),
    point.z - (start.z + dz * progress),
  );
};

const distanceToBoundary = (points, point) => {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    distance = Math.min(
      distance,
      pointSegmentDistance(
        point,
        points[index],
        points[(index + 1) % points.length],
      ),
    );
  }
  return distance;
};

const reshapeStreamGroup = (points) => {
  if (!Array.isArray(points) || points.length < 8 || points.length % 2 !== 0) {
    return points;
  }
  const stationCount = points.length / 2;
  const left = points.slice(0, stationCount);
  const right = [...points.slice(stationCount)].reverse();
  const nextLeft = [];
  const nextRight = [];

  for (let index = 0; index < stationCount; index += 1) {
    const progress = index / (stationCount - 1);
    const first = left[index];
    const second = right[index];
    const centerX = (first.x + second.x) * 0.5;
    const centerZ = (first.z + second.z) * 0.5;
    const widthX = second.x - first.x;
    const widthZ = second.z - first.z;
    const halfWidth = Math.hypot(widthX, widthZ) * 0.5;
    if (halfWidth <= 1e-6) return points;
    const normalX = widthX / (halfWidth * 2);
    const normalZ = widthZ / (halfWidth * 2);

    const startBlend = smoothstep(progress / 0.14);
    const endBlend = smoothstep((1 - progress) / 0.12);
    const endScale = 0.16 + Math.min(startBlend, endBlend) * 0.84;
    const widthVariation =
      0.88 +
      Math.sin(progress * Math.PI * 4.6 + 0.45) * 0.085 +
      Math.sin(progress * Math.PI * 9.1 - 0.8) * 0.035;
    const scale = clamp(endScale * widthVariation, 0.14, 0.96);
    const nextHalfWidth = halfWidth * scale;
    const margin = Math.max(0, halfWidth - nextHalfWidth);
    const centerShift = margin * clamp(
      Math.sin(progress * Math.PI * 5.2 + 0.7) * 0.28 +
        Math.sin(progress * Math.PI * 2.1 - 0.4) * 0.12,
      -0.42,
      0.42,
    );
    const shiftedCenterX = centerX + normalX * centerShift;
    const shiftedCenterZ = centerZ + normalZ * centerShift;

    nextLeft.push(Object.freeze({
      x: shiftedCenterX - normalX * nextHalfWidth,
      z: shiftedCenterZ - normalZ * nextHalfWidth,
    }));
    nextRight.push(Object.freeze({
      x: shiftedCenterX + normalX * nextHalfWidth,
      z: shiftedCenterZ + normalZ * nextHalfWidth,
    }));
  }

  const reshaped = Object.freeze([
    ...nextLeft,
    ...[...nextRight].reverse(),
  ]);
  return reshaped.every((point) => pointInCoursePolygon(points, point))
    ? reshaped
    : points;
};

export function createVisualWatercourseWorld(world) {
  const visualWorld = createV13WatercourseWorld(world);
  const groups = visualWorld.waterSurfaceGroups ?? [];
  if (groups.length === 0) return visualWorld;
  const reshapedGroups = Object.freeze(groups.map(reshapeStreamGroup));
  const first = reshapedGroups[0] ?? Object.freeze([]);
  return Object.freeze({
    ...visualWorld,
    waterSurfacePoints: first,
    waterSurfaceGroups: reshapedGroups,
    visualWatercourseVersion: WEBGL_VISUAL_WATERCOURSE_VERSION,
  });
}

const insideTerrainHeightAt = (original, waterLevel, distance) => {
  const amount = smoothstep(distance / TERRAIN_INNER_BLEND_METERS);
  const target = waterLevel - mix(
    TERRAIN_EDGE_DROP_METERS,
    TERRAIN_BED_DEPTH_METERS,
    amount,
  );
  return Math.min(original, target);
};

const outsideTerrainHeightAt = (original, waterLevel, distance) => {
  if (distance >= TERRAIN_OUTER_BLEND_METERS) return original;
  const amount = smoothstep(distance / TERRAIN_OUTER_BLEND_METERS);
  const edgeFloor = waterLevel - TERRAIN_EDGE_DROP_METERS;
  const raisedEdge = Math.max(original, edgeFloor);
  return mix(raisedEdge, original, amount);
};

export function createVisualWaterTerrainWorld(world, visualWorld) {
  const groups = visualWorld.waterSurfaceGroups ?? [];
  const levels = visualWorld.waterLevels ?? [];
  return Object.freeze({
    ...world,
    waterSurfacePoints: Object.freeze([]),
    waterSurfaceGroups: Object.freeze([]),
    surfaceElevationAt: (x, z) => {
      const original = world.surfaceElevationAt(x, z);
      const point = { x, z };
      let height = original;
      for (let index = 0; index < groups.length; index += 1) {
        const points = groups[index];
        const waterLevel = levels[index] ?? visualWorld.waterLevel;
        const distance = distanceToBoundary(points, point);
        const inside = pointInCoursePolygon(points, point);
        const candidate = inside
          ? insideTerrainHeightAt(original, waterLevel, distance)
          : outsideTerrainHeightAt(original, waterLevel, distance);
        height = inside
          ? Math.min(height, candidate)
          : Math.max(height, candidate);
      }
      return height;
    },
  });
}
