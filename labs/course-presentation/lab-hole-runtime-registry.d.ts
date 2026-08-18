import type {
  LabHoleRuntimeV1,
  DeepReadonly,
} from "./lab-hole-runtime-v1.js";

export const LAB_RECOVERY_HOLE_RUNTIME_IDS: readonly [
  "north-inlet",
  "machair-run",
  "gannet-shelf",
];

export type LabHoleRuntimeId = (typeof LAB_RECOVERY_HOLE_RUNTIME_IDS)[number];

type LabOpeningClub =
  | "Driver"
  | "3 wood"
  | "5 iron"
  | "6 iron"
  | "7 iron"
  | "8 iron"
  | "9 iron"
  | "PW"
  | "GW"
  | "SW"
  | "Putter";

type LabGameplay = Omit<LabHoleRuntimeV1["gameplay"], "openingClub" | "courseArchetype"> & {
  readonly openingClub: LabOpeningClub;
  readonly courseArchetype:
    | "links"
    | "open-parkland"
    | "woodland"
    | "florida-soft";
};

type LabIdentity<Id extends LabHoleRuntimeId = LabHoleRuntimeId> =
  Omit<LabHoleRuntimeV1["identity"], "id"> & { readonly id: Id };

type LabHoleCompatibilityAliases<Id extends LabHoleRuntimeId> = Readonly<{
  id: Id;
  layoutId: string;
  scenarioId: string;
  holeLabel: string;
  label: string;
  par: number;
  openingClub: LabOpeningClub;
  courseArchetype: LabGameplay["courseArchetype"];
  physicsVersion: string;
  terrainVersion: string;
  roundSeed: number;
  wind: LabGameplay["wind"];
  aim: LabGameplay["aim"];
  roughSurfaceId: string;
  fairwaySurfaceIds: readonly string[];
  greenSurfaceId: string;
  bunkerSurfacePrefix: string;
  waterSurfaceId: string | null;
  waterBodyId: string | null;
  barrier: Omit<LabHoleRuntimeV1["geometry"]["barriers"][number], "points"> | null;
  layoutPresentation: LabHoleRuntimeV1["presentation"]["theme"];
}>;

export type LabHoleRuntimeDefinition<
  Id extends LabHoleRuntimeId = LabHoleRuntimeId,
> = DeepReadonly<
  Omit<LabHoleRuntimeV1, "identity" | "gameplay"> & {
    readonly identity: LabIdentity<Id>;
    readonly gameplay: LabGameplay;
  } & LabHoleCompatibilityAliases<Id>
>;

export type LabHoleRuntimeConfig<
  Id extends LabHoleRuntimeId = LabHoleRuntimeId,
> = Readonly<{
  id: Id;
  contentRevision: string;
  layoutId: string;
  scenarioId: string;
  holeLabel: string;
  label: string;
  par: number;
  openingClub: LabOpeningClub;
  courseArchetype: LabGameplay["courseArchetype"];
  physicsVersion: string;
  terrainVersion: string;
  roundSeed: number;
  wind: LabGameplay["wind"];
  aim: LabGameplay["aim"];
  roughSurfaceId: string;
  fairwaySurfaceIds: readonly string[];
  greenSurfaceId: string;
  bunkerSurfacePrefix: string;
  waterSurfaceId: string | null;
  waterBodyId: string | null;
  barrier: Omit<LabHoleRuntimeV1["geometry"]["barriers"][number], "points"> | null;
  presentation: LabHoleRuntimeV1["presentation"]["theme"];
}>;

export type LabHoleRuntimeRegistry = Readonly<{
  [Id in LabHoleRuntimeId]: LabHoleRuntimeDefinition<Id>;
}>;

export type LabHoleSourceWorld = Omit<
  LabHoleRuntimeV1["world"],
  "waterSurfaceGroups" | "waterLevels" | "barrierPointGroups"
> & Partial<Pick<
  LabHoleRuntimeV1["world"],
  "waterSurfaceGroups" | "waterLevels" | "barrierPointGroups"
>>;

export const LAB_RECOVERY_HOLE_CONFIG: Readonly<{
  [Id in LabHoleRuntimeId]: LabHoleRuntimeConfig<Id>;
}>;

export function createLabHoleRuntimeRegistry(
  worlds: readonly LabHoleSourceWorld[],
): LabHoleRuntimeRegistry;

export function createLabHoleRuntime<Id extends LabHoleRuntimeId>(
  config: LabHoleRuntimeConfig<Id>,
  world: LabHoleSourceWorld,
): LabHoleRuntimeDefinition<Id>;

export function labHoleRuntimeConfig<Id extends LabHoleRuntimeId>(
  runtimeId: Id,
): LabHoleRuntimeConfig<Id>;

export function labHoleRuntimeConfig(runtimeId: string): LabHoleRuntimeConfig;
