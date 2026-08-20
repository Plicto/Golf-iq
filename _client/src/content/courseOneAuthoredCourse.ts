import { type AuthoredCourseHoleV1, validateAuthoredCourseHole } from './authoredCourseHole.js';
import { COURSE_ONE_HOLE_EIGHT } from './courseOneHoleEight.js';
import { COURSE_ONE_HOLE_FIVE } from './courseOneHoleFive.js';
import { COURSE_ONE_HOLE_FOUR } from './courseOneHoleFour.js';
import { COURSE_ONE_HOLE_NINE } from './courseOneHoleNine.js';
import { COURSE_ONE_HOLE_ONE } from './courseOneHoleOne.js';
import { COURSE_ONE_HOLE_SEVEN } from './courseOneHoleSeven.js';
import { COURSE_ONE_HOLE_SIX } from './courseOneHoleSix.js';
import { COURSE_ONE_HOLE_THREE } from './courseOneHoleThree.js';
import { COURSE_ONE_HOLE_TWO } from './courseOneHoleTwo.js';

export interface AuthoredCourseOneV1 {
  readonly schemaVersion: 1;
  readonly id: 'course-one.authored.v1';
  readonly courseId: 'course-one';
  readonly artDirectionId: 'course-one.art-direction.v1';
  readonly holes: ReadonlyArray<Readonly<AuthoredCourseHoleV1>>;
  readonly totalPar: 36;
  readonly representativeMeters: 3265;
}

export interface AuthoredCourseOneIssue {
  readonly path: string;
  readonly message: string;
}

const COURSE_ONE_HOLE_ONE_INTEGRATED = Object.freeze({
  ...COURSE_ONE_HOLE_ONE,
  representativeMeters: 361,
  strategicIdentity: 'Opening strategy benchmark with water tightening the aggressive left line.',
  routes: Object.freeze(
    COURSE_ONE_HOLE_ONE.routes.map(({ expectedApproachMeters, ...route }) => ({
      ...route,
      expectedRemainingMeters: expectedApproachMeters
    }))
  ),
  misses: Object.freeze([
    {
      id: 'miss-left',
      side: 'left',
      consequence: 'The aggressive miss can enter the lateral inlet before the preferred approach angle is earned.',
      recovery: 'Apply authored penalty-area relief and play back toward the broad center-right corridor.'
    },
    {
      id: 'miss-right',
      side: 'right',
      consequence: 'The safe-side miss can find the right bunker and leave the green angled away.',
      recovery: 'Advance from sand toward the wide front-center rather than forcing the tucked line.'
    }
  ]),
  calibration: Object.freeze({
    representativeTeeId: COURSE_ONE_HOLE_ONE.calibration.representativeTeeId,
    representativePinId: COURSE_ONE_HOLE_ONE.calibration.representativePinId,
    minimumRouteSeparationMeters: COURSE_ONE_HOLE_ONE.calibration.requiredRouteSeparationMeters,
    mobileSurfaceBudget: COURSE_ONE_HOLE_ONE.calibration.mobileSurfaceBudget
  })
} satisfies AuthoredCourseHoleV1);

export const COURSE_ONE_AUTHORED = Object.freeze({
  schemaVersion: 1,
  id: 'course-one.authored.v1',
  courseId: 'course-one',
  artDirectionId: 'course-one.art-direction.v1',
  holes: Object.freeze([
    COURSE_ONE_HOLE_ONE_INTEGRATED,
    COURSE_ONE_HOLE_TWO,
    COURSE_ONE_HOLE_THREE,
    COURSE_ONE_HOLE_FOUR,
    COURSE_ONE_HOLE_FIVE,
    COURSE_ONE_HOLE_SIX,
    COURSE_ONE_HOLE_SEVEN,
    COURSE_ONE_HOLE_EIGHT,
    COURSE_ONE_HOLE_NINE
  ]),
  totalPar: 36,
  representativeMeters: 3265
} satisfies AuthoredCourseOneV1);

export function validateAuthoredCourseOne(
  course: Readonly<AuthoredCourseOneV1>
): ReadonlyArray<AuthoredCourseOneIssue> {
  const issues: AuthoredCourseOneIssue[] = [];
  if (course.schemaVersion !== 1 || course.id !== 'course-one.authored.v1')
    issues.push({ path: '$', message: 'Expected the authored Course One schema version and identifier.' });
  if (course.holes.length !== 9) issues.push({ path: '$.holes', message: 'Course One requires exactly nine holes.' });
  const numbers = course.holes.map(({ number }) => number);
  if (numbers.some((number, index) => number !== index + 1))
    issues.push({ path: '$.holes', message: 'Course One holes must be ordered one through nine.' });
  if (new Set(course.holes.map(({ id }) => id)).size !== course.holes.length)
    issues.push({ path: '$.holes', message: 'Course One hole identifiers must be unique.' });
  for (const [index, hole] of course.holes.entries()) {
    if (hole.courseId !== course.courseId || hole.artDirectionId !== course.artDirectionId)
      issues.push({ path: '$.holes[' + index + ']', message: 'Hole course and art-direction ownership must match.' });
    for (const issue of validateAuthoredCourseHole(hole))
      issues.push({ path: '$.holes[' + index + ']' + issue.path.slice(1), message: issue.message });
  }
  if (course.holes.reduce((sum, hole) => sum + hole.par, 0) !== course.totalPar)
    issues.push({ path: '$.totalPar', message: 'Course One total par must equal the authored holes.' });
  if (course.holes.reduce((sum, hole) => sum + hole.representativeMeters, 0) !== course.representativeMeters)
    issues.push({
      path: '$.representativeMeters',
      message: 'Course One representative distance must equal the authored holes.'
    });
  return Object.freeze(issues);
}
