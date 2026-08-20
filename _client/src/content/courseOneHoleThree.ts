import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_THREE = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-three',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 3,
  par: 3,
  representativeMeters: 168,
  strategicIdentity: 'Elevated par three where crosswind and safe-side selection matter more than flag hunting.',
  bounds: { minimumX: -50, maximumX: 50, minimumZ: -190, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -44, z: 18 },
        { x: 44, z: 18 },
        { x: 40, z: -184 },
        { x: -42, z: -184 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -20, z: -143 },
        { x: 19, z: -140 },
        { x: 25, z: -174 },
        { x: -17, z: -181 },
        { x: -29, z: -160 }
      ]
    },
    {
      id: 'bunker-short-right',
      kind: 'bunker',
      points: [
        { x: 16, z: -126 },
        { x: 32, z: -133 },
        { x: 28, z: -153 },
        { x: 14, z: -147 }
      ]
    },
    {
      id: 'bunker-long-left',
      kind: 'bunker',
      points: [
        { x: -29, z: -169 },
        { x: -14, z: -176 },
        { x: -10, z: -187 },
        { x: -31, z: -187 }
      ]
    },
    {
      id: 'native-short',
      kind: 'native',
      points: [
        { x: -40, z: -92 },
        { x: 42, z: -88 },
        { x: 34, z: -124 },
        { x: -35, z: -130 }
      ]
    }
  ],
  routes: [
    {
      id: 'safe-center-left',
      labelKey: 'courseOne.holeThree.routes.safeCenterLeft',
      target: { x: -7, z: -157, radiusMeters: 11 },
      minimumCarryMeters: 153,
      expectedRemainingMeters: 10,
      primaryRisk: 'bunker-long-left',
      reward: 'Uses the green depth and leaves an uphill putt across the prevailing wind.'
    },
    {
      id: 'attack-back-right',
      labelKey: 'courseOne.holeThree.routes.attackBackRight',
      target: { x: 9, z: -165, radiusMeters: 7 },
      minimumCarryMeters: 166,
      expectedRemainingMeters: 4,
      primaryRisk: 'bunker-short-right',
      reward: 'Creates a birdie look but exposes the shallow right shelf and downwind release.'
    }
  ],
  misses: [
    {
      id: 'miss-short',
      side: 'short',
      consequence: 'Native apron interrupts the running recovery and leaves elevation to climb.',
      recovery: 'Carry-first pitch to the center shelf.'
    },
    {
      id: 'miss-long',
      side: 'long',
      consequence: 'Back-left sand plays down the green with limited stopping room.',
      recovery: 'Open-face sand recovery toward the safe center.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: 4, z: -15 }, measuredMeters: 139 },
    { id: 'tee-club', position: { x: 2, z: -3 }, measuredMeters: 153 },
    { id: 'tee-back', position: { x: 0, z: 10 }, measuredMeters: 168 },
    { id: 'tee-championship', position: { x: -3, z: 21 }, measuredMeters: 181 }
  ],
  pins: [
    { id: 'pin-front', position: { x: 4, z: -149 }, difficulty: 'front-wind-exposed' },
    { id: 'pin-center', position: { x: -5, z: -160 }, difficulty: 'safe-side-readable' },
    { id: 'pin-back-right', position: { x: 11, z: -170 }, difficulty: 'shallow-shelf-demanding' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: -38, y: 42, z: 22 },
      lookAt: { x: 0, y: -7.5, z: -154 },
      fieldOfViewDegrees: 38
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: 8, y: 10, z: 16 },
      lookAt: { x: 0, y: -7.5, z: -158 },
      fieldOfViewDegrees: 34
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: 31, y: 20, z: -118 },
      lookAt: { x: 0, y: -7.5, z: -160 },
      fieldOfViewDegrees: 33
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: -23, y: 8, z: -139 },
      lookAt: { x: 0, y: -7.5, z: -161 },
      fieldOfViewDegrees: 31
    }
  ],
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-center',
    minimumRouteSeparationMeters: 14,
    mobileSurfaceBudget: 5
  }
} satisfies AuthoredCourseHoleV1);

export const COURSE_ONE_HOLE_THREE_WIND = Object.freeze({
  elevationDropMeters: 7.5,
  prevailingTowardHeadingDegrees: 112,
  representativeSpeedMetersPerSecond: 5.5,
  gustRangeMetersPerSecond: Object.freeze([4, 7]),
  safeSide: 'left-center',
  rule: 'Wind changes physical flight; presentation may explain but never correct the result.'
});
