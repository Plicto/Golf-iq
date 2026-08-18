export const RECOVERY_HOLE_PACKAGE_SCHEMA_VERSION = 1;

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;

const deepFreeze = (value, visited = new WeakSet()) => {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
};

const assertString = (value, label, pattern = ID) => {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} must be a stable string`);
  }
};

export function defineRecoveryHolePackageV1({
  descriptor,
  definition,
  presentation,
}) {
  if (!descriptor || descriptor.schemaVersion !== RECOVERY_HOLE_PACKAGE_SCHEMA_VERSION) {
    throw new RangeError("Recovery hole package schemaVersion must be 1");
  }
  if (
    descriptor.sourceKind !== "recovery-unmapped" ||
    descriptor.mappingStatus !== "unmapped" ||
    descriptor.promotionEligible !== false ||
    descriptor.canonicalCourseId !== null ||
    descriptor.canonicalHoleId !== null
  ) {
    throw new RangeError("Recovery hole package must remain explicitly unmapped");
  }
  assertString(descriptor.packageId, "Recovery packageId");
  assertString(descriptor.packageVersion, "Recovery packageVersion", VERSION);
  assertString(descriptor.runtimeId, "Recovery runtimeId");
  assertString(descriptor.contentRevision, "Recovery contentRevision");
  assertString(
    descriptor.compatibilityScenarioAlias,
    "Recovery compatibilityScenarioAlias",
  );
  if (!Number.isInteger(descriptor.runtimeOrder) || descriptor.runtimeOrder < 1) {
    throw new RangeError("Recovery runtimeOrder must be a positive integer");
  }
  if (
    definition?.identity?.id !== descriptor.runtimeId ||
    definition?.contentRevision !== descriptor.contentRevision ||
    definition?.identity?.scenarioId !== descriptor.compatibilityScenarioAlias
  ) {
    throw new RangeError("Recovery descriptor does not match its lab hole runtime");
  }
  if (
    presentation?.runtimeId !== descriptor.runtimeId ||
    presentation?.definition !== definition
  ) {
    throw new RangeError("Recovery presentation does not own the same lab hole runtime");
  }
  return deepFreeze({
    schemaVersion: RECOVERY_HOLE_PACKAGE_SCHEMA_VERSION,
    descriptor,
    definition,
    presentation,
  });
}
