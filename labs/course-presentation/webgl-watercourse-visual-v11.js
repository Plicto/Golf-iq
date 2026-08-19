import {
  WEBGL_SURFACE_MATERIAL_IDS,
  pointInCoursePolygon,
} from "./webgl-terrain-materials.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "tangent-stream-v11";
export const WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS = 0.012;

const STREAM_STATIONS = 112;
const TERRAIN_CLEARANCE_METERS = 0.008;

const CONTROLS = Object.freeze({
  "north-inlet": Object.freeze({ axis: "z", points: Object.freeze([
    [136, 26.2, 0.95], [146, 27.8, 1.35], [158, 30.1, 1.75],
    [171, 31.7, 1.95], [184, 31.3, 1.92], [197, 30.3, 1.72],
    [210, 31.3, 1.64], [223, 33.5, 1.88], [236, 35.3, 2.04],
    [248, 35.5, 1.94], [259, 34.3, 1.62], [267, 32.9, 0.82],
  ]) }),
  "gannet-shelf": Object.freeze({ axis: "x", points: Object.freeze([
    [-85, 75.7, 0.9], [-72, 76.8, 1.35], [-57, 78.8, 1.72],
    [-40, 80.9, 1.82], [-21, 82.8, 1.96], [0, 84.4, 1.86],
    [20, 84.0, 1.7], [39, 84.5, 1.86], [57, 86.2, 1.72],
    [72, 88.6, 1.38], [85, 90.4, 0.82],
  ]) }),
});

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const smoothstep = (value) => {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
};

const authoredGroups = (world) => world.waterSurfaceGroups ?? (
  world.waterSurfacePoints?.length >= 3 ? [world.waterSurfacePoints] : []
);

const controlValue = (controls, primary, slot) => {
  let index = 0;
  while (index < controls.length - 2 && primary > controls[index + 1][0]) {
    index += 1;
  }
  const first = controls[index];
  const second = controls[index + 1];
  const prior = controls[Math.max(0, index - 1)];
  const next = controls[Math.min(controls.length - 1, index + 2)];
  const span = Math.max(1e-6, second[0] - first[0]);
  const t = clamp((primary - first[0]) / span, 0, 1);
  const firstSlope = (second[slot] - prior[slot]) /
    Math.max(1e-6, second[0] - prior[0]);
  const secondSlope = (next[slot] - first[slot]) /
    Math.max(1e-6, next[0] - first[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * first[slot] +
    (t3 - 2 * t2 + t) * firstSlope * span +
    (-2 * t3 + 3 * t2) * second[slot] +
    (t3 - t2) * secondSlope * span;
};

const centerAt = (spec, primary) => controlValue(spec.points, primary, 1);
const halfWidthAt = (spec, primary) => controlValue(spec.points, primary, 2);

const centerDerivativeAt = (spec, primary) => {
  const first = spec.points[0][0];
  const last = spec.points.at(-1)[0];
  const step = Math.max(0.05, (last - first) / 1800);
  const before = centerAt(spec, clamp(primary - step, first, last));
  const after = centerAt(spec, clamp(primary + step, first, last));
  return (after - before) / Math.max(1e-6, step * 2);
};

const streamFrameAt = (spec, primary) => {
  const center = centerAt(spec, primary);
  const derivative = centerDerivativeAt(spec, primary);
  const tangent = spec.axis === "z"
    ? { x: derivative, z: 1 }
    : { x: 1, z: derivative };
  const length = Math.hypot(tangent.x, tangent.z) || 1;
  const tx = tangent.x / length;
  const tz = tangent.z / length;
  return Object.freeze({
    center: spec.axis === "z"
      ? Object.freeze({ x: center, z: primary })
      : Object.freeze({ x: primary, z: center }),
    normal: Object.freeze({ x: tz, z: -tx }),
  });
};

const pointAlongNormal = (frame, distance) => Object.freeze({
  x: frame.center.x + frame.normal.x * distance,
  z: frame.center.z + frame.normal.z * distance,
});

const fittedHalfWidth = (gameplay, frame, requested) => {
  let half = Math.max(0.12, requested);
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const left = pointAlongNormal(frame, -half);
    const right = pointAlongNormal(frame, half);
    if (
      pointInCoursePolygon(gameplay, left) &&
      pointInCoursePolygon(gameplay, right)
    ) {
      return half;
    }
    half *= 0.84;
  }
  throw new RangeError("visual stream cannot remain inside gameplay water");
};

const buildVisualGroup = (world, gameplay) => {
  const spec = CONTROLS[world.id];
  if (!spec) return null;
  const firstPrimary = spec.points[0][0];
  const lastPrimary = spec.points.at(-1)[0];
  const left = [];
  const right = [];
  for (let index = 0; index < STREAM_STATIONS; index += 1) {
    const progress = index / (STREAM_STATIONS - 1);
    const primary = firstPrimary + (lastPrimary - firstPrimary) * progress;
    const frame = streamFrameAt(spec, primary);
    const endBlend = Math.min(
      smoothstep(progress / 0.075),
      smoothstep((1 - progress) / 0.075),
    );
    const taper = 0.38 + endBlend * 0.62;
    const requested = Math.max(0.34, halfWidthAt(spec, primary) * taper);
    const half = fittedHalfWidth(gameplay, frame, requested);
    left.push(pointAlongNormal(frame, -half));
    right.push(pointAlongNormal(frame, half));
  }
  const group = Object.freeze([...left, ...[...right].reverse()]);
  if (group.some((point) => !pointInCoursePolygon(gameplay, point))) {
    throw new RangeError("visual stream escapes gameplay water");
  }
  return group;
};

const polygonCross = (first, second, third) =>
  (second.x - first.x) * (third.z - first.z) -
  (second.z - first.z) * (third.x - first.x);

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
    throw new RangeError("visual stream triangle is degenerate");
  }
  if (winding < 0) {
    indices.push(firstIndex, secondIndex, thirdIndex);
  } else {
    indices.push(firstIndex, thirdIndex, secondIndex);
  }
};

const appendWaterGroup = ({
  positions,
  normals,
  materials,
  indices,
  world,
  points,
  surfaceIndex,
}) => {
  if (points.length % 2 !== 0 || points.length < 8) {
    throw new RangeError("visual stream requires paired banks");
  }
  const stationCount = points.length / 2;
  const left = points.slice(0, stationCount);
  const right = [...points.slice(stationCount)].reverse();
  const waterLevel = world.waterLevels?.[surfaceIndex] ?? world.waterLevel;
  const waterHeight = waterLevel + WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS;
  const firstVertex = positions.length / 3;

  for (let index = 0; index < stationCount; index += 1) {
    for (const point of [left[index], right[index]]) {
      positions.push(point.x, waterHeight, point.z);
      normals.push(0, 1, 0);
      materials.push(WEBGL_SURFACE_MATERIAL_IDS.water);
    }
  }

  let triangleCount = 0;
  for (let index = 0; index < stationCount - 1; index += 1) {
    const currentLeft = firstVertex + index * 2;
    const currentRight = currentLeft + 1;
    const nextLeft = currentLeft + 2;
    const nextRight = currentLeft + 3;
    appendClockwiseTriangle(
      indices,
      currentLeft,
      nextLeft,
      currentRight,
      left[index],
      left[index + 1],
      right[index],
    );
    appendClockwiseTriangle(
      indices,
      currentRight,
      nextLeft,
      nextRight,
      right[index],
      left[index + 1],
      right[index + 1],
    );
    triangleCount += 2;
  }

  return Object.freeze({
    vertexCount: stationCount * 2,
    triangleCount,
  });
};

export function replaceVisualWatercourseGeometry(geometry, world) {
  if (!CONTROLS[world.id]) return geometry;
  const waterBatchIndex = geometry.surfaceBatches.findIndex(
    ({ material }) => material === "water",
  );
  const hasWaterBatch = waterBatchIndex >= 0;
  const waterBatch = hasWaterBatch
    ? geometry.surfaceBatches[waterBatchIndex]
    : Object.freeze({
      material: "water",
      firstIndex: geometry.indices.length,
      indexCount: 0,
      triangleCount: 0,
    });
  if (
    hasWaterBatch &&
    waterBatch.firstIndex + waterBatch.indexCount !== geometry.indices.length
  ) {
    throw new RangeError("visual stream must remain the final surface batch");
  }

  let firstWaterVertex = geometry.positions.length / 3;
  if (hasWaterBatch) {
    firstWaterVertex = Number.POSITIVE_INFINITY;
    for (
      let index = waterBatch.firstIndex;
      index < waterBatch.firstIndex + waterBatch.indexCount;
      index += 1
    ) {
      firstWaterVertex = Math.min(firstWaterVertex, geometry.indices[index]);
    }
    if (!Number.isInteger(firstWaterVertex)) {
      throw new RangeError("visual stream batch has no vertices");
    }
  }

  const positions = Array.from(geometry.positions.subarray(0, firstWaterVertex * 3));
  const normals = Array.from(geometry.normals.subarray(0, firstWaterVertex * 3));
  const materials = Array.from(geometry.materials.subarray(0, firstWaterVertex));
  const indices = Array.from(geometry.indices.subarray(0, waterBatch.firstIndex));

  let waterVertices = 0;
  let waterTriangles = 0;
  const groups = authoredGroups(world);
  for (let index = 0; index < groups.length; index += 1) {
    const result = appendWaterGroup({
      positions,
      normals,
      materials,
      indices,
      world,
      points: groups[index],
      surfaceIndex: index,
    });
    waterVertices += result.vertexCount;
    waterTriangles += result.triangleCount;
  }

  const indexCount = indices.length - waterBatch.firstIndex;
  const nextWaterBatch = Object.freeze({
    material: "water",
    firstIndex: waterBatch.firstIndex,
    indexCount,
    triangleCount: indexCount / 3,
  });
  const surfaceBatches = hasWaterBatch
    ? geometry.surfaceBatches.map((batch, index) =>
      index === waterBatchIndex ? nextWaterBatch : batch
    )
    : [...geometry.surfaceBatches, nextWaterBatch];

  return Object.freeze({
    ...geometry,
    waterShorelineVertexCount: 0,
    waterShorelineTriangleCount: 0,
    waterShorelineByteLength: 0,
    surfaceTriangleCount:
      geometry.surfaceTriangleCount - waterBatch.triangleCount + waterTriangles,
    surfaceBatches: Object.freeze(surfaceBatches),
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    materials: new Uint8Array(materials),
    indices: new Uint32Array(indices),
    materialCounts: Object.freeze({
      ...geometry.materialCounts,
      water: waterVertices,
      waterShoreline: 0,
    }),
  });
}

export function createVisualWatercourseWorld(world) {
  const gameplay = authoredGroups(world)[0];
  const spec = CONTROLS[world.id];
  if (!gameplay || !spec) return world;
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
      const surfaceIndex = groups.findIndex((points) =>
        pointInCoursePolygon(points, point)
      );
      if (surfaceIndex < 0) return original;
      const level = levels[surfaceIndex] ?? visualWorld.waterLevel;
      return Math.min(
        original,
        level + WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS -
          TERRAIN_CLEARANCE_METERS,
      );
    },
  });
}
