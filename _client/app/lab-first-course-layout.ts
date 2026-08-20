import type {
  BallState,
  ClubId,
  Point,
  Wind,
} from "./gameplay-v119/game-engine";
import type {
  CourseLayout,
  CoursePoint,
} from "./gameplay-v119/course-layout";
import { courseGroundMaterials } from "./gameplay-v119/ground-materials";
import { terrainSampler } from "./gameplay-v119/course-terrain-sampler";
import { COURSE_ONE_CANONICAL_PACKAGE, courseOneCanonicalSelection } from "../../../src/content/courseOneCanonicalPackage.js";
import {
  adaptCanonicalCourseHoleToLabRuntime,
  type CanonicalLabHoleRuntimeSourceV1,
} from "../../../src/content/labHoleRuntimeAdapter.js";
import { NORTH_INLET_RECOVERY_HOLE_PACKAGE } from "../public/labs/course-presentation/north-inlet-hole-package.js";
import {
  loadRecoveryHolePackage,
  type RecoveryHolePackageV1,
} from "../public/labs/course-presentation/recovery-hole-catalog.js";
import { createCanonicalCourseOneHolePackage } from "../public/labs/course-presentation/canonical-course-one-runtime.js";
import type { LabHoleRuntimeV1 } from "../public/labs/course-presentation/lab-hole-runtime-v1.js";

export type LabHoleRuntimeId = string;

export type LabFirstRoundHole = Readonly<{
  runtimeId: LabHoleRuntimeId;
  sourceKind: "canonical" | "recovery-unmapped";
  canonicalCourseId: string | null;
  canonicalHoleId: string | null;
  contentRevision: string;
  compatibilityScenarioAlias: string;
  holeLabel: string;
  label: string;
  par: number;
  openingClub: ClubId;
  layout: CourseLayout;
  wind: Wind;
  roundSeed: number;
  canonicalSource: Readonly<CanonicalLabHoleRuntimeSourceV1> | null;
  initialBallState: () => BallState;
}>;

type LoadedHolePackage = Readonly<{
  descriptor: Readonly<{
    runtimeId: string;
    sourceKind: "canonical" | "recovery-unmapped";
    canonicalCourseId: string | null;
    canonicalHoleId: string | null;
    contentRevision: string;
    compatibilityScenarioAlias: string;
  }>;
  definition: LabHoleRuntimeV1;
}>;

const createLayout = (definition: LabHoleRuntimeV1): CourseLayout => {
  const { gameplay, geometry, identity, presentation } = definition;
  const terrainHeightAt = (point: CoursePoint) =>
    geometry.surfaceElevationAt(point.x, point.z);

  return Object.freeze({
    // A distinct runtime id prevents the legacy North Inlet putt shortcut from
    // replacing this lab-native layout with the historical green model.
    id: identity.layoutId,
    courseArchetype: gameplay.courseArchetype,
    label: identity.label,
    shortLabel: identity.label,
    physicsVersion: gameplay.physicsVersion,
    terrainVersion: gameplay.terrainVersion,
    tee: geometry.tee,
    pin: geometry.pin,
    bounds: geometry.bounds,
    aim: gameplay.aim,
    surfaces: geometry.surfaces,
    groundMaterials: courseGroundMaterials(gameplay.courseArchetype),
    waterBodies: geometry.waterBodies,
    barriers: geometry.barriers,
    terrainHeightAt,
    sampleTerrain: terrainSampler(terrainHeightAt),
    presentation: presentation.theme,
  });
};

const createInitialBallState = (layout: CourseLayout): BallState =>
  Object.freeze({
    position: layout.tee,
    lie: "tee",
    remainingMeters: Math.hypot(
      layout.pin.x - layout.tee.x,
      layout.pin.z - layout.tee.z,
    ),
  });

const createRoundHole = (
  loadedPackage: LoadedHolePackage,
  canonicalSource: Readonly<CanonicalLabHoleRuntimeSourceV1> | null,
): LabFirstRoundHole => {
  const definition = loadedPackage.definition;
  const layout = createLayout(definition);
  return Object.freeze({
    runtimeId: loadedPackage.descriptor.runtimeId,
    sourceKind: loadedPackage.descriptor.sourceKind,
    canonicalCourseId: loadedPackage.descriptor.canonicalCourseId,
    canonicalHoleId: loadedPackage.descriptor.canonicalHoleId,
    contentRevision: loadedPackage.descriptor.contentRevision,
    compatibilityScenarioAlias:
      loadedPackage.descriptor.compatibilityScenarioAlias,
    holeLabel: definition.identity.holeLabel,
    label: definition.identity.label,
    par: definition.gameplay.par,
    openingClub: definition.gameplay.openingClub as ClubId,
    layout,
    wind: definition.gameplay.wind,
    roundSeed: definition.gameplay.roundSeed,
    canonicalSource,
    initialBallState: () => createInitialBallState(layout),
  });
};

const canonicalRoundSources = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9].map((holeNumber) =>
  adaptCanonicalCourseHoleToLabRuntime({
    coursePackage: COURSE_ONE_CANONICAL_PACKAGE,
    ...courseOneCanonicalSelection(holeNumber),
  })
));

const canonicalRoundHoles = Object.freeze(canonicalRoundSources.map((source) =>
  createRoundHole(
    createCanonicalCourseOneHolePackage(source) as LoadedHolePackage,
    source,
  )
));

const canonicalRoundHoleById = new Map<LabHoleRuntimeId, LabFirstRoundHole>(
  canonicalRoundHoles.map((hole) => [hole.runtimeId, hole]),
);

export const LAB_FIRST_ROUND_METADATA = Object.freeze(
  canonicalRoundHoles.map((hole) => Object.freeze({
    runtimeId: hole.runtimeId,
    sourceKind: hole.sourceKind,
    canonicalCourseId: hole.canonicalCourseId,
    canonicalHoleId: hole.canonicalHoleId,
    promotionEligible: false,
    compatibilityScenarioAlias: hole.compatibilityScenarioAlias,
    holeLabel: hole.holeLabel,
    label: hole.label,
    par: hole.par,
    openingClub: hole.openingClub,
    contentRevision: hole.contentRevision,
  })),
);

const legacyOpeningHole = createRoundHole(
  NORTH_INLET_RECOVERY_HOLE_PACKAGE as RecoveryHolePackageV1 as LoadedHolePackage,
  null,
);

export const LAB_FIRST_OPENING_HOLE = canonicalRoundHoles[0];
export const LAB_NORTH_INLET_LAYOUT = legacyOpeningHole.layout;
export const LAB_NORTH_INLET_LENGTH_METERS =
  legacyOpeningHole.initialBallState().remainingMeters;

export function initialLabFirstBallState(): BallState {
  return legacyOpeningHole.initialBallState();
}

export function loadedLabFirstRoundHole(
  runtimeId: LabHoleRuntimeId,
): LabFirstRoundHole | null {
  return canonicalRoundHoleById.get(runtimeId) ?? null;
}

export async function loadLabFirstRoundHole(
  runtimeId: LabHoleRuntimeId,
): Promise<LabFirstRoundHole> {
  const retained = canonicalRoundHoleById.get(runtimeId);
  if (retained) return retained;
  const recoveryPackage = await loadRecoveryHolePackage(runtimeId as never);
  return createRoundHole(
    recoveryPackage as RecoveryHolePackageV1 as LoadedHolePackage,
    null,
  );
}

export async function loadLabFirstRound(): Promise<readonly LabFirstRoundHole[]> {
  return canonicalRoundHoles;
}

export function labPoint(point: Point) {
  return Object.freeze({ x: point.x, z: point.z });
}
