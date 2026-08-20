import { COURSE_ONE_AUTHORED } from './courseOneAuthoredCourse.js';
import type { AuthoredCourseHoleV1, AuthoredHolePoint } from './authoredCourseHole.js';
import type { GameplaySurfaceKind } from './gameplaySurfaceShapes.js';
import { validateCoursePackage, type ValidatedCoursePackageV1 } from './courseValidator.js';

const COURSE_ONE_ASSET_IDS = Object.freeze({
  environment: 'course-one.environment',
  terrain: 'course-one.terrain',
  collision: 'course-one.collision',
  contour: 'course-one.contour'
});

const COURSE_ONE_ASSET_HASHES = Object.freeze({
  environment: 'sha256:80af5f14ab9e0c0d4951a9a24a8f98551d6508ae112c268a6feee162946409c0',
  terrain: 'sha256:12446b68e985503db0c9a3ef47f7c4259c359c931e4d6bd65490bf1596b59a30',
  collision: 'sha256:bd87c529d09e04bf432dd7e286010708e56d6da42075437a33e39915b11b0afe',
  contour: 'sha256:a83fc2aae803bc3599081c6bb58081bd34aeb5d955b759db2649868b77306309'
});

const SURFACE_PRIORITY: Readonly<Record<GameplaySurfaceKind, number>> = Object.freeze({
  boundary: 0,
  rough: 10,
  fairway: 20,
  green: 50,
  bunker: 60,
  water: 70
});

const REQUIRED_SURFACES: ReadonlyArray<GameplaySurfaceKind> = Object.freeze([
  'fairway',
  'rough',
  'green',
  'bunker',
  'water',
  'boundary'
]);

function signedArea(points: ReadonlyArray<AuthoredHolePoint>): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (point && next) twiceArea += point.x * next.z - next.x * point.z;
  }
  return twiceArea / 2;
}

function counterClockwise(points: ReadonlyArray<AuthoredHolePoint>): ReadonlyArray<AuthoredHolePoint> {
  const copied = points.map((point) => ({ ...point }));
  return signedArea(copied) > 0 ? copied : copied.reverse();
}

function gameplaySurface(kind: AuthoredCourseHoleV1['surfaces'][number]['kind']): GameplaySurfaceKind {
  return kind === 'native' ? 'rough' : kind;
}

function behavior(surface: GameplaySurfaceKind): 'solid' | 'hazard' | 'boundary' {
  if (surface === 'water') return 'hazard';
  if (surface === 'boundary') return 'boundary';
  return 'solid';
}

function boundaryPoints(hole: Readonly<AuthoredCourseHoleV1>): ReadonlyArray<AuthoredHolePoint> {
  return [
    { x: hole.bounds.minimumX, z: hole.bounds.minimumZ },
    { x: hole.bounds.maximumX, z: hole.bounds.minimumZ },
    { x: hole.bounds.maximumX, z: hole.bounds.maximumZ },
    { x: hole.bounds.minimumX, z: hole.bounds.maximumZ }
  ];
}

function placeholderPoints(holeNumber: number, surface: GameplaySurfaceKind): ReadonlyArray<AuthoredHolePoint> {
  const surfaceIndex = REQUIRED_SURFACES.indexOf(surface);
  const x = 9_000 + holeNumber * 70 + surfaceIndex * 8;
  const z = 9_000 + holeNumber * 70;
  return [
    { x, z },
    { x: x + 3, z },
    { x: x + 3, z: z + 3 },
    { x, z: z + 3 }
  ];
}

function greenElevation(hole: Readonly<AuthoredCourseHoleV1>): number {
  return hole.cameras.find((camera) => camera.mode === 'green-reading')?.lookAt.y ?? 0;
}

function courseTeeId(teeId: string): string {
  return teeId;
}

function teeConfigurationId(holeId: string, teeId: string): string {
  return `${holeId}.${teeId}.setup`;
}

function pinSetId(holeId: string): string {
  return `${holeId}.pins`;
}

function pinId(holeId: string, authoredPinId: string): string {
  return `${holeId}.${authoredPinId}`;
}

function runtimeId(holeNumber: number): string {
  return `course-one-hole-${holeNumber}`;
}

function surfaceShapeSet(hole: Readonly<AuthoredCourseHoleV1>) {
  const authoredShapes = hole.surfaces.map((surface) => {
    const surfaceKind = gameplaySurface(surface.kind);
    return {
      id: `${hole.id}.${surface.id}`,
      surface: surfaceKind,
      priority: SURFACE_PRIORITY[surfaceKind],
      behavior: behavior(surfaceKind),
      geometry: { type: 'polygon', points: counterClockwise(surface.points) }
    };
  });
  const represented = new Set(authoredShapes.map((shape) => shape.surface));
  const missingShapes = REQUIRED_SURFACES.filter((surface) => surface !== 'boundary' && !represented.has(surface)).map(
    (surface) => ({
      id: `${hole.id}.runtime-placeholder.${surface}`,
      surface,
      priority: SURFACE_PRIORITY[surface],
      behavior: behavior(surface),
      geometry: { type: 'polygon', points: placeholderPoints(hole.number, surface) }
    })
  );
  return {
    schemaVersion: 1,
    id: `${hole.id}.surfaces`,
    revision: 1,
    holeId: hole.id,
    shapes: [
      ...authoredShapes,
      ...missingShapes,
      {
        id: `${hole.id}.playable-boundary`,
        surface: 'boundary',
        priority: SURFACE_PRIORITY.boundary,
        behavior: 'boundary',
        geometry: { type: 'polygon', points: boundaryPoints(hole) }
      }
    ]
  };
}

function canonicalHole(hole: Readonly<AuthoredCourseHoleV1>) {
  const tee = hole.tees.find((candidate) => candidate.id === hole.calibration.representativeTeeId);
  const pin = hole.pins.find((candidate) => candidate.id === hole.calibration.representativePinId);
  const green = hole.surfaces.find((surface) => surface.kind === 'green');
  if (!tee || !pin || !green) throw new RangeError(`Incomplete authored Course One hole: ${hole.id}`);
  const pinY = greenElevation(hole);
  const primaryGreenTargetId = `${hole.id}.green-target`;
  const routeTarget = hole.routes[0]?.target ?? pin.position;
  const centerline = [
    { x: tee.position.x, y: 0, z: tee.position.z },
    { x: routeTarget.x, y: pinY * 0.5, z: routeTarget.z },
    { x: pin.position.x, y: pinY, z: pin.position.z }
  ];
  const hazards = hole.surfaces
    .filter((surface) => surface.kind === 'bunker' || surface.kind === 'water')
    .map((surface) => ({
      id: `${hole.id}.${surface.id}.hazard`,
      kind: surface.kind,
      shapeRef: `${hole.id}.${surface.id}`
    }));

  return {
    schemaVersion: 1,
    id: hole.id,
    courseId: hole.courseId,
    revision: 1,
    holeNumber: hole.number,
    par: hole.par,
    strokeIndex: hole.number,
    geometry: {
      terrainRef: COURSE_ONE_ASSET_IDS.terrain,
      surfaceShapeSetRef: `${hole.id}.surfaces`,
      collisionRef: COURSE_ONE_ASSET_IDS.collision
    },
    routing: { centerline, designLengthMeters: hole.representativeMeters },
    targets: [
      ...hole.routes.map((route) => ({
        id: `${hole.id}.${route.id}`,
        kind: hole.par === 3 ? 'green' : 'landing',
        position: { x: route.target.x, y: pinY * 0.5, z: route.target.z },
        radiusMeters: route.target.radiusMeters
      })),
      {
        id: primaryGreenTargetId,
        kind: 'green',
        position: { x: pin.position.x, y: pinY, z: pin.position.z },
        radiusMeters: 7
      }
    ],
    hazards: [
      ...hazards,
      {
        id: `${hole.id}.playable-boundary.hazard`,
        kind: 'boundary',
        shapeRef: `${hole.id}.playable-boundary`
      }
    ],
    cameraAnchors: hole.cameras.map((camera) => ({
      id: `${hole.id}.${camera.id}`,
      mode: camera.mode,
      position: { ...camera.position },
      lookAt: { ...camera.lookAt },
      fieldOfViewDegrees: camera.fieldOfViewDegrees
    })),
    tees: hole.tees.map((candidate) => ({
      id: candidate.id,
      courseTeeId: courseTeeId(candidate.id),
      position: { x: candidate.position.x, y: 0, z: candidate.position.z },
      headingDegrees: 0
    })),
    green: {
      surfaceRef: `${hole.id}.${green.id}`,
      boundaryRef: `${hole.id}.${green.id}`,
      contourRef: COURSE_ONE_ASSET_IDS.contour,
      pinSetRef: pinSetId(hole.id),
      primaryTargetRef: primaryGreenTargetId
    }
  };
}

function hazardRules(hole: Readonly<AuthoredCourseHoleV1>) {
  const penaltyAreas = hole.surfaces.filter((surface) => surface.kind === 'water').map((surface) => ({
    id: `${hole.id}.${surface.id}.penalty`,
    shapeRef: `${hole.id}.${surface.id}`,
    marking: 'red',
    strokePenalty: 1,
    reliefProcedures: ['stroke-and-distance', 'back-on-line', 'lateral-two-club-lengths']
  }));
  return {
    schemaVersion: 1,
    id: `${hole.id}.rules`,
    revision: 1,
    holeId: hole.id,
    authority: {
      rulesetEdition: 'golf-iq-2026',
      effectiveRevision: 1,
      modes: ['quick-three', 'full-nine']
    },
    penaltyAreas,
    outOfBounds: {
      shapeRefs: [`${hole.id}.playable-boundary`],
      strokePenalty: 1,
      provisionalBallAllowed: true
    },
    dropZones: [],
    unplayableBall: {
      strokePenalty: 1,
      reliefProcedures: ['stroke-and-distance', 'back-on-line', 'lateral-two-club-lengths']
    },
    modeRules: [
      { mode: 'quick-three', penaltiesEnabled: true, maximumScorePolicy: 'double-par', dropZonePolicy: 'disabled' },
      { mode: 'full-nine', penaltiesEnabled: true, maximumScorePolicy: 'none', dropZonePolicy: 'disabled' }
    ],
    localRules: []
  };
}

function pinDifficulty(value: string): 'accessible' | 'balanced' | 'demanding' {
  if (/front|safe|accessible/i.test(value)) return 'accessible';
  if (/back|demanding|punish|shallow/i.test(value)) return 'demanding';
  return 'balanced';
}

function preferredApproachSide(x: number): 'left' | 'center' | 'right' {
  if (x < -2) return 'left';
  if (x > 2) return 'right';
  return 'center';
}

function teePins(hole: Readonly<AuthoredCourseHoleV1>) {
  const pinY = greenElevation(hole);
  return {
    schemaVersion: 1,
    id: `${hole.id}.tees-pins`,
    revision: 1,
    holeId: hole.id,
    teeConfigurations: hole.tees.map((tee, index) => ({
      id: teeConfigurationId(hole.id, tee.id),
      holeTeeRef: tee.id,
      courseTeeId: courseTeeId(tee.id),
      labelKey: `tees.${tee.id}`,
      displayOrder: index + 1,
      designLengthMeters: tee.measuredMeters,
      strategy: {
        skillBand: index <= 1 ? 'guided' : index === 2 ? 'standard' : 'expert',
        preferredRoute: 'center',
        forcedCarryMeters: 0
      }
    })),
    pinSets: [
      {
        id: pinSetId(hole.id),
        nameKey: 'pins.course-one',
        rotationGroup: hole.number,
        pins: hole.pins.map((pin) => ({
          id: pinId(hole.id, pin.id),
          position: { x: pin.position.x, y: pinY, z: pin.position.z },
          minimumBoundaryClearanceMeters: 1.5,
          difficulty: pinDifficulty(pin.difficulty),
          preferredApproachSide: preferredApproachSide(pin.position.x),
          safeMissSide: 'short'
        }))
      }
    ]
  };
}

function dataAsset(id: string, uri: string, contentHash: string) {
  return {
    id,
    kind: 'data',
    uri,
    contentHash,
    downloadBytes: 64,
    residentBytes: 64,
    qualityTiers: ['low', 'balanced', 'high'],
    required: false,
    fallbackRef: null,
    dependencies: [],
    metrics: { triangleCount: 0, texturePixels: 0, audioSeconds: 0 }
  };
}

function compileCourseOneCanonicalPackage(): Readonly<ValidatedCoursePackageV1> {
  const holes = COURSE_ONE_AUTHORED.holes;
  const authoredTeeIds = holes[0]?.tees.map((tee) => tee.id) ?? [];
  const input = {
    schemaVersion: 1,
    course: {
      schemaVersion: 1,
      id: COURSE_ONE_AUTHORED.courseId,
      revision: 1,
      content: {
        nameKey: 'courses.course-one.name',
        descriptionKey: 'courses.course-one.description',
        fictional: true
      },
      world: {
        units: 'meters',
        coordinateSystem: 'golf-iq-rh-y-up-v1',
        defaultHeadingDegrees: 0,
        altitudeMeters: 12
      },
      assets: {
        manifestRef: 'course-one.assets',
        environmentPresetRef: COURSE_ONE_ASSET_IDS.environment,
        sharedGeometryRefs: []
      },
      tees: authoredTeeIds.map((id) => ({ id, nameKey: `tees.${id}`, color: '#141414' })),
      holeOrder: holes.map((hole) => hole.id),
      compatibility: { contentApiVersion: 1, minimumAppVersion: '0.1.0', requiredFeatures: [] }
    },
    assetManifest: {
      schemaVersion: 1,
      id: 'course-one.assets',
      revision: 1,
      courseId: COURSE_ONE_AUTHORED.courseId,
      assetRoot: 'courses/course-one/',
      budgets: {
        maximumDownloadBytes: 4_096,
        maximumResidentBytes: 8_192,
        maximumModelTriangles: 1,
        maximumTexturePixels: 1,
        maximumAudioSeconds: 1
      },
      assets: [
        dataAsset(COURSE_ONE_ASSET_IDS.environment, 'data/environment.json', COURSE_ONE_ASSET_HASHES.environment),
        dataAsset(COURSE_ONE_ASSET_IDS.terrain, 'data/terrain.json', COURSE_ONE_ASSET_HASHES.terrain),
        dataAsset(COURSE_ONE_ASSET_IDS.collision, 'data/collision.json', COURSE_ONE_ASSET_HASHES.collision),
        dataAsset(COURSE_ONE_ASSET_IDS.contour, 'data/contour.json', COURSE_ONE_ASSET_HASHES.contour)
      ]
    },
    holes: holes.map(canonicalHole),
    surfaceShapeSets: holes.map(surfaceShapeSet),
    hazardRules: holes.map(hazardRules),
    teePinConfigurations: holes.map(teePins)
  };
  const validation = validateCoursePackage(input);
  if (!validation.ok) {
    throw new RangeError(
      `Course One canonical package is invalid: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`
    );
  }
  return validation.value;
}

export const COURSE_ONE_CANONICAL_PACKAGE = compileCourseOneCanonicalPackage();

export interface CourseOneCanonicalSelection {
  readonly holeId: string;
  readonly holeTeeId: string;
  readonly teeConfigurationId: string;
  readonly pinSetId: string;
  readonly pinId: string;
  readonly runtimeIdentity: Readonly<{ readonly runtimeId: string }>;
}

export function courseOneCanonicalSelection(holeNumber: number): Readonly<CourseOneCanonicalSelection> {
  const hole = COURSE_ONE_AUTHORED.holes.find((candidate) => candidate.number === holeNumber);
  if (!hole) throw new RangeError(`Unknown Course One hole number: ${holeNumber}`);
  return Object.freeze({
    holeId: hole.id,
    holeTeeId: hole.calibration.representativeTeeId,
    teeConfigurationId: teeConfigurationId(hole.id, hole.calibration.representativeTeeId),
    pinSetId: pinSetId(hole.id),
    pinId: pinId(hole.id, hole.calibration.representativePinId),
    runtimeIdentity: Object.freeze({ runtimeId: runtimeId(hole.number) })
  });
}
