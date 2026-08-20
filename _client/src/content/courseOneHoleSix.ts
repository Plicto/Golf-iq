import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_SIX = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-six',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 6,
  par: 3,
  representativeMeters: 196,
  strategicIdentity:
    'Long par three where a firm run-up corridor competes with a full aerial carry to the exposed back-left shelf.',
  bounds: { minimumX: -62, maximumX: 62, minimumZ: -222, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -57, z: 18 },
        { x: 57, z: 18 },
        { x: 56, z: -216 },
        { x: -56, z: -216 }
      ]
    },
    {
      id: 'fairway-runup',
      kind: 'fairway',
      points: [
        { x: 4, z: -112 },
        { x: 34, z: -117 },
        { x: 28, z: -174 },
        { x: -3, z: -167 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -25, z: -162 },
        { x: 24, z: -158 },
        { x: 32, z: -195 },
        { x: -18, z: -211 },
        { x: -37, z: -187 }
      ]
    },
    {
      id: 'bunker-front-right',
      kind: 'bunker',
      points: [
        { x: 24, z: -145 },
        { x: 43, z: -155 },
        { x: 39, z: -181 },
        { x: 28, z: -177 }
      ]
    },
    {
      id: 'bunker-back',
      kind: 'bunker',
      points: [
        { x: -8, z: -204 },
        { x: 23, z: -199 },
        { x: 32, z: -214 },
        { x: -10, z: -216 }
      ]
    },
    {
      id: 'water-left',
      kind: 'water',
      points: [
        { x: -57, z: -124 },
        { x: -31, z: -134 },
        { x: -28, z: -201 },
        { x: -56, z: -212 }
      ]
    }
  ],
  routes: [
    {
      id: 'running-front-right',
      labelKey: 'courseOne.holeSix.routes.runningFrontRight',
      target: { x: 13, z: -169, radiusMeters: 13 },
      minimumCarryMeters: 163,
      expectedRemainingMeters: 25,
      primaryRisk: 'bunker-front-right',
      reward: 'Uses the firm apron and widest green entrance while keeping the penalty water outside the normal miss.'
    },
    {
      id: 'aerial-back-left',
      labelKey: 'courseOne.holeSix.routes.aerialBackLeft',
      target: { x: -13, z: -196, radiusMeters: 8 },
      minimumCarryMeters: 191,
      expectedRemainingMeters: 6,
      primaryRisk: 'water-left',
      reward: 'Carries directly to the exposed shelf and earns the shortest birdie putt.'
    }
  ],
  misses: [
    {
      id: 'miss-short',
      side: 'short',
      consequence: 'The run-up miss remains on tightly mown fairway below the green.',
      recovery: 'Use the full green depth with a low-running chip.'
    },
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'The aerial miss can enter the lateral water beside the back-left shelf.',
      recovery: 'Apply authored penalty-area relief and play toward the broad front-center.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: 7, z: -17 }, measuredMeters: 157 },
    { id: 'tee-club', position: { x: 4, z: -2 }, measuredMeters: 177 },
    { id: 'tee-back', position: { x: 0, z: 11 }, measuredMeters: 196 },
    { id: 'tee-championship', position: { x: -3, z: 21 }, measuredMeters: 209 }
  ],
  pins: [
    { id: 'pin-front-right', position: { x: 13, z: -169 }, difficulty: 'runup-accessible' },
    { id: 'pin-center', position: { x: -1, z: -185 }, difficulty: 'balanced-center' },
    { id: 'pin-back-left', position: { x: -14, z: -199 }, difficulty: 'water-side-exposed' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: 48, y: 49, z: 20 },
      lookAt: { x: -1, y: 1.5, z: -177 },
      fieldOfViewDegrees: 39
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: 9, y: 12, z: 17 },
      lookAt: { x: 0, y: 1.5, z: -183 },
      fieldOfViewDegrees: 35
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: 44, y: 23, z: -133 },
      lookAt: { x: -1, y: 1.5, z: -183 },
      fieldOfViewDegrees: 33
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: -31, y: 9, z: -156 },
      lookAt: { x: -1, y: 1.5, z: -185 },
      fieldOfViewDegrees: 30
    }
  ],
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-center',
    minimumRouteSeparationMeters: 36,
    mobileSurfaceBudget: 6
  }
} satisfies AuthoredCourseHoleV1);

export const COURSE_ONE_HOLE_SIX_FLIGHT_CONTEXT = Object.freeze({
  apronFirmness: 'firm',
  prevailingHeadwindMetersPerSecond: 3.8,
  runningLandingAngleMaximumDegrees: 39,
  aerialMinimumCarryMeters: 191,
  groundValue: 'The front-right apron converts lower flight into safe forward release.',
  aerialValue: 'The high carry removes apron variance but exposes the water-side shelf.',
  authority: 'Describes authored strategy only; it never recommends, selects, steers, or corrects a shot.'
});
