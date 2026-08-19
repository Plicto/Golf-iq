export const WEBGL_VISUAL_SURFACE_BOUNDARY_VERSION = "organic-fairway-v8";

const FAIRWAY_STATIONS = 180;
const EDGE_EPSILON_METERS = 0.03;
const MINIMUM_HALF_WIDTH_METERS = 0.36;
const SMOOTHING_RADIUS = 5;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const smoothstep = (value) => {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
};

const polygonBounds = (points) => Object.freeze({
  minimumZ: Math.min(...points.map(({ z }) => z)),
  maximumZ: Math.max(...points.map(({ z }) => z)),
});

const horizontalIntersections = (points, z) => {
  const intersections = [];
  for (let index = 0; index < points.length; index += 1) {
    const first = points[index];
    const second = points[(index + 1) % points.length];
    if (Math.abs(second.z - first.z) <= 1e-9) continue;
    const minimumZ = Math.min(first.z, second.z);
    const maximumZ = Math.max(first.z, second.z);
    if (z < minimumZ || z >= maximumZ) continue;
    const progress = (z - first.z) / (second.z - first.z);
    intersections.push(first.x + (second.x - first.x) * progress);
  }
  intersections.sort((left, right) => left - right);
  return intersections;
};

const crossSectionAt = (points, z) => {
  const intersections = horizontalIntersections(points, z);
  if (intersections.length !== 2) return null;
  return Object.freeze({
    left: intersections[0],
    right: intersections[1],
  });
};

const smoothSamples = (samples, key) => samples.map((sample, index) => {
  let total = 0;
  let weightTotal = 0;
  for (let offset = -SMOOTHING_RADIUS; offset <= SMOOTHING_RADIUS; offset += 1) {
    const sampleIndex = clamp(index + offset, 0, samples.length - 1);
    const distance = Math.abs(offset) / (SMOOTHING_RADIUS + 1);
    const weight = (1 - distance) ** 2;
    total += samples[sampleIndex][key] * weight;
    weightTotal += weight;
  }
  return total / weightTotal;
});

const endScaleAt = (progress) => {
  const start = smoothstep(progress / 0.04);
  const end = smoothstep((1 - progress) / 0.055);
  return 0.32 + Math.min(start, end) * 0.68;
};

const leftInsetAt = (progress) =>
  0.28 +
  (0.5 + 0.5 * Math.sin(progress * Math.PI * 3.7 + 0.61)) * 0.48 +
  (0.5 + 0.5 * Math.sin(progress * Math.PI * 9.3 - 0.37)) * 0.18;

const rightInsetAt = (progress) =>
  0.26 +
  (0.5 + 0.5 * Math.sin(progress * Math.PI * 4.25 - 0.18)) * 0.44 +
  (0.5 + 0.5 * Math.sin(progress * Math.PI * 10.1 + 0.96)) * 0.2;

const blendedEdge = (smoothed, authored) =>
  smoothed * 0.76 + authored * 0.24;

const buildVisualFairway = (authored) => {
  const { minimumZ, maximumZ } = polygonBounds(authored);
  const span = maximumZ - minimumZ;
  if (!(span > EDGE_EPSILON_METERS * 4)) return authored;

  const firstZ = minimumZ + EDGE_EPSILON_METERS;
  const lastZ = maximumZ - EDGE_EPSILON_METERS;
  const samples = [];
  for (let index = 0; index < FAIRWAY_STATIONS; index += 1) {
    const progress = index / (FAIRWAY_STATIONS - 1);
    const z = firstZ + (lastZ - firstZ) * progress;
    const section = crossSectionAt(authored, z);
    if (!section || !(section.right > section.left)) return authored;
    samples.push(Object.freeze({
      progress,
      z,
      left: section.left,
      right: section.right,
    }));
  }

  const smoothedLeft = smoothSamples(samples, "left");
  const smoothedRight = smoothSamples(samples, "right");
  const left = [];
  const right = [];

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const rawHalfWidth = (sample.right - sample.left) * 0.5;
    const scale = endScaleAt(sample.progress);
    const availableHalfWidth = Math.max(
      0.006,
      rawHalfWidth - 0.01,
    );
    const cappedHalfWidth = Math.min(
      availableHalfWidth,
      Math.max(
        MINIMUM_HALF_WIDTH_METERS,
        rawHalfWidth * scale,
      ),
    );
    const desiredLeft =
      blendedEdge(smoothedLeft[index], sample.left) +
      leftInsetAt(sample.progress);
    const desiredRight =
      blendedEdge(smoothedRight[index], sample.right) -
      rightInsetAt(sample.progress);
    const desiredHalfWidth = Math.max(
      0.006,
      (desiredRight - desiredLeft) * 0.5,
    );
    const halfWidth = clamp(
      desiredHalfWidth,
      Math.min(MINIMUM_HALF_WIDTH_METERS, cappedHalfWidth),
      cappedHalfWidth,
    );
    const desiredCenter = clamp(
      (desiredLeft + desiredRight) * 0.5,
      sample.left + halfWidth + 0.005,
      sample.right - halfWidth - 0.005,
    );

    left.push(Object.freeze({
      x: desiredCenter - halfWidth,
      z: sample.z,
    }));
    right.push(Object.freeze({
      x: desiredCenter + halfWidth,
      z: sample.z,
    }));
  }

  return Object.freeze([
    ...left,
    ...[...right].reverse(),
  ]);
};

export function createVisualSurfaceBoundaryWorld(world) {
  if (
    !world ||
    !Array.isArray(world.fairwayPoints) ||
    world.fairwayPoints.length !== 1 ||
    !Array.isArray(world.fairwayPoints[0]) ||
    world.fairwayPoints[0].length < 4
  ) {
    return world;
  }
  const visualFairway = buildVisualFairway(world.fairwayPoints[0]);
  return Object.freeze({
    ...world,
    fairwayPoints: Object.freeze([visualFairway]),
    visualSurfaceBoundaryVersion: WEBGL_VISUAL_SURFACE_BOUNDARY_VERSION,
  });
}
