export const HAZARD_RULES_SCHEMA_VERSION = 1 as const;

export type RuleGameMode = 'guided-scenario' | 'decision-scenario' | 'quick-three' | 'full-nine' | 'daily-challenge';

export type ReliefProcedure = 'stroke-and-distance' | 'back-on-line' | 'lateral-two-club-lengths' | 'drop-zone';

export interface HazardRulesDataV1 {
  readonly schemaVersion: typeof HAZARD_RULES_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly holeId: string;
  readonly authority: {
    readonly rulesetEdition: string;
    readonly effectiveRevision: number;
    readonly modes: ReadonlyArray<RuleGameMode>;
  };
  readonly penaltyAreas: ReadonlyArray<{
    readonly id: string;
    readonly shapeRef: string;
    readonly marking: 'red' | 'yellow';
    readonly strokePenalty: 1;
    readonly reliefProcedures: ReadonlyArray<ReliefProcedure>;
  }>;
  readonly outOfBounds: {
    readonly shapeRefs: ReadonlyArray<string>;
    readonly strokePenalty: 1;
    readonly provisionalBallAllowed: boolean;
  };
  readonly dropZones: ReadonlyArray<{
    readonly id: string;
    readonly position: { readonly x: number; readonly z: number };
    readonly radiusMeters: number;
    readonly appliesToPenaltyAreaRefs: ReadonlyArray<string>;
  }>;
  readonly unplayableBall: {
    readonly strokePenalty: 1;
    readonly reliefProcedures: ReadonlyArray<'stroke-and-distance' | 'back-on-line' | 'lateral-two-club-lengths'>;
  };
  readonly modeRules: ReadonlyArray<{
    readonly mode: RuleGameMode;
    readonly penaltiesEnabled: boolean;
    readonly maximumScorePolicy: 'none' | 'double-par' | 'scenario-defined';
    readonly dropZonePolicy: 'authored-only' | 'disabled';
  }>;
  readonly localRules: ReadonlyArray<{
    readonly id: string;
    readonly textKey: string;
    readonly appliesToModes: ReadonlyArray<RuleGameMode>;
    readonly affectedHazardRefs: ReadonlyArray<string>;
  }>;
}

export interface HazardRulesValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type HazardRulesValidationResult =
  | { readonly ok: true; readonly value: Readonly<HazardRulesDataV1> }
  | {
      readonly ok: false;
      readonly issues: ReadonlyArray<HazardRulesValidationIssue>;
    };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const MODES: ReadonlyArray<RuleGameMode> = [
  'guided-scenario',
  'decision-scenario',
  'quick-three',
  'full-nine',
  'daily-challenge'
];
const RELIEF: ReadonlyArray<ReliefProcedure> = [
  'stroke-and-distance',
  'back-on-line',
  'lateral-two-club-lengths',
  'drop-zone'
];

function objectAt(
  value: unknown,
  path: string,
  keys: ReadonlyArray<string>,
  issues: HazardRulesValidationIssue[]
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
    if (!Object.hasOwn(record, key))
      issues.push({
        path: `${path}.${key}`,
        message: 'Required field is missing.'
      });
  }
  return record;
}

function stableStringAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  pattern: RegExp,
  issues: HazardRulesValidationIssue[]
): string | null {
  const value = record[key];
  if (typeof value !== 'string' || !pattern.test(value)) {
    issues.push({
      path: `${path}.${key}`,
      message: 'Expected a valid stable string.'
    });
    return null;
  }
  return value;
}

function enumAt<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlyArray<T>,
  issues: HazardRulesValidationIssue[]
): T | null {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push({ path, message: `Expected one of: ${allowed.join(', ')}.` });
    return null;
  }
  return value as T;
}

function uniqueEnumArrayAt<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlyArray<T>,
  issues: HazardRulesValidationIssue[],
  allowEmpty = false
): T[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push({
      path,
      message: allowEmpty ? 'Expected an array.' : 'Expected a non-empty array.'
    });
    return [];
  }
  const result: T[] = [];
  value.forEach((entry, index) => {
    const item = enumAt(entry, `${path}[${index}]`, allowed, issues);
    if (item) result.push(item);
  });
  if (new Set(result).size !== result.length) issues.push({ path, message: 'Values must be unique.' });
  return result;
}

function uniqueIdArrayAt(
  value: unknown,
  path: string,
  issues: HazardRulesValidationIssue[],
  allowEmpty = false
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issues.push({
      path,
      message: allowEmpty ? 'Expected an array.' : 'Expected a non-empty array.'
    });
    return [];
  }
  const result: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !ID.test(entry)) {
      issues.push({
        path: `${path}[${index}]`,
        message: 'Expected a stable identifier.'
      });
    } else result.push(entry);
  });
  if (new Set(result).size !== result.length) issues.push({ path, message: 'Values must be unique.' });
  return result;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateHazardRulesData(input: unknown): HazardRulesValidationResult {
  const issues: HazardRulesValidationIssue[] = [];
  const root = objectAt(
    input,
    '$',
    [
      'schemaVersion',
      'id',
      'revision',
      'holeId',
      'authority',
      'penaltyAreas',
      'outOfBounds',
      'dropZones',
      'unplayableBall',
      'modeRules',
      'localRules'
    ],
    issues
  );
  if (!root) return { ok: false, issues };
  if (root.schemaVersion !== HAZARD_RULES_SCHEMA_VERSION)
    issues.push({
      path: '$.schemaVersion',
      message: 'Only hazard-rules schema version 1 is supported.'
    });
  stableStringAt(root, 'id', '$', ID, issues);
  stableStringAt(root, 'holeId', '$', ID, issues);
  if (!Number.isInteger(root.revision) || (root.revision as number) < 1)
    issues.push({
      path: '$.revision',
      message: 'Revision must be a positive integer.'
    });

  const authority = objectAt(root.authority, '$.authority', ['rulesetEdition', 'effectiveRevision', 'modes'], issues);
  let authorityModes: RuleGameMode[] = [];
  if (authority) {
    stableStringAt(authority, 'rulesetEdition', '$.authority', ID, issues);
    if (!Number.isInteger(authority.effectiveRevision) || (authority.effectiveRevision as number) < 1)
      issues.push({
        path: '$.authority.effectiveRevision',
        message: 'Effective revision must be a positive integer.'
      });
    authorityModes = uniqueEnumArrayAt(authority.modes, '$.authority.modes', MODES, issues);
  }

  const penaltyAreaIds: string[] = [];
  const penaltyAreasUsingDropZones = new Set<string>();
  if (!Array.isArray(root.penaltyAreas)) {
    issues.push({ path: '$.penaltyAreas', message: 'Expected an array.' });
  } else {
    root.penaltyAreas.forEach((entry, index) => {
      const path = `$.penaltyAreas[${index}]`;
      const area = objectAt(entry, path, ['id', 'shapeRef', 'marking', 'strokePenalty', 'reliefProcedures'], issues);
      if (!area) return;
      const id = stableStringAt(area, 'id', path, ID, issues);
      stableStringAt(area, 'shapeRef', path, ID, issues);
      const marking = enumAt(area.marking, `${path}.marking`, ['red', 'yellow'] as const, issues);
      if (area.strokePenalty !== 1)
        issues.push({
          path: `${path}.strokePenalty`,
          message: 'Penalty areas require one penalty stroke.'
        });
      const relief = uniqueEnumArrayAt(area.reliefProcedures, `${path}.reliefProcedures`, RELIEF, issues);
      if (!relief.includes('stroke-and-distance') || !relief.includes('back-on-line'))
        issues.push({
          path: `${path}.reliefProcedures`,
          message: 'Penalty-area relief requires stroke-and-distance and back-on-line.'
        });
      if (marking === 'red' && !relief.includes('lateral-two-club-lengths'))
        issues.push({
          path: `${path}.reliefProcedures`,
          message: 'A red penalty area requires lateral relief.'
        });
      if (marking === 'yellow' && relief.includes('lateral-two-club-lengths'))
        issues.push({
          path: `${path}.reliefProcedures`,
          message: 'A yellow penalty area cannot grant lateral relief.'
        });
      if (id) {
        penaltyAreaIds.push(id);
        if (relief.includes('drop-zone')) penaltyAreasUsingDropZones.add(id);
      }
    });
  }
  if (new Set(penaltyAreaIds).size !== penaltyAreaIds.length)
    issues.push({
      path: '$.penaltyAreas',
      message: 'Penalty-area identifiers must be unique.'
    });

  const outOfBounds = objectAt(
    root.outOfBounds,
    '$.outOfBounds',
    ['shapeRefs', 'strokePenalty', 'provisionalBallAllowed'],
    issues
  );
  if (outOfBounds) {
    uniqueIdArrayAt(outOfBounds.shapeRefs, '$.outOfBounds.shapeRefs', issues);
    if (outOfBounds.strokePenalty !== 1)
      issues.push({
        path: '$.outOfBounds.strokePenalty',
        message: 'Out-of-bounds requires one penalty stroke plus distance.'
      });
    if (typeof outOfBounds.provisionalBallAllowed !== 'boolean')
      issues.push({
        path: '$.outOfBounds.provisionalBallAllowed',
        message: 'Provisional-ball availability must be explicit.'
      });
  }

  const coveredByDropZones = new Set<string>();
  const dropZoneIds: string[] = [];
  if (!Array.isArray(root.dropZones)) {
    issues.push({ path: '$.dropZones', message: 'Expected an array.' });
  } else {
    root.dropZones.forEach((entry, index) => {
      const path = `$.dropZones[${index}]`;
      const zone = objectAt(entry, path, ['id', 'position', 'radiusMeters', 'appliesToPenaltyAreaRefs'], issues);
      if (!zone) return;
      const id = stableStringAt(zone, 'id', path, ID, issues);
      if (id) dropZoneIds.push(id);
      const position = objectAt(zone.position, `${path}.position`, ['x', 'z'], issues);
      if (
        position &&
        (typeof position.x !== 'number' ||
          typeof position.z !== 'number' ||
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.z) ||
          position.x < -20_000 ||
          position.x > 20_000 ||
          position.z < -20_000 ||
          position.z > 20_000)
      )
        issues.push({
          path: `${path}.position`,
          message: 'Expected bounded finite meter-space x and z.'
        });
      if (
        typeof zone.radiusMeters !== 'number' ||
        !Number.isFinite(zone.radiusMeters) ||
        zone.radiusMeters < 0.25 ||
        zone.radiusMeters > 20
      )
        issues.push({
          path: `${path}.radiusMeters`,
          message: 'Drop-zone radius must be 0.25 through 20 meters.'
        });
      const references = uniqueIdArrayAt(zone.appliesToPenaltyAreaRefs, `${path}.appliesToPenaltyAreaRefs`, issues);
      references.forEach((reference) => {
        if (!penaltyAreaIds.includes(reference))
          issues.push({
            path: `${path}.appliesToPenaltyAreaRefs`,
            message: `Unknown penalty-area reference: ${reference}.`
          });
        else coveredByDropZones.add(reference);
      });
    });
  }
  if (new Set(dropZoneIds).size !== dropZoneIds.length)
    issues.push({
      path: '$.dropZones',
      message: 'Drop-zone identifiers must be unique.'
    });
  penaltyAreasUsingDropZones.forEach((id) => {
    if (!coveredByDropZones.has(id))
      issues.push({
        path: '$.dropZones',
        message: `Penalty area ${id} grants drop-zone relief but has no authored drop zone.`
      });
  });

  const unplayable = objectAt(root.unplayableBall, '$.unplayableBall', ['strokePenalty', 'reliefProcedures'], issues);
  if (unplayable) {
    if (unplayable.strokePenalty !== 1)
      issues.push({
        path: '$.unplayableBall.strokePenalty',
        message: 'Unplayable-ball relief requires one penalty stroke.'
      });
    const procedures = uniqueEnumArrayAt(
      unplayable.reliefProcedures,
      '$.unplayableBall.reliefProcedures',
      ['stroke-and-distance', 'back-on-line', 'lateral-two-club-lengths'] as const,
      issues
    );
    if (procedures.length !== 3)
      issues.push({
        path: '$.unplayableBall.reliefProcedures',
        message: 'All three standard unplayable-ball procedures are required.'
      });
  }

  const modeIds: RuleGameMode[] = [];
  if (!Array.isArray(root.modeRules) || root.modeRules.length === 0) {
    issues.push({
      path: '$.modeRules',
      message: 'At least one game-mode rule is required.'
    });
  } else {
    root.modeRules.forEach((entry, index) => {
      const path = `$.modeRules[${index}]`;
      const rule = objectAt(entry, path, ['mode', 'penaltiesEnabled', 'maximumScorePolicy', 'dropZonePolicy'], issues);
      if (!rule) return;
      const mode = enumAt(rule.mode, `${path}.mode`, MODES, issues);
      if (mode) modeIds.push(mode);
      if (typeof rule.penaltiesEnabled !== 'boolean')
        issues.push({
          path: `${path}.penaltiesEnabled`,
          message: 'Penalty behavior must be explicit.'
        });
      enumAt(
        rule.maximumScorePolicy,
        `${path}.maximumScorePolicy`,
        ['none', 'double-par', 'scenario-defined'] as const,
        issues
      );
      enumAt(rule.dropZonePolicy, `${path}.dropZonePolicy`, ['authored-only', 'disabled'] as const, issues);
    });
  }
  if (new Set(modeIds).size !== modeIds.length)
    issues.push({
      path: '$.modeRules',
      message: 'Game-mode rules must be unique.'
    });
  authorityModes.forEach((mode) => {
    if (!modeIds.includes(mode))
      issues.push({
        path: '$.modeRules',
        message: `Missing rule metadata for authority mode ${mode}.`
      });
  });

  const localRuleIds: string[] = [];
  if (!Array.isArray(root.localRules)) {
    issues.push({ path: '$.localRules', message: 'Expected an array.' });
  } else {
    root.localRules.forEach((entry, index) => {
      const path = `$.localRules[${index}]`;
      const rule = objectAt(entry, path, ['id', 'textKey', 'appliesToModes', 'affectedHazardRefs'], issues);
      if (!rule) return;
      const id = stableStringAt(rule, 'id', path, ID, issues);
      if (id) localRuleIds.push(id);
      stableStringAt(rule, 'textKey', path, KEY, issues);
      const modes = uniqueEnumArrayAt(rule.appliesToModes, `${path}.appliesToModes`, MODES, issues);
      modes.forEach((mode) => {
        if (!authorityModes.includes(mode))
          issues.push({
            path: `${path}.appliesToModes`,
            message: `Mode ${mode} is outside rule authority.`
          });
      });
      const hazardRefs = uniqueIdArrayAt(rule.affectedHazardRefs, `${path}.affectedHazardRefs`, issues, true);
      hazardRefs.forEach((reference) => {
        if (!penaltyAreaIds.includes(reference))
          issues.push({
            path: `${path}.affectedHazardRefs`,
            message: `Unknown penalty-area reference: ${reference}.`
          });
      });
    });
  }
  if (new Set(localRuleIds).size !== localRuleIds.length)
    issues.push({
      path: '$.localRules',
      message: 'Local-rule identifiers must be unique.'
    });

  if (issues.length > 0) return { ok: false, issues: Object.freeze(issues) };
  return {
    ok: true,
    value: deepFreeze(JSON.parse(JSON.stringify(input)) as HazardRulesDataV1)
  };
}

export function parseHazardRulesJson(json: string): HazardRulesValidationResult {
  try {
    return validateHazardRulesData(JSON.parse(json));
  } catch {
    return {
      ok: false,
      issues: Object.freeze([{ path: '$', message: 'Malformed JSON.' }])
    };
  }
}
