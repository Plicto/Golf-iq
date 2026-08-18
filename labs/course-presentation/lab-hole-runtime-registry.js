import {
  LAB_HOLE_RUNTIME_COORDINATE_SYSTEM,
  LAB_HOLE_RUNTIME_SCHEMA_VERSION,
  defineLabHoleRuntimeV1,
} from "./lab-hole-runtime-v1.js";

const freezePoint = ({ x, z }) => Object.freeze({ x, z });

const freezeAim = (aim) => Object.freeze({
  tee: freezePoint(aim.tee),
  balanced: freezePoint(aim.balanced),
  safe: freezePoint(aim.safe),
  routes: Object.freeze({
    "safe-right": freezePoint(aim.routes["safe-right"]),
    "aggressive-left": freezePoint(aim.routes["aggressive-left"]),
  }),
  lateralLimit: Object.freeze({ ...aim.lateralLimit }),
});

const freezePresentation = (presentation) => Object.freeze({ ...presentation });

const freezeCourse = (course) => Object.freeze({
  ...course,
  wind: Object.freeze({ ...course.wind }),
  aim: freezeAim(course.aim),
  fairwaySurfaceIds: Object.freeze([...course.fairwaySurfaceIds]),
  barrier: course.barrier ? Object.freeze({ ...course.barrier }) : null,
  presentation: freezePresentation(course.presentation),
});

export const LAB_RECOVERY_HOLE_RUNTIME_IDS = Object.freeze([
  "north-inlet",
  "machair-run",
  "gannet-shelf",
]);

export const LAB_RECOVERY_HOLE_CONFIG = Object.freeze({
  "north-inlet": freezeCourse({
    id: "north-inlet",
    contentRevision: "north-inlet-content-v3",
    layoutId: "north-inlet-presentation",
    scenarioId: "course-one-hole-one",
    holeLabel: "Hole One",
    label: "North Inlet",
    par: 4,
    openingClub: "Driver",
    courseArchetype: "links",
    physicsVersion: "north-inlet-dry-links-contact-v3",
    terrainVersion: "north-inlet-dry-links-world-v3",
    roundSeed: 20260810,
    wind: {
      speed: 3.8,
      towardDegrees: 198,
      label: "3.8 m/s · helping from left",
    },
    aim: {
      tee: { x: -6, z: 257 },
      balanced: { x: 8.5, z: 389 },
      safe: { x: 2, z: 384 },
      routes: {
        "safe-right": { x: -8, z: 260 },
        "aggressive-left": { x: 17, z: 272 },
      },
      lateralLimit: { tee: 80, approach: 80 },
    },
    roughSurfaceId: "north-inlet-lab-rough",
    fairwaySurfaceIds: ["north-inlet-lab-fairway"],
    greenSurfaceId: "north-inlet-lab-green",
    bunkerSurfacePrefix: "north-inlet-lab-bunker",
    waterSurfaceId: "north-inlet-lab-water",
    waterBodyId: "north-inlet-lab-water-body",
    barrier: null,
    presentation: {
      sky: "#70a4bd",
      horizon: "#9a9166",
      rough: "#887e4f",
      fairway: "#969b62",
      green: "#a4ae71",
      bunker: "#d7bd82",
      water: "#376b70",
      accent: "#f2d274",
      atmosphere: "open",
    },
  }),
  "machair-run": freezeCourse({
    id: "machair-run",
    contentRevision: "machair-run-content-v3",
    layoutId: "machair-run-presentation",
    scenarioId: "course-one-hole-two",
    holeLabel: "Hole Two",
    label: "Machair Run",
    par: 4,
    openingClub: "Driver",
    courseArchetype: "links",
    physicsVersion: "machair-run-dry-links-contact-v3",
    terrainVersion: "machair-run-dry-links-world-v3",
    roundSeed: 20260810,
    wind: {
      speed: 5.2,
      towardDegrees: 286,
      label: "5.2 m/s · crossing from right",
    },
    aim: {
      tee: { x: 14, z: 210 },
      balanced: { x: 4, z: 382 },
      safe: { x: 10, z: 370 },
      routes: {
        "safe-right": { x: 14, z: 210 },
        "aggressive-left": { x: -8, z: 226 },
      },
      lateralLimit: { tee: 88, approach: 88 },
    },
    roughSurfaceId: "machair-run-lab-rough",
    fairwaySurfaceIds: [
      "machair-run-lab-fairway",
      "machair-run-lab-back-bank",
    ],
    greenSurfaceId: "machair-run-lab-green",
    bunkerSurfacePrefix: "machair-run-lab-bunker",
    waterSurfaceId: null,
    waterBodyId: null,
    barrier: {
      id: "machair-run-lab-stone-wall",
      kind: "stone-wall",
      heightMeters: 0.88,
      baseLevelMeters: null,
      thicknessMeters: 0.64,
      normalRestitution: 0.36,
      tangentialRetention: 0.78,
    },
    presentation: {
      sky: "#75a5ba",
      horizon: "#9a8c62",
      rough: "#8d8255",
      fairway: "#9c9c67",
      green: "#a9ae75",
      bunker: "#d6ba7c",
      water: "#4e7778",
      accent: "#f2d485",
      atmosphere: "salt-wind",
    },
  }),
  "gannet-shelf": freezeCourse({
    id: "gannet-shelf",
    contentRevision: "gannet-shelf-content-v3",
    layoutId: "gannet-shelf-presentation",
    scenarioId: "course-one-hole-three",
    holeLabel: "Hole Three",
    label: "Gannet Shelf",
    par: 3,
    openingClub: "5 iron",
    courseArchetype: "links",
    physicsVersion: "gannet-shelf-dry-links-contact-v3",
    terrainVersion: "gannet-shelf-dry-links-world-v3",
    roundSeed: 20260810,
    wind: {
      speed: 6.1,
      towardDegrees: 104,
      label: "6.1 m/s · hard from left",
    },
    aim: {
      tee: { x: 15, z: 166 },
      balanced: { x: -9, z: 176 },
      safe: { x: 15, z: 166 },
      routes: {
        "safe-right": { x: 15, z: 166 },
        "aggressive-left": { x: -9, z: 176 },
      },
      lateralLimit: { tee: 86, approach: 86 },
    },
    roughSurfaceId: "gannet-shelf-lab-rough",
    fairwaySurfaceIds: ["gannet-shelf-lab-apron"],
    greenSurfaceId: "gannet-shelf-lab-green",
    bunkerSurfacePrefix: "gannet-shelf-lab-bunker",
    waterSurfaceId: "gannet-shelf-lab-water",
    waterBodyId: "gannet-shelf-lab-water-body",
    barrier: null,
    presentation: {
      sky: "#6f9fb8",
      horizon: "#918b65",
      rough: "#887f55",
      fairway: "#979e69",
      green: "#a3af78",
      bunker: "#d6bb80",
      water: "#3b6870",
      accent: "#f2d486",
      atmosphere: "salt-wind",
    },
  }),
});

const assertFinitePoint = (point, label) => {
  if (!point || ![point.x, point.z].every(Number.isFinite)) {
    throw new TypeError(`${label} must use finite course coordinates`);
  }
};

const assertLabHoleWorld = (config, world) => {
  if (!world || world.id !== config.id) {
    throw new RangeError(`Missing lab hole world: ${config.id}`);
  }
  if (world.label !== config.label) {
    throw new RangeError(`Course label drift: ${config.id}`);
  }
  assertFinitePoint(world.tee, `${config.id} tee`);
  assertFinitePoint(world.pin, `${config.id} pin`);
  if (
    typeof world.terrainElevationAt !== "function" ||
    typeof world.surfaceElevationAt !== "function" ||
    !world.bounds ||
    world.roughPoints.length < 3 ||
    world.fairwayPoints.length < 1 ||
    world.greenPoints.length < 3
  ) {
    throw new TypeError(`Incomplete lab hole world: ${config.id}`);
  }
  if (config.fairwaySurfaceIds.length !== world.fairwayPoints.length) {
    throw new RangeError(`Fairway surface drift: ${config.id}`);
  }
  if (
    (config.waterSurfaceId === null) !==
      (world.waterSurfacePoints.length === 0) ||
    (config.waterBodyId === null) !== (config.waterSurfaceId === null)
  ) {
    throw new RangeError(`Water surface drift: ${config.id}`);
  }
  if ((config.barrier === null) !== (world.wallPoints.length === 0)) {
    throw new RangeError(`Barrier drift: ${config.id}`);
  }
  const measuredLength = Math.hypot(
    world.pin.x - world.tee.x,
    world.pin.z - world.tee.z,
  );
  if (world.lengthMeters + 0.75 < measuredLength) {
    throw new RangeError(`Course length is shorter than tee to pin: ${config.id}`);
  }
};

const freezePoints = (points) => Object.freeze(
  points.map((point) => freezePoint(point)),
);

const courseSurface = (id, kind, points) => Object.freeze({
  id,
  kind,
  points: freezePoints(points),
});

const createGeometry = (config, world) => {
  const waterSurfaces = config.waterSurfaceId === null
    ? []
    : [courseSurface(
        config.waterSurfaceId,
        "water",
        world.waterSurfacePoints,
      )];
  const bunkerSurfaces = world.bunkerPoints.map((points, index) =>
    courseSurface(
      `${config.bunkerSurfacePrefix}-${index + 1}`,
      "bunker",
      points,
    )
  );
  const fairwaySurfaces = world.fairwayPoints.map((points, index) =>
    courseSurface(config.fairwaySurfaceIds[index], "fairway", points)
  );
  const waterBodies = config.waterBodyId === null ||
      config.waterSurfaceId === null
    ? []
    : [Object.freeze({
        id: config.waterBodyId,
        surfaceId: config.waterSurfaceId,
        levelMeters: world.waterLevel,
      })];
  const barriers = config.barrier === null
    ? []
    : [Object.freeze({
        ...config.barrier,
        points: freezePoints(world.wallPoints),
      })];

  return Object.freeze({
    lengthMeters: world.lengthMeters,
    tee: freezePoint(world.tee),
    pin: freezePoint(world.pin),
    bounds: Object.freeze({ ...world.bounds }),
    surfaces: Object.freeze([
      ...waterSurfaces,
      ...bunkerSurfaces,
      courseSurface(config.greenSurfaceId, "green", world.greenPoints),
      ...fairwaySurfaces,
      courseSurface(config.roughSurfaceId, "rough", world.roughPoints),
    ]),
    bunkerFeatures: Object.freeze(world.bunkers.map((bunker, index) =>
      Object.freeze({
        ...bunker,
        id: `${config.bunkerSurfacePrefix}-${index + 1}`,
        surfaceId: `${config.bunkerSurfacePrefix}-${index + 1}`,
      })
    )),
    waterBodies: Object.freeze(waterBodies),
    barriers: Object.freeze(barriers),
    terrainElevationAt: world.terrainElevationAt,
    surfaceElevationAt: world.surfaceElevationAt,
    greenElevationAt: world.greenElevationAt,
  });
};

const withRetainedWorldCollections = (world) => {
  if (
    Array.isArray(world.waterSurfaceGroups) &&
    Array.isArray(world.waterLevels) &&
    Array.isArray(world.barrierPointGroups)
  ) {
    return world;
  }
  const waterSurfaceGroups = world.waterSurfaceGroups ?? (
    world.waterSurfacePoints.length === 0 ? [] : [world.waterSurfacePoints]
  );
  const barrierPointGroups = world.barrierPointGroups ?? (
    world.wallPoints.length === 0 ? [] : [world.wallPoints]
  );
  const waterLevels = world.waterLevels ?? waterSurfaceGroups.map(
    () => world.waterLevel,
  );
  return Object.freeze({
    ...world,
    waterSurfaceGroups: Object.freeze([...waterSurfaceGroups]),
    waterLevels: Object.freeze([...waterLevels]),
    barrierPointGroups: Object.freeze([...barrierPointGroups]),
  });
};

export const createLabHoleRuntime = (config, sourceWorld) => {
  const world = withRetainedWorldCollections(sourceWorld);
  assertLabHoleWorld(config, world);
  const identity = Object.freeze({
    id: config.id,
    layoutId: config.layoutId,
    scenarioId: config.scenarioId,
    holeLabel: config.holeLabel,
    label: config.label,
  });
  const gameplay = Object.freeze({
    par: config.par,
    openingClub: config.openingClub,
    courseArchetype: config.courseArchetype,
    physicsVersion: config.physicsVersion,
    terrainVersion: config.terrainVersion,
    roundSeed: config.roundSeed,
    wind: config.wind,
    aim: config.aim,
  });
  const geometry = createGeometry(config, world);
  const presentation = Object.freeze({
    ...config.presentation,
    theme: config.presentation,
    palette: world.palette,
    cameras: Object.freeze({
      overview: world.overviewCamera,
      greenDetail: world.greenDetailCamera,
    }),
    treePositions: world.treePositions,
    strategyPaths: world.strategyPaths,
    stripe: Object.freeze({
      startZ: world.stripeStartZ,
      endZ: world.stripeEndZ,
    }),
  });

  return defineLabHoleRuntimeV1({
    ...config,
    schemaVersion: LAB_HOLE_RUNTIME_SCHEMA_VERSION,
    contentRevision: config.contentRevision,
    coordinateSystem: LAB_HOLE_RUNTIME_COORDINATE_SYSTEM,
    identity,
    gameplay,
    geometry,
    presentation,
    layoutPresentation: config.presentation,
    world,
  });
};

export function createLabHoleRuntimeRegistry(worlds) {
  if (
    worlds.length !== LAB_RECOVERY_HOLE_RUNTIME_IDS.length ||
    new Set(worlds.map(({ id }) => id)).size !== worlds.length
  ) {
    throw new RangeError(
      "Lab hole runtime registry requires one unique configured world per id",
    );
  }
  const byId = Object.fromEntries(worlds.map((world) => [world.id, world]));
  const entries = LAB_RECOVERY_HOLE_RUNTIME_IDS.map((id) => {
    const config = LAB_RECOVERY_HOLE_CONFIG[id];
    const world = byId[id];
    return [id, createLabHoleRuntime(config, world)];
  });
  if (Object.keys(byId).length !== entries.length) {
    throw new RangeError("Lab hole runtime registry contains an unconfigured world");
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function labHoleRuntimeConfig(runtimeId) {
  const config = LAB_RECOVERY_HOLE_CONFIG[runtimeId];
  if (!config) {
    throw new RangeError(`Unknown lab hole runtime: ${runtimeId}`);
  }
  return config;
}
