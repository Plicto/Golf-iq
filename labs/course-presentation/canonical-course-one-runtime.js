import {
  LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
  defineLabHolePresentationV1,
} from "./course-presentation-registry.js";
import { createLabHoleRuntime } from "./lab-hole-runtime-registry.js";

const REGULATION_CUP_DIAMETER_METERS = 0.10795;
const PLACEHOLDER_MARKER = ".runtime-placeholder.";

const PALETTE = Object.freeze({
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
});

const THEME = Object.freeze({
  sky: "#70a4bd",
  horizon: "#9a9166",
  rough: "#887e4f",
  fairway: "#969b62",
  green: "#a4ae71",
  bunker: "#d7bd82",
  water: "#376b70",
  accent: "#f2d274",
  atmosphere: "salt-wind",
});

const WIND_BY_HOLE = Object.freeze({
  1: Object.freeze({ speed: 3.8, towardDegrees: 198, label: "3.8 m/s · helping from left" }),
  2: Object.freeze({ speed: 5.2, towardDegrees: 286, label: "5.2 m/s · crossing from right" }),
  3: Object.freeze({ speed: 5.5, towardDegrees: 112, label: "5.5 m/s · crossing from left" }),
  4: Object.freeze({ speed: 3.6, towardDegrees: 180, label: "3.6 m/s · headwind" }),
  5: Object.freeze({ speed: 2.8, towardDegrees: 180, label: "2.8 m/s · headwind" }),
  6: Object.freeze({ speed: 3.8, towardDegrees: 180, label: "3.8 m/s · headwind" }),
  7: Object.freeze({ speed: 3.2, towardDegrees: 90, label: "3.2 m/s · crossing toward water" }),
  8: Object.freeze({ speed: 0, towardDegrees: 0, label: "Calm" }),
  9: Object.freeze({ speed: 3.6, towardDegrees: 90, label: "3.6 m/s · crossing toward water" }),
});

const PLAYABLE_HOLE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const deepFreeze = (value, seen = new WeakSet()) => {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    seen.has(value)
  ) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
};

const polygonArea = (points) => Math.abs(points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length];
  return area + point.x * next.z - next.x * point.z;
}, 0) / 2);

const polygonBounds = (points) => points.reduce(
  (bounds, point) => ({
    minimumX: Math.min(bounds.minimumX, point.x),
    maximumX: Math.max(bounds.maximumX, point.x),
    minimumZ: Math.min(bounds.minimumZ, point.z),
    maximumZ: Math.max(bounds.maximumZ, point.z),
  }),
  {
    minimumX: Number.POSITIVE_INFINITY,
    maximumX: Number.NEGATIVE_INFINITY,
    minimumZ: Number.POSITIVE_INFINITY,
    maximumZ: Number.NEGATIVE_INFINITY,
  },
);

const pointInPolygon = (point, points) => {
  let inside = false;
  for (let index = 0, prior = points.length - 1; index < points.length; prior = index, index += 1) {
    const current = points[index];
    const previous = points[prior];
    if (
      current.z > point.z !== previous.z > point.z &&
      point.x < ((previous.x - current.x) * (point.z - current.z)) /
        (previous.z - current.z) + current.x
    ) inside = !inside;
  }
  return inside;
};

const centroid = (points) => Object.freeze(points.reduce(
  (total, point) => ({ x: total.x + point.x / points.length, z: total.z + point.z / points.length }),
  { x: 0, z: 0 },
));

const sourceSurfaces = (source) => source.hole.surfaces.filter(
  (surface) =>
    surface.surface !== "boundary" &&
    !surface.id.includes(PLACEHOLDER_MARKER),
);

const primarySurface = (surfaces, kind) => surfaces
  .filter((surface) => surface.surface === kind)
  .sort((left, right) => polygonArea(right.points) - polygonArea(left.points))[0] ?? null;

const strategicTargets = (source) => source.hole.targets
  .filter((target) => target.id !== `${source.canonical.holeId}.green-target`)
  .slice(0, 2);

const boundaryFor = (source) => {
  const boundary = source.hole.surfaces.find((surface) => surface.surface === "boundary");
  if (!boundary) throw new RangeError(`Canonical Course One boundary is missing: ${source.runtimeIdentity.runtimeId}`);
  return boundary;
};

const derivedTeeApron = (source, bounds) => {
  const halfWidth = Math.max(4, Math.min(8, (bounds.maximumX - bounds.minimumX) * 0.07));
  const depth = Math.max(10, Math.min(20, source.hole.designLengthMeters * 0.06));
  const startZ = Math.max(bounds.minimumZ + 0.25, -2);
  const endZ = Math.min(bounds.maximumZ - 0.25, depth);
  return Object.freeze({
    id: `${source.runtimeIdentity.runtimeId}.runtime-apron`,
    surface: "fairway",
    points: Object.freeze([
      Object.freeze({ x: -halfWidth, z: startZ }),
      Object.freeze({ x: halfWidth, z: startZ }),
      Object.freeze({ x: halfWidth * 1.25, z: endZ }),
      Object.freeze({ x: -halfWidth * 1.25, z: endZ }),
    ]),
  });
};

const courseCenterAtFactory = (source) => {
  const points = [...source.hole.centerline].sort((left, right) => left.z - right.z);
  return (z) => {
    if (z <= points[0].z) return points[0].x;
    if (z >= points.at(-1).z) return points.at(-1).x;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      if (z < from.z || z > to.z) continue;
      const span = Math.max(0.0001, to.z - from.z);
      const progress = (z - from.z) / span;
      return from.x + (to.x - from.x) * progress;
    }
    return source.hole.pin.x;
  };
};

const terrainFunctions = (source, greenPoints) => {
  const tee = source.hole.tee;
  const pin = source.hole.pin;
  const forwardSpan = Math.max(1, Math.abs(pin.z - tee.z));
  const direction = pin.z >= tee.z ? 1 : -1;
  const progressAt = (z) => clamp(((z - tee.z) * direction) / forwardSpan, 0, 1);
  const terrainElevationAt = (x, z) => {
    const progress = progressAt(z);
    const envelope = Math.sin(progress * Math.PI);
    return tee.y + (pin.y - tee.y) * progress +
      envelope * (
        Math.sin(progress * Math.PI * 4.2 + x * 0.035) * 0.58 +
        Math.sin((z + x * 1.35) * 0.045) * 0.24
      );
  };
  const greenElevationAt = (x, z) =>
    terrainElevationAt(x, z) +
    (x - pin.x) * 0.004 -
    (z - pin.z) * 0.0025;
  const surfaceElevationAt = (x, z) =>
    pointInPolygon({ x, z }, greenPoints)
      ? greenElevationAt(x, z)
      : terrainElevationAt(x, z);
  return Object.freeze({ terrainElevationAt, greenElevationAt, surfaceElevationAt });
};

const cameraFromAnchor = (anchor, fallbackFov) => Object.freeze({
  position: Object.freeze({ ...anchor.position }),
  target: Object.freeze({ ...anchor.lookAt }),
  fovDegrees: fallbackFov ?? anchor.fieldOfViewDegrees,
  rollDegrees: 0,
  focalShiftX: 0,
  focalShiftY: 0.02,
});

const cameraAnchor = (source, mode) =>
  source.hole.cameraAnchors.find((candidate) => candidate.mode === mode) ?? null;

const bunkerFeature = (surface, index) => {
  const bounds = polygonBounds(surface.points);
  const center = centroid(surface.points);
  return Object.freeze({
    x: center.x,
    z: center.z,
    radiusX: Math.max(0.5, (bounds.maximumX - bounds.minimumX) / 2),
    radiusZ: Math.max(0.5, (bounds.maximumZ - bounds.minimumZ) / 2),
    rotation: 0,
    shapeSeed: index + 0.73,
    floorRadius: 0.42,
    depthMeters: 1.08 + index * 0.08,
    rimHeightMeters: 0.22,
    style: "soft-pot",
  });
};

const createWorld = (source) => {
  const surfaces = sourceSurfaces(source);
  const boundary = boundaryFor(source);
  const bounds = polygonBounds(boundary.points);
  const rough = primarySurface(surfaces, "rough");
  const green = primarySurface(surfaces, "green");
  if (!rough || !green) throw new RangeError(`Canonical Course One land surfaces are incomplete: ${source.runtimeIdentity.runtimeId}`);
  const authoredFairways = surfaces.filter((surface) => surface.surface === "fairway");
  const fairways = authoredFairways.length > 0 ? authoredFairways : [derivedTeeApron(source, bounds)];
  const bunkers = surfaces.filter((surface) => surface.surface === "bunker");
  const waters = surfaces.filter((surface) => surface.surface === "water").slice(0, 1);
  const terrain = terrainFunctions(source, green.points);
  const pin = Object.freeze({ x: source.hole.pin.x, y: source.hole.pin.y, z: source.hole.pin.z });
  const greenRadiusX = Math.max(2, ...green.points.map((point) => Math.abs(point.x - pin.x)));
  const greenRadiusZ = Math.max(2, ...green.points.map((point) => Math.abs(point.z - pin.z)));
  const waterSurfaceGroups = Object.freeze(waters.map((surface) => Object.freeze(
    surface.points.map((point) => Object.freeze({ ...point })),
  )));
  const waterLevels = Object.freeze(waterSurfaceGroups.map((points) => {
    const center = centroid(points);
    return terrain.terrainElevationAt(center.x, center.z) - 0.28;
  }));
  const overviewAnchor = cameraAnchor(source, "establishing");
  const greenAnchor = cameraAnchor(source, "green-reading") ?? cameraAnchor(source, "landing");
  if (!overviewAnchor || !greenAnchor) {
    throw new RangeError(`Canonical Course One cameras are incomplete: ${source.runtimeIdentity.runtimeId}`);
  }
  const centerAt = courseCenterAtFactory(source);
  const fairwayHalfWidth = Math.max(5, Math.min(24, (bounds.maximumX - bounds.minimumX) * 0.18));
  const stripeStartZ = Math.max(bounds.minimumZ, Math.min(source.hole.pin.z * 0.08, source.hole.pin.z - 2));
  const stripeEndZ = Math.min(bounds.maximumZ, Math.max(stripeStartZ + 1, source.hole.pin.z * 0.92));
  const targets = strategicTargets(source);
  const strategyPaths = Object.freeze(targets.map((target, index) => Object.freeze({
    color: index === 0 ? "#f0d36a" : "#cfe4dc",
    points: Object.freeze([
      Object.freeze({ x: 0, z: 0 }),
      Object.freeze({ x: target.position.x, z: target.position.z }),
      Object.freeze({ x: source.hole.pin.x, z: source.hole.pin.z }),
    ]),
  })));
  const directLengthMeters = Math.hypot(pin.x, pin.z);

  return Object.freeze({
    id: source.runtimeIdentity.runtimeId,
    label: `Course One · Hole ${source.canonical.holeNumber}`,
    lengthMeters: Math.max(source.hole.designLengthMeters, directLengthMeters),
    tee: Object.freeze({ x: 0, z: 0 }),
    pin,
    greenPresentation: Object.freeze({
      center: Object.freeze({ x: pin.x, z: pin.z }),
      radiusX: greenRadiusX,
      radiusZ: greenRadiusZ,
      cupDiameter: REGULATION_CUP_DIAMETER_METERS,
      flagstickHeight: 2.15,
      flagWidth: 0.62,
      flagHeight: 0.38,
    }),
    roughPoints: Object.freeze(rough.points.map((point) => Object.freeze({ ...point }))),
    fairwayPoints: Object.freeze(fairways.map((surface) => Object.freeze(
      surface.points.map((point) => Object.freeze({ ...point })),
    ))),
    greenPoints: Object.freeze(green.points.map((point) => Object.freeze({ ...point }))),
    bunkers: Object.freeze(bunkers.map(bunkerFeature)),
    bunkerPoints: Object.freeze(bunkers.map((surface) => Object.freeze(
      surface.points.map((point) => Object.freeze({ ...point })),
    ))),
    waterSurfacePoints: waterSurfaceGroups[0] ?? Object.freeze([]),
    waterSurfaceGroups,
    waterLevel: waterLevels[0] ?? 0,
    waterLevels,
    wallPoints: Object.freeze([]),
    barrierPointGroups: Object.freeze([]),
    treePositions: Object.freeze([]),
    strategyPaths,
    terrainElevationAt: terrain.terrainElevationAt,
    greenElevationAt: terrain.greenElevationAt,
    surfaceElevationAt: terrain.surfaceElevationAt,
    centerAt,
    fairwayHalfWidthAt: () => fairwayHalfWidth,
    stripeStartZ,
    stripeEndZ,
    bounds: Object.freeze({ ...bounds }),
    overviewCamera: cameraFromAnchor(overviewAnchor),
    greenDetailCamera: cameraFromAnchor(greenAnchor),
    palette: PALETTE,
  });
};

const createConfig = (source, world) => {
  const surfaces = sourceSurfaces(source);
  const rough = primarySurface(surfaces, "rough");
  const green = primarySurface(surfaces, "green");
  const authoredFairways = surfaces.filter((surface) => surface.surface === "fairway");
  const fairwaySurfaceIds = authoredFairways.length > 0
    ? authoredFairways.map((surface) => surface.id)
    : [`${source.runtimeIdentity.runtimeId}.runtime-apron`];
  const water = surfaces.find((surface) => surface.surface === "water") ?? null;
  const targetCandidates = strategicTargets(source);
  const balancedTarget = targetCandidates[0]?.position ?? source.hole.pin;
  const aggressiveTarget = targetCandidates[1]?.position ?? source.hole.pin;
  const lateralLimit = Math.max(24, Math.min(90, (world.bounds.maximumX - world.bounds.minimumX) * 0.8));
  return Object.freeze({
    id: source.runtimeIdentity.runtimeId,
    contentRevision: source.runtimeIdentity.contentRevision,
    layoutId: `${source.runtimeIdentity.runtimeId}-presentation`,
    scenarioId: source.runtimeIdentity.runtimeId,
    holeLabel: `Hole ${source.canonical.holeNumber}`,
    label: world.label,
    par: source.hole.par,
    openingClub: source.hole.par === 3 ? "5 iron" : "Driver",
    courseArchetype: "links",
    physicsVersion: "course-one-canonical-links-v1",
    terrainVersion: "course-one-canonical-terrain-v1",
    roundSeed: 20260820 + source.canonical.holeNumber,
    wind: WIND_BY_HOLE[source.canonical.holeNumber] ?? WIND_BY_HOLE[1],
    aim: Object.freeze({
      tee: Object.freeze({ x: 0, z: 0 }),
      balanced: Object.freeze({ x: balancedTarget.x, z: balancedTarget.z }),
      safe: Object.freeze({ x: balancedTarget.x, z: balancedTarget.z }),
      routes: Object.freeze({
        "safe-right": Object.freeze({ x: balancedTarget.x, z: balancedTarget.z }),
        "aggressive-left": Object.freeze({ x: aggressiveTarget.x, z: aggressiveTarget.z }),
      }),
      lateralLimit: Object.freeze({ tee: lateralLimit, approach: lateralLimit }),
    }),
    roughSurfaceId: rough.id,
    fairwaySurfaceIds: Object.freeze(fairwaySurfaceIds),
    greenSurfaceId: green.id,
    bunkerSurfacePrefix: `${source.runtimeIdentity.runtimeId}.bunker`,
    waterSurfaceId: water?.id ?? null,
    waterBodyId: water ? `${source.runtimeIdentity.runtimeId}.water-body` : null,
    barrier: null,
    presentation: THEME,
  });
};

const flybyCamera = (anchor) => Object.freeze({
  position: Object.freeze({ ...anchor.position }),
  target: Object.freeze({ ...anchor.lookAt }),
  positionVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
  targetVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
  fovDegrees: anchor.fieldOfViewDegrees,
  fovVelocityDegreesPerSecond: 0,
  rollDegrees: 0,
  rollVelocityDegreesPerSecond: 0,
  focalShiftY: 0.02,
});

const createFlybys = (source) => {
  const establishing = cameraAnchor(source, "establishing");
  const landing = cameraAnchor(source, "landing");
  const green = cameraAnchor(source, "green-reading") ?? landing;
  if (!establishing || !landing || !green) {
    throw new RangeError(`Canonical Course One flyby cameras are incomplete: ${source.runtimeIdentity.runtimeId}`);
  }
  const runtimeId = source.runtimeIdentity.runtimeId;
  const first = flybyCamera(establishing);
  const middle = flybyCamera(landing);
  const last = flybyCamera(green);
  return Object.freeze({
    fullFlyby: Object.freeze({
      schemaVersion: 1,
      id: `${runtimeId}-cinematic-drone-flyby-v1`,
      durationMs: 7200,
      keyframes: Object.freeze([
        Object.freeze({ timeMs: 0, ...first }),
        Object.freeze({ timeMs: 3600, ...middle }),
        Object.freeze({ timeMs: 7200, ...last }),
      ]),
      events: Object.freeze([
        Object.freeze({ timeMs: 0, type: "flyby-start", stage: "lifting" }),
        Object.freeze({ timeMs: 1200, type: "tee-reveal", stage: "tee" }),
        Object.freeze({ timeMs: 3600, type: "decision-reveal", stage: "decision" }),
        Object.freeze({ timeMs: 6000, type: "green-reveal", stage: "green" }),
        Object.freeze({ timeMs: 7200, type: "flyby-complete", stage: "complete" }),
      ]),
    }),
    reducedFlyby: Object.freeze({
      schemaVersion: 1,
      id: `${runtimeId}-reduced-flyby-v1`,
      durationMs: 2600,
      stills: Object.freeze([
        Object.freeze({
          startMs: 0,
          endMs: 1500,
          stage: "overview",
          camera: Object.freeze({
            position: first.position,
            target: first.target,
            fovDegrees: first.fovDegrees,
            rollDegrees: 0,
            focalShiftY: 0.02,
          }),
        }),
        Object.freeze({
          startMs: 1500,
          endMs: 2600,
          stage: "green",
          camera: Object.freeze({
            position: last.position,
            target: last.target,
            fovDegrees: last.fovDegrees,
            rollDegrees: 0,
            focalShiftY: 0.02,
          }),
        }),
      ]),
    }),
  });
};

const assertCanonicalSource = (source) => {
  if (
    source?.schemaVersion !== 1 ||
    source?.sourceKind !== "canonical" ||
    source?.mappingStatus !== "structural-mapped" ||
    source?.promotionEligible !== false ||
    source?.canonical?.courseId !== "course-one" ||
    !PLAYABLE_HOLE_NUMBERS.includes(source?.canonical?.holeNumber) ||
    typeof source?.runtimeIdentity?.runtimeId !== "string" ||
    typeof source?.runtimeIdentity?.contentRevision !== "string"
  ) {
    throw new TypeError("Canonical Course One runtime source is invalid");
  }
  return source;
};

export function createCanonicalCourseOneHolePackage(input) {
  const source = assertCanonicalSource(input);
  const world = createWorld(source);
  const definition = createLabHoleRuntime(createConfig(source, world), world);
  const { fullFlyby, reducedFlyby } = createFlybys(source);
  const presentation = defineLabHolePresentationV1({
    schemaVersion: LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
    runtimeId: source.runtimeIdentity.runtimeId,
    definition,
    fullFlyby,
    reducedFlyby,
  });
  return deepFreeze({
    schemaVersion: 1,
    descriptor: {
      schemaVersion: 1,
      sourceKind: "canonical",
      mappingStatus: source.mappingStatus,
      promotionEligible: source.promotionEligible,
      packageId: "course-one.playable-slice",
      packageVersion: "1.0.0",
      runtimeId: source.runtimeIdentity.runtimeId,
      contentRevision: source.runtimeIdentity.contentRevision,
      canonicalCourseId: source.canonical.courseId,
      canonicalHoleId: source.canonical.holeId,
      compatibilityScenarioAlias: source.runtimeIdentity.runtimeId,
      runtimeOrder: source.canonical.holeNumber,
    },
    definition,
    presentation,
  });
}
