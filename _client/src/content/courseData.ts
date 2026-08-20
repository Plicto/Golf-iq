export const COURSE_SCHEMA_VERSION = 1 as const;

export interface CourseV1 {
  readonly schemaVersion: typeof COURSE_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly content: {
    readonly nameKey: string;
    readonly descriptionKey: string;
    readonly fictional: true;
  };
  readonly world: {
    readonly units: 'meters';
    readonly coordinateSystem: 'golf-iq-rh-y-up-v1';
    readonly defaultHeadingDegrees: number;
    readonly altitudeMeters: number;
  };
  readonly assets: {
    readonly manifestRef: string;
    readonly environmentPresetRef: string;
    readonly sharedGeometryRefs: ReadonlyArray<string>;
  };
  readonly tees: ReadonlyArray<{
    readonly id: string;
    readonly nameKey: string;
    readonly color: string;
  }>;
  readonly holeOrder: ReadonlyArray<string>;
  readonly compatibility: {
    readonly contentApiVersion: 1;
    readonly minimumAppVersion: string;
    readonly requiredFeatures: ReadonlyArray<string>;
  };
}

export interface CourseValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type CourseValidationResult =
  | { readonly ok: true; readonly value: Readonly<CourseV1> }
  | { readonly ok: false; readonly issues: ReadonlyArray<CourseValidationIssue> };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const COLOR = /^#[0-9a-f]{6}$/;

function objectAt(
  value: unknown,
  path: string,
  keys: ReadonlyArray<string>,
  issues: CourseValidationIssue[]
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

function stringAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  pattern: RegExp,
  issues: CourseValidationIssue[]
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
  issues: CourseValidationIssue[],
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

function stringArrayAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: CourseValidationIssue[],
  allowEmpty = false
): string[] | null {
  const value = record[key];
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push({ path: `${path}.${key}`, message: 'Expected a non-empty array.' });
    return null;
  }
  const result: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !ID.test(entry)) {
      issues.push({ path: `${path}.${key}[${index}]`, message: 'Expected a stable identifier.' });
    } else result.push(entry);
  });
  if (new Set(result).size !== result.length)
    issues.push({ path: `${path}.${key}`, message: 'Values must be unique.' });
  return result;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateCourse(input: unknown): CourseValidationResult {
  const issues: CourseValidationIssue[] = [];
  const root = objectAt(
    input,
    '$',
    ['schemaVersion', 'id', 'revision', 'content', 'world', 'assets', 'tees', 'holeOrder', 'compatibility'],
    issues
  );
  if (!root) return { ok: false, issues };

  if (root.schemaVersion !== COURSE_SCHEMA_VERSION)
    issues.push({ path: '$.schemaVersion', message: 'Only course schema version 1 is supported.' });
  stringAt(root, 'id', '$', ID, issues);
  numberAt(root, 'revision', '$', 1, 1_000_000, issues, true);

  const content = objectAt(root.content, '$.content', ['nameKey', 'descriptionKey', 'fictional'], issues);
  if (content) {
    stringAt(content, 'nameKey', '$.content', KEY, issues);
    stringAt(content, 'descriptionKey', '$.content', KEY, issues);
    if (content.fictional !== true)
      issues.push({ path: '$.content.fictional', message: 'Version 1 courses are fictional.' });
  }

  const world = objectAt(
    root.world,
    '$.world',
    ['units', 'coordinateSystem', 'defaultHeadingDegrees', 'altitudeMeters'],
    issues
  );
  if (world) {
    if (world.units !== 'meters') issues.push({ path: '$.world.units', message: 'World units must be meters.' });
    if (world.coordinateSystem !== 'golf-iq-rh-y-up-v1')
      issues.push({ path: '$.world.coordinateSystem', message: 'Unsupported coordinate system.' });
    numberAt(world, 'defaultHeadingDegrees', '$.world', 0, 359.999_999, issues);
    numberAt(world, 'altitudeMeters', '$.world', -500, 5_000, issues);
  }

  const assets = objectAt(
    root.assets,
    '$.assets',
    ['manifestRef', 'environmentPresetRef', 'sharedGeometryRefs'],
    issues
  );
  if (assets) {
    stringAt(assets, 'manifestRef', '$.assets', ID, issues);
    stringAt(assets, 'environmentPresetRef', '$.assets', ID, issues);
    stringArrayAt(assets, 'sharedGeometryRefs', '$.assets', issues, true);
  }

  const teeIds: string[] = [];
  if (!Array.isArray(root.tees) || root.tees.length === 0 || root.tees.length > 8) {
    issues.push({ path: '$.tees', message: 'Expected one through eight tee definitions.' });
  } else {
    root.tees.forEach((entry, index) => {
      const path = `$.tees[${index}]`;
      const tee = objectAt(entry, path, ['id', 'nameKey', 'color'], issues);
      if (!tee) return;
      const id = stringAt(tee, 'id', path, ID, issues);
      if (id) teeIds.push(id);
      stringAt(tee, 'nameKey', path, KEY, issues);
      stringAt(tee, 'color', path, COLOR, issues);
    });
  }
  if (new Set(teeIds).size !== teeIds.length)
    issues.push({ path: '$.tees', message: 'Tee identifiers must be unique.' });

  const holeOrder = stringArrayAt(root, 'holeOrder', '$', issues);
  if (holeOrder && holeOrder.length !== 9 && holeOrder.length !== 18)
    issues.push({ path: '$.holeOrder', message: 'A course must define exactly nine or eighteen holes.' });

  const compatibility = objectAt(
    root.compatibility,
    '$.compatibility',
    ['contentApiVersion', 'minimumAppVersion', 'requiredFeatures'],
    issues
  );
  if (compatibility) {
    if (compatibility.contentApiVersion !== 1)
      issues.push({ path: '$.compatibility.contentApiVersion', message: 'Unsupported content API version.' });
    stringAt(compatibility, 'minimumAppVersion', '$.compatibility', VERSION, issues);
    stringArrayAt(compatibility, 'requiredFeatures', '$.compatibility', issues, true);
  }

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  const copied = JSON.parse(JSON.stringify(input)) as CourseV1;
  return { ok: true, value: deepFreeze(copied) };
}

export function parseCourseJson(json: string): CourseValidationResult {
  try {
    return validateCourse(JSON.parse(json));
  } catch {
    return { ok: false, issues: Object.freeze([{ path: '$', message: 'Malformed JSON.' }]) };
  }
}
