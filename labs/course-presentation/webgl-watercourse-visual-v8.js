import { pointInCoursePolygon, waterSurfaceGroupsFor } from "./webgl-terrain-materials.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "authored-spline-v1";

const CONTROLS = Object.freeze({
  "north-inlet": Object.freeze({ axis: "z", points: Object.freeze([
    [138, 26.7, .95], [148, 28.1, 1.45], [160, 31.0, 1.90],
    [172, 33.0, 2.15], [184, 32.2, 2.00], [196, 29.6, 1.70],
    [208, 30.0, 1.55], [220, 35.5, 2.00], [232, 39.1, 2.25],
    [244, 38.7, 2.05], [256, 35.7, 1.80], [266, 32.9, 1.15],
    [268, 32.5, .80],
  ]) }),
  "gannet-shelf": Object.freeze({ axis: "x", points: Object.freeze([
    [-84, 75.5, 1.20], [-70, 77.0, 1.65], [-55, 79.2, 2.05],
    [-38, 81.4, 1.85], [-20, 83.2, 2.20], [0, 85.0, 1.95],
    [18, 83.7, 1.75], [36, 83.6, 2.10], [54, 86.0, 1.90],
    [70, 89.0, 1.60], [84, 91.0, 1.10],
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
  for (let index = 0; index < 48; index += 1) {
    const primary = firstPrimary + (lastPrimary - firstPrimary) * index / 47;
    const section = sectionAt(gameplay, axis, primary);
    if (!section) throw new RangeError("visual watercourse leaves gameplay hazard");
    const maxHalf = Math.max(.62, (section.maximum - section.minimum) * .5 - .42);
    const half = clamp(controlValue(controls, primary, "half"), .62, maxHalf);
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

export function createVisualWatercourseWorld(world) {
  const gameplay = authoredGroups(world)[0];
  if (!gameplay || !CONTROLS[world.id]) return world;
  const group = buildVisualGroup(world, gameplay);
  const level = world.waterLevels?.[0] ?? world.waterLevel;
  const points = Object.freeze(group.map((point) =>
    Object.freeze({ ...point, y: level })
  ));
  return Object.freeze({
    ...world,
    waterSurfacePoints: points,
    waterSurfaceGroups: Object.freeze([points]),
    waterLevels: Object.freeze([level]),
  });
}

const inRenderedWater = (world, point) =>
  waterSurfaceGroupsFor(world).some((group) => pointInCoursePolygon(group, point));

export function suppressVisualWaterUndergrid(geometry, world) {
  if (!CONTROLS[world.id]) return geometry;
  const indices = new Uint32Array(geometry.indices);
  const coarseEnd = geometry.bunkerPatches[0]?.firstGridIndex ?? geometry.gridTriangleCount * 3;
  let suppressed = 0;
  for (let offset = 0; offset < coarseEnd; offset += 3) {
    const vertexIndices = [indices[offset], indices[offset + 1], indices[offset + 2]];
    const vertices = vertexIndices.map((vertex) => ({
      x: geometry.positions[vertex * 3],
      z: geometry.positions[vertex * 3 + 2],
    }));
    const centroid = {
      x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
      z: (vertices[0].z + vertices[1].z + vertices[2].z) / 3,
    };
    if ([...vertices, centroid].some((point) => inRenderedWater(world, point))) {
      indices[offset + 1] = indices[offset];
      indices[offset + 2] = indices[offset];
      suppressed += 1;
    }
  }
  if (!suppressed) return geometry;
  return Object.freeze({ ...geometry, indices });
}
