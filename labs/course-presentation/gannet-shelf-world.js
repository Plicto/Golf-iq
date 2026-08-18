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

const contour = (x, z, centerX, centerZ, radiusX, radiusZ) =>
  Math.exp(-1 * (
    ((x - centerX) / radiusX) ** 2 +
    ((z - centerZ) / radiusZ) ** 2
  ));

const plateauBlend = (point, center, radiusX, radiusZ, inner = 0.58, outer = 1.45) => {
  const radial = Math.hypot(
    (point.x - center.x) / radiusX,
    (point.z - center.z) / radiusZ,
  );
  return 1 - smootherstep((radial - inner) / (outer - inner));
};

export const GANNET_SHELF_PIN = Object.freeze({ x: -9, y: 0, z: 176 });

export const GANNET_SHELF_GREEN_PRESENTATION = Object.freeze({
  center: Object.freeze({ x: -6, z: 171 }),
  radiusX: 20,
  radiusZ: 25,
  cupDiameter: 0.10795,
  flagstickHeight: 2.15,
  flagWidth: 0.62,
  flagHeight: 0.38,
});

export const GANNET_SHELF_BUNKERS = Object.freeze([
  Object.freeze({
    x: -6, z: 143, radiusX: 3.2, radiusZ: 4.1,
    rotation: 0.28, shapeSeed: 0.9, floorRadius: 0.38,
    depthMeters: 1.22, rimHeightMeters: 0.26, style: "revetted-pot",
  }),
  Object.freeze({
    x: 15, z: 158, radiusX: 4.4, radiusZ: 5.2,
    rotation: -0.34, shapeSeed: 2.1, floorRadius: 0.46,
    depthMeters: 0.98, rimHeightMeters: 0.2, style: "soft-pot",
  }),
  Object.freeze({
    x: -24, z: 183, radiusX: 3.7, radiusZ: 4.8,
    rotation: 0.14, shapeSeed: 3.6, floorRadius: 0.4,
    depthMeters: 1.3, rimHeightMeters: 0.28, style: "revetted-pot",
  }),
  Object.freeze({
    x: 6, z: 192, radiusX: 2.7, radiusZ: 3.3,
    rotation: -0.18, shapeSeed: 4.8, floorRadius: 0.44,
    depthMeters: 1.08, rimHeightMeters: 0.23, style: "soft-pot",
  }),
]);

const bunkerRadiusScale = (bunker, angle) => clamp(
  1 +
    Math.sin(angle * 3 + bunker.shapeSeed) * 0.09 +
    Math.sin(angle * 5 - bunker.shapeSeed * 0.68) * 0.05,
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

const shelfMacro = (point) => {
  const progress = clamp(point.z / 176, -0.1, 1.24);
  const climb = 1.45 * smootherstep(progress);
  const longRoll =
    0.84 * Math.sin(progress * Math.PI * 2.15 - 0.35) +
    0.36 * Math.sin(progress * Math.PI * 4.7 + point.x * 0.035);
  const lateral =
    0.38 * Math.sin(point.x * 0.075 + progress * 2.8) +
    0.18 * Math.sin(point.x * 0.14 - progress * 4.1);
  const rightShoulder =
    1.08 * contour(point.x, point.z, 28, 132, 25, 50) +
    0.66 * contour(point.x, point.z, 38, 184, 29, 35);
  const duneCrown =
    0.72 * contour(point.x, point.z, -18, 164, 26, 39) -
    0.34 * contour(point.x, point.z, 4, 149, 17, 24);
  return climb + longRoll + lateral + rightShoulder + duneCrown;
};

const shelfRawHeight = (point) => {
  const macro = shelfMacro(point);
  const teeBlend = plateauBlend(point, { x: 0, z: 0 }, 18, 15, 0.26, 1.46);
  const teePlane = shelfMacro({ x: 0, z: 0 });
  let height = mix(macro, teePlane, teeBlend * 0.98);

  const greenX = point.x + 6;
  const greenZ = 171 - point.z;
  const greenFront = smoothstep((point.z - 138) / 12);
  const greenRear = 1 - smoothstep((point.z - 208) / 13);
  const greenSide = 1 - smoothstep((Math.abs(greenX) - 28) / 17);
  const greenBlend = greenFront * greenRear * greenSide;
  const greenDatum = shelfMacro({ x: -6, z: 151 }) + 0.18;
  const greenShape =
    greenDatum + greenX * 0.011 - greenZ * 0.0065 +
    0.26 * contour(greenX, greenZ, 11, 4, 11, 12) -
    0.22 * contour(greenX, greenZ, -8, -7, 10, 10) -
    0.13 * contour(greenX, greenZ, 1, 15, 17, 8);
  height = mix(height, greenShape, greenBlend);

  const duneEdge = smoothstep((point.z - 132) / 20) *
    (1 - smoothstep((point.x + 8) / 19));
  height += duneEdge * 0.34;

  for (const bunker of GANNET_SHELF_BUNKERS) {
    height += bunkerHeight(bunker, point);
  }
  return height;
};

const GANNET_DATUM = shelfRawHeight({ x: 0, z: 0 });

export function gannetShelfSurfaceElevationAt(x, z) {
  if (![x, z].every(Number.isFinite)) {
    throw new RangeError("Terrain coordinates must be finite.");
  }
  return shelfRawHeight({ x, z }) - GANNET_DATUM;
}

const freezePoints = (points) => Object.freeze(
  points.map(({ x, z }) => Object.freeze({ x, z })),
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

export const GANNET_SHELF_ROUGH_POINTS = freezePoints([
  { x: -86, z: -18 },
  { x: 86, z: -18 },
  { x: 86, z: 218 },
  { x: -86, z: 218 },
]);

export const GANNET_SHELF_APRON_POINTS = freezePoints([
  { x: 5, z: 111 }, { x: 35, z: 116 }, { x: 43, z: 149 },
  { x: 39, z: 186 }, { x: 14, z: 202 }, { x: -1, z: 183 },
  { x: -1, z: 149 },
]);

export const GANNET_SHELF_GREEN_POINTS = freezePoints([
  { x: -25, z: 151 }, { x: -7, z: 146 }, { x: 9, z: 156 },
  { x: 14, z: 177 }, { x: 3, z: 193 }, { x: -17, z: 196 },
  { x: -29, z: 181 },
]);

export const GANNET_SHELF_WATER_POINTS = freezePoints([
  { x: -86, z: 72 }, { x: -56, z: 74 }, { x: -25, z: 79 },
  { x: 5, z: 82 }, { x: 35, z: 80 }, { x: 65, z: 84 },
  { x: 86, z: 88 }, { x: 86, z: 95 }, { x: 64, z: 91 },
  { x: 34, z: 87 }, { x: 4, z: 89 }, { x: -26, z: 86 },
  { x: -57, z: 81 }, { x: -86, z: 78 },
]);

export const GANNET_SHELF_WATER_LEVEL =
  gannetShelfSurfaceElevationAt(0, 85) - 0.3;

export const GANNET_SHELF_WATER_SURFACE_POINTS = Object.freeze(
  GANNET_SHELF_WATER_POINTS.map(({ x, z }) =>
    Object.freeze({ x, y: GANNET_SHELF_WATER_LEVEL, z }),
  ),
);

export const GANNET_SHELF_BUNKER_POINTS = Object.freeze(
  GANNET_SHELF_BUNKERS.map((bunker) => bunkerPoints(bunker)),
);

export function gannetShelfCenterAt(z) {
  const progress = clamp((z - 111) / 82, 0, 1);
  return mix(17, 8, progress) + Math.sin(progress * Math.PI) * 2.5;
}

export function gannetShelfFairwayHalfWidthAt(z) {
  const progress = clamp((z - 111) / 82, 0, 1);
  return mix(11, 19, smoothstep(progress));
}

export const GANNET_SHELF_TREE_POSITIONS = Object.freeze([]);

export const GANNET_SHELF_STRATEGY_PATHS = Object.freeze([
  Object.freeze({
    color: "#f0d36a",
    points: freezePoints([
      { x: 0, z: 3 }, { x: -4, z: 58 }, { x: -8, z: 118 }, { x: -9, z: 176 },
    ]),
  }),
  Object.freeze({
    color: "#cfe4dc",
    points: freezePoints([
      { x: 0, z: 3 }, { x: 10, z: 58 }, { x: 21, z: 119 }, { x: 15, z: 166 },
    ]),
  }),
]);

export const GANNET_SHELF_WORLD = Object.freeze({
  id: "gannet-shelf",
  label: "Gannet Shelf",
  lengthMeters: 176,
  tee: Object.freeze({ x: 0, z: 0 }),
  pin: GANNET_SHELF_PIN,
  greenPresentation: GANNET_SHELF_GREEN_PRESENTATION,
  roughPoints: GANNET_SHELF_ROUGH_POINTS,
  fairwayPoints: Object.freeze([GANNET_SHELF_APRON_POINTS]),
  greenPoints: GANNET_SHELF_GREEN_POINTS,
  bunkers: GANNET_SHELF_BUNKERS,
  bunkerPoints: GANNET_SHELF_BUNKER_POINTS,
  waterSurfacePoints: GANNET_SHELF_WATER_SURFACE_POINTS,
  waterSurfaceGroups: Object.freeze([GANNET_SHELF_WATER_SURFACE_POINTS]),
  waterLevel: GANNET_SHELF_WATER_LEVEL,
  waterLevels: Object.freeze([GANNET_SHELF_WATER_LEVEL]),
  wallPoints: Object.freeze([]),
  barrierPointGroups: Object.freeze([]),
  treePositions: GANNET_SHELF_TREE_POSITIONS,
  strategyPaths: GANNET_SHELF_STRATEGY_PATHS,
  terrainElevationAt: gannetShelfSurfaceElevationAt,
  greenElevationAt: gannetShelfSurfaceElevationAt,
  surfaceElevationAt: gannetShelfSurfaceElevationAt,
  centerAt: gannetShelfCenterAt,
  fairwayHalfWidthAt: gannetShelfFairwayHalfWidthAt,
  stripeStartZ: 113,
  stripeEndZ: 193,
  bounds: Object.freeze({ minimumX: -92, maximumX: 92, minimumZ: -22, maximumZ: 224 }),
  overviewCamera: Object.freeze({
    position: Object.freeze({ x: -108, y: 76, z: -34 }),
    target: Object.freeze({ x: -1, y: 1.7, z: 92 }),
    fovDegrees: 47,
    rollDegrees: 0,
    focalShiftY: 0.04,
  }),
  greenDetailCamera: Object.freeze({
    position: Object.freeze({ x: 18, y: gannetShelfSurfaceElevationAt(18, 151) + 1.62, z: 151 }),
    target: Object.freeze({ x: -9, y: gannetShelfSurfaceElevationAt(-9, 176) + 0.74, z: 176 }),
    fovDegrees: 25,
    rollDegrees: 0,
    focalShiftX: 0.035,
    focalShiftY: -0.04,
  }),
  palette: Object.freeze({
    skyTop: "#6f9fb8",
    skyMiddle: "#b8d0cf",
    skyHorizon: "#f0d6a4",
    horizon: "#918b65",
    landscapeTop: "#9b915e",
    landscapeMiddle: "#706d48",
    landscapeBottom: "#3c4933",
    roughTop: "#b1a36c",
    roughMiddle: "#887f55",
    roughBottom: "#515a3a",
    fairwayTop: "#b7ba80",
    fairwayMiddle: "#979e69",
    fairwayBottom: "#68784c",
    fringe: "#727d50",
    greenTop: "#bdc68e",
    greenMiddle: "#a3af78",
    greenBottom: "#7d915e",
    fairwayStripeLight: "rgba(230,220,151,.14)",
    fairwayStripeDark: "rgba(70,91,50,.1)",
    duneHighlight: "rgba(244,217,146,.1)",
    duneShadow: "rgba(51,59,38,.11)",
    distantRidge: "rgba(116,108,73,.27)",
  }),
});
