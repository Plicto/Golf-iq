export const HOLE_SCHEMA_VERSION = 1 as const;

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface HoleV1 {
  readonly schemaVersion: typeof HOLE_SCHEMA_VERSION;
  readonly id: string;
  readonly courseId: string;
  readonly revision: number;
  readonly holeNumber: number;
  readonly par: 3 | 4 | 5;
  readonly strokeIndex: number;
  readonly geometry: {
    readonly terrainRef: string;
    readonly surfaceShapeSetRef: string;
    readonly collisionRef: string;
  };
  readonly routing: {
    readonly centerline: ReadonlyArray<WorldPoint>;
    readonly designLengthMeters: number;
  };
  readonly targets: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'landing' | 'layup' | 'green' | 'recovery';
    readonly position: WorldPoint;
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
    readonly position: WorldPoint;
    readonly lookAt: WorldPoint;
    readonly fieldOfViewDegrees: number;
  }>;
  readonly tees: ReadonlyArray<{
    readonly id: string;
    readonly courseTeeId: string;
    readonly position: WorldPoint;
    readonly headingDegrees: number;
  }>;
  readonly green: {
    readonly surfaceRef: string;
    readonly boundaryRef: string;
    readonly contourRef: string;
    readonly pinSetRef: string;
    readonly primaryTargetRef: string;
  };
}

export interface HoleValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type HoleValidationResult =
  | { readonly ok: true; readonly value: Readonly<HoleV1> }
  | { readonly ok: false; readonly issues: ReadonlyArray<HoleValidationIssue> };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function objectAt(
  value: unknown,
  path: string,
  keys: ReadonlyArray<string>,
  issues: HoleValidationIssue[]
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

function idAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: HoleValidationIssue[]
): string | null {
  const value = record[key];
  if (typeof value !== 'string' || !ID.test(value)) {
    issues.push({ path: `${path}.${key}`, message: 'Expected a stable lowercase identifier.' });
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
  issues: HoleValidationIssue[],
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
  record: Record<string, unknown>,
  key: string,
  path: string,
  allowed: ReadonlyArray<T>,
  issues: HoleValidationIssue[]
): T | null {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push({ path: `${path}.${key}`, message: `Expected one of: ${allowed.join(', ')}.` });
    return null;
  }
  return value as T;
}

function pointAt(value: unknown, path: string, issues: HoleValidationIssue[]): WorldPoint | null {
  const point = objectAt(value, path, ['x', 'y', 'z'], issues);
  if (!point) return null;
  const x = numberAt(point, 'x', path, -20_000, 20_000, issues);
  const y = numberAt(point, 'y', path, -1_000, 5_000, issues);
  const z = numberAt(point, 'z', path, -20_000, 20_000, issues);
  return x === null || y === null || z === null ? null : { x, y, z };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateHole(input: unknown): HoleValidationResult {
  const issues: HoleValidationIssue[] = [];
  const root = objectAt(
    input,
    '$',
    [
      'schemaVersion',
      'id',
      'courseId',
      'revision',
      'holeNumber',
      'par',
      'strokeIndex',
      'geometry',
      'routing',
      'targets',
      'hazards',
      'cameraAnchors',
      'tees',
      'green'
    ],
    issues
  );
  if (!root) return { ok: false, issues };
  if (root.schemaVersion !== HOLE_SCHEMA_VERSION)
    issues.push({ path: '$.schemaVersion', message: 'Only hole schema version 1 is supported.' });
  idAt(root, 'id', '$', issues);
  idAt(root, 'courseId', '$', issues);
  numberAt(root, 'revision', '$', 1, 1_000_000, issues, true);
  numberAt(root, 'holeNumber', '$', 1, 18, issues, true);
  const par = numberAt(root, 'par', '$', 3, 5, issues, true);
  if (par !== null && ![3, 4, 5].includes(par)) issues.push({ path: '$.par', message: 'Par must be 3, 4, or 5.' });
  numberAt(root, 'strokeIndex', '$', 1, 18, issues, true);

  const geometry = objectAt(root.geometry, '$.geometry', ['terrainRef', 'surfaceShapeSetRef', 'collisionRef'], issues);
  if (geometry)
    for (const key of ['terrainRef', 'surfaceShapeSetRef', 'collisionRef']) idAt(geometry, key, '$.geometry', issues);

  const routing = objectAt(root.routing, '$.routing', ['centerline', 'designLengthMeters'], issues);
  if (routing) {
    numberAt(routing, 'designLengthMeters', '$.routing', 45, 750, issues);
    if (!Array.isArray(routing.centerline) || routing.centerline.length < 2 || routing.centerline.length > 32) {
      issues.push({ path: '$.routing.centerline', message: 'Routing requires two through thirty-two world points.' });
    } else
      routing.centerline.forEach((point, index) => {
        pointAt(point, `$.routing.centerline[${index}]`, issues);
      });
  }

  const targetIds: string[] = [];
  const greenTargetIds = new Set<string>();
  if (!Array.isArray(root.targets) || root.targets.length === 0) {
    issues.push({ path: '$.targets', message: 'At least one strategic target is required.' });
  } else {
    root.targets.forEach((entry, index) => {
      const path = `$.targets[${index}]`;
      const target = objectAt(entry, path, ['id', 'kind', 'position', 'radiusMeters'], issues);
      if (!target) return;
      const id = idAt(target, 'id', path, issues);
      const kind = enumAt(target, 'kind', path, ['landing', 'layup', 'green', 'recovery'], issues);
      if (id) targetIds.push(id);
      if (id && kind === 'green') greenTargetIds.add(id);
      pointAt(target.position, `${path}.position`, issues);
      numberAt(target, 'radiusMeters', path, 0.5, 80, issues);
    });
  }
  if (new Set(targetIds).size !== targetIds.length)
    issues.push({ path: '$.targets', message: 'Target identifiers must be unique.' });

  const hazardIds: string[] = [];
  if (!Array.isArray(root.hazards)) issues.push({ path: '$.hazards', message: 'Expected an array.' });
  else
    root.hazards.forEach((entry, index) => {
      const path = `$.hazards[${index}]`;
      const hazard = objectAt(entry, path, ['id', 'kind', 'shapeRef'], issues);
      if (!hazard) return;
      const id = idAt(hazard, 'id', path, issues);
      if (id) hazardIds.push(id);
      enumAt(hazard, 'kind', path, ['bunker', 'water', 'penalty', 'boundary'], issues);
      idAt(hazard, 'shapeRef', path, issues);
    });
  if (new Set(hazardIds).size !== hazardIds.length)
    issues.push({ path: '$.hazards', message: 'Hazard identifiers must be unique.' });

  const cameraIds: string[] = [];
  const cameraModes = new Set<string>();
  if (!Array.isArray(root.cameraAnchors) || root.cameraAnchors.length === 0) {
    issues.push({ path: '$.cameraAnchors', message: 'Authored camera anchors are required.' });
  } else {
    root.cameraAnchors.forEach((entry, index) => {
      const path = `$.cameraAnchors[${index}]`;
      const camera = objectAt(entry, path, ['id', 'mode', 'position', 'lookAt', 'fieldOfViewDegrees'], issues);
      if (!camera) return;
      const id = idAt(camera, 'id', path, issues);
      if (id) cameraIds.push(id);
      const mode = enumAt(camera, 'mode', path, ['establishing', 'decision', 'landing', 'green-reading'], issues);
      if (mode) cameraModes.add(mode);
      pointAt(camera.position, `${path}.position`, issues);
      pointAt(camera.lookAt, `${path}.lookAt`, issues);
      numberAt(camera, 'fieldOfViewDegrees', path, 20, 80, issues);
    });
  }
  if (new Set(cameraIds).size !== cameraIds.length)
    issues.push({ path: '$.cameraAnchors', message: 'Camera identifiers must be unique.' });
  for (const required of ['establishing', 'decision', 'landing'])
    if (!cameraModes.has(required))
      issues.push({ path: '$.cameraAnchors', message: `Missing ${required} camera anchor.` });

  const teeIds: string[] = [];
  const courseTeeIds: string[] = [];
  if (!Array.isArray(root.tees) || root.tees.length === 0)
    issues.push({ path: '$.tees', message: 'At least one tee is required.' });
  else
    root.tees.forEach((entry, index) => {
      const path = `$.tees[${index}]`;
      const tee = objectAt(entry, path, ['id', 'courseTeeId', 'position', 'headingDegrees'], issues);
      if (!tee) return;
      const id = idAt(tee, 'id', path, issues);
      const courseTeeId = idAt(tee, 'courseTeeId', path, issues);
      if (id) teeIds.push(id);
      if (courseTeeId) courseTeeIds.push(courseTeeId);
      pointAt(tee.position, `${path}.position`, issues);
      numberAt(tee, 'headingDegrees', path, 0, 359.999_999, issues);
    });
  if (new Set(teeIds).size !== teeIds.length || new Set(courseTeeIds).size !== courseTeeIds.length)
    issues.push({ path: '$.tees', message: 'Tee and course-tee references must be unique.' });

  const green = objectAt(
    root.green,
    '$.green',
    ['surfaceRef', 'boundaryRef', 'contourRef', 'pinSetRef', 'primaryTargetRef'],
    issues
  );
  if (green) {
    for (const key of ['surfaceRef', 'boundaryRef', 'contourRef', 'pinSetRef', 'primaryTargetRef'])
      idAt(green, key, '$.green', issues);
    if (typeof green.primaryTargetRef === 'string' && !greenTargetIds.has(green.primaryTargetRef))
      issues.push({ path: '$.green.primaryTargetRef', message: 'Primary target must reference a green target.' });
  }

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  return { ok: true, value: deepFreeze(JSON.parse(JSON.stringify(input)) as HoleV1) };
}

export function parseHoleJson(json: string): HoleValidationResult {
  try {
    return validateHole(JSON.parse(json));
  } catch {
    return { ok: false, issues: Object.freeze([{ path: '$', message: 'Malformed JSON.' }]) };
  }
}
