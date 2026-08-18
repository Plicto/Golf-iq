import {
  LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
  defineLabHolePresentationV1,
} from "./course-presentation-registry.js";
import {
  createLabHoleRuntime,
  labHoleRuntimeConfig,
} from "./lab-hole-runtime-registry.js";
import {
  NORTH_INLET_CINEMATIC_FLYBY,
  NORTH_INLET_REDUCED_FLYBY,
} from "./north-inlet-flyby.js";
import { NORTH_INLET_WORLD } from "./north-inlet-world.js";
import { recoveryHoleDescriptor } from "./recovery-hole-catalog.js";
import { defineRecoveryHolePackageV1 } from "./recovery-hole-package.js";

const runtimeId = "north-inlet";
const definition = createLabHoleRuntime(
  labHoleRuntimeConfig(runtimeId),
  NORTH_INLET_WORLD,
);
const presentation = defineLabHolePresentationV1({
  schemaVersion: LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
  runtimeId,
  definition,
  fullFlyby: NORTH_INLET_CINEMATIC_FLYBY,
  reducedFlyby: NORTH_INLET_REDUCED_FLYBY,
});

export const NORTH_INLET_RECOVERY_HOLE_PACKAGE = defineRecoveryHolePackageV1({
  descriptor: recoveryHoleDescriptor(runtimeId),
  definition,
  presentation,
});
