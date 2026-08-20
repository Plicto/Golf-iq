export const TEE_PIN_SCHEMA_VERSION = 1 as const;

export interface TeePinPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TeePinValidationContext {
  readonly holeId: string;
  readonly teeReferences: ReadonlyArray<{
    readonly id: string;
    readonly courseTeeId: string;
  }>;
  readonly greenBoundary: ReadonlyArray<{
    readonly x: number;
    readonly z: number;
  }>;
}

export interface TeePinConfigurationsV1 {
  readonly schemaVersion: typeof TEE_PIN_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly holeId: string;
  readonly teeConfigurations: ReadonlyArray<{
    readonly id: string;
    readonly holeTeeRef: string;
    readonly courseTeeId: string;
    readonly labelKey: string;
    readonly displayOrder: number;
    readonly designLengthMeters: number;
    readonly strategy: {
      readonly skillBand: 'guided' | 'standard' | 'expert';
      readonly preferredRoute: 'left' | 'center' | 'right';
      readonly forcedCarryMeters: number;
    };
  }>;
  readonly pinSets: ReadonlyArray<{
    readonly id: string;
    readonly nameKey: string;
    readonly rotationGroup: number;
    readonly pins: ReadonlyArray<{
      readonly id: string;
      readonly position: TeePinPoint;
      readonly minimumBoundaryClearanceMeters: number;
      readonly difficulty: 'accessible' | 'balanced' | 'demanding';
      readonly preferredApproachSide: 'left' | 'center' | 'right';
      readonly safeMissSide: 'short' | 'long' | 'left' | 'right';
    }>;
  }>;
}

export interface TeePinValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type TeePinValidationResult =
  | { readonly ok: true; readonly value: Readonly<TeePinConfigurationsV1> }
  | { readonly ok: false; readonly issues: ReadonlyArray<TeePinValidationIssue> };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;

function objectAt(
  value: unknown,
  path: string,
  keys: ReadonlyArray<string>,
  issues: TeePinValidationIssue[]
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push({ path, message: 'Expected an object.' });
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) issues.push({ path: `${path}.${key}`, message: 'Unknown field.' });
  }
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) issues.push({ path: `${path}.${key}`, message: 'Required field is missing.' });
  }
  return record;
}

function stableStringAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  pattern: RegExp,
  issues: TeePinValidationIssue[]
): string | null {
  const value = record[key];
  if (typeof value !== 'string' || !pattern.test(value)) {
    issues.push({ path: `${path}.${key}`, message: 'Expected a valid stable string.' });
    return null;
  }
  return value;
}

function numberAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
  issues: TeePinValidationIssue[],
  integer = false
): number | null {
  const value = record[key];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    issues.push({ path: `${path}.${key}`, message: `Expected a number from ${minimum} through ${maximum}.` });
    return null;
  }
  return value;
}

function enumAt<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlyArray<T>,
  issues: TeePinValidationIssue[]
): T | null {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push({ path, message: `Expected one of: ${allowed.join(', ')}.` });
    return null;
  }
  return value as T;
}

function pointAt(value: unknown, path: string, issues: TeePinValidationIssue[]): TeePinPoint | null {
  const point = objectAt(value, path, ['x', 'y', 'z'], issues);
  if (!point) return null;
  const x = numberAt(point, 'x', path, -20_000, 20_000, issues);
  const y = numberAt(point, 'y', path, -1_000, 5_000, issues);
  const z = numberAt(point, 'z', path, -20_000, 20_000, issues);
  return x === null || y === null || z === null ? null : { x, y, z };
}

function containsPoint(
  polygon: ReadonlyArray<{ readonly x: number; readonly z: number }>,
  point: Readonly<{ x: number; z: number }>
): boolean {
  let inside = false;
  for (let index = 0, prior = polygon.length - 1; index < polygon.length; prior = index, index += 1) {
    const a = polygon[index];
    const b = polygon[prior];
    if (!a || !b) continue;
    const crosses = a.z > point.z !== b.z > point.z;
    if (crosses && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(
  point: Readonly<{ x: number; z: number }>,
  start: Readonly<{ x: number; z: number }>,
  end: Readonly<{ x: number; z: number }>
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.z - start.z);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (start.x + projection * dx), point.z - (start.z + projection * dz));
}

function boundaryClearance(
  polygon: ReadonlyArray<{ readonly x: number; readonly z: number }>,
  point: Readonly<{ x: number; z: number }>
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (start && end) minimum = Math.min(minimum, distanceToSegment(point, start, end));
  }
  return minimum;
}

function validContext(context: TeePinValidationContext, issues: TeePinValidationIssue[]): boolean {
  let valid = true;
  if (!ID.test(context.holeId)) {
    issues.push({ path: '$context.holeId', message: 'Expected a stable hole identifier.' });
    valid = false;
  }
  if (
    context.greenBoundary.length < 3 ||
    context.greenBoundary.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.z) ||
        point.x < -20_000 ||
        point.x > 20_000 ||
        point.z < -20_000 ||
        point.z > 20_000
    )
  ) {
    issues.push({ path: '$context.greenBoundary', message: 'Expected a valid bounded green polygon.' });
    valid = false;
  }
  const teeKeys = context.teeReferences.map((tee) => `${tee.id}:${tee.courseTeeId}`);
  if (
    context.teeReferences.length === 0 ||
    context.teeReferences.some((tee) => !ID.test(tee.id) || !ID.test(tee.courseTeeId)) ||
    new Set(teeKeys).size !== teeKeys.length
  ) {
    issues.push({ path: '$context.teeReferences', message: 'Expected unique valid tee references.' });
    valid = false;
  }
  return valid;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateTeePinConfigurations(input: unknown, context: TeePinValidationContext): TeePinValidationResult {
  const issues: TeePinValidationIssue[] = [];
  validContext(context, issues);
  const root = objectAt(
    input,
    '$',
    ['schemaVersion', 'id', 'revision', 'holeId', 'teeConfigurations', 'pinSets'],
    issues
  );
  if (!root) return { ok: false, issues };
  if (root.schemaVersion !== TEE_PIN_SCHEMA_VERSION)
    issues.push({ path: '$.schemaVersion', message: 'Only tee-and-pin schema version 1 is supported.' });
  stableStringAt(root, 'id', '$', ID, issues);
  const holeId = stableStringAt(root, 'holeId', '$', ID, issues);
  if (holeId && holeId !== context.holeId)
    issues.push({ path: '$.holeId', message: 'Package hole must match validation context.' });
  numberAt(root, 'revision', '$', 1, 1_000_000, issues, true);

  const teeIds: string[] = [];
  const displayOrders: number[] = [];
  if (!Array.isArray(root.teeConfigurations) || root.teeConfigurations.length === 0) {
    issues.push({ path: '$.teeConfigurations', message: 'At least one tee configuration is required.' });
  } else {
    root.teeConfigurations.forEach((entry, index) => {
      const path = `$.teeConfigurations[${index}]`;
      const tee = objectAt(
        entry,
        path,
        ['id', 'holeTeeRef', 'courseTeeId', 'labelKey', 'displayOrder', 'designLengthMeters', 'strategy'],
        issues
      );
      if (!tee) return;
      const id = stableStringAt(tee, 'id', path, ID, issues);
      const holeTeeRef = stableStringAt(tee, 'holeTeeRef', path, ID, issues);
      const courseTeeId = stableStringAt(tee, 'courseTeeId', path, ID, issues);
      stableStringAt(tee, 'labelKey', path, KEY, issues);
      const displayOrder = numberAt(tee, 'displayOrder', path, 1, 20, issues, true);
      numberAt(tee, 'designLengthMeters', path, 45, 750, issues);
      if (id) teeIds.push(id);
      if (displayOrder !== null) displayOrders.push(displayOrder);
      if (
        holeTeeRef &&
        courseTeeId &&
        !context.teeReferences.some((reference) => reference.id === holeTeeRef && reference.courseTeeId === courseTeeId)
      )
        issues.push({ path, message: 'Tee configuration must reference an authored hole/course tee pair.' });
      const strategy = objectAt(
        tee.strategy,
        `${path}.strategy`,
        ['skillBand', 'preferredRoute', 'forcedCarryMeters'],
        issues
      );
      if (strategy) {
        enumAt(strategy.skillBand, `${path}.strategy.skillBand`, ['guided', 'standard', 'expert'] as const, issues);
        enumAt(
          strategy.preferredRoute,
          `${path}.strategy.preferredRoute`,
          ['left', 'center', 'right'] as const,
          issues
        );
        numberAt(strategy, 'forcedCarryMeters', `${path}.strategy`, 0, 280, issues);
      }
    });
  }
  if (new Set(teeIds).size !== teeIds.length)
    issues.push({ path: '$.teeConfigurations', message: 'Tee configuration identifiers must be unique.' });
  if (new Set(displayOrders).size !== displayOrders.length)
    issues.push({ path: '$.teeConfigurations', message: 'Tee display order must be unique.' });

  const pinSetIds: string[] = [];
  const pinIds: string[] = [];
  if (!Array.isArray(root.pinSets) || root.pinSets.length === 0) {
    issues.push({ path: '$.pinSets', message: 'At least one authored pin set is required.' });
  } else {
    root.pinSets.forEach((entry, setIndex) => {
      const path = `$.pinSets[${setIndex}]`;
      const set = objectAt(entry, path, ['id', 'nameKey', 'rotationGroup', 'pins'], issues);
      if (!set) return;
      const id = stableStringAt(set, 'id', path, ID, issues);
      if (id) pinSetIds.push(id);
      stableStringAt(set, 'nameKey', path, KEY, issues);
      numberAt(set, 'rotationGroup', path, 1, 12, issues, true);
      if (!Array.isArray(set.pins) || set.pins.length < 3 || set.pins.length > 12) {
        issues.push({ path: `${path}.pins`, message: 'A pin set requires three through twelve authored pins.' });
        return;
      }
      const setPositions: string[] = [];
      set.pins.forEach((entryValue, pinIndex) => {
        const pinPath = `${path}.pins[${pinIndex}]`;
        const pin = objectAt(
          entryValue,
          pinPath,
          ['id', 'position', 'minimumBoundaryClearanceMeters', 'difficulty', 'preferredApproachSide', 'safeMissSide'],
          issues
        );
        if (!pin) return;
        const pinId = stableStringAt(pin, 'id', pinPath, ID, issues);
        if (pinId) pinIds.push(pinId);
        const position = pointAt(pin.position, `${pinPath}.position`, issues);
        const clearance = numberAt(pin, 'minimumBoundaryClearanceMeters', pinPath, 1.5, 12, issues);
        enumAt(pin.difficulty, `${pinPath}.difficulty`, ['accessible', 'balanced', 'demanding'] as const, issues);
        enumAt(
          pin.preferredApproachSide,
          `${pinPath}.preferredApproachSide`,
          ['left', 'center', 'right'] as const,
          issues
        );
        enumAt(pin.safeMissSide, `${pinPath}.safeMissSide`, ['short', 'long', 'left', 'right'] as const, issues);
        if (position) {
          setPositions.push(`${position.x}:${position.y}:${position.z}`);
          if (!containsPoint(context.greenBoundary, position))
            issues.push({ path: `${pinPath}.position`, message: 'Pin must be inside the authored green boundary.' });
          else if (clearance !== null && boundaryClearance(context.greenBoundary, position) < clearance)
            issues.push({
              path: `${pinPath}.position`,
              message: 'Pin does not satisfy its authored minimum boundary clearance.'
            });
        }
      });
      if (new Set(setPositions).size !== setPositions.length)
        issues.push({ path: `${path}.pins`, message: 'Pin positions within a set must be unique.' });
    });
  }
  if (new Set(pinSetIds).size !== pinSetIds.length)
    issues.push({ path: '$.pinSets', message: 'Pin-set identifiers must be unique.' });
  if (new Set(pinIds).size !== pinIds.length)
    issues.push({ path: '$.pinSets', message: 'Pin identifiers must be unique across the package.' });

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  return { ok: true, value: deepFreeze(JSON.parse(JSON.stringify(input)) as TeePinConfigurationsV1) };
}
