import type { LabHoleRuntimeV1 } from "./lab-hole-runtime-v1.js";

export type CanonicalCourseOneRuntimeSource = Readonly<{
  schemaVersion: 1;
  sourceKind: "canonical";
  mappingStatus: "structural-mapped";
  promotionEligible: false;
  canonical: Readonly<{
    courseId: "course-one";
    holeId: string;
    holeNumber: number;
  }>;
  runtimeIdentity: Readonly<{
    runtimeId: string;
    contentRevision: string;
  }>;
  hole: Readonly<Record<string, unknown>>;
}>;

export type CanonicalCourseOneHolePackage = Readonly<{
  schemaVersion: 1;
  descriptor: Readonly<{
    schemaVersion: 1;
    sourceKind: "canonical";
    mappingStatus: "structural-mapped";
    promotionEligible: false;
    packageId: "course-one.playable-slice";
    packageVersion: "1.0.0";
    runtimeId: string;
    contentRevision: string;
    canonicalCourseId: "course-one";
    canonicalHoleId: string;
    compatibilityScenarioAlias: string;
    runtimeOrder: number;
  }>;
  definition: LabHoleRuntimeV1;
  presentation: Readonly<Record<string, unknown>>;
}>;

export function createCanonicalCourseOneHolePackage(
  input: unknown,
): CanonicalCourseOneHolePackage;
