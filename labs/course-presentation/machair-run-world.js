const TAU = Math.PI * 2;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const mix = (from, to, amount) => from + (to - from) * clamp(amount, 0, 1);

const smoothstep = (value) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const smootherstep = (value) => {
  const progress = clamp(value, 0, 1);
  return progress ** 3 * (10 - 15 * progress + 6 * progress ** 2);
};

const greenContour = (x, z, centerX, centerZ, radiusX, radiusZ) =>
  Math.exp(-1 * (
    ((x - centerX) / radiusX) ** 2 +
    ((z - centerZ) / radiusZ) ** 2
  ));

const plateauBlend = (point, center, radiusX, radiusZ, inner = 0.62, outer = 1.5) => {
  const radial = Math.hypot(
    (point.x - center.x) / radiusX,
    (point.z - center.z) / radiusZ,
  );
  return 1 - smootherstep((radial - inner) / (outer - inner));
};

const MACHAIR_SWEEPS = Object.freeze([
  Object.freeze({ progress: 0, height: 0 }),
  Object.freeze({ progress: 0.12, height: 0.86 }),
  Object.freeze({ progress: 0.28, height: -1.26 }),
  Object.freeze({ progress: 0.44, height: 1.48 }),
  Object.freeze({ progress: 0.61, height: -0.54 }),
  Object.freeze({ progress: 0.76, height: 1.08 }),
  Object.freeze({ progress: 0.89, height: -0.7 }),
  Object.freeze({ progress: 1.02, height: 0.22 }),
  Object.freeze({ progress: 1.12, height: 0.58 }),
]);

const sweepingHeight = (progress) => {
  const first = MACHAIR_SWEEPS[0];
  const last = MACHAIR_SWEEPS.at(-1);
  if (progress <= first.progress) return first.height;
  if (progress >= last.progress) return last.height;
  for (let index = 1; index < MACHAIR_SWEEPS.length; index += 1) {
    const left = MACHAIR_SWEEPS[index - 1];
    const right = MACHAIR_SWEEPS[index];
    if (progress > right.progress) continue;
    const local = (progress - left.progress) / (right.progress - left.progress);
    return mix(left.height, right.height, smootherstep(local));
  }
  return last.height;
};

export const MACHAIR_RUN_PIN = Object.freeze({ x: 4, y: 0, z: 382 });

export const MACHAIR_RUN_GREEN_PRESENTATION = Object.freeze({
  center: Object.freeze({ x: 4, z: 382 }),
  radiusX: 24,
  radiusZ: 27,
  cupDiameter: 0.10795,
  flagstickHeight: 2.15,
  flagWidth: 0.62,
  flagHeight: 0.38,
});

export const MACHAIR_RUN_BUNKERS = Object.freeze([
  Object.freeze({
    x: -18.5, z: 172, radiusX: 3.8, radiusZ: 4.1,
    rotation: 0.18, shapeSeed: 0.8, floorRadius: 0.44,
    depthMeters: 1.24, rimHeightMeters: 0.3, style: "revetted-pot",
  }),
  Object.freeze({
    x: 23.5, z: 248, radiusX: 3.5, radiusZ: 3.8,
    rotation: -0.32, shapeSeed: 1.7, floorRadius: 0.4,
    depthMeters: 1.18, rimHeightMeters: 0.28, style: "soft-pot",
  }),
  Object.freeze({
    x: -19, z: 360, radiusX: 3.7, radiusZ: 4.2,
    rotation: 0.08, shapeSeed: 2.9, floorRadius: 0.38,
    depthMeters: 1.34, rimHeightMeters: 0.31, style: "revetted-pot",
  }),
  Object.freeze({
    x: 21, z: 389, radiusX: 3.4, radiusZ: 3.8,
    rotation: -0.17, shapeSeed: 4.2, floorRadius: 0.46,
    depthMeters: 1.28, rimHeightMeters: 0.29, style: "revetted-pot",
  }),
  Object.freeze({
    x: 9.5, z: 327, radiusX: 2.7, radiusZ: 3.2,
    rotation: 0.42, shapeSeed: 5.4, floorRadius: 0.36,
    depthMeters: 1.08, rimHeightMeters: 0.24, style: "soft-pot",
  }),
]);

const bunkerRadiusScale = (bunker, angle) => clamp(
  1 +
    Math.sin(angle * 3 + bunker.shapeSeed) * 0.085 +
    Math.sin(angle * 5 - bunker.shapeSeed * 0.72) * 0.05,
  0.84,
  1.16,
);

const bunkerHeight = (bunker, point) => {
  const dx = point.x - bunker.x;
  const dz = point.z - bunker.z;
  const cosine = Math.cos(bunker.rotation);
  const sine = Math.sin(bunker.rotation);
  const localX = dx * cosine + dz * sine;
  const localZ = -dx * sine + dz * cosine;
  const normalizedX = localX / bunker.radiusX;
  const normalizedZ = localZ / bunker.radiusZ;
  const angle = Math.atan2(normalizedZ, normalizedX);
  const radial = Math.hypot(normalizedX, normalizedZ) /
    bunkerRadiusScale(bunker, angle);
  if (radial >= 1) return 0;
  const floorEdge = -bunker.depthMeters * 0.88;
  if (radial <= bunker.floorRadius) {
    return mix(
      -bunker.depthMeters,
      floorEdge,
      smoothstep(radial / bunker.floorRadius),
    );
  }
  if (radial <= 0.8) {
    return mix(
      floorEdge,
      bunker.rimHeightMeters,
      smoothstep((radial - bunker.floorRadius) / (0.8 - bunker.floorRadius)),
    );
  }
  return mix(
    bunker.rimHeightMeters,
    0,
    smoothstep((radial - 0.8) / 0.2),
  );
};

const machairMacro = (point) => {
  const progress = clamp(point.z / 382, -0.06, 1.12);
  const sweep = sweepingHeight(progress);
  const lateral =
    0.5 * Math.sin(point.x * 0.048 + progress * 5.1) +
    0.16 * Math.sin(point.x * 0.105 - progress * 3.2);
  const shoulder =
    0.42 * Math.exp(-1 * ((progress - 0.48) / 0.24) ** 2) *
    Math.sin((point.x + 5) * 0.075);
  const rollingMounds =
    0.84 * greenContour(point.x, point.z, -12, 136, 22, 38) -
    0.72 * greenContour(point.x, point.z, 9, 218, 25, 43) +
    0.96 * greenContour(point.x, point.z, 15, 290, 24, 35) -
    0.58 * greenContour(point.x, point.z, -8, 330, 26, 28);
  const duneBlend = smoothstep((Math.abs(point.x) - 27) / 34);
  const oldZ = 4 - point.z;
  const dunes = duneBlend * (
    1.05 +
    0.72 * Math.sin(oldZ * 0.031 + Math.abs(point.x) * 0.064) +
    0.28 * Math.sin(oldZ * 0.071 - point.x * 0.043)
  );
  return sweep + lateral + shoulder + rollingMounds + dunes;
};

const machairRawHeight = (point) => {
  const macro = machairMacro(point);
  const teeBlend = plateauBlend(point, { x: 0, z: 0 }, 18, 17, 0.3, 1.5);
  const teePlane = machairMacro({ x: 0, z: 0 });
  let height = mix(macro, teePlane, teeBlend * 0.98);

  const greenX = point.x - 4;
  const greenZ = 382 - point.z;
  const greenFront = smoothstep((point.z - 346) / 12);
  const greenRear = 1 - smoothstep((point.z - 416) / 13);
  const greenSide = 1 - smoothstep((Math.abs(greenX) - 28) / 20);
  const greenBlend = greenFront * greenRear * greenSide;
  const greenDatum = machairMacro({ x: 4, z: 352 }) + 0.14;
  const greenShape =
    greenDatum + greenX * 0.013 - greenZ * 0.005 +
    0.32 * greenContour(greenX, greenZ, -10, 5, 12, 11) -
    0.24 * greenContour(greenX, greenZ, 9, -7, 11, 10) -
    0.14 * greenContour(greenX, greenZ, 0, 15, 16, 7);
  height = mix(height, greenShape, greenBlend);

  const bankApproach = smoothstep((point.z - 400) / 5);
  height += bankApproach * (
    1.38 * greenContour(greenX, greenZ, -2, -31, 20, 9.25) +
    0.2 * greenContour(greenX, greenZ, 12, -25, 11, 9)
  );

  for (const bunker of MACHAIR_RUN_BUNKERS) {
    height += bunkerHeight(bunker, point);
  }
  return height;
};

const MACHAIR_DATUM = machairRawHeight({ x: 0, z: 0 });

export function machairRunSurfaceElevationAt(x, z) {
  if (![x, z].every(Number.isFinite)) {
    throw new RangeError("Terrain coordinates must be finite.");
  }
  return machairRawHeight({ x, z }) - MACHAIR_DATUM;
}

const freezePoints = (points) => Object.freeze(
  points.map(({ x, z }) => Object.freeze({ x, z })),
);

const coursePoints = (points) => freezePoints(
  points.map(({ x, z }) => ({ x, z: 4 - z })),
);

const bunkerPoints = (feature, segments = 48) => freezePoints(
  Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * TAU;
    const radiusScale = bunkerRadiusScale(feature, angle);
    const localX = Math.cos(angle) * feature.radiusX * radiusScale;
    const localZ = Math.sin(angle) * feature.radiusZ * radiusScale;
    const cosine = Math.cos(feature.rotation);
    const sine = Math.sin(feature.rotation);
    return {
      x: feature.x + localX * cosine - localZ * sine,
      z: feature.z + localX * sine + localZ * cosine,
    };
  }),
);

export const MACHAIR_RUN_ROUGH_POINTS = coursePoints([
  { x: -88, z: 22 },
  { x: 88, z: 22 },
  { x: 88, z: -418 },
  { x: -88, z: -418 },
]);

export const MACHAIR_RUN_FAIRWAY_POINTS = coursePoints([
  { x: -18, z: 12 }, { x: 18, z: 12 }, { x: 26, z: -54 },
  { x: 22, z: -104 }, { x: 31, z: -150 }, { x: 28, z: -205 },
  { x: 38, z: -252 }, { x: 32, z: -303 }, { x: 25, z: -340 },
  { x: 17, z: -356 }, { x: -13, z: -350 }, { x: -25, z: -316 },
  { x: -29, z: -268 }, { x: -23, z: -220 }, { x: -31, z: -172 },
  { x: -24, z: -112 }, { x: -25, z: -52 },
]);

export const MACHAIR_RUN_BACK_BANK_POINTS = coursePoints([
  { x: -24, z: -394 },
  { x: 24, z: -394 },
  { x: 38, z: -414 },
  { x: -32, z: -418 },
]);

export const MACHAIR_RUN_GREEN_POINTS = coursePoints([
  { x: -16, z: -350 }, { x: 12, z: -348 }, { x: 25, z: -362 },
  { x: 25, z: -384 }, { x: 15, z: -399 }, { x: -8, z: -404 },
  { x: -24, z: -389 }, { x: -24, z: -367 },
]);

export const MACHAIR_RUN_BUNKER_POINTS = Object.freeze(
  MACHAIR_RUN_BUNKERS.map((bunker) => bunkerPoints(bunker)),
);

export const MACHAIR_RUN_WALL_POINTS = freezePoints([
  { x: -40, z: 108 },
  { x: -43, z: 209 },
  { x: -38, z: 326 },
]);

export function machairRunCenterAt(z) {
  const progress = clamp(z / 382, 0, 1);
  return Math.sin(progress * Math.PI * 1.7) * 8 + progress * 5;
}

export function machairRunFairwayHalfWidthAt(z) {
  const progress = clamp(z / 382, 0, 1);
  if (progress < 0.12) return mix(6, 25, progress / 0.12);
  if (progress > 0.84) return mix(25, 14, (progress - 0.84) / 0.16);
  return 25 + Math.sin(progress * Math.PI * 4.2) * 3.2;
}

export const MACHAIR_RUN_TREE_POSITIONS = Object.freeze([
]);

export const MACHAIR_RUN_STRATEGY_PATHS = Object.freeze([
  Object.freeze({
    color: "#f0d36a",
    points: freezePoints([
      { x: 0, z: 4 }, { x: 12, z: 102 }, { x: 17, z: 204 }, { x: 10, z: 302 },
    ]),
  }),
  Object.freeze({
    color: "#cfe4dc",
    points: freezePoints([
      { x: 0, z: 4 }, { x: -9, z: 112 }, { x: -4, z: 222 }, { x: 4, z: 318 },
    ]),
  }),
]);

export const MACHAIR_RUN_WORLD = Object.freeze({
  id: "machair-run",
  label: "Machair Run",
  lengthMeters: 382,
  tee: Object.freeze({ x: 0, z: 0 }),
  pin: MACHAIR_RUN_PIN,
  greenPresentation: MACHAIR_RUN_GREEN_PRESENTATION,
  roughPoints: MACHAIR_RUN_ROUGH_POINTS,
  fairwayPoints: Object.freeze([
    MACHAIR_RUN_FAIRWAY_POINTS,
    MACHAIR_RUN_BACK_BANK_POINTS,
  ]),
  greenPoints: MACHAIR_RUN_GREEN_POINTS,
  bunkers: MACHAIR_RUN_BUNKERS,
  bunkerPoints: MACHAIR_RUN_BUNKER_POINTS,
  waterSurfacePoints: Object.freeze([]),
  waterSurfaceGroups: Object.freeze([]),
  waterLevel: 0,
  waterLevels: Object.freeze([]),
  wallPoints: MACHAIR_RUN_WALL_POINTS,
  barrierPointGroups: Object.freeze([MACHAIR_RUN_WALL_POINTS]),
  treePositions: MACHAIR_RUN_TREE_POSITIONS,
  strategyPaths: MACHAIR_RUN_STRATEGY_PATHS,
  terrainElevationAt: machairRunSurfaceElevationAt,
  greenElevationAt: machairRunSurfaceElevationAt,
  surfaceElevationAt: machairRunSurfaceElevationAt,
  centerAt: machairRunCenterAt,
  fairwayHalfWidthAt: machairRunFairwayHalfWidthAt,
  stripeStartZ: 24,
  stripeEndZ: 350,
  bounds: Object.freeze({ minimumX: -96, maximumX: 96, minimumZ: -20, maximumZ: 426 }),
  overviewCamera: Object.freeze({
    position: Object.freeze({ x: -142, y: 118, z: -62 }),
    target: Object.freeze({ x: 2, y: 1.8, z: 194 }),
    fovDegrees: 47,
    rollDegrees: 0,
    focalShiftY: 0.04,
  }),
  greenDetailCamera: Object.freeze({
    position: Object.freeze({ x: -18, y: machairRunSurfaceElevationAt(-18, 360) + 1.62, z: 360 }),
    target: Object.freeze({ x: 4, y: machairRunSurfaceElevationAt(4, 382) + 0.74, z: 382 }),
    fovDegrees: 25,
    rollDegrees: 0,
    focalShiftX: 0.035,
    focalShiftY: -0.04,
  }),
  palette: Object.freeze({
    skyTop: "#75a5ba",
    skyMiddle: "#bed3cc",
    skyHorizon: "#f1d4a0",
    horizon: "#9a8c62",
    landscapeTop: "#a0925d",
    landscapeMiddle: "#746e46",
    landscapeBottom: "#3f4930",
    roughTop: "#b6a66d",
    roughMiddle: "#8d8255",
    roughBottom: "#555b39",
    fairwayTop: "#bcb980",
    fairwayMiddle: "#9c9c67",
    fairwayBottom: "#6d774a",
    fringe: "#7b7d4e",
    greenTop: "#c2c68d",
    greenMiddle: "#a9ae75",
    greenBottom: "#83905a",
    fairwayStripeLight: "rgba(231,219,148,.14)",
    fairwayStripeDark: "rgba(75,88,47,.1)",
    duneHighlight: "rgba(244,216,143,.1)",
    duneShadow: "rgba(54,57,34,.11)",
    distantRidge: "rgba(123,109,69,.28)",
  }),
});
