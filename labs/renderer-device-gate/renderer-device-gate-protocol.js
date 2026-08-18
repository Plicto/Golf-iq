import { RENDERER_SCENARIO_IDS } from
  "../course-presentation/renderer-scenarios.js";

export const DEVICE_GATE_SCHEMA_VERSION = 1;
export const DEVICE_GATE_BACKEND = "webgl2-hybrid";
export const DEVICE_GATE_SCENARIOS = RENDERER_SCENARIO_IDS;

const finite = (value) => typeof value === "number" && Number.isFinite(value);

const positive = (value, label) => {
  if (!finite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive`);
  }
  return value;
};

export function deviceGateProtocol(budget, { testOnly = false } = {}) {
  if (!budget || !Number.isInteger(budget.runsPerScenario)) {
    throw new TypeError("Physical iPhone budget is incomplete");
  }
  if (budget.runsPerScenario !== 3) {
    throw new RangeError("The device gate requires exactly three formal runs");
  }
  const protocol = testOnly
    ? {
      runsPerScenario: budget.runsPerScenario,
      warmupMs: 20,
      measurementMs: 60,
      sustainedMs: 1_200,
      sustainedWindowMs: 500,
      renderScale: positive(budget.renderScale, "renderScale"),
      maximumRendererDevicePixelRatio: positive(
        budget.maximumRendererDevicePixelRatio,
        "maximumRendererDevicePixelRatio",
      ),
      minimumDevicePixelRatio: positive(
        budget.minimumDevicePixelRatio,
        "minimumDevicePixelRatio",
      ),
      minimumRendererCssWidth: positive(
        budget.minimumRendererCssWidth,
        "minimumRendererCssWidth",
      ),
      minimumRendererCssHeight: positive(
        budget.minimumRendererCssHeight,
        "minimumRendererCssHeight",
      ),
    }
    : {
      runsPerScenario: budget.runsPerScenario,
      warmupMs: positive(budget.warmupSeconds, "warmupSeconds") * 1_000,
      measurementMs:
        positive(budget.measurementSeconds, "measurementSeconds") * 1_000,
      sustainedMs: positive(budget.sustainedSeconds, "sustainedSeconds") * 1_000,
      sustainedWindowMs:
        positive(budget.sustainedWindowSeconds, "sustainedWindowSeconds") *
          1_000,
      renderScale: positive(budget.renderScale, "renderScale"),
      maximumRendererDevicePixelRatio: positive(
        budget.maximumRendererDevicePixelRatio,
        "maximumRendererDevicePixelRatio",
      ),
      minimumDevicePixelRatio: positive(
        budget.minimumDevicePixelRatio,
        "minimumDevicePixelRatio",
      ),
      minimumRendererCssWidth: positive(
        budget.minimumRendererCssWidth,
        "minimumRendererCssWidth",
      ),
      minimumRendererCssHeight: positive(
        budget.minimumRendererCssHeight,
        "minimumRendererCssHeight",
      ),
    };
  return Object.freeze({
    ...protocol,
    estimatedDurationSeconds: Math.ceil(
      DEVICE_GATE_SCENARIOS.length *
        (protocol.runsPerScenario *
          (protocol.warmupMs + protocol.measurementMs) +
          protocol.sustainedMs) /
        1_000,
    ),
  });
}

const cleanRendererIdentity = (result, scenarioId) => {
  if (
    result?.scenarioId !== scenarioId ||
    result?.requestedBackend !== DEVICE_GATE_BACKEND ||
    result?.actualBackend !== DEVICE_GATE_BACKEND ||
    result?.fallbackReason !== null ||
    result?.contextLosses !== 0
  ) {
    throw new Error(`${scenarioId} did not remain on strict WebGL2`);
  }
};

const normalizedRendererViewport = (viewport) => {
  const fields = [
    "cssWidth",
    "cssHeight",
    "backingWidth",
    "backingHeight",
    "devicePixelRatio",
    "renderScale",
  ];
  if (
    !viewport ||
    fields.some((field) => !finite(viewport[field]) || viewport[field] <= 0) ||
    !Number.isInteger(viewport.backingWidth) ||
    !Number.isInteger(viewport.backingHeight)
  ) {
    throw new TypeError("Renderer viewport is incomplete");
  }
  return Object.freeze(Object.fromEntries(
    fields.map((field) => [field, viewport[field]]),
  ));
};

const MEASUREMENT_METRICS = Object.freeze([
  "sampleCount",
  "frameIntervalP95Ms",
  "frameIntervalP99Ms",
  "framesOver33MsRatio",
  "framesOver50MsRatio",
  "renderP95Ms",
]);

const normalizedMetrics = (measurement, metrics) => {
  if (
    !measurement ||
    metrics.some((metric) =>
      !finite(measurement[metric]) || measurement[metric] < 0) ||
    !Number.isInteger(measurement.sampleCount) ||
    measurement.sampleCount <= 0 ||
    measurement.frameIntervalP95Ms <= 0 ||
    measurement.frameIntervalP99Ms <= 0 ||
    measurement.framesOver33MsRatio > 1 ||
    measurement.framesOver50MsRatio > 1 ||
    measurement.framesOver50MsRatio > measurement.framesOver33MsRatio ||
    measurement.frameIntervalP99Ms < measurement.frameIntervalP95Ms
  ) {
    throw new TypeError("Renderer measurement is incomplete");
  }
  return Object.freeze(Object.fromEntries(
    metrics.map((metric) => [metric, measurement[metric]]),
  ));
};

const normalizedMeasurement = (measurement) => {
  const metrics = [
    ...MEASUREMENT_METRICS,
    "measurementDurationMs",
  ];
  const normalized = normalizedMetrics(measurement, metrics);
  if (normalized.measurementDurationMs <= 0) {
    throw new TypeError("Renderer measurement is incomplete");
  }
  return normalized;
};

const normalizedWindowMeasurement = (measurement) =>
  normalizedMetrics(measurement, MEASUREMENT_METRICS);

export function normalizeDeviceRun(
  result,
  { scenarioId, startedAt, completedAt, protocol },
) {
  cleanRendererIdentity(result, scenarioId);
  const measurement = normalizedMeasurement(result.measurement);
  if (measurement.measurementDurationMs < protocol.measurementMs) {
    throw new Error(`${scenarioId} measurement ended too early`);
  }
  return Object.freeze({
    startedAt,
    completedAt,
    warmupSeconds: protocol.warmupMs / 1_000,
    measurementSeconds: protocol.measurementMs / 1_000,
    requestedBackend: result.requestedBackend,
    actualBackend: result.actualBackend,
    fallbackReason: result.fallbackReason,
    contextLosses: result.contextLosses,
    rendererViewport: normalizedRendererViewport(result.viewport),
    measurement,
  });
}

export function normalizeSustainedRun(
  result,
  { scenarioId, startedAt, completedAt, protocol },
) {
  cleanRendererIdentity(result, scenarioId);
  const sustained = result.sustained;
  const firstWindow = normalizedWindowMeasurement(sustained?.firstWindow);
  const finalWindow = normalizedWindowMeasurement(sustained?.finalWindow);
  const computedDegradation = firstWindow.frameIntervalP95Ms > 0
    ? Math.max(
      0,
      (finalWindow.frameIntervalP95Ms - firstWindow.frameIntervalP95Ms) /
        firstWindow.frameIntervalP95Ms,
    )
    : 0;
  if (
    !sustained ||
    !finite(sustained.measurementDurationMs) ||
    sustained.measurementDurationMs < protocol.sustainedMs ||
    !finite(sustained.windowMs) ||
    sustained.windowMs < protocol.sustainedWindowMs ||
    sustained.windowMs > sustained.measurementDurationMs ||
    !finite(sustained.finalWindowP95DegradationRatio) ||
    sustained.finalWindowP95DegradationRatio < 0 ||
    Math.abs(
      sustained.finalWindowP95DegradationRatio - computedDegradation,
    ) > 0.001
  ) {
    throw new TypeError(`${scenarioId} sustained measurement is incomplete`);
  }
  return Object.freeze({
    startedAt,
    completedAt,
    durationSeconds: sustained.measurementDurationMs / 1_000,
    windowSeconds: sustained.windowMs / 1_000,
    requestedBackend: result.requestedBackend,
    actualBackend: result.actualBackend,
    fallbackReason: result.fallbackReason,
    contextLosses: result.contextLosses,
    rendererViewport: normalizedRendererViewport(result.viewport),
    firstWindow,
    finalWindow,
    finalWindowP95DegradationRatio:
      sustained.finalWindowP95DegradationRatio,
  });
}

export function createDeviceGateCandidate({
  runId,
  testOnly,
  pageUrl,
  capturedAt,
  rendererSourceFingerprint,
  userAgent,
  language,
  displayMode,
  viewport,
  wakeLockSupported,
  wakeLockAcquired,
  protocol,
  scenarios,
  interruptions,
}) {
  if (
    typeof runId !== "string" ||
    !runId ||
    typeof pageUrl !== "string" ||
    !pageUrl ||
    !/^[0-9a-f]{64}$/.test(rendererSourceFingerprint) ||
    displayMode !== "safari-tab" ||
    !Array.isArray(scenarios) ||
    scenarios.length !== DEVICE_GATE_SCENARIOS.length ||
    !Array.isArray(interruptions) ||
    interruptions.length !== 0
  ) {
    throw new TypeError("Device-gate candidate is incomplete");
  }
  return Object.freeze({
    schemaVersion: DEVICE_GATE_SCHEMA_VERSION,
    evidenceType: "physical-iphone-candidate",
    testOnly,
    runId,
    capturedAt,
    pageUrl,
    rendererSourceFingerprint,
    environment: Object.freeze({
      userAgent,
      language,
      displayMode,
      wakeLockSupported,
      wakeLockAcquired,
      viewport: Object.freeze({ ...viewport }),
    }),
    backend: DEVICE_GATE_BACKEND,
    protocol: Object.freeze({ ...protocol }),
    scenarios: Object.freeze([...scenarios]),
    interruptions: Object.freeze([]),
  });
}
