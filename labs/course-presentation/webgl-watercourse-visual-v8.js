import {
  WEBGL_WATER_SURFACE_RENDER_LIFT_METERS,
  pointInCoursePolygon,
  waterSurfaceGroupsFor,
} from "./webgl-terrain-materials.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "authored-spline-v3";

const WATER_BANK_OUTER_RISE_PER_METER = 0.008;
const WATER_BANK_MAX_INFLUENCE_METERS = 6;

const CONTROLS = Object.freeze({
  "north-inlet": Object.freeze({ axis: "z", points: Object.freeze([
    [138, 27.2, 1.15], [148, 28.2, 1.50], [160, 30.1, 1.85],
    [172, 31.8, 2.05], [184, 31.4, 2.00], [196, 30.4, 1.85],
    [208, 31.2, 1.75], [220, 33.5, 2.00], [232, 35.4, 2.15],
    [244, 35.7, 2.05], [256, 34.5, 1.85], [266, 33.1, 1.25],
    [268, 32.8, .75],
  ]) }),
  "gannet-shelf": Object.freeze({ axis: "x", points: Object.freeze([
    [-84, 75.8, 1.15], [-70, 77.0, 1.55], [-55, 79.0, 1.90],
    [-38, 81.0, 1.90], [-20, 82.8, 2.05], [0, 84.4, 1.95],
    [18, 84.1, 1.80], [36, 84.3, 1.95], [54, 86.0, 1.85],
    [70, 88.4, 1.55], [84, 90.2, 1.05],
  ]) }),
});

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const authoredGroups = (world) => world.waterSurfaceGroups ?? (
  world.waterSurfacePoints?.length >= 3 ? [world.waterSurfacePoints] : []
);

const sectionAt = (polygon, axis, primary) => {
  const cross = axis === "z" ? "x" : "z";
  const hits = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const a = start[axis];
    const b = end[axis];
    if (Math.abs(b - a) <= 1e-9) continue;
    if (primary < Math.min(a, b) || primary >= Math.max(a, b)) continue;
    const progress = (primary - a) / (b - a);
    hits.push(start[cross] + (end[cross] - start[cross]) * progress);
  }
  hits.sort((left, right) => left - right);
  if (hits.length < 2 || hits.length % 2) return null;
  let result = null;
  for (let index = 0; index < hits.length; index += 2) {
    const candidate = { minimum: hits[index], maximum: hits[index + 1] };
    if (!result || candidate.maximum - candidate.minimum > result.maximum - result.minimum) {
      result = candidate;
    }
  }
  return result;
};

const controlValue = (controls, primary, field) => {
  const slot = field === "center" ? 1 : 2;
  let index = 0;
  while (index < controls.length - 2 && primary > controls[index + 1][0]) index += 1;
  const first = controls[index];
  const second = controls[index + 1];
  const prior = controls[Math.max(0, index - 1)];
  const next = controls[Math.min(controls.length - 1, index + 2)];
  const span = Math.max(1e-6, second[0] - first[0]);
  const t = clamp((primary - first[0]) / span, 0, 1);
  const firstSlope = (second[slot] - prior[slot]) / Math.max(1e-6, second[0] - prior[0]);
  const secondSlope = (next[slot] - first[slot]) / Math.max(1e-6, next[0] - first[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * first[slot] +
    (t3 - 2 * t2 + t) * firstSlope * span +
    (-2 * t3 + 3 * t2) * second[slot] +
    (t3 - t2) * secondSlope * span;
};

const buildVisualGroup = (world, gameplay) => {
  const spec = CONTROLS[world.id];
  if (!spec) return null;
  const { axis, points: controls } = spec;
  const firstPrimary = controls[0][0];
  const lastPrimary = controls.at(-1)[0];
  const left = [];
  const right = [];
  for (let index = 0; index < 72; index += 1) {
    const primary = firstPrimary + (lastPrimary - firstPrimary) * index / 71;
    const section = sectionAt(gameplay, axis, primary);
    if (!section) throw new RangeError("visual watercourse leaves gameplay hazard");
    const maxHalf = Math.max(.55, (section.maximum - section.minimum) * .5 - .42);
    const half = clamp(controlValue(controls, primary, "half"), .55, maxHalf);
    const minimum = section.minimum + half + .34;
    const maximum = section.maximum - half - .34;
    const requested = controlValue(controls, primary, "center");
    const center = minimum <= maximum ? clamp(requested, minimum, maximum) :
      (section.minimum + section.maximum) * .5;
    const first = axis === "z" ? { x: center - half, z: primary } :
      { x: primary, z: center - half };
    const second = axis === "z" ? { x: center + half, z: primary } :
      { x: primary, z: center + half };
    left.push(Object.freeze(first));
    right.push(Object.freeze(second));
  }
  const group = Object.freeze([...left, ...right.reverse()]);
  if (group.some((point) => !pointInCoursePolygon(gameplay, point))) {
    throw new RangeError("visual watercourse escapes gameplay hazard");
  }
  return group;
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

const bankProfileFor = (world, points, waterSurfaceIndex) => Object.freeze({
  points,
  waterSurfaceHeight:
    (world.waterLevels?.[waterSurfaceIndex] ?? world.waterLevel) +
    WEBGL_WATER_SURFACE_RENDER_LIFT_METERS,
  bounds: Object.freeze({
    minimumX: Math.min(...points.map(({ x }) => x)) -
      WATER_BANK_MAX_INFLUENCE_METERS,
    maximumX: Math.max(...points.map(({ x }) => x)) +
      WATER_BANK_MAX_INFLUENCE_METERS,
    minimumZ: Math.min(...points.map(({ z }) => z)) -
      WATER_BANK_MAX_INFLUENCE_METERS,
    maximumZ: Math.max(...points.map(({ z }) => z)) +
      WATER_BANK_MAX_INFLUENCE_METERS,
  }),
});

const distanceToBankProfile = (profile, point) => {
  if (
    point.x < profile.bounds.minimumX ||
    point.x > profile.bounds.maximumX ||
    point.z < profile.bounds.minimumZ ||
    point.z > profile.bounds.maximumZ
  ) {
    return Number.POSITIVE_INFINITY;
  }
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < profile.points.length; index += 1) {
    distance = Math.min(
      distance,
      pointSegmentDistance(
        point,
        profile.points[index],
        profile.points[(index + 1) % profile.points.length],
      ),
    );
  }
  return distance;
};

const visualSurfaceElevationFor = (world, profiles) => (x, z) => {
  const original = world.surfaceElevationAt(x, z);
  const point = { x, z };
  let ceiling = Number.POSITIVE_INFINITY;
  for (const profile of profiles) {
    if (pointInCoursePolygon(profile.points, point)) continue;
    const distance = distanceToBankProfile(profile, point);
    if (distance > WATER_BANK_MAX_INFLUENCE_METERS) continue;
    ceiling = Math.min(
      ceiling,
      profile.waterSurfaceHeight + distance * WATER_BANK_OUTER_RISE_PER_METER,
    );
  }
  return Math.min(original, ceiling);
};

export function createVisualWatercourseWorld(world) {
  const gameplay = authoredGroups(world)[0];
  if (!gameplay || !CONTROLS[world.id]) return world;
  const group = buildVisualGroup(world, gameplay);
  const level = world.waterLevels?.[0] ?? world.waterLevel;
  const points = Object.freeze(group.map((point) =>
    Object.freeze({ ...point, y: level })
  ));
  const ribbonWorld = Object.freeze({
    ...world,
    waterSurfacePoints: points,
    waterSurfaceGroups: Object.freeze([points]),
    waterLevels: Object.freeze([level]),
  });
  const renderedGroups = waterSurfaceGroupsFor(ribbonWorld);
  const profiles = Object.freeze(renderedGroups.map((rendered, index) =>
    bankProfileFor(ribbonWorld, rendered, index)
  ));
  return Object.freeze({
    ...ribbonWorld,
    surfaceElevationAt: visualSurfaceElevationFor(world, profiles),
  });
}
