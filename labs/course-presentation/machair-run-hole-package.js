import {
  LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
  defineLabHolePresentationV1,
} from "./course-presentation-registry.js";
import {
  createLabHoleRuntime,
  labHoleRuntimeConfig,
} from "./lab-hole-runtime-registry.js";
import {
  MACHAIR_RUN_CINEMATIC_FLYBY,
  MACHAIR_RUN_REDUCED_FLYBY,
} from "./machair-run-flyby.js";
import { MACHAIR_RUN_WORLD } from "./machair-run-world.js";
import { recoveryHoleDescriptor } from "./recovery-hole-catalog.js";
import { defineRecoveryHolePackageV1 } from "./recovery-hole-package.js";

const runtimeId = "machair-run";
const definition = createLabHoleRuntime(
  labHoleRuntimeConfig(runtimeId),
  MACHAIR_RUN_WORLD,
);
const presentation = defineLabHolePresentationV1({
  schemaVersion: LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
  runtimeId,
  definition,
  fullFlyby: MACHAIR_RUN_CINEMATIC_FLYBY,
  reducedFlyby: MACHAIR_RUN_REDUCED_FLYBY,
});

export const MACHAIR_RUN_RECOVERY_HOLE_PACKAGE = defineRecoveryHolePackageV1({
  descriptor: recoveryHoleDescriptor(runtimeId),
  definition,
  presentation,
});
