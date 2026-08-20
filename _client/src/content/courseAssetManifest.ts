export const COURSE_ASSET_MANIFEST_SCHEMA_VERSION = 1 as const;

export type CourseAssetKind = 'model' | 'texture' | 'audio' | 'data';
export type CourseAssetQualityTier = 'low' | 'balanced' | 'high';

export interface CourseAssetManifestV1 {
  readonly schemaVersion: typeof COURSE_ASSET_MANIFEST_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly courseId: string;
  readonly assetRoot: string;
  readonly budgets: {
    readonly maximumDownloadBytes: number;
    readonly maximumResidentBytes: number;
    readonly maximumModelTriangles: number;
    readonly maximumTexturePixels: number;
    readonly maximumAudioSeconds: number;
  };
  readonly assets: ReadonlyArray<{
    readonly id: string;
    readonly kind: CourseAssetKind;
    readonly uri: string;
    readonly contentHash: string;
    readonly downloadBytes: number;
    readonly residentBytes: number;
    readonly qualityTiers: ReadonlyArray<CourseAssetQualityTier>;
    readonly required: boolean;
    readonly fallbackRef: string | null;
    readonly dependencies: ReadonlyArray<string>;
    readonly metrics: {
      readonly triangleCount: number;
      readonly texturePixels: number;
      readonly audioSeconds: number;
    };
  }>;
}

export interface CourseAssetManifestIssue {
  readonly path: string;
  readonly message: string;
}

export type CourseAssetManifestValidationResult =
  | { readonly ok: true; readonly value: Readonly<CourseAssetManifestV1> }
  | { readonly ok: false; readonly issues: ReadonlyArray<CourseAssetManifestIssue> };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ROOT = /^[a-z0-9][a-z0-9/_-]*\/$/;
const URI = /^[a-z0-9][a-z0-9/_.-]*$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const KINDS: ReadonlyArray<CourseAssetKind> = ['model', 'texture', 'audio', 'data'];
const TIERS: ReadonlyArray<CourseAssetQualityTier> = ['low', 'balanced', 'high'];

function objectAt(
  value: unknown,
  path: string,
  keys: ReadonlyArray<string>,
  issues: CourseAssetManifestIssue[]
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

function integerAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
  issues: CourseAssetManifestIssue[]
): number | null {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    issues.push({ path: `${path}.${key}`, message: `Expected an integer from ${minimum} through ${maximum}.` });
    return null;
  }
  return value as number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function hasCycle(edges: ReadonlyMap<string, ReadonlyArray<string>>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...edges.keys()].some(visit);
}

export function validateCourseAssetManifest(input: unknown): CourseAssetManifestValidationResult {
  const issues: CourseAssetManifestIssue[] = [];
  const root = objectAt(
    input,
    '$',
    ['schemaVersion', 'id', 'revision', 'courseId', 'assetRoot', 'budgets', 'assets'],
    issues
  );
  if (!root) return { ok: false, issues };
  if (root.schemaVersion !== COURSE_ASSET_MANIFEST_SCHEMA_VERSION)
    issues.push({ path: '$.schemaVersion', message: 'Only course-asset manifest schema version 1 is supported.' });
  for (const key of ['id', 'courseId']) {
    if (typeof root[key] !== 'string' || !ID.test(root[key]))
      issues.push({ path: `$.${key}`, message: 'Expected a stable lowercase identifier.' });
  }
  integerAt(root, 'revision', '$', 1, 1_000_000, issues);
  if (typeof root.assetRoot !== 'string' || !ROOT.test(root.assetRoot) || root.assetRoot.includes('..'))
    issues.push({ path: '$.assetRoot', message: 'Expected a safe relative asset root ending in a slash.' });

  const budgets = objectAt(
    root.budgets,
    '$.budgets',
    [
      'maximumDownloadBytes',
      'maximumResidentBytes',
      'maximumModelTriangles',
      'maximumTexturePixels',
      'maximumAudioSeconds'
    ],
    issues
  );
  const budgetValues = budgets
    ? {
        download: integerAt(budgets, 'maximumDownloadBytes', '$.budgets', 1, 2_000_000_000, issues),
        resident: integerAt(budgets, 'maximumResidentBytes', '$.budgets', 1, 2_000_000_000, issues),
        triangles: integerAt(budgets, 'maximumModelTriangles', '$.budgets', 1, 20_000_000, issues),
        pixels: integerAt(budgets, 'maximumTexturePixels', '$.budgets', 1, 1_000_000_000, issues),
        audio: integerAt(budgets, 'maximumAudioSeconds', '$.budgets', 1, 86_400, issues)
      }
    : null;

  const ids: string[] = [];
  const uris: string[] = [];
  const kinds = new Map<string, CourseAssetKind>();
  const fallbacks = new Map<string, string | null>();
  const required = new Map<string, boolean>();
  const dependencies = new Map<string, ReadonlyArray<string>>();
  let download = 0;
  let resident = 0;
  let triangles = 0;
  let pixels = 0;
  let audio = 0;
  if (!Array.isArray(root.assets) || root.assets.length === 0 || root.assets.length > 2_000) {
    issues.push({ path: '$.assets', message: 'Expected one through two thousand asset entries.' });
  } else {
    root.assets.forEach((entry, index) => {
      const path = `$.assets[${index}]`;
      const asset = objectAt(
        entry,
        path,
        [
          'id',
          'kind',
          'uri',
          'contentHash',
          'downloadBytes',
          'residentBytes',
          'qualityTiers',
          'required',
          'fallbackRef',
          'dependencies',
          'metrics'
        ],
        issues
      );
      if (!asset) return;
      const id = typeof asset.id === 'string' && ID.test(asset.id) ? asset.id : null;
      if (!id) issues.push({ path: `${path}.id`, message: 'Expected a stable lowercase identifier.' });
      else ids.push(id);
      const kind =
        typeof asset.kind === 'string' && KINDS.includes(asset.kind as CourseAssetKind)
          ? (asset.kind as CourseAssetKind)
          : null;
      if (!kind) issues.push({ path: `${path}.kind`, message: `Expected one of: ${KINDS.join(', ')}.` });
      if (
        typeof asset.uri !== 'string' ||
        !URI.test(asset.uri) ||
        asset.uri.includes('..') ||
        asset.uri.startsWith('/')
      )
        issues.push({ path: `${path}.uri`, message: 'Expected a safe relative asset URI.' });
      else uris.push(asset.uri);
      if (typeof asset.contentHash !== 'string' || !HASH.test(asset.contentHash))
        issues.push({ path: `${path}.contentHash`, message: 'Expected a lowercase sha256 content hash.' });
      const assetDownload = integerAt(asset, 'downloadBytes', path, 1, 1_000_000_000, issues);
      const assetResident = integerAt(asset, 'residentBytes', path, 1, 1_000_000_000, issues);
      if (assetDownload !== null) download += assetDownload;
      if (assetResident !== null) resident += assetResident;
      if (typeof asset.required !== 'boolean')
        issues.push({ path: `${path}.required`, message: 'Required status must be explicit.' });
      if (!Array.isArray(asset.qualityTiers) || asset.qualityTiers.length === 0) {
        issues.push({ path: `${path}.qualityTiers`, message: 'At least one quality tier is required.' });
      } else {
        const tiers = asset.qualityTiers.filter(
          (tier): tier is CourseAssetQualityTier =>
            typeof tier === 'string' && TIERS.includes(tier as CourseAssetQualityTier)
        );
        if (tiers.length !== asset.qualityTiers.length)
          issues.push({ path: `${path}.qualityTiers`, message: `Expected only: ${TIERS.join(', ')}.` });
        if (new Set(tiers).size !== tiers.length)
          issues.push({ path: `${path}.qualityTiers`, message: 'Quality tiers must be unique.' });
      }
      const fallback = asset.fallbackRef;
      if (fallback !== null && (typeof fallback !== 'string' || !ID.test(fallback)))
        issues.push({ path: `${path}.fallbackRef`, message: 'Expected a stable asset reference or null.' });
      const dependencyRefs: string[] = [];
      if (!Array.isArray(asset.dependencies)) {
        issues.push({ path: `${path}.dependencies`, message: 'Expected an array.' });
      } else {
        asset.dependencies.forEach((reference, dependencyIndex) => {
          if (typeof reference !== 'string' || !ID.test(reference))
            issues.push({
              path: `${path}.dependencies[${dependencyIndex}]`,
              message: 'Expected a stable asset reference.'
            });
          else dependencyRefs.push(reference);
        });
        if (new Set(dependencyRefs).size !== dependencyRefs.length)
          issues.push({ path: `${path}.dependencies`, message: 'Dependencies must be unique.' });
      }
      const metrics = objectAt(
        asset.metrics,
        `${path}.metrics`,
        ['triangleCount', 'texturePixels', 'audioSeconds'],
        issues
      );
      if (metrics) {
        const modelTriangles = integerAt(metrics, 'triangleCount', `${path}.metrics`, 0, 20_000_000, issues);
        const texturePixels = integerAt(metrics, 'texturePixels', `${path}.metrics`, 0, 1_000_000_000, issues);
        const audioSeconds = integerAt(metrics, 'audioSeconds', `${path}.metrics`, 0, 86_400, issues);
        if (modelTriangles !== null) triangles += modelTriangles;
        if (texturePixels !== null) pixels += texturePixels;
        if (audioSeconds !== null) audio += audioSeconds;
        if (kind === 'model' && modelTriangles === 0)
          issues.push({ path: `${path}.metrics.triangleCount`, message: 'Model assets require a triangle estimate.' });
        if (kind === 'texture' && texturePixels === 0)
          issues.push({ path: `${path}.metrics.texturePixels`, message: 'Texture assets require a pixel estimate.' });
        if (kind === 'audio' && audioSeconds === 0)
          issues.push({ path: `${path}.metrics.audioSeconds`, message: 'Audio assets require a duration estimate.' });
        if (kind && kind !== 'model' && modelTriangles !== 0)
          issues.push({ path: `${path}.metrics.triangleCount`, message: 'Only model assets may declare triangles.' });
        if (kind && kind !== 'texture' && texturePixels !== 0)
          issues.push({ path: `${path}.metrics.texturePixels`, message: 'Only texture assets may declare pixels.' });
        if (kind && kind !== 'audio' && audioSeconds !== 0)
          issues.push({ path: `${path}.metrics.audioSeconds`, message: 'Only audio assets may declare duration.' });
      }
      if (id) {
        if (kind) kinds.set(id, kind);
        fallbacks.set(id, typeof fallback === 'string' ? fallback : null);
        required.set(id, asset.required === true);
        dependencies.set(id, dependencyRefs);
      }
    });
  }

  if (new Set(ids).size !== ids.length) issues.push({ path: '$.assets', message: 'Asset identifiers must be unique.' });
  if (new Set(uris).size !== uris.length) issues.push({ path: '$.assets', message: 'Asset URIs must be unique.' });
  const known = new Set(ids);
  for (const id of ids) {
    const fallback = fallbacks.get(id);
    if (required.get(id) && fallback === null)
      issues.push({ path: '$.assets', message: `Required asset ${id} must declare a fallback.` });
    if (fallback !== null && fallback !== undefined) {
      if (!known.has(fallback))
        issues.push({ path: '$.assets', message: `Asset ${id} has unknown fallback ${fallback}.` });
      else if (fallback === id) issues.push({ path: '$.assets', message: `Asset ${id} cannot fall back to itself.` });
      else if (kinds.get(fallback) !== kinds.get(id))
        issues.push({ path: '$.assets', message: `Asset ${id} fallback must use the same asset kind.` });
      else if (required.get(fallback))
        issues.push({ path: '$.assets', message: `Fallback asset ${fallback} must not itself be required.` });
    }
    for (const dependency of dependencies.get(id) ?? []) {
      if (!known.has(dependency))
        issues.push({ path: '$.assets', message: `Asset ${id} has unknown dependency ${dependency}.` });
      if (dependency === id) issues.push({ path: '$.assets', message: `Asset ${id} cannot depend on itself.` });
    }
  }
  if (hasCycle(dependencies)) issues.push({ path: '$.assets', message: 'Asset dependencies must be acyclic.' });
  const fallbackEdges = new Map<string, ReadonlyArray<string>>();
  for (const [id, fallback] of fallbacks) fallbackEdges.set(id, fallback ? [fallback] : []);
  if (hasCycle(fallbackEdges)) issues.push({ path: '$.assets', message: 'Fallback references must be acyclic.' });

  if (budgetValues) {
    const comparisons: ReadonlyArray<[number, number | null, string]> = [
      [download, budgetValues.download, 'maximumDownloadBytes'],
      [resident, budgetValues.resident, 'maximumResidentBytes'],
      [triangles, budgetValues.triangles, 'maximumModelTriangles'],
      [pixels, budgetValues.pixels, 'maximumTexturePixels'],
      [audio, budgetValues.audio, 'maximumAudioSeconds']
    ];
    for (const [actual, maximum, key] of comparisons) {
      if (maximum !== null && actual > maximum)
        issues.push({ path: `$.budgets.${key}`, message: `Authored total ${actual} exceeds budget ${maximum}.` });
    }
  }

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  return { ok: true, value: deepFreeze(JSON.parse(JSON.stringify(input)) as CourseAssetManifestV1) };
}

export function parseCourseAssetManifestJson(json: string): CourseAssetManifestValidationResult {
  try {
    return validateCourseAssetManifest(JSON.parse(json));
  } catch {
    return { ok: false, issues: Object.freeze([{ path: '$', message: 'Malformed JSON.' }]) };
  }
}
