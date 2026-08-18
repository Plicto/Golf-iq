import {
  WEBGL_SURFACE_MATERIAL_IDS,
  pointInCoursePolygon,
} from "./webgl-terrain-materials.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "authored-spline-v4";
export const WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS = 0.032;
export const WEBGL_VISUAL_WATER_SHORELINE_WIDTH_METERS = 0.55;

const SHORELINE_STATIONS = 44;
const SHORELINE_OUTER_EPSILON_METERS = 0.003;
const SHORELINE_INNER_EPSILON_METERS = 0.004;

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

const polygonCross = (first, second, third) =>
  (second.x - first.x) * (third.z - first.z) -
  (second.z - first.z) * (third.x - first.x);

const polygonSignedArea = (points) => points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length];
  return area + point.x * next.z - next.x * point.z;
}, 0) / 2;

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

const sampleBank = (points, count) => Object.freeze(Array.from(
  { length: count },
  (_, index) => {
    const position = (index / (count - 1)) * (points.length - 1);
    const firstIndex = Math.floor(position);
    const secondIndex = Math.min(points.length - 1, firstIndex + 1);
    const amount = position - firstIndex;
    return Object.freeze({
      x: points[firstIndex].x +
        (points[secondIndex].x - points[firstIndex].x) * amount,
      z: points[firstIndex].z +
        (points[secondIndex].z - points[firstIndex].z) * amount,
    });
  },
));

const inwardNormal = (start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-9) {
    throw new RangeError("visual shoreline contains a degenerate edge");
  }
  return Object.freeze({ x: -dz / length, z: dx / length });
};

const shorelineInnerPoints = (outer) => Object.freeze(outer.map((point, index) => {
  const prior = outer[(index + outer.length - 1) % outer.length];
  const next = outer[(index + 1) % outer.length];
  const priorNormal = inwardNormal(prior, point);
  const nextNormal = inwardNormal(point, next);
  let directionX = priorNormal.x + nextNormal.x;
  let directionZ = priorNormal.z + nextNormal.z;
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= 1e-9) {
    directionX = nextNormal.x;
    directionZ = nextNormal.z;
  } else {
    directionX /= directionLength;
    directionZ /= directionLength;
  }
  let distance = WEBGL_VISUAL_WATER_SHORELINE_WIDTH_METERS;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = Object.freeze({
      x: point.x + directionX * distance,
      z: point.z + directionZ * distance,
    });
    if (pointInCoursePolygon(outer, candidate)) return candidate;
    distance *= .5;
  }
  throw new RangeError("visual shoreline cannot remain inside watercourse");
}));

const appendClockwiseTriangle = (
  indices,
  firstIndex,
  secondIndex,
  thirdIndex,
  first,
  second,
  third,
) => {
  const winding = polygonCross(first, second, third);
  if (Math.abs(winding) <= 1e-9) {
    throw new RangeError("visual watercourse triangle is degenerate");
  }
  if (winding < 0) {
    indices.push(firstIndex, secondIndex, thirdIndex);
  } else {
    indices.push(firstIndex, thirdIndex, secondIndex);
  }
};

const appendVisualWaterGroup = ({
  positions,
  normals,
  materials,
  indices,
  world,
  points,
  surfaceIndex,
}) => {
  if (points.length % 2 !== 0 || points.length < 8) {
    throw new RangeError("visual watercourse requires paired banks");
  }
  const stationCount = points.length / 2;
  const left = points.slice(0, stationCount);
  const right = [...points.slice(stationCount)].reverse();
  const waterLevel = world.waterLevels?.[surfaceIndex] ?? world.waterLevel;
  const waterHeight = waterLevel + WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS;
  const firstWaterVertex = positions.length / 3;

  for (let index = 0; index < stationCount; index += 1) {
    for (const point of [left[index], right[index]]) {
      positions.push(point.x, waterHeight, point.z);
      normals.push(0, 1, 0);
      materials.push(WEBGL_SURFACE_MATERIAL_IDS.water);
    }
  }

  let waterTriangles = 0;
  for (let index = 0; index < stationCount - 1; index += 1) {
    const currentLeftIndex = firstWaterVertex + index * 2;
    const currentRightIndex = currentLeftIndex + 1;
    const nextLeftIndex = currentLeftIndex + 2;
    const nextRightIndex = currentLeftIndex + 3;
    appendClockwiseTriangle(
      indices,
      currentLeftIndex,
      nextLeftIndex,
      currentRightIndex,
      left[index],
      left[index + 1],
      right[index],
    );
    appendClockwiseTriangle(
      indices,
      currentRightIndex,
      nextLeftIndex,
      nextRightIndex,
      right[index],
      left[index + 1],
      right[index + 1],
    );
    waterTriangles += 2;
  }

  const shorelineLeft = sampleBank(left, SHORELINE_STATIONS);
  const shorelineRight = sampleBank(right, SHORELINE_STATIONS);
  const boundary = [...shorelineLeft, ...shorelineRight.reverse()];
  const outer = polygonSignedArea(boundary) > 0
    ? boundary
    : [...boundary].reverse();
  const inner = shorelineInnerPoints(outer);
  const firstShorelineVertex = positions.length / 3;

  for (const point of outer) {
    positions.push(
      point.x,
      Math.max(
        waterHeight + SHORELINE_OUTER_EPSILON_METERS,
        world.surfaceElevationAt(point.x, point.z) +
          SHORELINE_OUTER_EPSILON_METERS,
      ),
      point.z,
    );
    normals.push(0, 1, 0);
    materials.push(WEBGL_SURFACE_MATERIAL_IDS.waterShoreline);
  }
  for (const point of inner) {
    positions.push(
      point.x,
      waterHeight + SHORELINE_INNER_EPSILON_METERS,
      point.z,
    );
    normals.push(0, 1, 0);
    materials.push(WEBGL_SURFACE_MATERIAL_IDS.waterShoreline);
  }

  let shorelineTriangles = 0;
  const innerOffset = outer.length;
  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length;
    appendClockwiseTriangle(
      indices,
      firstShorelineVertex + index,
      firstShorelineVertex + innerOffset + index,
      firstShorelineVertex + innerOffset + next,
      outer[index],
      inner[index],
      inner[next],
    );
    appendClockwiseTriangle(
      indices,
      firstShorelineVertex + index,
      firstShorelineVertex + innerOffset + next,
      firstShorelineVertex + next,
      outer[index],
      inner[next],
      outer[next],
    );
    shorelineTriangles += 2;
  }

  return Object.freeze({
    waterVertices: stationCount * 2,
    waterTriangles,
    shorelineVertices: outer.length * 2,
    shorelineTriangles,
  });
};

export function replaceVisualWatercourseGeometry(geometry, world) {
  if (!CONTROLS[world.id]) return geometry;
  const waterBatchIndex = geometry.surfaceBatches.findIndex(
    ({ material }) => material === "water",
  );
  if (waterBatchIndex < 0) return geometry;
  const waterBatch = geometry.surfaceBatches[waterBatchIndex];
  if (waterBatch.firstIndex + waterBatch.indexCount !== geometry.indices.length) {
    throw new RangeError("visual watercourse must remain the final surface batch");
  }

  let firstWaterVertex = Number.POSITIVE_INFINITY;
  for (
    let index = waterBatch.firstIndex;
    index < waterBatch.firstIndex + waterBatch.indexCount;
    index += 1
  ) {
    firstWaterVertex = Math.min(firstWaterVertex, geometry.indices[index]);
  }
  if (!Number.isInteger(firstWaterVertex)) {
    throw new RangeError("visual watercourse batch has no vertices");
  }

  const positions = Array.from(
    geometry.positions.subarray(0, firstWaterVertex * 3),
  );
  const normals = Array.from(
    geometry.normals.subarray(0, firstWaterVertex * 3),
  );
  const materials = Array.from(
    geometry.materials.subarray(0, firstWaterVertex),
  );
  const indices = Array.from(
    geometry.indices.subarray(0, waterBatch.firstIndex),
  );

  let waterVertices = 0;
  let waterTriangles = 0;
  let shorelineVertices = 0;
  let shorelineTriangles = 0;
  const groups = authoredGroups(world);
  for (let index = 0; index < groups.length; index += 1) {
    const result = appendVisualWaterGroup({
      positions,
      normals,
      materials,
      indices,
      world,
      points: groups[index],
      surfaceIndex: index,
    });
    waterVertices += result.waterVertices;
    waterTriangles += result.waterTriangles;
    shorelineVertices += result.shorelineVertices;
    shorelineTriangles += result.shorelineTriangles;
  }

  const indexCount = indices.length - waterBatch.firstIndex;
  const surfaceBatches = geometry.surfaceBatches.map((batch, index) =>
    index === waterBatchIndex
      ? Object.freeze({
        material: "water",
        firstIndex: waterBatch.firstIndex,
        indexCount,
        triangleCount: indexCount / 3,
      })
      : batch
  );
  const materialCounts = Object.freeze({
    ...geometry.materialCounts,
    water: waterVertices,
    waterShoreline: shorelineVertices,
  });
  const waterShorelineByteLength = shorelineVertices * (
    Float32Array.BYTES_PER_ELEMENT * 6 + Uint8Array.BYTES_PER_ELEMENT
  ) + shorelineTriangles * 3 * Uint32Array.BYTES_PER_ELEMENT;

  return Object.freeze({
    ...geometry,
    waterShorelineVertexCount: shorelineVertices,
    waterShorelineTriangleCount: shorelineTriangles,
    waterShorelineByteLength,
    surfaceTriangleCount:
      geometry.surfaceTriangleCount - waterBatch.triangleCount +
      waterTriangles + shorelineTriangles,
    surfaceBatches: Object.freeze(surfaceBatches),
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    materials: new Uint8Array(materials),
    indices: new Uint32Array(indices),
    materialCounts,
  });
}

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
