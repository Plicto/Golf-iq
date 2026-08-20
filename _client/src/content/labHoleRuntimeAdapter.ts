import { localToWorld, normalizeHeadingDegrees, type WorldPoint, worldToLocal } from '../game/worldCoordinates.js';
import { type ValidatedCoursePackageV1, validateCoursePackage } from './courseValidator.js';
import type { GameplaySurfaceShape } from './gameplaySurfaceShapes.js';
import type { WorldPoint as CanonicalWorldPoint } from './holeData.js';

export const CANONICAL_LAB_HOLE_ADAPTER_SCHEMA_VERSION = 1 as const;
export const LAB_HOLE_RUNTIME_COORDINATE_SYSTEM = Object.freeze({
  units: 'meters' as const,
  origin: 'tee' as const,
  horizontalAxes: 'x-z' as const,
  verticalAxis: '+y' as const,
  forwardAxis: '+z' as const
});

export interface CanonicalLabCoordinateFrameV1 {
  readonly origin: Readonly<WorldPoint>;
  readonly headingDegrees: number;
}

export interface LabRuntimePointV1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CanonicalLabHoleRuntimeIdentityV1 {
  readonly runtimeId: string;
}

export interface AdaptCanonicalCourseHoleInputV1 {
  readonly coursePackage: unknown;
  readonly holeId: string;
  readonly holeTeeId: string;
  readonly teeConfigurationId: string;
  readonly pinSetId: string;
  readonly pinId: string;
  readonly runtimeIdentity: CanonicalLabHoleRuntimeIdentityV1;
}

export interface CanonicalLabHoleRuntimeSourceV1 {
  readonly schemaVersion: typeof CANONICAL_LAB_HOLE_ADAPTER_SCHEMA_VERSION;
  readonly sourceKind: 'canonical';
  readonly mappingStatus: 'structural-mapped';
  readonly promotionEligible: false;
  readonly canonical: {
    readonly courseId: string;
    readonly courseRevision: number;
    readonly packageSchemaVersion: number;
    readonly assetManifestId: string;
    readonly assetManifestRevision: number;
    readonly holeId: string;
    readonly holeRevision: number;
    readonly holeNumber: number;
    readonly holeOrderIndex: number;
    readonly surfaceShapeSetId: string;
    readonly surfaceShapeSetRevision: number;
    readonly hazardRulesId: string;
    readonly hazardRulesRevision: number;
    readonly teePinConfigurationsId: string;
    readonly teePinConfigurationsRevision: number;
  };
  readonly runtimeIdentity: CanonicalLabHoleRuntimeIdentityV1 & { readonly contentRevision: string };
  readonly coordinateFrame: {
    readonly canonicalCoordinateSystem: 'golf-iq-rh-y-up-v1';
    readonly labCoordinateSystem: typeof LAB_HOLE_RUNTIME_COORDINATE_SYSTEM;
    readonly origin: Readonly<WorldPoint>;
    readonly canonicalHeadingDegrees: number;
  };
  readonly refs: {
    readonly assetManifestRef: string;
    readonly environmentPresetRef: string;
    readonly terrainRef: string;
    readonly surfaceShapeSetRef: string;
    readonly collisionRef: string;
    readonly contourRef: string;
    readonly pinSetRef: string;
    readonly teeConfigurationRef: string;
    readonly greenSurfaceRef: string;
    readonly greenBoundaryRef: string;
    readonly holeTeeRef: string;
    readonly courseTeeRef: string;
    readonly selectedPinRef: string;
  };
  readonly hole: {
    readonly par: 3 | 4 | 5;
    readonly strokeIndex: number;
    readonly designLengthMeters: number;
    readonly tee: LabRuntimePointV1;
    readonly pin: LabRuntimePointV1;
    readonly centerline: ReadonlyArray<LabRuntimePointV1>;
    readonly targets: ReadonlyArray<{
      readonly id: string;
      readonly kind: 'landing' | 'layup' | 'green' | 'recovery';
      readonly position: LabRuntimePointV1;
      readonly radiusMeters: number;
    }>;
    readonly hazards: ReadonlyArray<{
      readonly id: string;
      readonly kind: 'bunker' | 'water' | 'penalty' | 'boundary';
      readonly shapeRef: string;
    }>;
    readonly cameraAnchors: ReadonlyArray<{
      readonly id: string;
      readonly mode: 'establishing' | 'decision' | 'landing' | 'green-reading';
      readonly position: LabRuntimePointV1;
      readonly lookAt: LabRuntimePointV1;
      readonly fieldOfViewDegrees: number;
    }>;
    readonly surfaces: ReadonlyArray<{
      readonly id: string;
      readonly surface: GameplaySurfaceShape['surface'];
      readonly priority: number;
      readonly behavior: GameplaySurfaceShape['behavior'];
      readonly points: ReadonlyArray<Readonly<{ readonly x: number; readonly z: number }>>;
    }>;
    readonly hazardRules: {
      readonly authority: Readonly<ValidatedCoursePackageV1['hazardRules'][number]['authority']>;
      readonly penaltyAreas: Readonly<ValidatedCoursePackageV1['hazardRules'][number]['penaltyAreas']>;
      readonly outOfBounds: Readonly<ValidatedCoursePackageV1['hazardRules'][number]['outOfBounds']>;
      readonly dropZones: ReadonlyArray<{
        readonly id: string;
        readonly position: Readonly<{ readonly x: number; readonly z: number }>;
        readonly radiusMeters: number;
        readonly appliesToPenaltyAreaRefs: ReadonlyArray<string>;
      }>;
      readonly unplayableBall: Readonly<ValidatedCoursePackageV1['hazardRules'][number]['unplayableBall']>;
      readonly modeRules: Readonly<ValidatedCoursePackageV1['hazardRules'][number]['modeRules']>;
      readonly localRules: Readonly<ValidatedCoursePackageV1['hazardRules'][number]['localRules']>;
    };
  };
}

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function stableString(value: string, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function revisionIdentitySegment(value: string | number): string {
  const text = String(value);
  return `${text.length}-${text}`;
}

function validatedPackage(input: unknown): Readonly<ValidatedCoursePackageV1> {
  const result = validateCoursePackage(input);
  if (result.ok) return result.value;
  const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  throw new RangeError(`Canonical course package validation failed: ${details}`);
}

export function canonicalWorldPointToLab(
  point: Readonly<CanonicalWorldPoint>,
  frame: Readonly<CanonicalLabCoordinateFrameV1>
): Readonly<LabRuntimePointV1> {
  const local = worldToLocal(frame.origin, frame.headingDegrees, point);
  return Object.freeze({ x: local.rightMeters, y: local.upMeters, z: local.forwardMeters });
}

export function labPointToCanonicalWorld(
  point: Readonly<LabRuntimePointV1>,
  frame: Readonly<CanonicalLabCoordinateFrameV1>
): Readonly<WorldPoint> {
  return localToWorld(frame.origin, frame.headingDegrees, {
    rightMeters: point.x,
    upMeters: point.y,
    forwardMeters: point.z
  });
}

export function canonicalHeadingToLabDegrees(canonicalHeadingDegrees: number, frameHeadingDegrees: number): number {
  return normalizeHeadingDegrees(180 + frameHeadingDegrees - canonicalHeadingDegrees);
}

export function labHeadingToCanonicalDegrees(labHeadingDegrees: number, frameHeadingDegrees: number): number {
  return normalizeHeadingDegrees(180 + frameHeadingDegrees - labHeadingDegrees);
}

export function adaptCanonicalCourseHoleToLabRuntime(
  input: Readonly<AdaptCanonicalCourseHoleInputV1>
): Readonly<CanonicalLabHoleRuntimeSourceV1> {
  const coursePackage = validatedPackage(input.coursePackage);
  const course = coursePackage.course;
  const holeId = stableString(input.holeId, 'Canonical holeId');
  const holeOrderIndex = course.holeOrder.indexOf(holeId);
  if (holeOrderIndex < 0) throw new RangeError(`Canonical hole is not owned by the course: ${holeId}`);
  const hole = coursePackage.holes.find((candidate) => candidate.id === holeId);
  if (!hole || hole.courseId !== course.id || hole.holeNumber !== holeOrderIndex + 1) {
    throw new RangeError(`Canonical course/hole ownership mismatch: ${course.id}/${holeId}`);
  }
  const tee = hole.tees.find((candidate) => candidate.id === input.holeTeeId);
  if (!tee || !course.tees.some((candidate) => candidate.id === tee.courseTeeId)) {
    throw new RangeError(`Canonical tee ownership mismatch: ${input.holeTeeId}`);
  }
  const teePins = coursePackage.teePinConfigurations.find((candidate) => candidate.holeId === holeId);
  if (!teePins) throw new RangeError(`Canonical tee/pin package is missing: ${holeId}`);
  const teeConfiguration = teePins.teeConfigurations.find((candidate) => candidate.id === input.teeConfigurationId);
  if (!teeConfiguration || teeConfiguration.holeTeeRef !== tee.id || teeConfiguration.courseTeeId !== tee.courseTeeId) {
    throw new RangeError(`Canonical tee configuration mismatch: ${input.teeConfigurationId}`);
  }
  const pinSet = teePins.pinSets.find((candidate) => candidate.id === input.pinSetId);
  if (!pinSet || pinSet.id !== hole.green.pinSetRef) {
    throw new RangeError(`Canonical pin-set ownership mismatch: ${input.pinSetId}`);
  }
  const pin = pinSet.pins.find((candidate) => candidate.id === input.pinId);
  if (!pin) throw new RangeError(`Canonical pin ownership mismatch: ${input.pinId}`);
  const surfaceSet = coursePackage.surfaceShapeSets.find(
    (candidate) => candidate.id === hole.geometry.surfaceShapeSetRef
  );
  if (!surfaceSet || surfaceSet.holeId !== hole.id) {
    throw new RangeError(`Canonical surface ownership mismatch: ${hole.geometry.surfaceShapeSetRef}`);
  }
  const hazardRules = coursePackage.hazardRules.find((candidate) => candidate.holeId === hole.id);
  if (!hazardRules) throw new RangeError(`Canonical hazard-rules ownership mismatch: ${hole.id}`);
  const frame = Object.freeze({ origin: tee.position, headingDegrees: tee.headingDegrees });
  const point = (value: Readonly<CanonicalWorldPoint>) => canonicalWorldPointToLab(value, frame);
  const surfacePoint = (value: Readonly<{ readonly x: number; readonly z: number }>) => {
    const mapped = point({ x: value.x, y: frame.origin.y, z: value.z });
    return Object.freeze({ x: mapped.x, z: mapped.z });
  };
  const runtimeIdentity = Object.freeze({
    runtimeId: stableString(input.runtimeIdentity.runtimeId, 'Lab runtimeId'),
    contentRevision: [
      `adapter-v${CANONICAL_LAB_HOLE_ADAPTER_SCHEMA_VERSION}`,
      course.id,
      course.revision,
      coursePackage.assetManifest.id,
      coursePackage.assetManifest.revision,
      hole.id,
      hole.revision,
      surfaceSet.id,
      surfaceSet.revision,
      hazardRules.id,
      hazardRules.revision,
      teePins.id,
      teePins.revision,
      teeConfiguration.id,
      pinSet.id,
      pin.id
    ]
      .map(revisionIdentitySegment)
      .join('.')
  });

  return deepFreeze({
    schemaVersion: CANONICAL_LAB_HOLE_ADAPTER_SCHEMA_VERSION,
    sourceKind: 'canonical',
    mappingStatus: 'structural-mapped',
    promotionEligible: false,
    canonical: {
      courseId: course.id,
      courseRevision: course.revision,
      packageSchemaVersion: coursePackage.schemaVersion,
      assetManifestId: coursePackage.assetManifest.id,
      assetManifestRevision: coursePackage.assetManifest.revision,
      holeId: hole.id,
      holeRevision: hole.revision,
      holeNumber: hole.holeNumber,
      holeOrderIndex,
      surfaceShapeSetId: surfaceSet.id,
      surfaceShapeSetRevision: surfaceSet.revision,
      hazardRulesId: hazardRules.id,
      hazardRulesRevision: hazardRules.revision,
      teePinConfigurationsId: teePins.id,
      teePinConfigurationsRevision: teePins.revision
    },
    runtimeIdentity,
    coordinateFrame: {
      canonicalCoordinateSystem: course.world.coordinateSystem,
      labCoordinateSystem: LAB_HOLE_RUNTIME_COORDINATE_SYSTEM,
      origin: frame.origin,
      canonicalHeadingDegrees: frame.headingDegrees
    },
    refs: {
      assetManifestRef: course.assets.manifestRef,
      environmentPresetRef: course.assets.environmentPresetRef,
      terrainRef: hole.geometry.terrainRef,
      surfaceShapeSetRef: hole.geometry.surfaceShapeSetRef,
      collisionRef: hole.geometry.collisionRef,
      contourRef: hole.green.contourRef,
      pinSetRef: pinSet.id,
      teeConfigurationRef: teeConfiguration.id,
      greenSurfaceRef: hole.green.surfaceRef,
      greenBoundaryRef: hole.green.boundaryRef,
      holeTeeRef: tee.id,
      courseTeeRef: tee.courseTeeId,
      selectedPinRef: pin.id
    },
    hole: {
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      designLengthMeters: teeConfiguration.designLengthMeters,
      tee: point(tee.position),
      pin: point(pin.position),
      centerline: hole.routing.centerline.map(point),
      targets: hole.targets.map((target) => ({ ...target, position: point(target.position) })),
      hazards: hole.hazards.map((hazard) => ({ ...hazard })),
      cameraAnchors: hole.cameraAnchors.map((camera) => ({
        ...camera,
        position: point(camera.position),
        lookAt: point(camera.lookAt)
      })),
      surfaces: surfaceSet.shapes.map((shape) => ({
        id: shape.id,
        surface: shape.surface,
        priority: shape.priority,
        behavior: shape.behavior,
        points: shape.geometry.points.map(surfacePoint)
      })),
      hazardRules: {
        authority: hazardRules.authority,
        penaltyAreas: hazardRules.penaltyAreas,
        outOfBounds: hazardRules.outOfBounds,
        dropZones: hazardRules.dropZones.map((dropZone) => ({
          ...dropZone,
          position: surfacePoint(dropZone.position)
        })),
        unplayableBall: hazardRules.unplayableBall,
        modeRules: hazardRules.modeRules,
        localRules: hazardRules.localRules
      }
    }
  });
}
