import type { CourseArchetype } from "./course-character.ts";
import type { CourseGroundMaterials, GroundMaterial } from "./ground-materials.ts";
import type { TerrainSample } from "./course-terrain-sampler.ts";
import type {
  CourseBarrierV1,
  CourseBoundsV1,
  CoursePoint2,
  CourseSurfaceV1,
  CourseWaterBodyV1,
} from "../../public/labs/course-presentation/lab-hole-runtime-v1.js";

export type CoursePoint = CoursePoint2;

export type CourseSurfaceKind =
  | "rough"
  | "fairway"
  | "green"
  | "bunker"
  | "water"
  | "boundary";

export type CourseSurface = CourseSurfaceV1;
export type CourseWaterBody = CourseWaterBodyV1;
export type CourseBarrierKind = CourseBarrierV1["kind"];
export type CourseBarrier = CourseBarrierV1;

export type CourseLayout = Readonly<{
  id: string;
  courseArchetype: CourseArchetype;
  label: string;
  shortLabel: string;
  physicsVersion: string;
  terrainVersion: string;
  tee: CoursePoint;
  pin: CoursePoint;
  bounds: CourseBoundsV1;
  aim: Readonly<{
    tee: CoursePoint;
    balanced: CoursePoint;
    safe: CoursePoint;
    routes: Readonly<{
      "safe-right": CoursePoint;
      "aggressive-left": CoursePoint;
    }>;
    lateralLimit: Readonly<{ tee: number; approach: number }>;
  }>;
  surfaces: readonly CourseSurface[];
  groundMaterials: CourseGroundMaterials;
  waterBodies: readonly CourseWaterBody[];
  barriers: readonly CourseBarrier[];
  terrainHeightAt: (point: CoursePoint) => number;
  sampleTerrain: (point: CoursePoint) => TerrainSample;
  presentation: Readonly<{
    sky: string;
    horizon: string;
    rough: string;
    fairway: string;
    green: string;
    bunker: string;
    water: string;
    accent: string;
    atmosphere: "salt-wind" | "humid" | "open";
  }>;
}>;

const SURFACE_PRIORITY: Readonly<
  Record<Exclude<CourseSurfaceKind, "boundary">, number>
> = Object.freeze({
  rough: 100,
  fairway: 200,
  green: 500,
  bunker: 600,
  water: 700,
});

const POLYGON_BOUNDS = new WeakMap<
  readonly CoursePoint[],
  Readonly<{
    minimumX: number;
    maximumX: number;
    minimumZ: number;
    maximumZ: number;
  }>
>();

function polygonBounds(points: readonly CoursePoint[]) {
  const cached = POLYGON_BOUNDS.get(points);
  if (cached) return cached;
  const bounds = Object.freeze(points.reduce(
    (current, point) => ({
      minimumX: Math.min(current.minimumX, point.x),
      maximumX: Math.max(current.maximumX, point.x),
      minimumZ: Math.min(current.minimumZ, point.z),
      maximumZ: Math.max(current.maximumZ, point.z),
    }),
    {
      minimumX: Number.POSITIVE_INFINITY,
      maximumX: Number.NEGATIVE_INFINITY,
      minimumZ: Number.POSITIVE_INFINITY,
      maximumZ: Number.NEGATIVE_INFINITY,
    },
  ));
  POLYGON_BOUNDS.set(points, bounds);
  return bounds;
}

function pointInPolygon(
  points: readonly CoursePoint[],
  point: CoursePoint,
) {
  const bounds = polygonBounds(points);
  const edgeTolerance = 0.000_001;
  if (
    point.x < bounds.minimumX - edgeTolerance ||
    point.x > bounds.maximumX + edgeTolerance ||
    point.z < bounds.minimumZ - edgeTolerance ||
    point.z > bounds.maximumZ + edgeTolerance
  ) {
    return false;
  }
  let inside = false;
  for (
    let index = 0, prior = points.length - 1;
    index < points.length;
    prior = index, index += 1
  ) {
    const current = points[index];
    const previous = points[prior];
    if (!current || !previous) continue;
    const edgeX = current.x - previous.x;
    const edgeZ = current.z - previous.z;
    const pointX = point.x - previous.x;
    const pointZ = point.z - previous.z;
    const cross = edgeX * pointZ - edgeZ * pointX;
    const along = pointX * edgeX + pointZ * edgeZ;
    if (
      Math.abs(cross) <= 0.000_001 * Math.max(1, Math.hypot(edgeX, edgeZ)) &&
      along >= -0.000_001 &&
      along <= edgeX ** 2 + edgeZ ** 2 + 0.000_001
    ) return true;
    if (
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          (previous.z - current.z) +
          current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function classifyCourseSurface(
  layout: CourseLayout,
  point: CoursePoint,
): CourseSurfaceKind {
  if (
    point.x < layout.bounds.minimumX ||
    point.x > layout.bounds.maximumX ||
    point.z < layout.bounds.minimumZ ||
    point.z > layout.bounds.maximumZ
  ) {
    return "boundary";
  }
  let retainedKind: Exclude<CourseSurfaceKind, "boundary"> | null = null;
  let retainedPriority = Number.NEGATIVE_INFINITY;
  for (const candidate of layout.surfaces) {
    const priority = SURFACE_PRIORITY[candidate.kind];
    if (priority <= retainedPriority) continue;
    if (!pointInPolygon(candidate.points, point)) continue;
    retainedKind = candidate.kind;
    retainedPriority = priority;
    if (priority === SURFACE_PRIORITY.water) break;
  }
  return retainedKind ?? "boundary";
}

export function courseWaterLevelAt(
  layout: CourseLayout,
  point: CoursePoint,
): number | null {
  for (const body of layout.waterBodies) {
    const surface = layout.surfaces.find(
      (candidate) => candidate.id === body.surfaceId && candidate.kind === "water",
    );
    if (surface && pointInPolygon(surface.points, point)) return body.levelMeters;
  }
  return null;
}

export function courseContactHeightAt(
  layout: CourseLayout,
  point: CoursePoint,
): number {
  return courseWaterLevelAt(layout, point) ?? layout.terrainHeightAt(point);
}

export function courseBarrierBaseHeightAt(
  layout: CourseLayout,
  barrier: CourseBarrier,
  point: CoursePoint,
) {
  return barrier.baseLevelMeters ?? layout.terrainHeightAt(point);
}

export function courseBarrierTopHeightAt(
  layout: CourseLayout,
  barrier: CourseBarrier,
  point: CoursePoint,
) {
  return courseBarrierBaseHeightAt(layout, barrier, point) +
    barrier.heightMeters;
}

export function courseGroundMaterialAt(
  layout: CourseLayout,
  point: CoursePoint,
): GroundMaterial | null {
  const surfaceKind = classifyCourseSurface(layout, point);
  if (
    surfaceKind === "water" ||
    surfaceKind === "boundary"
  ) return null;
  return layout.groundMaterials[surfaceKind];
}
