export const RECOVERY_HOLE_CATALOG_SCHEMA_VERSION = 1;

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const assertString = (value, label, pattern = ID) => {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} must be a stable string`);
  }
};

const descriptor = ({
  packageId,
  runtimeId,
  runtimeOrder,
  contentRevision,
  compatibilityScenarioAlias,
}) => {
  assertString(packageId, "Recovery packageId");
  assertString(runtimeId, "Recovery runtimeId");
  assertString(contentRevision, "Recovery contentRevision");
  assertString(
    compatibilityScenarioAlias,
    "Recovery compatibilityScenarioAlias",
  );
  if (!Number.isInteger(runtimeOrder) || runtimeOrder < 1) {
    throw new RangeError("Recovery runtimeOrder must be a positive integer");
  }
  return Object.freeze({
    schemaVersion: RECOVERY_HOLE_CATALOG_SCHEMA_VERSION,
    sourceKind: "recovery-unmapped",
    mappingStatus: "unmapped",
    promotionEligible: false,
    canonicalCourseId: null,
    canonicalHoleId: null,
    packageId,
    packageVersion: "1.0.0",
    runtimeId,
    runtimeOrder,
    contentRevision,
    compatibilityScenarioAlias,
  });
};

export const RECOVERY_HOLE_RUNTIME_ORDER = Object.freeze([
  "north-inlet",
  "machair-run",
  "gannet-shelf",
]);

export const RECOVERY_HOLE_CATALOG = Object.freeze({
  schemaVersion: RECOVERY_HOLE_CATALOG_SCHEMA_VERSION,
  sourceKind: "recovery-unmapped",
  canonicalCourseId: null,
  promotionEligible: false,
  targetLaunchHoleCount: 9,
  runtimeOrder: RECOVERY_HOLE_RUNTIME_ORDER,
  entries: Object.freeze({
    "north-inlet": descriptor({
      packageId: "lab-recovery.north-inlet",
      runtimeId: "north-inlet",
      runtimeOrder: 1,
      contentRevision: "north-inlet-content-v3",
      compatibilityScenarioAlias: "course-one-hole-one",
    }),
    "machair-run": descriptor({
      packageId: "lab-recovery.machair-run",
      runtimeId: "machair-run",
      runtimeOrder: 2,
      contentRevision: "machair-run-content-v3",
      compatibilityScenarioAlias: "course-one-hole-two",
    }),
    "gannet-shelf": descriptor({
      packageId: "lab-recovery.gannet-shelf",
      runtimeId: "gannet-shelf",
      runtimeOrder: 3,
      contentRevision: "gannet-shelf-content-v3",
      compatibilityScenarioAlias: "course-one-hole-three",
    }),
  }),
});

const loaders = Object.freeze({
  "north-inlet": () => import("./north-inlet-hole-package.js")
    .then((module) => module.NORTH_INLET_RECOVERY_HOLE_PACKAGE),
  "machair-run": () => import("./machair-run-hole-package.js")
    .then((module) => module.MACHAIR_RUN_RECOVERY_HOLE_PACKAGE),
  "gannet-shelf": () => import("./gannet-shelf-hole-package.js")
    .then((module) => module.GANNET_SHELF_RECOVERY_HOLE_PACKAGE),
});

const artSourceLoaders = Object.freeze({
  "north-inlet": () => import("./north-inlet-world.js")
    .then((module) => module.NORTH_INLET_WORLD),
  "machair-run": () => import("./machair-run-world.js")
    .then((module) => module.MACHAIR_RUN_WORLD),
  "gannet-shelf": () => import("./gannet-shelf-world.js")
    .then((module) => module.GANNET_SHELF_WORLD),
});

export function recoveryHoleDescriptor(runtimeId) {
  if (!Object.hasOwn(RECOVERY_HOLE_CATALOG.entries, runtimeId)) {
    throw new RangeError(`Unknown recovery hole runtime: ${runtimeId}`);
  }
  const entry = RECOVERY_HOLE_CATALOG.entries[runtimeId];
  return entry;
}

export async function loadRecoveryHoleArtSource(identity) {
  const descriptor = recoveryHoleDescriptor(identity?.runtimeId);
  if (
    descriptor.sourceKind !== identity.sourceKind ||
    descriptor.packageId !== identity.packageId ||
    descriptor.packageVersion !== identity.packageVersion ||
    descriptor.contentRevision !== identity.contentRevision
  ) {
    throw new RangeError(
      `Recovery art identity mismatch: ${descriptor.runtimeId}`,
    );
  }
  const world = await artSourceLoaders[descriptor.runtimeId]();
  if (world?.id !== descriptor.runtimeId) {
    throw new RangeError(
      `Recovery art world identity mismatch: ${descriptor.runtimeId}`,
    );
  }
  return Object.freeze({ descriptor, world });
}

const assertLoadedPackage = (expected, loadedPackage) => {
  if (!loadedPackage || loadedPackage.descriptor !== expected) {
    throw new RangeError(`Loaded recovery package identity mismatch: ${expected.runtimeId}`);
  }
  if (
    loadedPackage.definition?.identity?.id !== expected.runtimeId ||
    loadedPackage.definition?.contentRevision !== expected.contentRevision ||
    loadedPackage.presentation?.definition !== loadedPackage.definition
  ) {
    throw new RangeError(`Loaded recovery package content mismatch: ${expected.runtimeId}`);
  }
  return loadedPackage;
};

export function createRecoveryHolePackageLoader(catalog, packageLoaders) {
  if (
    !catalog ||
    catalog.schemaVersion !== RECOVERY_HOLE_CATALOG_SCHEMA_VERSION ||
    catalog.sourceKind !== "recovery-unmapped" ||
    catalog.canonicalCourseId !== null ||
    catalog.promotionEligible !== false ||
    !Array.isArray(catalog.runtimeOrder) ||
    !catalog.entries ||
    !packageLoaders
  ) {
    throw new TypeError("Recovery hole catalog input is invalid");
  }
  const runtimeIds = [...catalog.runtimeOrder];
  if (
    new Set(runtimeIds).size !== runtimeIds.length ||
    runtimeIds.some(
      (runtimeId, index) =>
        !Object.hasOwn(catalog.entries, runtimeId) ||
        catalog.entries[runtimeId].runtimeId !== runtimeId ||
        catalog.entries[runtimeId].runtimeOrder !== index + 1,
    )
  ) {
    throw new RangeError("Recovery hole catalog ordering is invalid");
  }
  const loaded = new Map();
  const pending = new Map();
  const expectedFor = (runtimeId) => {
    if (!Object.hasOwn(catalog.entries, runtimeId)) {
      throw new RangeError(`Unknown recovery hole runtime: ${runtimeId}`);
    }
    return catalog.entries[runtimeId];
  };
  const load = (runtimeId) => {
    const expected = expectedFor(runtimeId);
    const retained = loaded.get(runtimeId);
    if (retained) return Promise.resolve(retained);
    const inFlight = pending.get(runtimeId);
    if (inFlight) return inFlight;
    const packageLoader = packageLoaders[runtimeId];
    if (typeof packageLoader !== "function") {
      throw new RangeError(
        `Recovery hole runtime is unavailable: ${runtimeId}`,
      );
    }
    const request = Promise.resolve()
      .then(packageLoader)
      .then((loadedPackage) => {
        const verified = assertLoadedPackage(expected, loadedPackage);
        loaded.set(runtimeId, verified);
        return verified;
      })
      .finally(() => {
        if (pending.get(runtimeId) === request) pending.delete(runtimeId);
      });
    pending.set(runtimeId, request);
    return request;
  };
  return Object.freeze({
    load,
    loaded(runtimeId) {
      expectedFor(runtimeId);
      return loaded.get(runtimeId) ?? null;
    },
    state() {
      return Object.freeze({
        loadedRuntimeIds: Object.freeze([...loaded.keys()]),
        pendingRuntimeIds: Object.freeze([...pending.keys()]),
      });
    },
  });
}

const recoveryLoader = createRecoveryHolePackageLoader(
  RECOVERY_HOLE_CATALOG,
  loaders,
);

export const loadedRecoveryHolePackage = recoveryLoader.loaded;
export const recoveryHolePackageLoadState = recoveryLoader.state;
export const loadRecoveryHolePackage = recoveryLoader.load;
