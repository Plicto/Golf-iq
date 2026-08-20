import type { CourseArchetype } from "./course-character.ts";

export type PlayableGroundKind = "rough" | "fairway" | "green" | "bunker";

export type GroundMaterial = Readonly<{
  id: string;
  normalRestitution: number;
  impactFriction: number;
  deformationLoss: number;
  rollingResistance: number;
  staticResistance: number;
  velocityDrag: number;
}>;

export type CourseGroundMaterials = Readonly<
  Record<PlayableGroundKind, GroundMaterial>
>;

const material = (value: GroundMaterial): GroundMaterial =>
  Object.freeze({ ...value });

function courseMaterials(
  id: CourseArchetype,
  values: Readonly<Record<PlayableGroundKind, Omit<GroundMaterial, "id">>>,
): CourseGroundMaterials {
  return Object.freeze(Object.fromEntries(
    Object.entries(values).map(([surface, value]) => [
      surface,
      material({ id: `${id}-${surface}`, ...value }),
    ]),
  ) as Record<PlayableGroundKind, GroundMaterial>);
}

export const COURSE_GROUND_MATERIALS: Readonly<
  Record<CourseArchetype, CourseGroundMaterials>
> = Object.freeze({
  links: courseMaterials("links", {
    fairway: {
      normalRestitution: 0.39,
      impactFriction: 0.21,
      deformationLoss: 0.48,
      rollingResistance: 0.54,
      staticResistance: 0.68,
      velocityDrag: 0.009,
    },
    green: {
      normalRestitution: 0.3,
      impactFriction: 0.25,
      deformationLoss: 0.56,
      rollingResistance: 0.4,
      staticResistance: 0.52,
      velocityDrag: 0.005,
    },
    rough: {
      normalRestitution: 0.045,
      impactFriction: 0.62,
      deformationLoss: 0.91,
      rollingResistance: 3.25,
      staticResistance: 3.85,
      velocityDrag: 0.04,
    },
    bunker: {
      normalRestitution: 0.035,
      impactFriction: 0.58,
      deformationLoss: 0.88,
      rollingResistance: 2.8,
      staticResistance: 3.2,
      velocityDrag: 0.026,
    },
  }),
  "open-parkland": courseMaterials("open-parkland", {
    fairway: {
      normalRestitution: 0.23,
      impactFriction: 0.3,
      deformationLoss: 0.65,
      rollingResistance: 1.05,
      staticResistance: 1.26,
      velocityDrag: 0.008,
    },
    green: {
      normalRestitution: 0.2,
      impactFriction: 0.31,
      deformationLoss: 0.67,
      rollingResistance: 0.63,
      staticResistance: 0.79,
      velocityDrag: 0.005,
    },
    rough: {
      normalRestitution: 0.08,
      impactFriction: 0.46,
      deformationLoss: 0.79,
      rollingResistance: 1.46,
      staticResistance: 1.72,
      velocityDrag: 0.014,
    },
    bunker: {
      normalRestitution: 0.03,
      impactFriction: 0.6,
      deformationLoss: 0.9,
      rollingResistance: 2.5,
      staticResistance: 2.92,
      velocityDrag: 0.02,
    },
  }),
  woodland: courseMaterials("woodland", {
    fairway: {
      normalRestitution: 0.18,
      impactFriction: 0.34,
      deformationLoss: 0.69,
      rollingResistance: 1.25,
      staticResistance: 1.48,
      velocityDrag: 0.009,
    },
    green: {
      normalRestitution: 0.16,
      impactFriction: 0.34,
      deformationLoss: 0.71,
      rollingResistance: 0.75,
      staticResistance: 0.91,
      velocityDrag: 0.006,
    },
    rough: {
      normalRestitution: 0.055,
      impactFriction: 0.5,
      deformationLoss: 0.84,
      rollingResistance: 1.78,
      staticResistance: 2.04,
      velocityDrag: 0.016,
    },
    bunker: {
      normalRestitution: 0.025,
      impactFriction: 0.62,
      deformationLoss: 0.91,
      rollingResistance: 2.62,
      staticResistance: 3.02,
      velocityDrag: 0.021,
    },
  }),
  "florida-soft": courseMaterials("florida-soft", {
    fairway: {
      normalRestitution: 0.08,
      impactFriction: 0.44,
      deformationLoss: 0.82,
      rollingResistance: 1.72,
      staticResistance: 2.02,
      velocityDrag: 0.016,
    },
    green: {
      normalRestitution: 0.055,
      impactFriction: 0.43,
      deformationLoss: 0.84,
      rollingResistance: 1.08,
      staticResistance: 1.3,
      velocityDrag: 0.01,
    },
    rough: {
      normalRestitution: 0.04,
      impactFriction: 0.54,
      deformationLoss: 0.88,
      rollingResistance: 2.18,
      staticResistance: 2.52,
      velocityDrag: 0.02,
    },
    bunker: {
      normalRestitution: 0.018,
      impactFriction: 0.66,
      deformationLoss: 0.93,
      rollingResistance: 2.9,
      staticResistance: 3.3,
      velocityDrag: 0.024,
    },
  }),
});

export function courseGroundMaterials(
  course: CourseArchetype,
): CourseGroundMaterials {
  const values = COURSE_GROUND_MATERIALS[course];
  if (!values) throw new RangeError(`Unknown ground-material course: ${course}`);
  return values;
}
