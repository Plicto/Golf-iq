export const GAMEPLAY_SURFACE_SHAPES_SCHEMA_VERSION = 1 as const;

export type GameplaySurfaceKind = 'fairway' | 'rough' | 'green' | 'bunker' | 'water' | 'boundary';

export interface SurfacePoint {
  readonly x: number;
  readonly z: number;
}

export interface GameplaySurfaceShape {
  readonly id: string;
  readonly surface: GameplaySurfaceKind;
  readonly priority: number;
  readonly behavior: 'solid' | 'hazard' | 'boundary';
  readonly geometry: {
    readonly type: 'polygon';
    readonly points: ReadonlyArray<SurfacePoint>;
  };
}

export interface GameplaySurfaceShapeSetV1 {
  readonly schemaVersion: typeof GAMEPLAY_SURFACE_SHAPES_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly holeId: string;
  readonly shapes: ReadonlyArray<GameplaySurfaceShape>;
}

export interface SurfaceShapeValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type SurfaceShapeValidationResult =
  | { readonly ok: true; readonly value: Readonly<GameplaySurfaceShapeSetV1> }
  | { readonly ok: false; readonly issues: ReadonlyArray<SurfaceShapeValidationIssue> };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SURFACES: ReadonlyArray<GameplaySurfaceKind> = ['fairway', 'rough', 'green', 'bunker', 'water', 'boundary'];
const EXPECTED_BEHAVIOR: Readonly<Record<GameplaySurfaceKind, GameplaySurfaceShape['behavior']>> = Object.freeze({
  fairway: 'solid',
  rough: 'solid',
  green: 'solid',
  bunker: 'solid',
  water: 'hazard',
  boundary: 'boundary'
});

function objectAt(
  value: unknown,
  path: string,
  keys: ReadonlyArray<string>,
  issues: SurfaceShapeValidationIssue[]
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

function finiteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -20_000 && value <= 20_000;
}

function orientation(a: SurfacePoint, b: SurfacePoint, c: SurfacePoint): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsCross(a: SurfacePoint, b: SurfacePoint, c: SurfacePoint, d: SurfacePoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function hasSelfIntersection(points: ReadonlyArray<SurfacePoint>): boolean {
  for (let first = 0; first < points.length; first += 1) {
    const a = points[first];
    const b = points[(first + 1) % points.length];
    if (!a || !b) return true;
    for (let second = first + 1; second < points.length; second += 1) {
      if (Math.abs(first - second) <= 1 || (first === 0 && second === points.length - 1)) continue;
      const c = points[second];
      const d = points[(second + 1) % points.length];
      if (!c || !d) return true;
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

function signedArea(points: ReadonlyArray<SurfacePoint>): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (point && next) twiceArea += point.x * next.z - next.x * point.z;
  }
  return twiceArea / 2;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateGameplaySurfaceShapeSet(input: unknown): SurfaceShapeValidationResult {
  const issues: SurfaceShapeValidationIssue[] = [];
  const root = objectAt(input, '$', ['schemaVersion', 'id', 'revision', 'holeId', 'shapes'], issues);
  if (!root) return { ok: false, issues };
  if (root.schemaVersion !== GAMEPLAY_SURFACE_SHAPES_SCHEMA_VERSION)
    issues.push({ path: '$.schemaVersion', message: 'Only gameplay-surface shape schema version 1 is supported.' });
  for (const key of ['id', 'holeId'])
    if (typeof root[key] !== 'string' || !ID.test(root[key]))
      issues.push({ path: `$.${key}`, message: 'Expected a stable lowercase identifier.' });
  if (!Number.isInteger(root.revision) || (root.revision as number) < 1)
    issues.push({ path: '$.revision', message: 'Revision must be a positive integer.' });

  const ids: string[] = [];
  const represented = new Map<GameplaySurfaceKind, number>();
  if (!Array.isArray(root.shapes) || root.shapes.length < SURFACES.length || root.shapes.length > 128) {
    issues.push({ path: '$.shapes', message: 'Expected six through one hundred twenty-eight authored shapes.' });
  } else {
    root.shapes.forEach((entry, index) => {
      const path = `$.shapes[${index}]`;
      const shape = objectAt(entry, path, ['id', 'surface', 'priority', 'behavior', 'geometry'], issues);
      if (!shape) return;
      if (typeof shape.id !== 'string' || !ID.test(shape.id))
        issues.push({ path: `${path}.id`, message: 'Invalid shape id.' });
      else ids.push(shape.id);
      if (typeof shape.surface !== 'string' || !SURFACES.includes(shape.surface as GameplaySurfaceKind)) {
        issues.push({ path: `${path}.surface`, message: 'Unsupported gameplay surface.' });
      } else {
        const surface = shape.surface as GameplaySurfaceKind;
        represented.set(surface, (represented.get(surface) ?? 0) + 1);
        if (shape.behavior !== EXPECTED_BEHAVIOR[surface])
          issues.push({
            path: `${path}.behavior`,
            message: `${surface} requires ${EXPECTED_BEHAVIOR[surface]} behavior.`
          });
      }
      if (!Number.isInteger(shape.priority) || (shape.priority as number) < 0 || (shape.priority as number) > 1_000)
        issues.push({
          path: `${path}.priority`,
          message: 'Priority must be an integer from zero through one thousand.'
        });

      const geometry = objectAt(shape.geometry, `${path}.geometry`, ['type', 'points'], issues);
      if (!geometry) return;
      if (geometry.type !== 'polygon')
        issues.push({ path: `${path}.geometry.type`, message: 'Only polygon geometry is supported.' });
      if (!Array.isArray(geometry.points) || geometry.points.length < 3 || geometry.points.length > 256) {
        issues.push({
          path: `${path}.geometry.points`,
          message: 'A polygon requires three through two hundred fifty-six points.'
        });
        return;
      }
      const points: SurfacePoint[] = [];
      geometry.points.forEach((pointValue, pointIndex) => {
        const pointPath = `${path}.geometry.points[${pointIndex}]`;
        const point = objectAt(pointValue, pointPath, ['x', 'z'], issues);
        if (!point || !finiteCoordinate(point.x) || !finiteCoordinate(point.z)) {
          issues.push({ path: pointPath, message: 'Expected finite bounded meter-space x and z.' });
        } else points.push({ x: point.x, z: point.z });
      });
      const pointKeys = points.map((point) => `${point.x}:${point.z}`);
      if (new Set(pointKeys).size !== pointKeys.length)
        issues.push({ path: `${path}.geometry.points`, message: 'Polygon points must be unique.' });
      if (points.length === geometry.points.length) {
        if (signedArea(points) <= 0.1)
          issues.push({
            path: `${path}.geometry.points`,
            message: 'Polygon must be counter-clockwise with non-zero area.'
          });
        if (hasSelfIntersection(points))
          issues.push({ path: `${path}.geometry.points`, message: 'Polygon must not self-intersect.' });
      }
    });
  }
  if (new Set(ids).size !== ids.length) issues.push({ path: '$.shapes', message: 'Shape identifiers must be unique.' });
  for (const surface of SURFACES)
    if (!represented.has(surface)) issues.push({ path: '$.shapes', message: `Missing required ${surface} shape.` });
  if ((represented.get('boundary') ?? 0) !== 1)
    issues.push({ path: '$.shapes', message: 'Exactly one playable boundary shape is required.' });

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  return { ok: true, value: deepFreeze(JSON.parse(JSON.stringify(input)) as GameplaySurfaceShapeSetV1) };
}

function containsPoint(points: ReadonlyArray<SurfacePoint>, point: Readonly<SurfacePoint>): boolean {
  let inside = false;
  for (let index = 0, prior = points.length - 1; index < points.length; prior = index, index += 1) {
    const a = points[index];
    const b = points[prior];
    if (!a || !b) continue;
    const crosses = a.z > point.z !== b.z > point.z;
    if (crosses && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function classifyGameplaySurface(
  set: Readonly<GameplaySurfaceShapeSetV1>,
  point: Readonly<SurfacePoint>
): GameplaySurfaceKind | null {
  const result = validateGameplaySurfaceShapeSet(set);
  if (!result.ok) throw new TypeError('Cannot classify an invalid gameplay-surface shape set.');
  if (!finiteCoordinate(point.x) || !finiteCoordinate(point.z))
    throw new TypeError('Classification point must be finite.');
  const boundary = set.shapes.find((shape) => shape.surface === 'boundary');
  if (!boundary || !containsPoint(boundary.geometry.points, point)) return 'boundary';
  const matches = set.shapes
    .filter((shape) => shape.surface !== 'boundary' && containsPoint(shape.geometry.points, point))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  return matches[0]?.surface ?? null;
}
