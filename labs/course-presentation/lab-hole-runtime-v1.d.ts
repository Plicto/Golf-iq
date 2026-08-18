export const LAB_HOLE_RUNTIME_SCHEMA_VERSION: 1;
export const REGULATION_CUP_DIAMETER_METERS: 0.10795;

export const LAB_HOLE_RUNTIME_COORDINATE_SYSTEM: Readonly<{
  units: "meters";
  origin: "tee";
  horizontalAxes: "x-z";
  verticalAxis: "+y";
  forwardAxis: "+z";
}>;

export type DeepReadonly<Value> =
  Value extends (...args: infer Arguments) => infer Result
    ? (...args: Arguments) => Result
    : Value extends readonly unknown[] ? {
        readonly [Index in keyof Value]: DeepReadonly<Value[Index]>;
      }
    : Value extends object ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

export type CoursePoint2 = Readonly<{ x: number; z: number }>;
export type CoursePoint3 = Readonly<{ x: number; y: number; z: number }>;

export type CourseBoundsV1 = Readonly<{
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}>;

export type CourseSurfaceV1 = Readonly<{
  id: string;
  kind: "rough" | "fairway" | "green" | "bunker" | "water";
  points: readonly CoursePoint2[];
}>;

export type CourseWaterBodyV1 = Readonly<{
  id: string;
  surfaceId: string;
  levelMeters: number;
}>;

export type CourseBarrierV1 = Readonly<{
  id: string;
  kind: "stone-wall" | "timber-bulkhead";
  points: readonly CoursePoint2[];
  heightMeters: number;
  baseLevelMeters: number | null;
  thicknessMeters: number;
  normalRestitution: number;
  tangentialRetention: number;
}>;

export type CourseBunkerFeatureV1 = Readonly<{
  id: string;
  surfaceId: string;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  shapeSeed: number;
  floorRadius: number;
  depthMeters: number;
  rimHeightMeters: number;
  style: string;
}>;

export type CourseCameraV1 = Readonly<{
  position: CoursePoint3;
  target: CoursePoint3;
  fovDegrees: number;
  rollDegrees?: number;
  focalShiftX?: number;
  focalShiftY?: number;
}>;

export type CourseAimV1 = Readonly<{
  tee: CoursePoint2;
  balanced: CoursePoint2;
  safe: CoursePoint2;
  routes: Readonly<{
    "safe-right": CoursePoint2;
    "aggressive-left": CoursePoint2;
  }>;
  lateralLimit: Readonly<{ tee: number; approach: number }>;
}>;

export type CourseThemeV1 = Readonly<{
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

export type CoursePaletteV1 = Readonly<{
  skyTop: string;
  skyMiddle: string;
  skyHorizon: string;
  horizon: string;
  landscapeTop: string;
  landscapeMiddle: string;
  landscapeBottom: string;
  roughTop: string;
  roughMiddle: string;
  roughBottom: string;
  fairwayTop: string;
  fairwayMiddle: string;
  fairwayBottom: string;
  fringe: string;
  greenTop: string;
  greenMiddle: string;
  greenBottom: string;
  fairwayStripeLight: string;
  fairwayStripeDark: string;
  distantRidge?: string;
  duneHighlight?: string;
  duneShadow?: string;
}>;

export type CourseWorldV1 = Readonly<{
  id: string;
  label: string;
  lengthMeters: number;
  tee: CoursePoint2;
  pin: CoursePoint2 & Readonly<{ y?: number }>;
  greenPresentation: Readonly<{
    center: CoursePoint2;
    radiusX: number;
    radiusZ: number;
    cupDiameter: number;
    flagstickHeight: number;
    flagWidth: number;
    flagHeight: number;
  }>;
  roughPoints: readonly CoursePoint2[];
  fairwayPoints: readonly (readonly CoursePoint2[])[];
  greenPoints: readonly CoursePoint2[];
  bunkers: readonly Readonly<Record<string, string | number>>[];
  bunkerPoints: readonly (readonly CoursePoint2[])[];
  waterSurfacePoints: readonly (CoursePoint2 & Readonly<{ y?: number }>)[];
  waterSurfaceGroups: readonly (
    readonly (CoursePoint2 & Readonly<{ y?: number }>)[]
  )[];
  waterLevel: number;
  waterLevels: readonly number[];
  wallPoints: readonly CoursePoint2[];
  barrierPointGroups: readonly (readonly CoursePoint2[])[];
  treePositions: readonly (readonly [x: number, z: number, height: number])[];
  strategyPaths: readonly Readonly<{
    color: string;
    points: readonly CoursePoint2[];
  }>[];
  terrainElevationAt: (x: number, z: number) => number;
  greenElevationAt: (x: number, z: number) => number;
  surfaceElevationAt: (x: number, z: number) => number;
  centerAt: (z: number) => number;
  fairwayHalfWidthAt: (z: number) => number;
  stripeStartZ: number;
  stripeEndZ: number;
  bounds: CourseBoundsV1;
  overviewCamera: CourseCameraV1;
  greenDetailCamera: CourseCameraV1;
  palette: CoursePaletteV1;
}>;

export type LabHoleRuntimeV1 = Readonly<{
  schemaVersion: 1;
  contentRevision: string;
  coordinateSystem: typeof LAB_HOLE_RUNTIME_COORDINATE_SYSTEM;
  identity: Readonly<{
    id: string;
    layoutId: string;
    scenarioId: string;
    holeLabel: string;
    label: string;
  }>;
  gameplay: Readonly<{
    par: number;
    openingClub: string;
    courseArchetype: "links" | "open-parkland" | "woodland" | "florida-soft";
    physicsVersion: string;
    terrainVersion: string;
    roundSeed: number;
    wind: Readonly<{
      speed: number;
      towardDegrees: number;
      label: string;
    }>;
    aim: CourseAimV1;
  }>;
  geometry: Readonly<{
    lengthMeters: number;
    tee: CoursePoint2;
    pin: CoursePoint2;
    bounds: CourseBoundsV1;
    surfaces: readonly CourseSurfaceV1[];
    bunkerFeatures: readonly CourseBunkerFeatureV1[];
    waterBodies: readonly CourseWaterBodyV1[];
    barriers: readonly CourseBarrierV1[];
    terrainElevationAt: (x: number, z: number) => number;
    surfaceElevationAt: (x: number, z: number) => number;
    greenElevationAt: (x: number, z: number) => number;
  }>;
  presentation: CourseThemeV1 & Readonly<{
    theme: CourseThemeV1;
    palette: CoursePaletteV1;
    cameras: Readonly<{
      overview: CourseCameraV1;
      greenDetail: CourseCameraV1;
    }>;
    treePositions: CourseWorldV1["treePositions"];
    strategyPaths: CourseWorldV1["strategyPaths"];
    stripe: Readonly<{ startZ: number; endZ: number }>;
  }>;
  world: CourseWorldV1;
}>;

export function assertLabHoleRuntimeV1(runtime: LabHoleRuntimeV1): true;
export function defineLabHoleRuntimeV1<Runtime extends LabHoleRuntimeV1>(
  runtime: Runtime,
): DeepReadonly<Runtime>;
