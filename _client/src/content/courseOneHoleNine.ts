import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_NINE = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-nine',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 9,
  par: 5,
  representativeMeters: 523,
  strategicIdentity:
    'Closing par five where a dry left layup competes with a full carry beside the clubhouse water for a chance to reach in two.',
  bounds: { minimumX: -92, maximumX: 92, minimumZ: -558, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -86, z: 18 },
        { x: 86, z: 18 },
        { x: 84, z: -551 },
        { x: -84, z: -551 }
      ]
    },
    {
      id: 'fairway-lower',
      kind: 'fairway',
      points: [
        { x: -26, z: -52 },
        { x: 31, z: -49 },
        { x: 42, z: -266 },
        { x: -8, z: -293 },
        { x: -40, z: -196 }
      ]
    },
    {
      id: 'fairway-layup-left',
      kind: 'fairway',
      points: [
        { x: -49, z: -285 },
        { x: 2, z: -279 },
        { x: -1, z: -423 },
        { x: -47, z: -438 },
        { x: -64, z: -360 }
      ]
    },
    {
      id: 'fairway-attack-right',
      kind: 'fairway',
      points: [
        { x: 12, z: -284 },
        { x: 53, z: -276 },
        { x: 48, z: -436 },
        { x: 9, z: -449 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -18, z: -449 },
        { x: 32, z: -445 },
        { x: 46, z: -491 },
        { x: -8, z: -520 },
        { x: -34, z: -483 }
      ]
    },
    {
      id: 'bunker-layup-left',
      kind: 'bunker',
      points: [
        { x: -67, z: -342 },
        { x: -46, z: -338 },
        { x: -40, z: -377 },
        { x: -65, z: -384 }
      ]
    },
    {
      id: 'bunker-green-front',
      kind: 'bunker',
      points: [
        { x: -7, z: -431 },
        { x: 25, z: -430 },
        { x: 28, z: -458 },
        { x: -10, z: -461 }
      ]
    },
    {
      id: 'water-right',
      kind: 'water',
      points: [
        { x: 55, z: -236 },
        { x: 86, z: -242 },
        { x: 84, z: -520 },
        { x: 49, z: -502 }
      ]
    }
  ],
  routes: [
    {
      id: 'dry-left-layup',
      labelKey: 'courseOne.holeNine.routes.dryLeftLayup',
      target: { x: -31, z: -347, radiusMeters: 21 },
      minimumCarryMeters: 191,
      expectedRemainingMeters: 176,
      primaryRisk: 'bunker-layup-left',
      reward: 'Removes the clubhouse water and preserves a full wedge into the long axis of the closing green.'
    },
    {
      id: 'clubhouse-water-carry',
      labelKey: 'courseOne.holeNine.routes.clubhouseWaterCarry',
      target: { x: 28, z: -431, radiusMeters: 13 },
      minimumCarryMeters: 252,
      expectedRemainingMeters: 88,
      primaryRisk: 'water-right',
      reward: 'Carries beside the water to create a closing eagle pitch or a chance to reach in two.'
    }
  ],
  misses: [
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'The dry-route miss finds a layup bunker but remains in play with the full green visible.',
      recovery: 'Advance toward the broad front-center and protect the closing par.'
    },
    {
      id: 'miss-right',
      side: 'right',
      consequence:
        'The attacking miss can enter the lateral clubhouse water through the full second-shot landing zone.',
      recovery: 'Apply authored penalty-area relief and rebuild the hole from the dry corridor.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: -7, z: -17 }, measuredMeters: 447 },
    { id: 'tee-club', position: { x: -4, z: -2 }, measuredMeters: 482 },
    { id: 'tee-back', position: { x: 0, z: 11 }, measuredMeters: 523 },
    { id: 'tee-championship', position: { x: 4, z: 21 }, measuredMeters: 541 }
  ],
  pins: [
    { id: 'pin-front', position: { x: 6, z: -461 }, difficulty: 'reachable-front-opening' },
    { id: 'pin-center', position: { x: 9, z: -485 }, difficulty: 'balanced-closing' },
    { id: 'pin-back-left', position: { x: -10, z: -503 }, difficulty: 'layup-axis-reward' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: -74, y: 72, z: 20 },
      lookAt: { x: 2, y: 0, z: -349 },
      fieldOfViewDegrees: 43
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: -15, y: 18, z: -242 },
      lookAt: { x: 2, y: 0, z: -397 },
      fieldOfViewDegrees: 36
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: -62, y: 34, z: -377 },
      lookAt: { x: 8, y: 0, z: -467 },
      fieldOfViewDegrees: 33
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: -31, y: 10, z: -443 },
      lookAt: { x: 8, y: 0, z: -485 },
      fieldOfViewDegrees: 30
    }
  ],
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-center',
    minimumRouteSeparationMeters: 100,
    mobileSurfaceBudget: 8
  }
} satisfies AuthoredCourseHoleV1);

export const COURSE_ONE_HOLE_NINE_CLOSING_CONTEXT = Object.freeze({
  attackingCarryMeters: 252,
  waterSideWindMetersPerSecond: 3.6,
  dryLandingWidthMeters: 42,
  attackingLandingWidthMeters: 26,
  dryValue: 'The left layup removes the clubhouse water and preserves the long axis of the green.',
  attackingValue: 'The water-side carry earns closing eagle value at the cost of penalty exposure.',
  authority: 'Describes authored strategy only; it never recommends, selects, steers, or corrects a shot.'
});
