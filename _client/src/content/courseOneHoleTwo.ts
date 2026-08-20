import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_TWO: AuthoredCourseHoleV1 = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-two',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 2,
  par: 4,
  representativeMeters: 388,
  strategicIdentity: 'Positional tee strategy creates different approach angles and deliberately asymmetric misses.',
  bounds: { minimumX: -58, maximumX: 58, minimumZ: -410, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -50, z: 18 },
        { x: 50, z: 18 },
        { x: 43, z: -402 },
        { x: -45, z: -402 }
      ]
    },
    {
      id: 'fairway-main',
      kind: 'fairway',
      points: [
        { x: -15, z: 8 },
        { x: 18, z: 4 },
        { x: 28, z: -214 },
        { x: 18, z: -330 },
        { x: -17, z: -328 },
        { x: -30, z: -196 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -19, z: -339 },
        { x: 17, z: -338 },
        { x: 22, z: -377 },
        { x: -13, z: -386 },
        { x: -26, z: -361 }
      ]
    },
    {
      id: 'bunker-left',
      kind: 'bunker',
      points: [
        { x: -31, z: -325 },
        { x: -17, z: -331 },
        { x: -20, z: -355 },
        { x: -36, z: -347 }
      ]
    },
    {
      id: 'bunker-long-right',
      kind: 'bunker',
      points: [
        { x: 14, z: -377 },
        { x: 30, z: -370 },
        { x: 34, z: -391 },
        { x: 17, z: -400 }
      ]
    },
    {
      id: 'native-right',
      kind: 'native',
      points: [
        { x: 30, z: -132 },
        { x: 55, z: -144 },
        { x: 51, z: -274 },
        { x: 27, z: -250 }
      ]
    }
  ],
  routes: [
    {
      id: 'left-platform',
      labelKey: 'courseOne.holeTwo.routes.leftPlatform',
      target: { x: -17, z: -218, radiusMeters: 15 },
      minimumCarryMeters: 201,
      expectedRemainingMeters: 170,
      primaryRisk: 'bunker-left',
      reward: 'Flatter lie and a safer view of the front-left pin.'
    },
    {
      id: 'right-angle',
      labelKey: 'courseOne.holeTwo.routes.rightAngle',
      target: { x: 13, z: -229, radiusMeters: 13 },
      minimumCarryMeters: 214,
      expectedRemainingMeters: 157,
      primaryRisk: 'native-right',
      reward: 'Shorter approach with the green opening along its long axis.'
    }
  ],
  misses: [
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'Collection slope leaves green visible but lengthens the recovery.',
      recovery: 'Running pitch from short grass.'
    },
    {
      id: 'miss-right',
      side: 'right',
      consequence: 'Long-right bunker leaves a short-sided recovery toward the fall line.',
      recovery: 'High sand shot with little green.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: 3, z: -20 }, measuredMeters: 354 },
    { id: 'tee-club', position: { x: 1, z: -5 }, measuredMeters: 372 },
    { id: 'tee-back', position: { x: 0, z: 10 }, measuredMeters: 388 },
    { id: 'tee-championship', position: { x: -3, z: 22 }, measuredMeters: 402 }
  ],
  pins: [
    { id: 'pin-front-left', position: { x: -9, z: -349 }, difficulty: 'rewards-left-platform' },
    { id: 'pin-center', position: { x: 0, z: -362 }, difficulty: 'balanced' },
    { id: 'pin-back-right', position: { x: 10, z: -377 }, difficulty: 'punishes-right-miss' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: -42, y: 48, z: 22 },
      lookAt: { x: 0, y: 0, z: -210 },
      fieldOfViewDegrees: 40
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: 7, y: 8, z: 16 },
      lookAt: { x: 0, y: 0, z: -224 },
      fieldOfViewDegrees: 36
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: -34, y: 24, z: -284 },
      lookAt: { x: 0, y: 0, z: -354 },
      fieldOfViewDegrees: 35
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: 20, y: 10, z: -326 },
      lookAt: { x: 0, y: 0, z: -362 },
      fieldOfViewDegrees: 32
    }
  ],
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-center',
    minimumRouteSeparationMeters: 24,
    mobileSurfaceBudget: 6
  }
});
