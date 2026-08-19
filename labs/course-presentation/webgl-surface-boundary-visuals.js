import { pointInCoursePolygon } from "./webgl-terrain-materials.js";

export const WEBGL_VISUAL_SURFACE_BOUNDARY_VERSION = "smooth-fairway-v3";

const FAIRWAY_STATIONS = 320;
const MINIMUM_HALF_WIDTH_METERS = 0.25;
const CENTER_SMOOTHING_RADIUS_METERS = 13;
const WIDTH_SMOOTHING_RADIUS_METERS = 19;
const END_INSET_METERS = 8;
const CANDIDATE_INSETS_METERS = Object.freeze([0.6, 0.8, 1, 1.2, 1.5]);
const SMOOTHING_OFFSETS = Object.freeze([-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
const SMOOTHING_WEIGHTS = Object.freeze([1, 2, 3, 5, 7, 5, 3, 2, 1]);

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const fairwayPrimaryBounds = (points) => Object.freeze({
  minimum: Math.min(...points.map(({ z }) => z)),
  maximum: Math.max(...points.map(({ z }) => z)),
});

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

const buildCandidate = (
  world,
  authored,
  minimumZ,
  maximumZ,
  inset,
) => {
  const firstZ = minimumZ + Math.min(END_INSET_METERS, (maximumZ - minimumZ) * 0.04);
  const lastZ = maximumZ - Math.min(END_INSET_METERS, (maximumZ - minimumZ) * 0.04);
  const left = [];
  const right = [];
  for (let index = 0; index < FAIRWAY_STATIONS; index += 1) {
    const progress = index / (FAIRWAY_STATIONS - 1);
    const z = firstZ + (lastZ - firstZ) * progress;
    const center = smoothedCenterAt(world, z, minimumZ, maximumZ);
    const halfWidth = Math.max(
      MINIMUM_HALF_WIDTH_METERS,
      smoothedHalfWidthAt(world, z, minimumZ, maximumZ) - inset,
    );
    left.push(Object.freeze({ x: center - halfWidth, z }));
    right.push(Object.freeze({ x: center + halfWidth, z }));
  }
  const polygon = Object.freeze([...left, ...[...right].reverse()]);
  return polygon.every((point) => pointInCoursePolygon(authored, point))
    ? polygon
    : null;
};

const buildVisualFairway = (world, authored) => {
  const { minimum, maximum } = fairwayPrimaryBounds(authored);
  if (!(maximum > minimum)) return authored;
  for (const inset of CANDIDATE_INSETS_METERS) {
    const candidate = buildCandidate(
      world,
      authored,
      minimum,
      maximum,
      inset,
    );
    if (candidate) return candidate;
  }
  return authored;
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
