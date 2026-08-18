import {
  courseSurfaceMaterialAt,
  createWebglTerrainGeometry,
  pointInCoursePolygon,
  pointInCourseTee,
  waterSurfaceGroupsFor,
  webglTerrainHeightAt,
  webglTerrainMaterialAt,
} from "./webgl-terrain-materials.js";

export const WEBGL_ROUGH_VEGETATION_INSTANCES = 6_000;
export const WEBGL_VEGETATION_EXCLUSION_RADIUS_METERS = 0.72;
export const WEBGL_ROUGH_FIELD_VERSION = "rough-field-composition-v1";
export const WEBGL_ROUGH_FIELD_MAX_ATTEMPTS_PER_INSTANCE = 80;
export const WEBGL_ROUGH_FIELD_MINIMUM_DENSITY = 0.16;
export const WEBGL_ROUGH_FIELD_MAXIMUM_DENSITY = 0.97;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const mix = (from, to, amount) => from + (to - from) * amount;

const fractional = (value) => value - Math.floor(value);

const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
};

const seedForWorld = (world) => {
  let seed = 2_026_081_3;
  for (const character of world.id ?? "course") {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16_777_619);
  }
  return seed >>> 0;
};

const hashUint32 = (value) => {
  let hashed = value >>> 0;
  hashed = Math.imul(hashed ^ hashed >>> 16, 0x7f4a_7c15);
  hashed = Math.imul(hashed ^ hashed >>> 15, 0x6c8e_9cf5);
  return (hashed ^ hashed >>> 16) >>> 0;
};

const latticeValue = (x, z, seed) => hashUint32(
  seed ^
  Math.imul(x, 0x1f12_3bb5) ^
  Math.imul(z, 0x5f35_6495),
) / 4_294_967_295;

const smoothInterpolation = (amount) =>
  amount * amount * (3 - 2 * amount);

const valueNoiseAt = (x, z, scale, seed) => {
  const scaledX = x / scale;
  const scaledZ = z / scale;
  const minimumX = Math.floor(scaledX);
  const minimumZ = Math.floor(scaledZ);
  const amountX = smoothInterpolation(scaledX - minimumX);
  const amountZ = smoothInterpolation(scaledZ - minimumZ);
  const top = mix(
    latticeValue(minimumX, minimumZ, seed),
    latticeValue(minimumX + 1, minimumZ, seed),
    amountX,
  );
  const bottom = mix(
    latticeValue(minimumX, minimumZ + 1, seed),
    latticeValue(minimumX + 1, minimumZ + 1, seed),
    amountX,
  );
  return mix(top, bottom, amountZ);
};

const roughFieldDensityFromSeed = (seed, x, z) => {
  const broad = valueNoiseAt(x, z, 73, seed ^ 0x58f3_8ded);
  const middleX = x * 0.819_152_044_3 + z * 0.573_576_436_4;
  const middleZ = -x * 0.573_576_436_4 + z * 0.819_152_044_3;
  const middle = valueNoiseAt(
    middleX + 37.4,
    middleZ - 61.7,
    31,
    seed ^ 0xa24b_aed5,
  );
  const detailX = x * 0.342_020_143_3 - z * 0.939_692_620_8;
  const detailZ = x * 0.939_692_620_8 + z * 0.342_020_143_3;
  const detail = valueNoiseAt(
    detailX - 19.6,
    detailZ + 43.1,
    13,
    seed ^ 0x9e37_79b9,
  );
  const composition = broad * 0.56 + middle * 0.3 + detail * 0.14;
  const shaped = smoothInterpolation(clamp(
    (composition - 0.2) / 0.62,
    0,
    1,
  ));
  return mix(
    WEBGL_ROUGH_FIELD_MINIMUM_DENSITY,
    WEBGL_ROUGH_FIELD_MAXIMUM_DENSITY,
    shaped,
  );
};

export function roughFieldDensityAt(world, x, z) {
  if (!world || ![x, z].every(Number.isFinite)) {
    throw new TypeError("rough field density requires a world and finite point");
  }
  return roughFieldDensityFromSeed(seedForWorld(world), x, z);
}

const roughFieldCandidateValue = (seed, attempt) =>
  hashUint32(seed ^ Math.imul(attempt + 1, 0x2c92_7f5d)) /
    4_294_967_296;

const roughFieldCandidateCoordinate = (seed, attempt, salt) =>
  hashUint32(
    seed ^ Math.imul(attempt + 1, 0x9e37_79b9) ^ salt,
  ) / 4_294_967_296;

const RENDERED_FOOTPRINT_DIRECTIONS = Object.freeze(Array.from(
  { length: 12 },
  (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    return Object.freeze({ x: Math.cos(angle), z: Math.sin(angle) });
  },
));

const distanceSquaredToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) {
    return (point.x - start.x) ** 2 + (point.z - start.z) ** 2;
  }
  const projection = clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) /
      lengthSquared,
    0,
    1,
  );
  const closestX = start.x + dx * projection;
  const closestZ = start.z + dz * projection;
  return (point.x - closestX) ** 2 + (point.z - closestZ) ** 2;
};

const polygonBoundaryIsClear = (points, point, radiusSquared) => {
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    if (distanceSquaredToSegment(point, points[index], points[next]) <
      radiusSquared) {
      return false;
    }
  }
  return true;
};

export function roughVegetationFootprintIsClear(
  world,
  x,
  z,
  radius = WEBGL_VEGETATION_EXCLUSION_RADIUS_METERS,
) {
  if (![x, z, radius].every(Number.isFinite) || radius <= 0) {
    throw new RangeError("vegetation footprint must be finite and positive");
  }
  const center = { x, z };
  if (
    !pointInCoursePolygon(world.roughPoints, center) ||
    courseSurfaceMaterialAt(world, center) !== "rough" ||
    pointInCourseTee(world, center, radius)
  ) {
    return false;
  }
  const radiusSquared = radius * radius;
  if (!polygonBoundaryIsClear(
    world.roughPoints,
    center,
    radiusSquared,
  )) {
    return false;
  }
  const excludedSurfaces = [
    ...world.fairwayPoints,
    world.greenPoints,
    ...world.bunkerPoints,
    ...waterSurfaceGroupsFor(world),
  ];
  return excludedSurfaces.every((points) =>
    polygonBoundaryIsClear(points, center, radiusSquared)
  );
}

const renderedVegetationFootprintIsClear = (
  world,
  terrainGeometry,
  x,
  z,
  radius,
) => {
  if (webglTerrainMaterialAt(world, { x, z }, terrainGeometry) !== "rough") {
    return false;
  }
  return RENDERED_FOOTPRINT_DIRECTIONS.every((direction) =>
    webglTerrainMaterialAt(world, {
      x: x + direction.x * radius,
      z: z + direction.z * radius,
    }, terrainGeometry) === "rough"
  );
};

export function createFescueClusterVertices() {
  const vertices = [];
  const blades = Object.freeze([
    Object.freeze({ angle: -2.4, height: 0.61, lean: 0.17, width: 0.031, root: 0.16 }),
    Object.freeze({ angle: -1.1, height: 0.82, lean: 0.12, width: 0.029, root: 0.075 }),
    Object.freeze({ angle: 0.05, height: 0.7, lean: 0.15, width: 0.035, root: 0.13 }),
    Object.freeze({ angle: 1.3, height: 0.88, lean: 0.105, width: 0.028, root: 0.055 }),
    Object.freeze({ angle: 2.45, height: 0.57, lean: 0.19, width: 0.033, root: 0.18 }),
  ]);
  for (const blade of blades) {
    const { angle, height, lean, width, root } = blade;
    const sideX = Math.cos(angle);
    const sideZ = Math.sin(angle);
    const forwardX = -sideZ;
    const forwardZ = sideX;
    const leanX = forwardX * lean;
    const leanZ = forwardZ * lean;
    const rootOffsetX = forwardX * root;
    const rootOffsetZ = forwardZ * root;
    const topHalfWidth = width * 0.07;
    const bottomLeft = [
      rootOffsetX - sideX * width,
      0,
      rootOffsetZ - sideZ * width,
    ];
    const bottomRight = [
      rootOffsetX + sideX * width,
      0,
      rootOffsetZ + sideZ * width,
    ];
    const topLeft = [
      leanX - sideX * topHalfWidth,
      height,
      leanZ - sideZ * topHalfWidth,
    ];
    const topRight = [
      leanX + sideX * topHalfWidth,
      height,
      leanZ + sideZ * topHalfWidth,
    ];
    vertices.push(
      ...bottomLeft,
      ...bottomRight,
      ...topLeft,
      ...topLeft,
      ...bottomRight,
      ...topRight,
    );
  }
  return new Float32Array(vertices);
}

export function createRoughVegetationInstances(world, {
  count = WEBGL_ROUGH_VEGETATION_INSTANCES,
  terrainGeometry = createWebglTerrainGeometry(world),
} = {}) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError("vegetation count must be a positive integer");
  }
  const worldSeed = seedForWorld(world);
  const random = createRandom(worldSeed);
  const instances = [];
  const placementBounds = world.roughPoints.reduce((bounds, point) => ({
    minimumX: Math.min(bounds.minimumX, point.x),
    maximumX: Math.max(bounds.maximumX, point.x),
    minimumZ: Math.min(bounds.minimumZ, point.z),
    maximumZ: Math.max(bounds.maximumZ, point.z),
  }), {
    minimumX: Number.POSITIVE_INFINITY,
    maximumX: Number.NEGATIVE_INFINITY,
    minimumZ: Number.POSITIVE_INFINITY,
    maximumZ: Number.NEGATIVE_INFINITY,
  });
  const spanX = placementBounds.maximumX - placementBounds.minimumX;
  const spanZ = placementBounds.maximumZ - placementBounds.minimumZ;
  if (!(spanX > 0) || !(spanZ > 0)) {
    throw new RangeError("rough vegetation requires positive authored bounds");
  }
  for (
    let attempts = 0;
    instances.length < count * 6 &&
      attempts < count * WEBGL_ROUGH_FIELD_MAX_ATTEMPTS_PER_INSTANCE;
    attempts += 1
  ) {
    const x = placementBounds.minimumX +
      roughFieldCandidateCoordinate(
        worldSeed,
        attempts,
        0x68bc_21eb,
      ) * spanX;
    const z = placementBounds.minimumZ +
      roughFieldCandidateCoordinate(
        worldSeed,
        attempts,
        0x02e5_be93,
      ) * spanZ;
    if (
      roughFieldCandidateValue(worldSeed, attempts) >
        roughFieldDensityFromSeed(worldSeed, x, z)
    ) {
      continue;
    }
    if (!roughVegetationFootprintIsClear(world, x, z)) continue;
    if (!renderedVegetationFootprintIsClear(
      world,
      terrainGeometry,
      x,
      z,
      WEBGL_VEGETATION_EXCLUSION_RADIUS_METERS,
    )) {
      continue;
    }
    const y = webglTerrainHeightAt(world, { x, z }, terrainGeometry) + 0.018;
    const scale = 0.52 + random() * 0.53;
    const phase = random() * Math.PI * 2;
    const tint = 0.9 + random() * 0.18;
    instances.push(x, y, z, scale, phase, tint);
  }
  if (instances.length !== count * 6) {
    throw new RangeError(
      `Course ${world.id ?? "world"} cannot place ${count} rough instances`,
    );
  }
  const result = new Float32Array(instances);
  return result;
}

export function sampleRoughVegetationWind({
  wind,
  environmentTimeMs,
  position,
  phase,
  tint = 1,
  height = 1,
  reducedMotion = false,
}) {
  if (
    !position ||
    ![position.x, position.z, environmentTimeMs, phase, tint, height].every(
      Number.isFinite,
    )
  ) {
    throw new TypeError("wind sample requires finite position and timing");
  }
  if (reducedMotion || !wind || wind.speed <= 0) {
    return Object.freeze({ x: 0, z: 0 });
  }
  const seconds = environmentTimeMs / 1_000;
  const primary = Math.sin(
    seconds * 1.47 + phase + position.x * 0.033 + position.z * 0.018,
  );
  const gust = Math.sin(
    seconds * 0.41 + phase * 1.7 + position.x * 0.011 - position.z * 0.007,
  );
  const flutter = Math.sin(
    seconds * 2.23 + phase * 0.63 - position.x * 0.019 + position.z * 0.024,
  );
  const strength = clamp(wind.speed * 0.03, 0, 0.32);
  const stiffness = 0.68 + fractional(tint * 7.13 + phase * 0.17) * 0.32;
  const displacement =
    (primary * 0.62 + gust * 0.28 + flutter * 0.1) *
    strength * stiffness * height * height;
  const radians = ((wind.towardDegrees - 90) * Math.PI) / 180;
  return Object.freeze({
    x: Math.cos(radians) * displacement,
    z: Math.sin(radians) * displacement,
  });
}
