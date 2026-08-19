export const WEBGL_VISUAL_SURFACE_BOUNDARY_VERSION = "rounded-fairway-v5";

const FAIRWAY_STATIONS = 168;
const END_CAP_SEGMENTS = 18;
const START_CAP_SEGMENTS = 12;
const CENTER_SMOOTHING_RADIUS_METERS = 11;
const WIDTH_SMOOTHING_RADIUS_METERS = 15;
const WIDTH_INSET_METERS = 0.45;
const START_INSET_METERS = 1.5;
const END_BASE_INSET_METERS = 6;
const START_CAP_DEPTH_METERS = 3.5;
const END_CAP_DEPTH_METERS = 10;
const SMOOTHING_OFFSETS = Object.freeze([
  -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1,
]);
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

const smoothedCenterAt = (world, z) => smoothedSample(
  world.centerAt,
  z,
  CENTER_SMOOTHING_RADIUS_METERS,
  world.bounds.minimumZ,
  world.bounds.maximumZ,
);

const smoothedHalfWidthAt = (world, z) => smoothedSample(
  world.fairwayHalfWidthAt,
  z,
  WIDTH_SMOOTHING_RADIUS_METERS,
  world.bounds.minimumZ,
  world.bounds.maximumZ,
);

const fairwayStation = (world, z) => {
  const center = smoothedCenterAt(world, z);
  const halfWidth = Math.max(
    0.5,
    smoothedHalfWidthAt(world, z) - WIDTH_INSET_METERS +
      Math.sin(z * 0.026 + 0.7) * 0.06 +
      Math.sin(z * 0.069 - 1.1) * 0.03,
  );
  return Object.freeze({ center, halfWidth });
};

const roundedEndCap = (center, halfWidth, baseZ, depth) => {
  const points = [];
  for (let index = 1; index < END_CAP_SEGMENTS; index += 1) {
    const angle = Math.PI - (index / END_CAP_SEGMENTS) * Math.PI;
    points.push(Object.freeze({
      x: center + Math.cos(angle) * halfWidth,
      z: baseZ + Math.sin(angle) * depth,
    }));
  }
  return points;
};

const roundedStartCap = (center, halfWidth, baseZ, depth) => {
  const points = [];
  for (let index = 1; index < START_CAP_SEGMENTS; index += 1) {
    const angle = -(index / START_CAP_SEGMENTS) * Math.PI;
    points.push(Object.freeze({
      x: center + Math.cos(angle) * halfWidth,
      z: baseZ + Math.sin(angle) * depth,
    }));
  }
  return points;
};

const buildVisualFairway = (world, authored) => {
  const { minimum, maximum } = fairwayPrimaryBounds(authored);
  if (!(maximum > minimum)) return authored;

  const firstZ = clamp(
    minimum + START_INSET_METERS,
    world.bounds.minimumZ,
    world.bounds.maximumZ,
  );
  const lastZ = clamp(
    maximum - END_BASE_INSET_METERS,
    firstZ + 1,
    world.bounds.maximumZ,
  );
  const left = [];
  const right = [];

  for (let index = 0; index < FAIRWAY_STATIONS; index += 1) {
    const progress = index / (FAIRWAY_STATIONS - 1);
    const z = firstZ + (lastZ - firstZ) * progress;
    const station = fairwayStation(world, z);
    left.push(Object.freeze({ x: station.center - station.halfWidth, z }));
    right.push(Object.freeze({ x: station.center + station.halfWidth, z }));
  }

  const start = fairwayStation(world, firstZ);
  const end = fairwayStation(world, lastZ);
  const endCap = roundedEndCap(
    end.center,
    end.halfWidth,
    lastZ,
    Math.min(
      END_CAP_DEPTH_METERS,
      world.bounds.maximumZ - lastZ - 0.5,
    ),
  );
  const startCap = roundedStartCap(
    start.center,
    start.halfWidth,
    firstZ,
    Math.min(
      START_CAP_DEPTH_METERS,
      firstZ - world.bounds.minimumZ - 0.5,
    ),
  );

  return Object.freeze([
    ...left,
    ...endCap,
    ...[...right].reverse(),
    ...startCap,
  ]);
};

export function createVisualSurfaceBoundaryWorld(world) {
  if (
    !world ||
    typeof world.centerAt !== "function" ||
    typeof world.fairwayHalfWidthAt !== "function" ||
    !world.bounds ||
    !Array.isArray(world.fairwayPoints) ||
    world.fairwayPoints.length !== 1 ||
    !Array.isArray(world.fairwayPoints[0]) ||
    world.fairwayPoints[0].length < 6
  ) {
    return world;
  }
  const visualFairway = buildVisualFairway(world, world.fairwayPoints[0]);
  return Object.freeze({
    ...world,
    fairwayPoints: Object.freeze([visualFairway]),
    visualSurfaceBoundaryVersion: WEBGL_VISUAL_SURFACE_BOUNDARY_VERSION,
  });
}
