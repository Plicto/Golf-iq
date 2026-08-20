import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_EIGHT = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-eight',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 8,
  par: 4,
  representativeMeters: 374,
  strategicIdentity:
    'Uphill par four where a visible left position competes with a carry beyond the center bunkers for a shorter pitch.',
  bounds: { minimumX: -76, maximumX: 76, minimumZ: -407, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -70, z: 18 },
        { x: 70, z: 18 },
        { x: 69, z: -401 },
        { x: -69, z: -401 }
      ]
    },
    {
      id: 'fairway-left',
      kind: 'fairway',
      points: [
        { x: -32, z: -51 },
        { x: 20, z: -48 },
        { x: 12, z: -244 },
        { x: -39, z: -271 },
        { x: -51, z: -168 }
      ]
    },
    {
      id: 'fairway-upper',
      kind: 'fairway',
      points: [
        { x: -12, z: -245 },
        { x: 42, z: -229 },
        { x: 39, z: -331 },
        { x: -16, z: -346 },
        { x: -34, z: -298 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -20, z: -329 },
        { x: 32, z: -326 },
        { x: 43, z: -366 },
        { x: -10, z: -386 },
        { x: -32, z: -360 }
      ]
    },
    {
      id: 'bunker-center-left',
      kind: 'bunker',
      points: [
        { x: -9, z: -211 },
        { x: 12, z: -207 },
        { x: 14, z: -244 },
        { x: -13, z: -249 }
      ]
    },
    {
      id: 'bunker-center-right',
      kind: 'bunker',
      points: [
        { x: 19, z: -220 },
        { x: 42, z: -227 },
        { x: 39, z: -262 },
        { x: 17, z: -254 }
      ]
    },
    {
      id: 'native-left',
      kind: 'native',
      points: [
        { x: -69, z: -167 },
        { x: -48, z: -173 },
        { x: -42, z: -316 },
        { x: -68, z: -327 }
      ]
    }
  ],
  routes: [
    {
      id: 'visible-left-position',
      labelKey: 'courseOne.holeEight.routes.visibleLeftPosition',
      target: { x: -25, z: -229, radiusMeters: 19 },
      minimumCarryMeters: 201,
      expectedRemainingMeters: 143,
      primaryRisk: 'native-left',
      reward: 'Keeps the landing and green entrance visible while preserving the full uphill green depth.'
    },
    {
      id: 'carry-center-bunkers',
      labelKey: 'courseOne.holeEight.routes.carryCenterBunkers',
      target: { x: 23, z: -278, radiusMeters: 12 },
      minimumCarryMeters: 238,
      expectedRemainingMeters: 99,
      primaryRisk: 'bunker-center-right',
      reward: 'Carries the diagonal bunker pair and earns a short pitch into the upper shelf.'
    }
  ],
  misses: [
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'The positional miss enters native heath but retains a complete view of the uphill green.',
      recovery: 'Advance toward the broad front-center and use the green depth.'
    },
    {
      id: 'miss-short',
      side: 'short',
      consequence:
        'The aggressive carry can finish in the center bunker pair with no direct view of the putting surface.',
      recovery: 'Play back to the visible upper fairway before attacking the green.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: -6, z: -17 }, measuredMeters: 316 },
    { id: 'tee-club', position: { x: -3, z: -2 }, measuredMeters: 343 },
    { id: 'tee-back', position: { x: 0, z: 11 }, measuredMeters: 374 },
    { id: 'tee-championship', position: { x: 4, z: 21 }, measuredMeters: 389 }
  ],
  pins: [
    { id: 'pin-front', position: { x: 4, z: -338 }, difficulty: 'visible-front-opening' },
    { id: 'pin-center', position: { x: 8, z: -356 }, difficulty: 'balanced-center' },
    { id: 'pin-back-right', position: { x: 28, z: -372 }, difficulty: 'upper-shelf-demanding' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: -63, y: 58, z: 20 },
      lookAt: { x: 3, y: 8, z: -269 },
      fieldOfViewDegrees: 41
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: -9, y: 14, z: 17 },
      lookAt: { x: 1, y: 8, z: -254 },
      fieldOfViewDegrees: 35
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: -53, y: 31, z: -207 },
      lookAt: { x: 15, y: 8, z: -298 },
      fieldOfViewDegrees: 33
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: -26, y: 17, z: -324 },
      lookAt: { x: 8, y: 8, z: -356 },
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

export const COURSE_ONE_HOLE_EIGHT_ELEVATION_CONTEXT = Object.freeze({
  greenElevationGainMeters: 8,
  centerBunkerCarryMeters: 238,
  visibleLandingWidthMeters: 38,
  aggressiveLandingWidthMeters: 24,
  visibleValue: 'The left position keeps landing and green entrance visible through the uphill approach.',
  aggressiveValue: 'The center carry earns a short pitch but accepts bunker recovery without a direct green view.',
  authority: 'Describes authored strategy only; it never recommends, selects, steers, or corrects a shot.'
});
