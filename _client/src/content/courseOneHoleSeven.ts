import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_SEVEN = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-seven',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 7,
  par: 4,
  representativeMeters: 428,
  strategicIdentity:
    'Long dogleg par four where a broad left position competes with a diagonal carry that earns sightline and distance.',
  bounds: { minimumX: -84, maximumX: 84, minimumZ: -460, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -78, z: 18 },
        { x: 78, z: 18 },
        { x: 76, z: -454 },
        { x: -76, z: -454 }
      ]
    },
    {
      id: 'fairway-lower',
      kind: 'fairway',
      points: [
        { x: -29, z: -49 },
        { x: 24, z: -51 },
        { x: 39, z: -218 },
        { x: -8, z: -259 },
        { x: -43, z: -184 }
      ]
    },
    {
      id: 'fairway-upper',
      kind: 'fairway',
      points: [
        { x: -18, z: -237 },
        { x: 46, z: -218 },
        { x: 55, z: -370 },
        { x: 4, z: -393 },
        { x: -36, z: -323 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -10, z: -373 },
        { x: 38, z: -368 },
        { x: 51, z: -410 },
        { x: 2, z: -432 },
        { x: -22, z: -405 }
      ]
    },
    {
      id: 'bunker-diagonal',
      kind: 'bunker',
      points: [
        { x: 1, z: -225 },
        { x: 34, z: -208 },
        { x: 47, z: -257 },
        { x: 15, z: -276 }
      ]
    },
    {
      id: 'bunker-green-left',
      kind: 'bunker',
      points: [
        { x: -27, z: -365 },
        { x: -7, z: -367 },
        { x: -14, z: -408 },
        { x: -36, z: -398 }
      ]
    },
    {
      id: 'water-right',
      kind: 'water',
      points: [
        { x: 54, z: -167 },
        { x: 78, z: -173 },
        { x: 76, z: -347 },
        { x: 57, z: -335 }
      ]
    }
  ],
  routes: [
    {
      id: 'broad-left-position',
      labelKey: 'courseOne.holeSeven.routes.broadLeftPosition',
      target: { x: -21, z: -239, radiusMeters: 19 },
      minimumCarryMeters: 207,
      expectedRemainingMeters: 184,
      primaryRisk: 'bunker-green-left',
      reward: 'Finds the widest landing area and keeps the diagonal water outside the tee-shot dispersion.'
    },
    {
      id: 'challenge-right-corner',
      labelKey: 'courseOne.holeSeven.routes.challengeRightCorner',
      target: { x: 29, z: -286, radiusMeters: 12 },
      minimumCarryMeters: 247,
      expectedRemainingMeters: 137,
      primaryRisk: 'water-right',
      reward: 'Carries the diagonal bunker and opens the green sightline with a shorter approach.'
    }
  ],
  misses: [
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'The positional miss finishes in long rough but retains a complete view of the green entrance.',
      recovery: 'Advance toward the broad front-center and accept a longer par putt.'
    },
    {
      id: 'miss-right',
      side: 'right',
      consequence: 'The corner-challenge miss can enter the lateral water beyond the diagonal bunker.',
      recovery: 'Apply authored penalty-area relief and play the next shot from the right-side drop corridor.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: -4, z: -17 }, measuredMeters: 358 },
    { id: 'tee-club', position: { x: -2, z: -2 }, measuredMeters: 389 },
    { id: 'tee-back', position: { x: 0, z: 11 }, measuredMeters: 428 },
    { id: 'tee-championship', position: { x: 3, z: 21 }, measuredMeters: 444 }
  ],
  pins: [
    { id: 'pin-front-left', position: { x: 1, z: -383 }, difficulty: 'position-angle-reward' },
    { id: 'pin-center', position: { x: 17, z: -401 }, difficulty: 'balanced-center' },
    { id: 'pin-back-right', position: { x: 35, z: -416 }, difficulty: 'water-sightline-demanding' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: -69, y: 62, z: 20 },
      lookAt: { x: 9, y: 0, z: -291 },
      fieldOfViewDegrees: 42
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: -7, y: 13, z: 17 },
      lookAt: { x: 7, y: 0, z: -263 },
      fieldOfViewDegrees: 36
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: -51, y: 29, z: -226 },
      lookAt: { x: 21, y: 0, z: -310 },
      fieldOfViewDegrees: 34
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: -14, y: 10, z: -363 },
      lookAt: { x: 16, y: 0, z: -401 },
      fieldOfViewDegrees: 30
    }
  ],
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-center',
    minimumRouteSeparationMeters: 68,
    mobileSurfaceBudget: 7
  }
} satisfies AuthoredCourseHoleV1);

export const COURSE_ONE_HOLE_SEVEN_CORNER_CONTEXT = Object.freeze({
  diagonalCarryMeters: 247,
  crosswindTowardWaterMetersPerSecond: 3.2,
  positionalLandingWidthMeters: 38,
  aggressiveLandingWidthMeters: 24,
  positionalValue: 'The left position buys landing width and removes water from the normal tee-shot miss.',
  aggressiveValue: 'The right carry earns sightline and approach distance at the cost of diagonal hazard exposure.',
  authority: 'Describes authored strategy only; it never recommends, selects, steers, or corrects a shot.'
});
