import type { LabHoleRuntimeDefinition, LabHoleRuntimeId } from "./lab-hole-runtime-registry.js";

export const RECOVERY_HOLE_CATALOG_SCHEMA_VERSION: 1;

export type RecoveryHoleDescriptor<
  Id extends LabHoleRuntimeId = LabHoleRuntimeId,
> = Readonly<{
  schemaVersion: 1;
  sourceKind: "recovery-unmapped";
  mappingStatus: "unmapped";
  promotionEligible: false;
  canonicalCourseId: null;
  canonicalHoleId: null;
  packageId: string;
  packageVersion: string;
  runtimeId: Id;
  runtimeOrder: number;
  contentRevision: string;
  compatibilityScenarioAlias: string;
}>;

export type LabHolePresentationV1<
  Id extends LabHoleRuntimeId = LabHoleRuntimeId,
> = Readonly<{
  schemaVersion: 1;
  runtimeId: Id;
  definition: LabHoleRuntimeDefinition<Id>;
  fullFlyby: Readonly<Record<string, unknown>>;
  reducedFlyby: Readonly<Record<string, unknown>>;
}>;

export type RecoveryHolePackageV1<
  Id extends LabHoleRuntimeId = LabHoleRuntimeId,
> = Readonly<{
  schemaVersion: 1;
  descriptor: RecoveryHoleDescriptor<Id>;
  definition: LabHoleRuntimeDefinition<Id>;
  presentation: LabHolePresentationV1<Id>;
}>;

export const RECOVERY_HOLE_RUNTIME_ORDER: readonly [
  "north-inlet",
  "machair-run",
  "gannet-shelf",
];

export const RECOVERY_HOLE_CATALOG: Readonly<{
  schemaVersion: 1;
  sourceKind: "recovery-unmapped";
  canonicalCourseId: null;
  promotionEligible: false;
  targetLaunchHoleCount: 9;
  runtimeOrder: typeof RECOVERY_HOLE_RUNTIME_ORDER;
  entries: Readonly<{
    [Id in LabHoleRuntimeId]: RecoveryHoleDescriptor<Id>;
  }>;
}>;

export function recoveryHoleDescriptor<Id extends LabHoleRuntimeId>(
  runtimeId: Id,
): RecoveryHoleDescriptor<Id>;

export function recoveryHoleDescriptor(runtimeId: string): RecoveryHoleDescriptor;

export type RecoveryHoleArtIdentity<
  Id extends LabHoleRuntimeId = LabHoleRuntimeId,
> = Readonly<Pick<
  RecoveryHoleDescriptor<Id>,
  "sourceKind" | "packageId" | "packageVersion" | "runtimeId" | "contentRevision"
>>;

export function loadRecoveryHoleArtSource<Id extends LabHoleRuntimeId>(
  identity: RecoveryHoleArtIdentity<Id>,
): Promise<Readonly<{
  descriptor: RecoveryHoleDescriptor<Id>;
  world: LabHoleRuntimeDefinition<Id>["world"];
}>>;

export type RecoveryHolePackageLoader = Readonly<{
  load(runtimeId: string): Promise<RecoveryHolePackageV1>;
  loaded(runtimeId: string): RecoveryHolePackageV1 | null;
  state(): Readonly<{
    loadedRuntimeIds: readonly string[];
    pendingRuntimeIds: readonly string[];
  }>;
}>;

export function createRecoveryHolePackageLoader(
  catalog: typeof RECOVERY_HOLE_CATALOG,
  packageLoaders: Readonly<Record<string, () => Promise<RecoveryHolePackageV1>>>,
): RecoveryHolePackageLoader;

export function loadedRecoveryHolePackage<Id extends LabHoleRuntimeId>(
  runtimeId: Id,
): RecoveryHolePackageV1<Id> | null;

export function loadRecoveryHolePackage<Id extends LabHoleRuntimeId>(
  runtimeId: Id,
): Promise<RecoveryHolePackageV1<Id>>;

export function loadRecoveryHolePackage(
  runtimeId: string,
): Promise<RecoveryHolePackageV1>;

export function recoveryHolePackageLoadState(): Readonly<{
  loadedRuntimeIds: readonly LabHoleRuntimeId[];
  pendingRuntimeIds: readonly LabHoleRuntimeId[];
}>;
