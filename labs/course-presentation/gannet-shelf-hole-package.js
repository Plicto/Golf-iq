import {
  LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
  defineLabHolePresentationV1,
} from "./course-presentation-registry.js";
import {
  createLabHoleRuntime,
  labHoleRuntimeConfig,
} from "./lab-hole-runtime-registry.js";
import {
  GANNET_SHELF_CINEMATIC_FLYBY,
  GANNET_SHELF_REDUCED_FLYBY,
} from "./gannet-shelf-flyby.js";
import { GANNET_SHELF_WORLD } from "./gannet-shelf-world.js";
import { recoveryHoleDescriptor } from "./recovery-hole-catalog.js";
import { defineRecoveryHolePackageV1 } from "./recovery-hole-package.js";

const runtimeId = "gannet-shelf";
const definition = createLabHoleRuntime(
  labHoleRuntimeConfig(runtimeId),
  GANNET_SHELF_WORLD,
);
const presentation = defineLabHolePresentationV1({
  schemaVersion: LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
  runtimeId,
  definition,
  fullFlyby: GANNET_SHELF_CINEMATIC_FLYBY,
  reducedFlyby: GANNET_SHELF_REDUCED_FLYBY,
});

export const GANNET_SHELF_RECOVERY_HOLE_PACKAGE = defineRecoveryHolePackageV1({
  descriptor: recoveryHoleDescriptor(runtimeId),
  definition,
  presentation,
});
