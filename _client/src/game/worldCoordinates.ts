export const WORLD_COORDINATE_STANDARD = Object.freeze({
  schemaVersion: 1 as const,
  handedness: 'right-handed' as const,
  linearUnit: 'meter' as const,
  contentAngleUnit: 'degree' as const,
  runtimeAngleUnit: 'radian' as const,
  xAxis: 'player-right' as const,
  yAxis: 'up' as const,
  negativeZAxis: 'downrange' as const,
  origin: 'authored-hole-origin-on-ground' as const
});

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export interface LocalCoursePoint {
  rightMeters: number;
  upMeters: number;
  forwardMeters: number;
}

export interface CourseWorldBounds {
  leftX: number;
  rightX: number;
  teeZ: number;
  targetZ: number;
}

export interface NormalizedCoursePoint {
  x: number;
  depth: number;
}

const METERS_PER_YARD = 0.9144;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_SECOND_PER_MILE_PER_HOUR = 0.44704;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function validateWorldPoint(point: Readonly<WorldPoint>): void {
  finite(point.x, 'World x');
  finite(point.y, 'World y');
  finite(point.z, 'World z');
}

export function degreesToRadians(degrees: number): number {
  return (finite(degrees, 'Degrees') * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (finite(radians, 'Radians') * 180) / Math.PI;
}

export function normalizeHeadingDegrees(degrees: number): number {
  const normalized = ((finite(degrees, 'Heading') % 360) + 360) % 360;
  return normalized === 360 ? 0 : normalized;
}

export function contentHeadingToThreeYawRadians(degrees: number): number {
  return -degreesToRadians(normalizeHeadingDegrees(degrees));
}

export function headingDirection(degrees: number): Readonly<WorldPoint> {
  const radians = degreesToRadians(normalizeHeadingDegrees(degrees));
  return Object.freeze({ x: Math.sin(radians), y: 0, z: -Math.cos(radians) });
}

export function localToWorld(
  origin: Readonly<WorldPoint>,
  headingDegrees: number,
  local: Readonly<LocalCoursePoint>
): Readonly<WorldPoint> {
  validateWorldPoint(origin);
  finite(local.rightMeters, 'Local right');
  finite(local.upMeters, 'Local up');
  finite(local.forwardMeters, 'Local forward');
  const radians = degreesToRadians(normalizeHeadingDegrees(headingDegrees));
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze({
    x: origin.x + local.rightMeters * cosine + local.forwardMeters * sine,
    y: origin.y + local.upMeters,
    z: origin.z + local.rightMeters * sine - local.forwardMeters * cosine
  });
}

export function worldToLocal(
  origin: Readonly<WorldPoint>,
  headingDegrees: number,
  world: Readonly<WorldPoint>
): Readonly<LocalCoursePoint> {
  validateWorldPoint(origin);
  validateWorldPoint(world);
  const radians = degreesToRadians(normalizeHeadingDegrees(headingDegrees));
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = world.x - origin.x;
  const deltaZ = world.z - origin.z;
  return Object.freeze({
    rightMeters: deltaX * cosine + deltaZ * sine,
    upMeters: world.y - origin.y,
    forwardMeters: deltaX * sine - deltaZ * cosine
  });
}

export function distanceMeters(left: Readonly<WorldPoint>, right: Readonly<WorldPoint>): number {
  validateWorldPoint(left);
  validateWorldPoint(right);
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

export function normalizedCoursePointToWorld(
  bounds: Readonly<CourseWorldBounds>,
  point: Readonly<NormalizedCoursePoint>,
  elevationMeters: number
): Readonly<WorldPoint> {
  finite(bounds.leftX, 'leftX');
  finite(bounds.rightX, 'rightX');
  finite(bounds.teeZ, 'teeZ');
  finite(bounds.targetZ, 'targetZ');
  if (bounds.leftX >= bounds.rightX) throw new RangeError('Course bounds require leftX < rightX.');
  if (point.x < 0 || point.x > 10_000 || !Number.isInteger(point.x))
    throw new RangeError('Normalized course x must be an integer from 0 through 10000.');
  if (point.depth < 0 || point.depth > 10_000 || !Number.isInteger(point.depth))
    throw new RangeError('Normalized course depth must be an integer from 0 through 10000.');
  return Object.freeze({
    x: bounds.leftX + (point.x / 10_000) * (bounds.rightX - bounds.leftX),
    y: finite(elevationMeters, 'Elevation'),
    z: bounds.teeZ + (point.depth / 10_000) * (bounds.targetZ - bounds.teeZ)
  });
}

export const yardsToMeters = (yards: number): number => finite(yards, 'Yards') * METERS_PER_YARD;
export const metersToYards = (meters: number): number => finite(meters, 'Meters') / METERS_PER_YARD;
export const feetToMeters = (feet: number): number => finite(feet, 'Feet') * METERS_PER_FOOT;
export const metersToFeet = (meters: number): number => finite(meters, 'Meters') / METERS_PER_FOOT;
export const milesPerHourToMetersPerSecond = (mph: number): number =>
  finite(mph, 'Miles per hour') * METERS_PER_SECOND_PER_MILE_PER_HOUR;
export const metersPerSecondToMilesPerHour = (mps: number): number =>
  finite(mps, 'Meters per second') / METERS_PER_SECOND_PER_MILE_PER_HOUR;
