import { type CourseAssetManifestV1, validateCourseAssetManifest } from './courseAssetManifest.js';
import { type CourseV1, validateCourse } from './courseData.js';
import {
  type GameplaySurfaceShapeSetV1,
  type GameplaySurfaceKind,
  validateGameplaySurfaceShapeSet
} from './gameplaySurfaceShapes.js';
import { type HazardRulesDataV1, validateHazardRulesData } from './hazardRulesData.js';
import { type HoleV1, validateHole } from './holeData.js';
import {
  type TeePinConfigurationsV1,
  type TeePinValidationContext,
  validateTeePinConfigurations
} from './teePinConfigurations.js';

export const COURSE_PACKAGE_SCHEMA_VERSION = 1 as const;

export interface ValidatedCoursePackageV1 {
  readonly schemaVersion: typeof COURSE_PACKAGE_SCHEMA_VERSION;
  readonly course: Readonly<CourseV1>;
  readonly assetManifest: Readonly<CourseAssetManifestV1>;
  readonly holes: ReadonlyArray<Readonly<HoleV1>>;
  readonly surfaceShapeSets: ReadonlyArray<Readonly<GameplaySurfaceShapeSetV1>>;
  readonly hazardRules: ReadonlyArray<Readonly<HazardRulesDataV1>>;
  readonly teePinConfigurations: ReadonlyArray<Readonly<TeePinConfigurationsV1>>;
}

export interface CoursePackageValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type CoursePackageValidationResult =
  | { readonly ok: true; readonly value: Readonly<ValidatedCoursePackageV1> }
  | { readonly ok: false; readonly issues: ReadonlyArray<CoursePackageValidationIssue> };

function objectAt(
  value: unknown,
  path: string,
  keys: ReadonlyArray<string>,
  issues: CoursePackageValidationIssue[]
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

function appendIssues(
  destination: CoursePackageValidationIssue[],
  prefix: string,
  source: ReadonlyArray<{ readonly path: string; readonly message: string }>
): void {
  for (const issue of source) {
    destination.push({
      path: issue.path === '$' ? prefix : `${prefix}${issue.path.slice(1)}`,
      message: issue.message
    });
  }
}

function validatedArray<T>(
  value: unknown,
  path: string,
  validate: (
    entry: unknown
  ) =>
    | { readonly ok: true; readonly value: Readonly<T> }
    | { readonly ok: false; readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }> },
  issues: CoursePackageValidationIssue[]
): ReadonlyArray<Readonly<T>> {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: 'Expected a non-empty array.' });
    return [];
  }
  const accepted: Readonly<T>[] = [];
  value.forEach((entry, index) => {
    const result = validate(entry);
    if (result.ok) accepted.push(result.value);
    else appendIssues(issues, `${path}[${index}]`, result.issues);
  });
  return accepted;
}

function uniqueById<T extends { readonly id: string }>(
  values: ReadonlyArray<Readonly<T>>,
  path: string,
  issues: CoursePackageValidationIssue[]
): ReadonlyMap<string, Readonly<T>> {
  const result = new Map<string, Readonly<T>>();
  for (const value of values) {
    if (result.has(value.id)) issues.push({ path, message: `Duplicate package identifier: ${value.id}.` });
    else result.set(value.id, value);
  }
  return result;
}

function requireAssetReferences(
  references: ReadonlyArray<string>,
  assets: ReadonlySet<string>,
  path: string,
  issues: CoursePackageValidationIssue[]
): void {
  for (const reference of references) {
    if (!assets.has(reference)) issues.push({ path, message: `Unknown asset reference: ${reference}.` });
  }
}

function requireShapeReference(
  reference: string,
  shapes: ReadonlyMap<string, GameplaySurfaceKind>,
  allowed: ReadonlyArray<GameplaySurfaceKind>,
  path: string,
  issues: CoursePackageValidationIssue[]
): void {
  const kind = shapes.get(reference);
  if (!kind) issues.push({ path, message: `Unknown gameplay-surface reference: ${reference}.` });
  else if (!allowed.includes(kind))
    issues.push({ path, message: `Surface reference ${reference} has incompatible ${kind} semantics.` });
}

function packageHoleId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const holeId = (value as Record<string, unknown>).holeId;
  return typeof holeId === 'string' ? holeId : null;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateCoursePackage(input: unknown): CoursePackageValidationResult {
  const issues: CoursePackageValidationIssue[] = [];
  const root = objectAt(
    input,
    '$',
    ['schemaVersion', 'course', 'assetManifest', 'holes', 'surfaceShapeSets', 'hazardRules', 'teePinConfigurations'],
    issues
  );
  if (!root) return { ok: false, issues };
  if (root.schemaVersion !== COURSE_PACKAGE_SCHEMA_VERSION)
    issues.push({ path: '$.schemaVersion', message: 'Only course package schema version 1 is supported.' });

  const courseResult = validateCourse(root.course);
  if (!courseResult.ok) appendIssues(issues, '$.course', courseResult.issues);
  const manifestResult = validateCourseAssetManifest(root.assetManifest);
  if (!manifestResult.ok) appendIssues(issues, '$.assetManifest', manifestResult.issues);
  const holes = validatedArray(root.holes, '$.holes', validateHole, issues);
  const shapeSets = validatedArray(
    root.surfaceShapeSets,
    '$.surfaceShapeSets',
    validateGameplaySurfaceShapeSet,
    issues
  );
  const rules = validatedArray(root.hazardRules, '$.hazardRules', validateHazardRulesData, issues);

  if (courseResult.ok && Array.isArray(root.holes) && root.holes.length !== courseResult.value.holeOrder.length)
    issues.push({ path: '$.holes', message: 'Package hole count must match the complete course order.' });

  if (!courseResult.ok || !manifestResult.ok) return { ok: false, issues: Object.freeze(issues) };
  const course = courseResult.value;
  const manifest = manifestResult.value;
  const holesById = uniqueById(holes, '$.holes', issues);
  const shapeSetsById = uniqueById(shapeSets, '$.surfaceShapeSets', issues);
  const rulesByHole = new Map<string, Readonly<HazardRulesDataV1>>();
  for (const rule of rules) {
    if (rulesByHole.has(rule.holeId))
      issues.push({ path: '$.hazardRules', message: `Duplicate hazard-rules package for hole ${rule.holeId}.` });
    else rulesByHole.set(rule.holeId, rule);
  }
  const assetIds = new Set(manifest.assets.map((asset) => asset.id));

  if (manifest.courseId !== course.id)
    issues.push({ path: '$.assetManifest.courseId', message: 'Asset manifest must belong to the course.' });
  if (course.assets.manifestRef !== manifest.id)
    issues.push({
      path: '$.course.assets.manifestRef',
      message: 'Course manifest reference does not match the package.'
    });
  requireAssetReferences(
    [course.assets.environmentPresetRef, ...course.assets.sharedGeometryRefs],
    assetIds,
    '$.course.assets',
    issues
  );

  const orderedHoleIds = new Set(course.holeOrder);
  for (const holeId of course.holeOrder) {
    if (!holesById.has(holeId)) issues.push({ path: '$.holes', message: `Missing ordered hole package: ${holeId}.` });
  }
  for (const hole of holes) {
    if (!orderedHoleIds.has(hole.id))
      issues.push({ path: '$.holes', message: `Hole ${hole.id} is outside course order.` });
    if (hole.courseId !== course.id)
      issues.push({ path: '$.holes', message: `Hole ${hole.id} belongs to a different course.` });
    const expectedIndex = course.holeOrder.indexOf(hole.id) + 1;
    if (expectedIndex > 0 && hole.holeNumber !== expectedIndex)
      issues.push({ path: '$.holes', message: `Hole ${hole.id} number does not match course order.` });
  }
  if (new Set(holes.map((hole) => hole.strokeIndex)).size !== holes.length)
    issues.push({ path: '$.holes', message: 'Stroke indexes must be unique across the course.' });

  const teePinPackages: Readonly<TeePinConfigurationsV1>[] = [];
  const rawTeePinPackages = Array.isArray(root.teePinConfigurations) ? root.teePinConfigurations : [];
  if (!Array.isArray(root.teePinConfigurations) || root.teePinConfigurations.length === 0)
    issues.push({ path: '$.teePinConfigurations', message: 'Expected a non-empty array.' });

  for (const hole of holes) {
    const shapeSet = shapeSetsById.get(hole.geometry.surfaceShapeSetRef);
    if (!shapeSet) {
      issues.push({
        path: '$.surfaceShapeSets',
        message: `Hole ${hole.id} references unknown shape set ${hole.geometry.surfaceShapeSetRef}.`
      });
      continue;
    }
    if (shapeSet.holeId !== hole.id)
      issues.push({ path: '$.surfaceShapeSets', message: `Shape set ${shapeSet.id} belongs to a different hole.` });
    const shapes = new Map(shapeSet.shapes.map((shape) => [shape.id, shape.surface] as const));
    requireAssetReferences(
      [hole.geometry.terrainRef, hole.geometry.collisionRef, hole.green.contourRef],
      assetIds,
      `$.holes.${hole.id}`,
      issues
    );
    requireShapeReference(hole.green.surfaceRef, shapes, ['green'], `$.holes.${hole.id}.green.surfaceRef`, issues);
    requireShapeReference(hole.green.boundaryRef, shapes, ['green'], `$.holes.${hole.id}.green.boundaryRef`, issues);
    for (const hazard of hole.hazards) {
      const allowed: ReadonlyArray<GameplaySurfaceKind> =
        hazard.kind === 'bunker'
          ? ['bunker']
          : hazard.kind === 'water'
            ? ['water']
            : hazard.kind === 'boundary'
              ? ['boundary']
              : ['water', 'boundary'];
      requireShapeReference(hazard.shapeRef, shapes, allowed, `$.holes.${hole.id}.hazards.${hazard.id}`, issues);
    }
    const rule = rulesByHole.get(hole.id);
    if (!rule) issues.push({ path: '$.hazardRules', message: `Missing hazard-rules package for hole ${hole.id}.` });
    else {
      for (const area of rule.penaltyAreas)
        requireShapeReference(area.shapeRef, shapes, ['water'], `$.hazardRules.${rule.id}`, issues);
      for (const reference of rule.outOfBounds.shapeRefs)
        requireShapeReference(reference, shapes, ['boundary'], `$.hazardRules.${rule.id}`, issues);
    }

    const rawMatches = rawTeePinPackages.filter((entry) => packageHoleId(entry) === hole.id);
    if (rawMatches.length !== 1) {
      issues.push({
        path: '$.teePinConfigurations',
        message: `Hole ${hole.id} requires exactly one tee-and-pin package.`
      });
      continue;
    }
    const green = shapeSet.shapes.find((shape) => shape.id === hole.green.boundaryRef && shape.surface === 'green');
    if (!green) continue;
    const context: TeePinValidationContext = {
      holeId: hole.id,
      teeReferences: hole.tees.map((tee) => ({ id: tee.id, courseTeeId: tee.courseTeeId })),
      greenBoundary: green.geometry.points
    };
    const teePinResult = validateTeePinConfigurations(rawMatches[0], context);
    if (!teePinResult.ok) appendIssues(issues, `$.teePinConfigurations.${hole.id}`, teePinResult.issues);
    else {
      teePinPackages.push(teePinResult.value);
      if (!teePinResult.value.pinSets.some((pinSet) => pinSet.id === hole.green.pinSetRef))
        issues.push({
          path: `$.holes.${hole.id}.green.pinSetRef`,
          message: `Unknown authored pin set: ${hole.green.pinSetRef}.`
        });
      const configuredTeePairs = new Set(
        teePinResult.value.teeConfigurations.map((tee) => `${tee.holeTeeRef}:${tee.courseTeeId}`)
      );
      for (const tee of hole.tees) {
        if (!configuredTeePairs.has(`${tee.id}:${tee.courseTeeId}`))
          issues.push({ path: `$.teePinConfigurations.${hole.id}`, message: `Missing playable tee ${tee.id}.` });
      }
    }
  }

  for (const shapeSet of shapeSets) {
    if (!holesById.has(shapeSet.holeId))
      issues.push({ path: '$.surfaceShapeSets', message: `Shape set ${shapeSet.id} belongs to an unknown hole.` });
  }
  for (const rule of rules) {
    if (!holesById.has(rule.holeId))
      issues.push({ path: '$.hazardRules', message: `Rules package ${rule.id} belongs to an unknown hole.` });
  }

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: COURSE_PACKAGE_SCHEMA_VERSION,
      course,
      assetManifest: manifest,
      holes,
      surfaceShapeSets: shapeSets,
      hazardRules: rules,
      teePinConfigurations: teePinPackages
    })
  };
}
