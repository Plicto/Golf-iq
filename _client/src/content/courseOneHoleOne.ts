import type { HoleSnapshotInput, SnapshotMarker, SnapshotSurface } from './contentRegressionSnapshots.js';

export const COURSE_ONE_HOLE_ONE_SCHEMA_VERSION = 1 as const;

export interface CourseOneHoleOneRoute {
  readonly id: 'safe-right' | 'aggressive-left';
  readonly labelKey: string;
  readonly target: { readonly x: number; readonly z: number; readonly radiusMeters: number };
  readonly minimumCarryMeters: number;
  readonly expectedApproachMeters: number;
  readonly primaryRisk: 'water-left' | 'bunker-right';
  readonly reward: string;
}

export interface CourseOneHoleOneV1 {
  readonly schemaVersion: 1;
  readonly id: 'course-one.hole-one';
  readonly courseId: 'course-one';
  readonly artDirectionId: 'course-one.art-direction.v1';
  readonly number: 1;
  readonly par: 4;
  readonly strokeIndex: 5;
  readonly bounds: HoleSnapshotInput['bounds'];
  readonly surfaces: ReadonlyArray<SnapshotSurface>;
  readonly markers: ReadonlyArray<SnapshotMarker>;
  readonly routes: ReadonlyArray<CourseOneHoleOneRoute>;
  readonly tees: ReadonlyArray<{
    readonly id: string;
    readonly position: { readonly x: number; readonly z: number };
    readonly measuredMeters: number;
  }>;
  readonly pins: ReadonlyArray<{
    readonly id: string;
    readonly position: { readonly x: number; readonly z: number };
    readonly difficulty: 'front-safe' | 'center-balanced' | 'back-demanding';
  }>;
  readonly cameras: ReadonlyArray<{
    readonly id: string;
    readonly mode: 'establishing' | 'decision' | 'landing' | 'green-reading';
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly lookAt: { readonly x: number; readonly y: number; readonly z: number };
    readonly fieldOfViewDegrees: number;
  }>;
  readonly rules: {
    readonly waterHazardId: 'water-left';
    readonly outOfBoundsSide: 'none';
    readonly reliefMode: 'authored-lateral';
  };
  readonly calibration: {
    readonly representativeTeeId: 'tee-back';
    readonly representativePinId: 'pin-a';
    readonly requiredRouteSeparationMeters: 18;
    readonly mobileSurfaceBudget: 5;
    readonly structuralSnapshot: 'snapshots/course-one/structure.json';
    readonly visualSnapshot: 'snapshots/course-one/hole-one.svg';
  };
}

const surfaces: ReadonlyArray<SnapshotSurface> = Object.freeze([
  {
    id: 'rough-main',
    kind: 'rough',
    points: [
      { x: -38, z: 12 },
      { x: 38, z: 12 },
      { x: 34, z: -370 },
      { x: -34, z: -370 }
    ]
  },
  {
    id: 'fairway-main',
    kind: 'fairway',
    points: [
      { x: -12, z: 0 },
      { x: 13, z: -4 },
      { x: 20, z: -250 },
      { x: 11, z: -335 },
      { x: -14, z: -330 },
      { x: -21, z: -220 }
    ]
  },
  {
    id: 'green-main',
    kind: 'green',
    points: [
      { x: -14, z: -334 },
      { x: 13, z: -338 },
      { x: 17, z: -363 },
      { x: -9, z: -370 },
      { x: -20, z: -350 }
    ]
  },
  {
    id: 'bunker-right',
    kind: 'bunker',
    points: [
      { x: 15, z: -324 },
      { x: 27, z: -330 },
      { x: 24, z: -348 },
      { x: 14, z: -341 }
    ]
  },
  {
    id: 'water-left',
    kind: 'water',
    points: [
      { x: -37, z: -188 },
      { x: -18, z: -202 },
      { x: -21, z: -248 },
      { x: -41, z: -230 }
    ]
  }
]);

const markers: ReadonlyArray<SnapshotMarker> = Object.freeze([
  { id: 'tee-back', kind: 'tee', position: { x: 0, z: 4 } },
  { id: 'landing-one', kind: 'target', position: { x: 4, z: -215 } },
  { id: 'pin-a', kind: 'pin', position: { x: 1, z: -352 } }
]);

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const COURSE_ONE_HOLE_ONE: CourseOneHoleOneV1 = deepFreeze({
  schemaVersion: COURSE_ONE_HOLE_ONE_SCHEMA_VERSION,
  id: 'course-one.hole-one',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 1,
  par: 4,
  strokeIndex: 5,
  bounds: { minimumX: -45, maximumX: 45, minimumZ: -380, maximumZ: 20 },
  surfaces,
  markers,
  routes: [
    {
      id: 'safe-right',
      labelKey: 'courseOne.holeOne.routes.safeRight',
      target: { x: 13, z: -202, radiusMeters: 17 },
      minimumCarryMeters: 188,
      expectedApproachMeters: 158,
      primaryRisk: 'bunker-right',
      reward: 'Wider landing shoulder and a longer approach across the green.'
    },
    {
      id: 'aggressive-left',
      labelKey: 'courseOne.holeOne.routes.aggressiveLeft',
      target: { x: -5, z: -220, radiusMeters: 12 },
      minimumCarryMeters: 215,
      expectedApproachMeters: 139,
      primaryRisk: 'water-left',
      reward: 'Shorter approach from an open angle after carrying the inlet edge.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: 3, z: -20 }, measuredMeters: 332 },
    { id: 'tee-club', position: { x: 1, z: -7 }, measuredMeters: 349 },
    { id: 'tee-back', position: { x: 0, z: 4 }, measuredMeters: 361 },
    { id: 'tee-championship', position: { x: -2, z: 16 }, measuredMeters: 374 }
  ],
  pins: [
    { id: 'pin-front', position: { x: -5, z: -342 }, difficulty: 'front-safe' },
    { id: 'pin-a', position: { x: 1, z: -352 }, difficulty: 'center-balanced' },
    { id: 'pin-back', position: { x: 7, z: -361 }, difficulty: 'back-demanding' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: 34, y: 44, z: 28 },
      lookAt: { x: 0, y: 0, z: -186 },
      fieldOfViewDegrees: 39
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: 7, y: 8, z: 14 },
      lookAt: { x: 2, y: 0, z: -212 },
      fieldOfViewDegrees: 36
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: 31, y: 25, z: -278 },
      lookAt: { x: 0, y: 0, z: -336 },
      fieldOfViewDegrees: 34
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: 15, y: 9, z: -326 },
      lookAt: { x: 0, y: 0, z: -352 },
      fieldOfViewDegrees: 32
    }
  ],
  rules: { waterHazardId: 'water-left', outOfBoundsSide: 'none', reliefMode: 'authored-lateral' },
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-a',
    requiredRouteSeparationMeters: 18,
    mobileSurfaceBudget: 5,
    structuralSnapshot: 'snapshots/course-one/structure.json',
    visualSnapshot: 'snapshots/course-one/hole-one.svg'
  }
});

export interface CourseOneHoleOneIssue {
  readonly path: string;
  readonly message: string;
}

function inside(point: { readonly x: number; readonly z: number }, bounds: CourseOneHoleOneV1['bounds']): boolean {
  return (
    point.x >= bounds.minimumX && point.x <= bounds.maximumX && point.z >= bounds.minimumZ && point.z <= bounds.maximumZ
  );
}

export function validateCourseOneHoleOne(input: Readonly<CourseOneHoleOneV1>): ReadonlyArray<CourseOneHoleOneIssue> {
  const issues: CourseOneHoleOneIssue[] = [];
  if (input.schemaVersion !== 1 || input.id !== 'course-one.hole-one' || input.courseId !== 'course-one')
    issues.push({ path: '$.identity', message: 'Expected the locked Course One opening-hole identity.' });
  if (input.artDirectionId !== 'course-one.art-direction.v1')
    issues.push({ path: '$.artDirectionId', message: 'Hole 1 must use the locked Course One art direction.' });
  if (input.par !== 4 || input.number !== 1) issues.push({ path: '$.number', message: 'Expected Hole 1, par 4.' });
  if (input.surfaces.length !== input.calibration.mobileSurfaceBudget)
    issues.push({ path: '$.surfaces', message: 'Surface count must match the mobile budget.' });
  const surfaceIds = new Set(input.surfaces.map(({ id }) => id));
  for (const required of ['rough-main', 'fairway-main', 'green-main', 'bunker-right', 'water-left'])
    if (!surfaceIds.has(required))
      issues.push({ path: '$.surfaces', message: 'Missing required surface: ' + required + '.' });
  for (const [index, surface] of input.surfaces.entries()) {
    if (surface.points.length < 3)
      issues.push({ path: '$.surfaces[' + index + '].points', message: 'Surface requires at least three points.' });
    if (surface.points.some((entry) => !inside(entry, input.bounds)))
      issues.push({ path: '$.surfaces[' + index + '].points', message: 'Surface point is outside hole bounds.' });
  }
  if (input.routes.length !== 2) issues.push({ path: '$.routes', message: 'Expected safe and aggressive routes.' });
  const safe = input.routes.find(({ id }) => id === 'safe-right');
  const aggressive = input.routes.find(({ id }) => id === 'aggressive-left');
  if (!safe || !aggressive) issues.push({ path: '$.routes', message: 'Both named routes are required.' });
  else {
    const separation = Math.hypot(safe.target.x - aggressive.target.x, safe.target.z - aggressive.target.z);
    if (separation < input.calibration.requiredRouteSeparationMeters)
      issues.push({ path: '$.routes', message: 'Strategic targets are not sufficiently separated.' });
    if (aggressive.expectedApproachMeters >= safe.expectedApproachMeters)
      issues.push({ path: '$.routes.aggressive-left', message: 'Aggressive route must earn a shorter approach.' });
  }
  if (!input.tees.some(({ id }) => id === input.calibration.representativeTeeId))
    issues.push({ path: '$.calibration.representativeTeeId', message: 'Representative tee is missing.' });
  if (!input.pins.some(({ id }) => id === input.calibration.representativePinId))
    issues.push({ path: '$.calibration.representativePinId', message: 'Representative pin is missing.' });
  for (const mode of ['establishing', 'decision', 'landing', 'green-reading'] as const)
    if (!input.cameras.some((camera) => camera.mode === mode))
      issues.push({ path: '$.cameras', message: 'Missing camera mode: ' + mode + '.' });
  if (input.rules.waterHazardId !== 'water-left' || !surfaceIds.has(input.rules.waterHazardId))
    issues.push({ path: '$.rules.waterHazardId', message: 'Water relief must reference the authored inlet.' });
  return Object.freeze(issues);
}

export function createCourseOneHoleOneSnapshotInput(): HoleSnapshotInput {
  const issues = validateCourseOneHoleOne(COURSE_ONE_HOLE_ONE);
  if (issues.length > 0) throw new TypeError(issues.map(({ path, message }) => path + ': ' + message).join('\n'));
  return deepFreeze({
    courseId: COURSE_ONE_HOLE_ONE.courseId,
    courseVersion: '1.0.0',
    holeId: COURSE_ONE_HOLE_ONE.id,
    holeNumber: COURSE_ONE_HOLE_ONE.number,
    par: COURSE_ONE_HOLE_ONE.par,
    bounds: COURSE_ONE_HOLE_ONE.bounds,
    surfaces: COURSE_ONE_HOLE_ONE.surfaces,
    markers: COURSE_ONE_HOLE_ONE.markers
  });
}
