const TAU = Math.PI * 2;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const mix = (from, to, amount) => from + (to - from) * amount;

const smoothstep = (value) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const bunkerRadiusScale = (bunker, angle) => clamp(
  1 +
    Math.sin(angle * 3 + bunker.shapeSeed) * 0.09 +
    Math.sin(angle * 5 - bunker.shapeSeed * 0.7) * 0.055,
  0.83,
  1.17,
);

const bunkerRadial = (bunker, x, z) => {
  const dx = x - bunker.x;
  const dz = z - bunker.z;
  const cosine = Math.cos(bunker.rotation);
  const sine = Math.sin(bunker.rotation);
  const localX = dx * cosine + dz * sine;
  const localZ = -dx * sine + dz * cosine;
  const normalizedX = localX / bunker.radiusX;
  const normalizedZ = localZ / bunker.radiusZ;
  const angle = Math.atan2(normalizedZ, normalizedX);
  return Math.hypot(normalizedX, normalizedZ) /
    bunkerRadiusScale(bunker, angle);
};

const bunkerHeightAt = (bunker, x, z) => {
  const radial = bunkerRadial(bunker, x, z);
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

const buildBunkerBoundary = (bunker, segments = 40) => {
  const cosine = Math.cos(bunker.rotation);
  const sine = Math.sin(bunker.rotation);
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * TAU;
    const radiusScale = bunkerRadiusScale(bunker, angle);
    const localX = Math.cos(angle) * bunker.radiusX * radiusScale;
    const localZ = Math.sin(angle) * bunker.radiusZ * radiusScale;
    return {
      x: bunker.x + localX * cosine - localZ * sine,
      z: bunker.z + localX * sine + localZ * cosine,
    };
  });
};

const buildRibbon = (
  startZ,
  endZ,
  steps,
  centerAt,
  halfWidthAt,
  yOffset = 0,
  elevationAt = terrainElevationAt,
) => {
  const left = [];
  const right = [];
  for (let index = 0; index <= steps; index += 1) {
    const z = mix(startZ, endZ, index / steps);
    const center = centerAt(z);
    const halfWidth = halfWidthAt(z);
    left.push({
      x: center - halfWidth,
      y: elevationAt(center - halfWidth, z) + yOffset,
      z,
    });
    right.push({
      x: center + halfWidth,
      y: elevationAt(center + halfWidth, z) + yOffset,
      z,
    });
  }
  return [...left, ...right.reverse()];
};

const buildEllipse = (
  center,
  radiusX,
  radiusZ,
  segments = 32,
  yOffset = 0,
  elevationAt = terrainElevationAt,
) => {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * TAU;
    const x = center.x + Math.cos(angle) * radiusX;
    const z = center.z + Math.sin(angle) * radiusZ;
    points.push({
      x,
      y: elevationAt(x, z) + yOffset,
      z,
    });
  }
  return points;
};

const freezePoints = (points) => Object.freeze(
  points.map(({ x, z }) => Object.freeze({ x, z })),
);

export const NORTH_INLET_PIN = Object.freeze({ x: 8.5, y: 0, z: 389 });

export const NORTH_INLET_GREEN_PRESENTATION = Object.freeze({
  center: Object.freeze({ x: 7.7, z: 387 }),
  radiusX: 18.4,
  radiusZ: 21.8,
  cupDiameter: 0.10795,
  flagstickHeight: 2.15,
  flagWidth: 0.62,
  flagHeight: 0.38,
});

export const NORTH_INLET_BUNKERS = Object.freeze([
  Object.freeze({
    x: -24, z: 192, radiusX: 4.8, radiusZ: 3.5,
    rotation: 0.24, shapeSeed: 0.7, floorRadius: 0.42,
    depthMeters: 1.18, rimHeightMeters: 0.24, style: "soft-pot",
  }),
  Object.freeze({
    x: 20, z: 310, radiusX: 3.7, radiusZ: 5.1,
    rotation: -0.38, shapeSeed: 1.9, floorRadius: 0.36,
    depthMeters: 1.42, rimHeightMeters: 0.3, style: "revetted-pot",
  }),
  Object.freeze({
    x: -12, z: 371, radiusX: 3.2, radiusZ: 3.8,
    rotation: 0.12, shapeSeed: 3.1, floorRadius: 0.4,
    depthMeters: 1.32, rimHeightMeters: 0.27, style: "revetted-pot",
  }),
  Object.freeze({
    x: 25, z: 391, radiusX: 4.1, radiusZ: 3.3,
    rotation: -0.2, shapeSeed: 4.6, floorRadius: 0.46,
    depthMeters: 1.08, rimHeightMeters: 0.22, style: "soft-pot",
  }),
]);

export const NORTH_INLET_WATER_POINTS = Object.freeze([
  Object.freeze({ x: 30, z: 135 }),
  Object.freeze({ x: 38, z: 164 }),
  Object.freeze({ x: 35, z: 195 }),
  Object.freeze({ x: 45, z: 224 }),
  Object.freeze({ x: 36, z: 269 }),
  Object.freeze({ x: 29, z: 270 }),
  Object.freeze({ x: 33, z: 225 }),
  Object.freeze({ x: 26, z: 195 }),
  Object.freeze({ x: 27, z: 165 }),
  Object.freeze({ x: 23, z: 136 }),
]);

export const STATIC_OVERVIEW_CAMERA = Object.freeze({
  position: { x: -132, y: 112, z: -58 },
  target: { x: 2, y: 1.5, z: 196 },
  fovDegrees: 47,
  rollDegrees: 0,
  focalShiftY: 0.04,
});

export function courseCenterAt(z) {
  return (
    Math.sin(z / 66) * 5.4 +
    Math.sin((z - 75) / 128) * 8.8 +
    Math.max(0, z - 245) * 0.036
  );
}

export function fairwayHalfWidthAt(z) {
  const landingWidth = 24 + Math.sin(z / 43) * 3.2;
  if (z < 44) {
    return mix(5, landingWidth, z / 44);
  }
  if (z > 330) {
    return mix(landingWidth, 12, (z - 330) / 70);
  }
  return landingWidth;
}

export function roughHalfWidthAt(z) {
  return fairwayHalfWidthAt(z) + 15 + Math.sin(z / 51) * 2;
}

export function terrainElevationAt(x, z) {
  const legacyElevation =
    Math.sin(z / 61) * 1.05 +
    Math.sin((z + x * 1.7) / 34) * 0.52 +
    z * 0.0024;
  const progress = clamp(z / 389, -0.08, 1.14);
  const edgeDunes = smoothstep((Math.abs(x - courseCenterAt(z)) - 31) / 34) * (
    0.94 +
    Math.sin(z * 0.034 + Math.abs(x) * 0.057) * 0.58 +
    Math.sin(z * 0.078 - x * 0.041) * 0.2
  );
  const landingHumps =
    0.86 * Math.exp(-(((x + 15) / 23) ** 2 + ((z - 122) / 45) ** 2)) -
    0.62 * Math.exp(-(((x - 8) / 28) ** 2 + ((z - 205) / 54) ** 2)) +
    0.78 * Math.exp(-(((x - 18) / 24) ** 2 + ((z - 282) / 42) ** 2)) -
    0.44 * Math.exp(-(((x + 4) / 25) ** 2 + ((z - 334) / 31) ** 2));
  const dryLinksElevation =
    Math.sin(progress * Math.PI * 2.15 - 0.28) * 1.16 +
    Math.sin(progress * Math.PI * 4.7 + x * 0.026) * 0.38 +
    Math.sin((z + x * 1.55) / 31) * 0.28 +
    landingHumps +
    edgeDunes +
    z * 0.0021;
  const playableLinksBlend =
    smoothstep((z - 28) / 34) *
    (1 - smoothstep((z - 320) / 34));
  const bunkerHeight = NORTH_INLET_BUNKERS.reduce(
    (height, bunker) => height + bunkerHeightAt(bunker, x, z),
    0,
  );
  return mix(legacyElevation, dryLinksElevation, playableLinksBlend) +
    bunkerHeight;
}

export function greenSurfaceElevationAt(x, z) {
  const { center, radiusX, radiusZ } = NORTH_INLET_GREEN_PRESENTATION;
  const normalizedX = (x - center.x) / radiusX;
  const normalizedZ = (z - center.z) / radiusZ;
  const edgeFade = clamp(1 - normalizedX ** 2 - normalizedZ ** 2, 0, 1);
  const shapedSurface =
    (x - center.x) * 0.007 -
    (z - center.z) * 0.004 +
    Math.sin((x + z) * 0.16) * 0.055;
  return terrainElevationAt(x, z) + shapedSurface * edgeFade;
}

export function isOnNorthInletGreen(x, z) {
  const { center, radiusX, radiusZ } = NORTH_INLET_GREEN_PRESENTATION;
  return (
    ((x - center.x) / radiusX) ** 2 +
      ((z - center.z) / radiusZ) ** 2 <=
    1
  );
}

export function northInletCourseSurfaceElevationAt(x, z) {
  return isOnNorthInletGreen(x, z)
    ? greenSurfaceElevationAt(x, z)
    : terrainElevationAt(x, z);
}

export const NORTH_INLET_WATER_LEVEL = terrainElevationAt(30, 205) - 0.34;

export const NORTH_INLET_WATER_SURFACE_POINTS = Object.freeze(
  NORTH_INLET_WATER_POINTS.map(({ x, z }) =>
    Object.freeze({ x, y: NORTH_INLET_WATER_LEVEL, z }),
  ),
);

export const GREEN_DETAIL_CAMERA = Object.freeze({
  position: Object.freeze({
    x: -10.5,
    y: terrainElevationAt(-10.5, 371) + 1.62,
    z: 371,
  }),
  target: Object.freeze({
    x: NORTH_INLET_PIN.x,
    y: greenSurfaceElevationAt(NORTH_INLET_PIN.x, NORTH_INLET_PIN.z) + 0.74,
    z: NORTH_INLET_PIN.z,
  }),
  fovDegrees: 25,
  rollDegrees: 0,
  focalShiftX: 0.035,
  focalShiftY: -0.04,
});

export const NORTH_INLET_ROUGH_POINTS = freezePoints(
  buildRibbon(0, 410, 52, courseCenterAt, roughHalfWidthAt),
);

export const NORTH_INLET_FAIRWAY_POINTS = freezePoints(
  buildRibbon(4, 365, 52, courseCenterAt, fairwayHalfWidthAt),
);

export const NORTH_INLET_GREEN_POINTS = freezePoints(
  buildEllipse(
    NORTH_INLET_GREEN_PRESENTATION.center,
    NORTH_INLET_GREEN_PRESENTATION.radiusX,
    NORTH_INLET_GREEN_PRESENTATION.radiusZ,
    56,
  ),
);

export const NORTH_INLET_BUNKER_POINTS = Object.freeze(
  NORTH_INLET_BUNKERS.map((bunker) =>
    freezePoints(buildBunkerBoundary(bunker)),
  ),
);

export const NORTH_INLET_STRATEGY_PATHS = Object.freeze([
  Object.freeze({
    color: "#f0d36a",
    points: Object.freeze([
      Object.freeze({ x: 0, z: 5 }),
      Object.freeze({ x: -8, z: 93 }),
      Object.freeze({ x: -13, z: 182 }),
      Object.freeze({ x: -5, z: 276 }),
    ]),
  }),
  Object.freeze({
    color: "#cfe4dc",
    points: Object.freeze([
      Object.freeze({ x: 0, z: 5 }),
      Object.freeze({ x: 11, z: 103 }),
      Object.freeze({ x: 27, z: 198 }),
      Object.freeze({ x: 20, z: 291 }),
    ]),
  }),
]);

export const NORTH_INLET_WORLD = Object.freeze({
  id: "north-inlet",
  label: "North Inlet",
  lengthMeters: 389,
  tee: Object.freeze({ x: 0, z: 0 }),
  pin: NORTH_INLET_PIN,
  greenPresentation: NORTH_INLET_GREEN_PRESENTATION,
  roughPoints: NORTH_INLET_ROUGH_POINTS,
  fairwayPoints: Object.freeze([NORTH_INLET_FAIRWAY_POINTS]),
  greenPoints: NORTH_INLET_GREEN_POINTS,
  bunkers: NORTH_INLET_BUNKERS,
  bunkerPoints: NORTH_INLET_BUNKER_POINTS,
  waterSurfacePoints: NORTH_INLET_WATER_SURFACE_POINTS,
  waterSurfaceGroups: Object.freeze([NORTH_INLET_WATER_SURFACE_POINTS]),
  waterLevel: NORTH_INLET_WATER_LEVEL,
  waterLevels: Object.freeze([NORTH_INLET_WATER_LEVEL]),
  wallPoints: Object.freeze([]),
  barrierPointGroups: Object.freeze([]),
  treePositions: Object.freeze([]),
  strategyPaths: NORTH_INLET_STRATEGY_PATHS,
  terrainElevationAt,
  greenElevationAt: greenSurfaceElevationAt,
  surfaceElevationAt: northInletCourseSurfaceElevationAt,
  centerAt: courseCenterAt,
  fairwayHalfWidthAt,
  stripeStartZ: 28,
  stripeEndZ: 352,
  bounds: Object.freeze({ minimumX: -178, maximumX: 178, minimumZ: -16, maximumZ: 448 }),
  overviewCamera: STATIC_OVERVIEW_CAMERA,
  greenDetailCamera: GREEN_DETAIL_CAMERA,
  palette: Object.freeze({
    skyTop: "#70a4bd",
    skyMiddle: "#b9d2d0",
    skyHorizon: "#f2d8a5",
    horizon: "#9a9166",
    landscapeTop: "#9a8d57",
    landscapeMiddle: "#716b43",
    landscapeBottom: "#3e4930",
    roughTop: "#b0a166",
    roughMiddle: "#887e4f",
    roughBottom: "#535a37",
    fairwayTop: "#b7b77a",
    fairwayMiddle: "#969b62",
    fairwayBottom: "#697747",
    fringe: "#777c4d",
    greenTop: "#bdc58a",
    greenMiddle: "#a4ae71",
    greenBottom: "#7e9057",
    fairwayStripeLight: "rgba(229,219,145,.14)",
    fairwayStripeDark: "rgba(72,91,48,.1)",
    duneHighlight: "rgba(242,216,144,.09)",
    duneShadow: "rgba(52,57,34,.11)",
    distantRidge: "rgba(116,105,65,.28)",
  }),
});
