import { pointInCoursePolygon } from "./webgl-terrain-materials.js";
import {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  createVisualWaterTerrainWorld,
  replaceVisualWatercourseGeometry,
} from "./webgl-watercourse-visual-v18.js";
import { createVisualWatercourseWorld as createV15WatercourseWorld } from
  "./webgl-watercourse-visual-v15.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "contained-stream-v19";
export {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  createVisualWaterTerrainWorld,
  replaceVisualWatercourseGeometry,
};

const WATER_BANK_CLEARANCE_METERS = 0.004;
const HEIGHT_SMOOTHING_WEIGHTS = Object.freeze([1, 2, 3, 4, 5, 4, 3, 2, 1]);

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
    if (pointInCoursePolygon(polygon, point)) return distance;
    distance *= 0.82;
  }
  const center = { x: centerX, z: centerZ };
  if (!pointInCoursePolygon(polygon, center)) {
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

    const startBlend = smoothstep(progress / 0.22);
    const endBlend = smoothstep((1 - progress) / 0.18);
    const endScale = 0.015 + Math.min(startBlend, endBlend) * 0.985;
    const widthVariation = clamp(
      0.79 +
        Math.sin(progress * Math.PI * 3.1 + 0.58) * 0.09 +
        Math.sin(progress * Math.PI * 6.8 - 0.42) * 0.032,
      0.66,
      0.92,
    );
    const baseHalfWidth = halfWidth * clamp(
      endScale * widthVariation,
      0.015,
      0.92,
    );
    const asymmetry = clamp(
      Math.sin(progress * Math.PI * 3.7 + 0.72) * 0.075 +
        Math.sin(progress * Math.PI * 1.55 - 0.38) * 0.03,
      -0.1,
      0.1,
    );
    const leftRequested = Math.min(
      halfWidth * 0.94,
      baseHalfWidth * (1 + asymmetry),
    );
    const rightRequested = Math.min(
      halfWidth * 0.94,
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

  if (reshaped.some((point) => !pointInCoursePolygon(polygon, point))) {
    throw new RangeError("visual stream containment fit failed");
  }
  return reshaped;
};

export function createVisualWatercourseWorld(world) {
  const visualWorld = createV15WatercourseWorld(world);
  const groups = visualWorld.waterSurfaceGroups ?? [];
  if (groups.length === 0) return visualWorld;
  const reshapedGroups = Object.freeze(
    groups.map((points) => reshapeStreamGroup(world, points)),
  );
  const first = reshapedGroups[0] ?? Object.freeze([]);
  return Object.freeze({
    ...visualWorld,
    waterSurfacePoints: first,
    waterSurfaceGroups: reshapedGroups,
    visualWatercourseVersion: WEBGL_VISUAL_WATERCOURSE_VERSION,
  });
}
