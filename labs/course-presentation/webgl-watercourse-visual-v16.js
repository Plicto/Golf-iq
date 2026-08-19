import { pointInCoursePolygon } from "./webgl-terrain-materials.js";
import {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  createVisualWatercourseWorld as createV15WatercourseWorld,
  replaceVisualWatercourseGeometry,
} from "./webgl-watercourse-visual-v15.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "integrated-stream-v16";
export {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  replaceVisualWatercourseGeometry,
};

const WATER_EDGE_RAISE_METERS = 0.01;
const WATER_BED_CLEARANCE_METERS = 0.006;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

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

const reshapeStreamGroup = (points) => {
  const { left, right } = pairedStations(points);
  const nextLeft = [];
  const nextRight = [];

  for (let index = 0; index < left.length; index += 1) {
    const progress = index / (left.length - 1);
    const first = left[index];
    const second = right[index];
    const centerX = (first.x + second.x) * 0.5;
    const centerZ = (first.z + second.z) * 0.5;
    const centerY = (first.y + second.y) * 0.5 + WATER_EDGE_RAISE_METERS;
    const widthX = second.x - first.x;
    const widthZ = second.z - first.z;
    const width = Math.hypot(widthX, widthZ);
    if (width <= 1e-8) {
      throw new RangeError("visual stream station width is degenerate");
    }
    const normalX = widthX / width;
    const normalZ = widthZ / width;
    const halfWidth = width * 0.5;

    const startBlend = smoothstep(progress / 0.14);
    const endBlend = smoothstep((1 - progress) / 0.12);
    const endScale = 0.1 + Math.min(startBlend, endBlend) * 0.9;
    const widthVariation = clamp(
      0.94 +
        Math.sin(progress * Math.PI * 4.4 + 0.5) * 0.043 +
        Math.sin(progress * Math.PI * 10.6 - 0.7) * 0.017,
      0.87,
      0.995,
    );
    const nextHalfWidth = halfWidth * clamp(
      endScale * widthVariation,
      0.1,
      0.995,
    );
    const margin = Math.max(0, halfWidth - nextHalfWidth);
    const centerShift = margin * clamp(
      Math.sin(progress * Math.PI * 5.1 + 0.65) * 0.17 +
        Math.sin(progress * Math.PI * 2.3 - 0.35) * 0.07,
      -0.22,
      0.22,
    );
    const shiftedCenterX = centerX + normalX * centerShift;
    const shiftedCenterZ = centerZ + normalZ * centerShift;

    nextLeft.push(Object.freeze({
      x: shiftedCenterX - normalX * nextHalfWidth,
      y: centerY,
      z: shiftedCenterZ - normalZ * nextHalfWidth,
    }));
    nextRight.push(Object.freeze({
      x: shiftedCenterX + normalX * nextHalfWidth,
      y: centerY,
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
  const visualWorld = createV15WatercourseWorld(world);
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
        const waterHeight = waterHeightAtPoint(centerlines[index], point) +
          WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS;
        height = Math.min(
          height,
          waterHeight - WATER_BED_CLEARANCE_METERS,
        );
      }
      return height;
    },
  });
}
