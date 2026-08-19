import { RENDERER_SCENARIO_IDS } from
  "../course-presentation/renderer-scenarios.js";

export const VISUAL_GATE_SCHEMA_VERSION = 1;
export const VISUAL_GATE_VERSION = "pr225-safari-v12";
export const VISUAL_GATE_BACKEND = "webgl2-hybrid";
export const VISUAL_GATE_SCENARIOS = RENDERER_SCENARIO_IDS;
export const VISUAL_GATE_GROUND_ART_VERSION = "links-ground-v6";
export const VISUAL_GATE_WATERCOURSE_ART_VERSION =
  "watercourse-edge-and-surface-v5";
export const VISUAL_GATE_SHORELINE = Object.freeze({
  vertices: 0,
  triangles: 0,
  bytes: 0,
});
export const VISUAL_GATE_RENDERER_FINGERPRINT =
  "6cce2b2c885760e3c62136b200bb6238f0793e58492fa82ca80b9b3653b4e48f";
export const VISUAL_GATE_VIEWPORT = Object.freeze({
  cssWidth: 390,
  cssHeight: 844,
  backingWidth: 975,
  backingHeight: 2_110,
  devicePixelRatio: 2.5,
  renderScale: 1,
});

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const sha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

const normalizeViewport = (viewport) => {
  if (
    !viewport ||
    Object.entries(VISUAL_GATE_VIEWPORT).some(
      ([field, expected]) => viewport[field] !== expected,
    )
  ) {
    throw new Error("Renderer capture did not use the canonical 390 x 844 viewport");
  }
  return VISUAL_GATE_VIEWPORT;
};

const normalizePixelProbe = (probe) => {
  if (
    !probe ||
    !Number.isInteger(probe.checksum) ||
    probe.checksum <= 0 ||
    !Number.isInteger(probe.visiblePixels) ||
    probe.visiblePixels <= 0 ||
    !Number.isInteger(probe.sampledPixels) ||
    probe.sampledPixels !== 2_048 ||
    probe.visiblePixels > probe.sampledPixels
  ) {
    throw new TypeError("Renderer pixel probe is incomplete");
  }
  return Object.freeze({
    checksum: probe.checksum,
    visiblePixels: probe.visiblePixels,
    sampledPixels: probe.sampledPixels,
  });
};

export function normalizeVisualCapture(result, {
  pngDataUrl,
  pngByteLength,
  pngSha256,
  repeatPngSha256,
}) {
  if (
    !VISUAL_GATE_SCENARIOS.includes(result?.scenarioId) ||
    result.requestedBackend !== VISUAL_GATE_BACKEND ||
    result.actualBackend !== VISUAL_GATE_BACKEND ||
    result.fallbackReason !== null ||
    result.contextLosses !== 0
  ) {
    throw new Error("Visual capture did not remain on strict WebGL2");
  }
  if (
    !finite(result.timeMs) ||
    !finite(result.environmentTimeMs) ||
    !result.preparation ||
    typeof result.preparation !== "object" ||
    result.preparation.groundArtVersion !== VISUAL_GATE_GROUND_ART_VERSION ||
    !result.rendererStats ||
    typeof result.rendererStats !== "object" ||
    result.rendererStats.groundArtVersion !== VISUAL_GATE_GROUND_ART_VERSION ||
    result.rendererStats.watercourseArtVersion !==
      VISUAL_GATE_WATERCOURSE_ART_VERSION ||
    result.rendererStats.waterShorelineVertices !==
      VISUAL_GATE_SHORELINE.vertices ||
    result.rendererStats.waterShorelineTriangles !==
      VISUAL_GATE_SHORELINE.triangles ||
    result.rendererStats.waterShorelineBytes !==
      VISUAL_GATE_SHORELINE.bytes ||
    result.rendererStats.contextLosses !== 0
  ) {
    throw new TypeError("Renderer capture evidence is incomplete");
  }
  if (
    typeof pngDataUrl !== "string" ||
    !pngDataUrl.startsWith("data:image/png;base64,") ||
    !Number.isInteger(pngByteLength) ||
    pngByteLength <= 8_000 ||
    !sha256(pngSha256) ||
    !sha256(repeatPngSha256) ||
    pngSha256 !== repeatPngSha256
  ) {
    throw new Error("Repeated PNG captures are not byte-identical");
  }
  return Object.freeze({
    scenarioId: result.scenarioId,
    requestedBackend: result.requestedBackend,
    actualBackend: result.actualBackend,
    fallbackReason: result.fallbackReason,
    contextLosses: result.contextLosses,
    rendererViewport: normalizeViewport(result.viewport),
    timeMs: result.timeMs,
    environmentTimeMs: result.environmentTimeMs,
    preparation: result.preparation,
    rendererStats: result.rendererStats,
    pixelProbe: normalizePixelProbe(result.pixelProbe),
    repeatability: Object.freeze({
      captures: 2,
      algorithm: "sha256",
      byteIdentical: true,
      firstPngSha256: pngSha256,
      secondPngSha256: repeatPngSha256,
    }),
    pngByteLength,
    pngSha256,
    pngDataUrl,
  });
}

export function createVisualGateCandidate({
  runId,
  testOnly,
  pageUrl,
  capturedAt,
  rendererSourceFingerprint,
  userAgent,
  language,
  displayMode,
  viewport,
  captures,
}) {
  if (
    typeof runId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(runId) ||
    typeof testOnly !== "boolean" ||
    typeof pageUrl !== "string" ||
    !pageUrl ||
    !Number.isFinite(Date.parse(capturedAt)) ||
    rendererSourceFingerprint !== VISUAL_GATE_RENDERER_FINGERPRINT ||
    typeof userAgent !== "string" ||
    !userAgent ||
    typeof language !== "string" ||
    !language ||
    displayMode !== "safari-tab" ||
    !viewport ||
    !finite(viewport.width) ||
    !finite(viewport.height) ||
    !finite(viewport.layoutWidth) ||
    !finite(viewport.layoutHeight) ||
    !finite(viewport.devicePixelRatio) ||
    !Array.isArray(captures) ||
    captures.length !== VISUAL_GATE_SCENARIOS.length ||
    captures.some(
      (capture, index) => capture.scenarioId !== VISUAL_GATE_SCENARIOS[index],
    )
  ) {
    throw new TypeError("Physical iPhone visual candidate is incomplete");
  }
  return Object.freeze({
    schemaVersion: VISUAL_GATE_SCHEMA_VERSION,
    evidenceType: "physical-iphone-visual-candidate",
    gateVersion: VISUAL_GATE_VERSION,
    testOnly,
    runId,
    pageUrl,
    capturedAt,
    rendererSourceFingerprint,
    backend: VISUAL_GATE_BACKEND,
    captureProtocol: Object.freeze({
      rendererViewport: VISUAL_GATE_VIEWPORT,
      capturesPerScenario: 2,
      exportedCapturesPerScenario: 1,
      repeatability: "byte-identical-png-sha256",
      scenarios: VISUAL_GATE_SCENARIOS,
    }),
    environment: Object.freeze({
      userAgent,
      language,
      displayMode,
      viewport,
    }),
    captures: Object.freeze(captures),
    errors: Object.freeze([]),
  });
}
