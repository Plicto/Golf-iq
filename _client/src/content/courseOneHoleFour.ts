import { deepFreezeAuthoredHole, type AuthoredCourseHoleV1 } from './authoredCourseHole.js';

export const COURSE_ONE_HOLE_FOUR = deepFreezeAuthoredHole({
  schemaVersion: 1,
  id: 'course-one.hole-four',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  number: 4,
  par: 4,
  representativeMeters: 315,
  strategicIdentity:
    'Short risk-reward par four where a wide right layup competes with a committed drive at the green.',
  bounds: { minimumX: -78, maximumX: 64, minimumZ: -340, maximumZ: 24 },
  surfaces: [
    {
      id: 'rough-main',
      kind: 'rough',
      points: [
        { x: -70, z: 18 },
        { x: 55, z: 18 },
        { x: 59, z: -333 },
        { x: -70, z: -333 }
      ]
    },
    {
      id: 'fairway-right',
      kind: 'fairway',
      points: [
        { x: -8, z: -68 },
        { x: 38, z: -62 },
        { x: 44, z: -231 },
        { x: 7, z: -247 },
        { x: -13, z: -182 }
      ]
    },
    {
      id: 'green-main',
      kind: 'green',
      points: [
        { x: -24, z: -279 },
        { x: 17, z: -277 },
        { x: 29, z: -311 },
        { x: -16, z: -324 },
        { x: -34, z: -301 }
      ]
    },
    {
      id: 'bunker-center',
      kind: 'bunker',
      points: [
        { x: -17, z: -220 },
        { x: 4, z: -226 },
        { x: 7, z: -259 },
        { x: -18, z: -257 }
      ]
    },
    {
      id: 'bunker-green-right',
      kind: 'bunker',
      points: [
        { x: 19, z: -268 },
        { x: 40, z: -279 },
        { x: 38, z: -307 },
        { x: 25, z: -309 }
      ]
    },
    {
      id: 'water-left',
      kind: 'water',
      points: [
        { x: -67, z: -185 },
        { x: -38, z: -192 },
        { x: -26, z: -314 },
        { x: -65, z: -329 }
      ]
    }
  ],
  routes: [
    {
      id: 'conservative-layup-right',
      labelKey: 'courseOne.holeFour.routes.conservativeLayupRight',
      target: { x: 22, z: -190, radiusMeters: 18 },
      minimumCarryMeters: 175,
      expectedRemainingMeters: 110,
      primaryRisk: 'bunker-center',
      reward: 'Keeps water out of play and preserves a full-angle approach into the green depth.'
    },
    {
      id: 'aggressive-green-left',
      labelKey: 'courseOne.holeFour.routes.aggressiveGreenLeft',
      target: { x: -8, z: -289, radiusMeters: 10 },
      minimumCarryMeters: 272,
      expectedRemainingMeters: 25,
      primaryRisk: 'water-left',
      reward: 'A committed carry can reach the front apron and creates an eagle pitch or birdie putt.'
    }
  ],
  misses: [
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'The aggressive line brings the lateral water edge into the full-shot dispersion.',
      recovery: 'Apply the authored penalty-area procedure and play the next shot from relief.'
    },
    {
      id: 'miss-right',
      side: 'right',
      consequence: 'The conservative miss finds deep green-side sand but remains in play.',
      recovery: 'Sand recovery toward the broad center rather than the short-sided flag.'
    }
  ],
  tees: [
    { id: 'tee-forward', position: { x: 7, z: -18 }, measuredMeters: 266 },
    { id: 'tee-club', position: { x: 4, z: -4 }, measuredMeters: 287 },
    { id: 'tee-back', position: { x: 0, z: 10 }, measuredMeters: 315 },
    { id: 'tee-championship', position: { x: -4, z: 21 }, measuredMeters: 329 }
  ],
  pins: [
    { id: 'pin-front', position: { x: -6, z: -286 }, difficulty: 'driveable-front-edge' },
    { id: 'pin-center', position: { x: 2, z: -301 }, difficulty: 'balanced-center' },
    { id: 'pin-back-left', position: { x: -15, z: -313 }, difficulty: 'water-side-demanding' }
  ],
  cameras: [
    {
      id: 'camera-establishing',
      mode: 'establishing',
      position: { x: 59, y: 54, z: 16 },
      lookAt: { x: -2, y: 0, z: -232 },
      fieldOfViewDegrees: 41
    },
    {
      id: 'camera-decision',
      mode: 'decision',
      position: { x: 10, y: 12, z: 18 },
      lookAt: { x: 2, y: 0, z: -260 },
      fieldOfViewDegrees: 36
    },
    {
      id: 'camera-landing',
      mode: 'landing',
      position: { x: 48, y: 27, z: -214 },
      lookAt: { x: -3, y: 0, z: -289 },
      fieldOfViewDegrees: 34
    },
    {
      id: 'camera-green',
      mode: 'green-reading',
      position: { x: -31, y: 9, z: -274 },
      lookAt: { x: 0, y: 0, z: -301 },
      fieldOfViewDegrees: 30
    }
  ],
  calibration: {
    representativeTeeId: 'tee-back',
    representativePinId: 'pin-center',
    minimumRouteSeparationMeters: 96,
    mobileSurfaceBudget: 6
  }
} satisfies AuthoredCourseHoleV1);

export const COURSE_ONE_HOLE_FOUR_DECISION_CONTEXT = Object.freeze({
  aggressiveMinimumCarryMeters: 272,
  aggressiveHeadwindLimitMetersPerSecond: 4.5,
  conservativeParValue: 'Preserves a full-angle approach and keeps the penalty area outside the normal miss.',
  aggressiveScoringValue: 'Trades a severe left miss for an eagle pitch or birdie putt.',
  authority: 'Describes authored strategy only; it never recommends, selects, steers, or corrects a shot.'
});
