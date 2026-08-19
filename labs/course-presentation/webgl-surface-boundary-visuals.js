import { pointInCoursePolygon } from "./webgl-terrain-materials.js";

export const WEBGL_VISUAL_SURFACE_BOUNDARY_VERSION = "tangent-fairway-v2";

const FAIRWAY_STATIONS = 240;
const EDGE_INSET_METERS = 0.1;
const MINIMUM_HALF_WIDTH_METERS = 0.25;
const CENTER_SMOOTHING_RADIUS_METERS = 11;
const WIDTH_SMOOTHING_RADIUS_METERS = 17;
const SMOOTHING_OFFSETS = Object.freeze([-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
const SMOOTHING_WEIGHTS = Object.freeze([1, 2, 3, 5, 7, 5, 3, 2, 1]);

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const fairwayPrimaryBounds = (points) => Object.freeze({
  minimum: Math.min(...points.map(({ z }) => z)),
  maximum: Math.max(...points.map(({ z }) => z)),
});

const fairwayCrossSectionAt = (points, z) => {
  const intersections = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (Math.abs(end.z - start.z) <= 1e-9) continue;
    if (z < Math.min(start.z, end.z) || z >= Math.max(start.z, end.z)) {
      continue;
    }
    const progress = (z - start.z) / (end.z - start.z);
    intersections.push(start.x + (end.x - start.x) * progress);
  }
  intersections.sort((left, right) => left - right);
  if (intersections.length < 2 || intersections.length % 2 !== 0) return null;
  let section = null;
  for (let index = 0; index < intersections.length; index += 2) {
    const candidate = Object.freeze({
      minimum: intersections[index],
      maximum: intersections[index + 1],
    });
    if (!section || candidate.maximum - candidate.minimum >
      section.maximum - section.minimum) {
      section = candidate;
    }
  }
  return section;
};

const smoothedSample = (
  sample,
  z,
  radius,
  minimumZ,
  maximumZ,
) => {
  let total = 0;
  let weightTotal = 0;
  for (let index = 0; index < SMOOTHING_OFFSETS.length; index += 1) {
    const sampleZ = clamp(
      z + SMOOTHING_OFFSETS[index] * radius,
      minimumZ,
      maximumZ,
    );
    const weight = SMOOTHING_WEIGHTS[index];
    total += sample(sampleZ) * weight;
    weightTotal += weight;
  }
  return total / weightTotal;
};

const smoothedCenterAt = (world, z, minimumZ, maximumZ) =>
  smoothedSample(
    world.centerAt,
    z,
    CENTER_SMOOTHING_RADIUS_METERS,
    minimumZ,
    maximumZ,
  );

const smoothedHalfWidthAt = (world, z, minimumZ, maximumZ) =>
  smoothedSample(
    world.fairwayHalfWidthAt,
    z,
    WIDTH_SMOOTHING_RADIUS_METERS,
    minimumZ,
    maximumZ,
  );

const centerDerivativeAt = (world, z, minimumZ, maximumZ) => {
  const sampleStep = Math.max(0.08, (maximumZ - minimumZ) / 1800);
  const before = smoothedCenterAt(
    world,
    clamp(z - sampleStep, minimumZ, maximumZ),
    minimumZ,
    maximumZ,
  );
  const after = smoothedCenterAt(
    world,
    clamp(z + sampleStep, minimumZ, maximumZ),
    minimumZ,
    maximumZ,
  );
  return (after - before) / Math.max(1e-6, sampleStep * 2);
};

const tangentFrameAt = (world, authored, z, minimumZ, maximumZ) => {
  const section = fairwayCrossSectionAt(authored, z);
  if (!section) return null;
  const requestedCenter = smoothedCenterAt(world, z, minimumZ, maximumZ);
  const centerX = clamp(
    requestedCenter,
    section.minimum + EDGE_INSET_METERS,
    section.maximum - EDGE_INSET_METERS,
  );
  const derivative = centerDerivativeAt(world, z, minimumZ, maximumZ);
  const tangentLength = Math.hypot(derivative, 1) || 1;
  return Object.freeze({
    center: Object.freeze({ x: centerX, z }),
    normal: Object.freeze({
      x: 1 / tangentLength,
      z: -derivative / tangentLength,
    }),
  });
};

const pointAlongNormal = (frame, distance) => Object.freeze({
  x: frame.center.x + frame.normal.x * distance,
  z: frame.center.z + frame.normal.z * distance,
});

const fittedHalfWidth = (authored, frame, requested) => {
  let halfWidth = Math.max(MINIMUM_HALF_WIDTH_METERS, requested);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const left = pointAlongNormal(frame, -halfWidth);
    const right = pointAlongNormal(frame, halfWidth);
    if (
      pointInCoursePolygon(authored, left) &&
      pointInCoursePolygon(authored, right)
    ) {
      return halfWidth;
    }
    halfWidth *= 0.94;
  }
  return null;
};

const buildVisualFairway = (world, authored) => {
  const { minimum, maximum } = fairwayPrimaryBounds(authored);
  if (!(maximum > minimum)) return authored;
  const firstZ = minimum + Math.min(0.18, (maximum - minimum) * 0.004);
  const lastZ = maximum - Math.min(0.18, (maximum - minimum) * 0.004);
  const left = [];
  const right = [];
  for (let index = 0; index < FAIRWAY_STATIONS; index += 1) {
    const progress = index / (FAIRWAY_STATIONS - 1);
    const z = firstZ + (lastZ - firstZ) * progress;
    const frame = tangentFrameAt(world, authored, z, minimum, maximum);
    if (!frame) continue;
    const requested = smoothedHalfWidthAt(world, z, minimum, maximum) * (
      1 + Math.sin(z * 0.027 + 0.7) * 0.004 +
      Math.sin(z * 0.071 - 1.1) * 0.002
    );
    const halfWidth = fittedHalfWidth(authored, frame, requested);
    if (halfWidth === null) continue;
    left.push(pointAlongNormal(frame, -halfWidth));
    right.push(pointAlongNormal(frame, halfWidth));
  }
  if (left.length < FAIRWAY_STATIONS * 0.9 || right.length !== left.length) {
    return authored;
  }
  return Object.freeze([...left, ...[...right].reverse()]);
};

export function createVisualSurfaceBoundaryWorld(world) {
  if (
    !world ||
    typeof world.centerAt !== "function" ||
    typeof world.fairwayHalfWidthAt !== "function" ||
    !Array.isArray(world.fairwayPoints) ||
    world.fairwayPoints.length !== 1 ||
    !Array.isArray(world.fairwayPoints[0]) ||
    world.fairwayPoints[0].length < 6
  ) {
    return world;
  }
  const authored = world.fairwayPoints[0];
  const visualFairway = buildVisualFairway(world, authored);
  if (visualFairway === authored) return world;
  return Object.freeze({
    ...world,
    fairwayPoints: Object.freeze([visualFairway]),
    visualSurfaceBoundaryVersion: WEBGL_VISUAL_SURFACE_BOUNDARY_VERSION,
  });
}
