export interface AuthoredHolePoint {
  readonly x: number;
  readonly z: number;
}

export interface AuthoredHoleSurface {
  readonly id: string;
  readonly kind: 'rough' | 'fairway' | 'green' | 'bunker' | 'water' | 'native';
  readonly points: ReadonlyArray<AuthoredHolePoint>;
}

export interface AuthoredHoleRoute {
  readonly id: string;
  readonly labelKey: string;
  readonly target: AuthoredHolePoint & { readonly radiusMeters: number };
  readonly minimumCarryMeters: number;
  readonly expectedRemainingMeters: number;
  readonly primaryRisk: string;
  readonly reward: string;
}

export interface AuthoredCourseHoleV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly courseId: 'course-one';
  readonly artDirectionId: 'course-one.art-direction.v1';
  readonly number: number;
  readonly par: 3 | 4 | 5;
  readonly representativeMeters: number;
  readonly strategicIdentity: string;
  readonly bounds: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumZ: number;
    readonly maximumZ: number;
  };
  readonly surfaces: ReadonlyArray<AuthoredHoleSurface>;
  readonly routes: ReadonlyArray<AuthoredHoleRoute>;
  readonly misses: ReadonlyArray<{
    readonly id: string;
    readonly side: 'left' | 'right' | 'short' | 'long';
    readonly consequence: string;
    readonly recovery: string;
  }>;
  readonly tees: ReadonlyArray<{
    readonly id: string;
    readonly position: AuthoredHolePoint;
    readonly measuredMeters: number;
  }>;
  readonly pins: ReadonlyArray<{
    readonly id: string;
    readonly position: AuthoredHolePoint;
    readonly difficulty: string;
  }>;
  readonly cameras: ReadonlyArray<{
    readonly id: string;
    readonly mode: 'establishing' | 'decision' | 'landing' | 'green-reading';
    readonly position: AuthoredHolePoint & { readonly y: number };
    readonly lookAt: AuthoredHolePoint & { readonly y: number };
    readonly fieldOfViewDegrees: number;
  }>;
  readonly calibration: {
    readonly representativeTeeId: string;
    readonly representativePinId: string;
    readonly minimumRouteSeparationMeters: number;
    readonly mobileSurfaceBudget: number;
  };
}

export interface AuthoredCourseHoleIssue {
  readonly path: string;
  readonly message: string;
}

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function deepFreezeAuthoredHole<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreezeAuthoredHole(child);
  }
  return value;
}

function inside(point: AuthoredHolePoint, hole: Readonly<AuthoredCourseHoleV1>): boolean {
  return (
    point.x >= hole.bounds.minimumX &&
    point.x <= hole.bounds.maximumX &&
    point.z >= hole.bounds.minimumZ &&
    point.z <= hole.bounds.maximumZ
  );
}

export function validateAuthoredCourseHole(
  hole: Readonly<AuthoredCourseHoleV1>
): ReadonlyArray<AuthoredCourseHoleIssue> {
  const issues: AuthoredCourseHoleIssue[] = [];
  if (hole.schemaVersion !== 1)
    issues.push({ path: '$.schemaVersion', message: 'Only authored-hole schema version 1 is supported.' });
  if (!ID.test(hole.id) || hole.courseId !== 'course-one')
    issues.push({ path: '$.id', message: 'Expected a stable Course One hole identifier.' });
  if (hole.artDirectionId !== 'course-one.art-direction.v1')
    issues.push({ path: '$.artDirectionId', message: 'Expected the locked Course One art direction.' });
  if (!Number.isInteger(hole.number) || hole.number < 1 || hole.number > 9)
    issues.push({ path: '$.number', message: 'Expected a Course One hole number from one through nine.' });
  if (![3, 4, 5].includes(hole.par)) issues.push({ path: '$.par', message: 'Expected par three, four, or five.' });
  if (hole.bounds.maximumX <= hole.bounds.minimumX || hole.bounds.maximumZ <= hole.bounds.minimumZ)
    issues.push({ path: '$.bounds', message: 'Hole bounds must have positive width and length.' });
  if (hole.surfaces.length !== hole.calibration.mobileSurfaceBudget)
    issues.push({ path: '$.surfaces', message: 'Surface count must match the mobile budget.' });
  const surfaceIds = hole.surfaces.map(({ id }) => id);
  if (new Set(surfaceIds).size !== surfaceIds.length)
    issues.push({ path: '$.surfaces', message: 'Surface identifiers must be unique.' });
  for (const [index, surface] of hole.surfaces.entries()) {
    if (!ID.test(surface.id))
      issues.push({ path: '$.surfaces[' + index + '].id', message: 'Expected a stable surface identifier.' });
    if (surface.points.length < 3)
      issues.push({ path: '$.surfaces[' + index + '].points', message: 'Surface requires at least three points.' });
    if (surface.points.some((point) => !inside(point, hole)))
      issues.push({ path: '$.surfaces[' + index + '].points', message: 'Surface point is outside hole bounds.' });
  }
  if (hole.routes.length < 2) issues.push({ path: '$.routes', message: 'At least two strategic routes are required.' });
  const routeIds = hole.routes.map(({ id }) => id);
  if (new Set(routeIds).size !== routeIds.length)
    issues.push({ path: '$.routes', message: 'Route identifiers must be unique.' });
  for (const [index, route] of hole.routes.entries())
    if (!inside(route.target, hole))
      issues.push({ path: '$.routes[' + index + '].target', message: 'Route target is outside hole bounds.' });
  for (let left = 0; left < hole.routes.length; left += 1)
    for (let right = left + 1; right < hole.routes.length; right += 1) {
      const a = hole.routes[left];
      const b = hole.routes[right];
      if (
        a &&
        b &&
        Math.hypot(a.target.x - b.target.x, a.target.z - b.target.z) < hole.calibration.minimumRouteSeparationMeters
      )
        issues.push({ path: '$.routes', message: 'Strategic route targets are not sufficiently separated.' });
    }
  if (new Set(hole.misses.map(({ side }) => side)).size < 2)
    issues.push({ path: '$.misses', message: 'At least two asymmetric miss sides are required.' });
  if (!hole.tees.some(({ id }) => id === hole.calibration.representativeTeeId))
    issues.push({ path: '$.calibration.representativeTeeId', message: 'Representative tee is missing.' });
  if (!hole.pins.some(({ id }) => id === hole.calibration.representativePinId))
    issues.push({ path: '$.calibration.representativePinId', message: 'Representative pin is missing.' });
  for (const mode of ['establishing', 'decision', 'landing', 'green-reading'] as const)
    if (!hole.cameras.some((camera) => camera.mode === mode))
      issues.push({ path: '$.cameras', message: 'Missing camera mode: ' + mode + '.' });
  return Object.freeze(issues);
}
