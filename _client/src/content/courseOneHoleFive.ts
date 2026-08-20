import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_FIVE = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-five',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 5,
  par: 5,
  representativeMeters: 512,
  strategicIdentity:
    'Heathland par five where the second shot decides between a full-angle layup and a narrow chance to reach in two.',
  bounds: { minimumX: -82, maximumX: 82, minimumZ: -545, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -76, z: 18 },
        { x: 76, z: 18 },
        { x: 74, z: -538 },
        { x: -75, z: -538 }
      ]
    },
    {
      id: 'fairway-lower',
      kind: 'fairway',
      points: [
        { x: -15, z: -55 },
        { x: 37, z: -49 },
        { x: 45, z: -271 },
        { x: 3, z: -296 },
        { x: -25, z: -214 }
      ]
    },
    {
      id: 'fairway-upper',
      kind: 'fairway',
      points: [
        { x: -31, z: -290 },
        { x: 32, z: -280 },
        { x: 28, z: -452 },
        { x: -18, z: -466 },
        { x: -44, z: -386 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -25, z: -466 },
        { x: 21, z: -463 },
        { x: 32, z: -503 },
        { x: -16, z: -523 },
        { x: -36, z: -493 }
      ]
    },
    {
      id: 'bunker-layup-left',
      kind: 'bunker',
      points: [
        { x: -50, z: -350 },
        { x: -27, z: -346 },
        { x: -22, z: -382 },
        { x: -48, z: -390 }
      ]
    },
    {
      id: 'bunker-green-right',
      kind: 'bunker',
      points: [
        { x: 22, z: -451 },
        { x: 48, z: -463 },
        { x: 43, z: -503 },
        { x: 28, z: -500 }
      ]
    },
    {
      id: 'water-crossing',
      kind: 'water',
      points: [
        { x: -75, z: -301 },
        { x: -41, z: -312 },
        { x: -22, z: -337 },
        { x: -75, z: -329 }
      ]
    }
  ],
  routes: [
    {
      id: 'three-shot-right-layup',
      labelKey: 'courseOne.holeFive.routes.threeShotRightLayup',
      target: { x: 25, z: -326, radiusMeters: 20 },
      minimumCarryMeters: 188,
      expectedRemainingMeters: 186,
      primaryRisk: 'bunker-layup-left',
      reward: 'Preserves the green depth and leaves a full wedge from the broad right platform.'
    },
    {
      id: 'attack-upper-left',
      labelKey: 'courseOne.holeFive.routes.attackUpperLeft',
      target: { x: -18, z: -423, radiusMeters: 13 },
      minimumCarryMeters: 244,
      expectedRemainingMeters: 91,
      primaryRisk: 'water-crossing',
      reward: 'Clears the diagonal crossing and opens a narrow chance to reach the green in two.'
    }
  ],
  misses: [
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'The attacking second shot can enter the diagonal penalty water before the upper fairway.',
      recovery: 'Use the authored penalty-area relief and rebuild the hole as a three-shot par five.'
    },
    {
      id: 'miss-right',
      side: 'right',
      consequence: 'The conservative miss remains in native rough with the green still visible.',
      recovery: 'Advance to the right layup platform and preserve a full-angle fourth shot.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: 8, z: -18 }, measuredMeters: 438 },
    { id: 'tee-club', position: { x: 5, z: -3 }, measuredMeters: 472 },
    { id: 'tee-back', position: { x: 0, z: 11 }, measuredMeters: 512 },
    { id: 'tee-championship', position: { x: -4, z: 21 }, measuredMeters: 528 }
  ],
  pins: [
    { id: 'pin-front', position: { x: 4, z: -475 }, difficulty: 'reachable-front-opening' },
    { id: 'pin-center', position: { x: -3, z: -493 }, difficulty: 'balanced-center' },
    { id: 'pin-back-left', position: { x: -17, z: -510 }, difficulty: 'layup-angle-reward' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: 67, y: 68, z: 19 },
      lookAt: { x: 0, y: 0, z: -340 },
      fieldOfViewDegrees: 43
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: 31, y: 18, z: -232 },
      lookAt: { x: -4, y: 0, z: -395 },
      fieldOfViewDegrees: 36
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: 54, y: 31, z: -377 },
      lookAt: { x: -3, y: 0, z: -474 },
      fieldOfViewDegrees: 34
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: -38, y: 10, z: -459 },
      lookAt: { x: -2, y: 0, z: -493 },
      fieldOfViewDegrees: 30
    }
  ],
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-center',
    minimumRouteSeparationMeters: 100,
    mobileSurfaceBudget: 7
  }
} satisfies AuthoredCourseHoleV1);

export const COURSE_ONE_HOLE_FIVE_SECOND_SHOT = Object.freeze({
  attackMinimumCarryMeters: 244,
  maximumAttackHeadwindMetersPerSecond: 3.5,
  requiredLie: 'fairway',
  layupValue: 'The right platform preserves the full green depth and removes the diagonal water.',
  attackValue: 'The upper-left carry earns a chance to reach in two at the cost of penalty exposure.',
  authority: 'Describes authored strategy only; it never recommends, selects, steers, or corrects a shot.'
});
