import { loadRecoveryHoleArtSource } from "./recovery-hole-catalog.js";
import { createRoughVegetationInstances } from
  "./webgl-rough-vegetation.js";
import {
  WEBGL_GROUND_ART_VERSION,
  createWebglTerrainGeometry,
} from "./webgl-terrain-materials.js";
import {
  createVisualWatercourseWorld,
  replaceVisualWatercourseGeometry,
} from "./webgl-watercourse-visual-v10.js";

const assertRequest = (message) => {
  const identity = message?.identity;
  if (
    message?.type !== "golf-iq:prepare-webgl-art" ||
    typeof message.requestId !== "string" ||
    identity?.schemaVersion !== 1 ||
    identity.sourceKind !== "recovery-unmapped" ||
    typeof identity.packageId !== "string" ||
    typeof identity.packageVersion !== "string" ||
    typeof identity.runtimeId !== "string" ||
    typeof identity.contentRevision !== "string" ||
    identity.groundArtVersion !== WEBGL_GROUND_ART_VERSION
  ) {
    throw new TypeError("WebGL course art worker request is invalid");
  }
  return identity;
};

self.addEventListener("message", async (event) => {
  const requestId = event.data?.requestId;
  try {
    const identity = assertRequest(event.data);
    const { world } = await loadRecoveryHoleArtSource(identity);
    const visualWorld = createVisualWatercourseWorld(world);
    const startedAt = performance.now();
    const terrainGeometry = replaceVisualWatercourseGeometry(
      createWebglTerrainGeometry(world),
      visualWorld,
    );
    const vegetationInstances = createRoughVegetationInstances(world, {
      terrainGeometry,
    });
    const art = {
      identity,
      terrainGeometry,
      vegetationInstances,
      executionContext: "dedicated-worker",
      workerDurationMs: performance.now() - startedAt,
    };
    self.postMessage({
      type: "golf-iq:webgl-art-ready",
      requestId,
      art,
    }, [
      terrainGeometry.positions.buffer,
      terrainGeometry.normals.buffer,
      terrainGeometry.materials.buffer,
      terrainGeometry.indices.buffer,
      vegetationInstances.buffer,
    ]);
  } catch (cause) {
    self.postMessage({
      type: "golf-iq:webgl-art-error",
      requestId,
      identity: event.data?.identity ?? null,
      code: "WEBGL_ART_PREPARATION_FAILED",
      message: cause instanceof Error
        ? cause.stack ?? cause.message
        : "WebGL course art preparation failed",
    });
  }
});
