import { recoveryHoleDescriptor } from "./recovery-hole-catalog.js";

export const RENDERER_PROBE_SCHEMA_VERSION = 1;

export const RENDERER_BACKENDS = Object.freeze([
  "canvas2d",
  "webgl2-hybrid",
]);

export const RENDERER_SCENARIO_IDS = Object.freeze([
  "north-inlet.watercourse.overview",
  "north-inlet.drive.rear",
  "north-inlet.drive.landing",
  "north-inlet.green.read",
]);

const northInletDescriptor = recoveryHoleDescriptor("north-inlet");

export function rendererScenarioSourceIdentity(scenarioId) {
  if (!RENDERER_SCENARIO_IDS.includes(scenarioId)) {
    throw new RangeError(`Unknown renderer scenario: ${scenarioId}`);
  }
  return Object.freeze({
    sourceKind: northInletDescriptor.sourceKind,
    packageId: northInletDescriptor.packageId,
    packageVersion: northInletDescriptor.packageVersion,
    runtimeId: northInletDescriptor.runtimeId,
    contentRevision: northInletDescriptor.contentRevision,
  });
}

export const RENDERER_PROBE_DEFAULTS = Object.freeze({
  warmupMs: 3_000,
  measurementMs: 12_000,
  sustainedMeasurementMs: 300_000,
  sustainedWindowMs: 60_000,
  renderScale: 1,
  maximumDevicePixelRatio: 2.5,
});

const percentile = (values, fraction) => {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * fraction) - 1),
  );
  return ordered[index];
};

const average = (values) => values.length === 0
  ? 0
  : values.reduce((total, value) => total + value, 0) / values.length;

const rounded = (value) => Math.round(value * 1_000) / 1_000;

const validViewport = (viewport) =>
  Number.isFinite(viewport?.cssWidth) && viewport.cssWidth > 0 &&
  Number.isFinite(viewport?.cssHeight) && viewport.cssHeight > 0 &&
  Number.isInteger(viewport?.backingWidth) && viewport.backingWidth > 0 &&
  Number.isInteger(viewport?.backingHeight) && viewport.backingHeight > 0 &&
  Number.isFinite(viewport?.devicePixelRatio) &&
    viewport.devicePixelRatio > 0 &&
  Number.isFinite(viewport?.renderScale) && viewport.renderScale > 0;

const validSummary = (measurement) =>
  Number.isInteger(measurement?.sampleCount) && measurement.sampleCount > 0 &&
  Number.isFinite(measurement?.frameIntervalP95Ms) &&
    measurement.frameIntervalP95Ms >= 0 &&
  Number.isFinite(measurement?.frameIntervalP99Ms) &&
    measurement.frameIntervalP99Ms >= measurement.frameIntervalP95Ms &&
  Number.isFinite(measurement?.framesOver33MsRatio) &&
    measurement.framesOver33MsRatio >= 0 &&
    measurement.framesOver33MsRatio <= 1 &&
  Number.isFinite(measurement?.framesOver50MsRatio) &&
    measurement.framesOver50MsRatio >= 0 &&
    measurement.framesOver50MsRatio <= measurement.framesOver33MsRatio &&
  Number.isFinite(measurement?.renderP95Ms) && measurement.renderP95Ms >= 0;

const validPreparation = (preparation) => {
  const timingEpsilonMs = 0.001;
  if (
    preparation?.schemaVersion !== 1 ||
    !["dedicated-worker", "not-required"].includes(
      preparation.executionContext,
    ) ||
    preparation.sourceKind !== "recovery-unmapped" ||
    typeof preparation.packageId !== "string" ||
    typeof preparation.packageVersion !== "string" ||
    typeof preparation.runtimeId !== "string" ||
    typeof preparation.contentRevision !== "string" ||
    ![
      "workerDurationMs",
      "workerObservedDurationMs",
      "gpuUploadDurationMs",
      "maximumUploadStepDurationMs",
      "totalDurationMs",
      "preparedBytes",
    ].every((key) =>
      Number.isFinite(preparation[key]) && preparation[key] >= 0
    )
  ) {
    return false;
  }
  if (preparation.executionContext === "not-required") {
    return preparation.cpuCacheHit === null &&
      preparation.gpuCacheHit === null &&
      preparation.workerDurationMs === 0 &&
      preparation.workerObservedDurationMs === 0 &&
      preparation.gpuUploadDurationMs === 0 &&
      preparation.maximumUploadStepDurationMs === 0 &&
      preparation.totalDurationMs === 0 &&
      preparation.preparedBytes === 0;
  }
  if (
    typeof preparation.groundArtVersion !== "string" ||
    !Number.isFinite(preparation.sourceWorkerDurationMs) ||
    preparation.sourceWorkerDurationMs < 0
  ) {
    return false;
  }
  if (preparation.gpuCacheHit === true) {
    return preparation.cpuCacheHit === null &&
      preparation.workerDurationMs === 0 &&
      preparation.workerObservedDurationMs === 0 &&
      preparation.gpuUploadDurationMs === 0 &&
      preparation.maximumUploadStepDurationMs === 0 &&
      preparation.totalDurationMs === 0 &&
      preparation.preparedBytes > 0;
  }
  if (
    preparation.gpuCacheHit !== false ||
    ![true, false].includes(preparation.cpuCacheHit) ||
    preparation.preparedBytes <= 0 ||
    preparation.workerDurationMs >
      preparation.workerObservedDurationMs + timingEpsilonMs ||
    preparation.maximumUploadStepDurationMs >
      preparation.gpuUploadDurationMs + timingEpsilonMs ||
    preparation.workerObservedDurationMs +
      preparation.gpuUploadDurationMs >
      preparation.totalDurationMs + timingEpsilonMs ||
    preparation.sourceWorkerDurationMs < preparation.workerDurationMs
  ) {
    return false;
  }
  return preparation.cpuCacheHit
    ? preparation.workerDurationMs === 0
    : preparation.sourceWorkerDurationMs === preparation.workerDurationMs;
};

const preparationMatchesResult = (result) => {
  let expected;
  try {
    expected = rendererScenarioSourceIdentity(result.scenarioId);
  } catch {
    return false;
  }
  if (
    Object.entries(expected).some(
      ([key, value]) => result.preparation?.[key] !== value,
    )
  ) {
    return false;
  }
  return result.actualBackend === "webgl2-hybrid"
    ? result.preparation.executionContext === "dedicated-worker"
    : result.preparation.executionContext === "not-required";
};

const validBackendResult = (result) => {
  if (result.requestedBackend === result.actualBackend) {
    return result.fallbackReason === null;
  }
  return result.requestedBackend === "webgl2-hybrid" &&
    result.actualBackend === "canvas2d" &&
    typeof result.fallbackReason === "string" &&
    result.fallbackReason.trim().length > 0;
};

export function summarizeRendererSamples(frameIntervals, renderDurations) {
  if (
    !Array.isArray(frameIntervals) ||
    !Array.isArray(renderDurations) ||
    frameIntervals.length !== renderDurations.length ||
    frameIntervals.some((value) => !Number.isFinite(value) || value < 0) ||
    renderDurations.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new TypeError("Renderer samples must be paired finite durations");
  }
  const count = frameIntervals.length;
  return Object.freeze({
    sampleCount: count,
    frameIntervalMeanMs: rounded(average(frameIntervals)),
    frameIntervalP50Ms: rounded(percentile(frameIntervals, 0.5)),
    frameIntervalP95Ms: rounded(percentile(frameIntervals, 0.95)),
    frameIntervalP99Ms: rounded(percentile(frameIntervals, 0.99)),
    framesOver33MsRatio: rounded(
      count === 0
        ? 0
        : frameIntervals.filter((value) => value > 33.4).length / count,
    ),
    framesOver50MsRatio: rounded(
      count === 0
        ? 0
        : frameIntervals.filter((value) => value > 50).length / count,
    ),
    renderMeanMs: rounded(average(renderDurations)),
    renderP95Ms: rounded(percentile(renderDurations, 0.95)),
    renderP99Ms: rounded(percentile(renderDurations, 0.99)),
  });
}

export function summarizeSustainedRendererSamples(
  samples,
  measurementDurationMs,
  windowMs,
) {
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    !Number.isFinite(measurementDurationMs) ||
    measurementDurationMs <= 0 ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0 ||
    windowMs > measurementDurationMs ||
    samples.some((sample) =>
      !Number.isFinite(sample?.elapsedMs) ||
      sample.elapsedMs < 0 ||
      !Number.isFinite(sample?.frameIntervalMs) ||
      sample.frameIntervalMs < 0 ||
      !Number.isFinite(sample?.renderDurationMs) ||
      sample.renderDurationMs < 0)
  ) {
    throw new TypeError("Sustained renderer samples are incomplete");
  }
  const firstSamples = samples.filter((sample) => sample.elapsedMs <= windowMs);
  const finalWindowStart = Math.max(0, measurementDurationMs - windowMs);
  const finalSamples = samples.filter((sample) =>
    sample.elapsedMs >= finalWindowStart);
  if (firstSamples.length === 0 || finalSamples.length === 0) {
    throw new RangeError("Sustained renderer windows require samples");
  }
  const summarize = (windowSamples) => summarizeRendererSamples(
    windowSamples.map((sample) => sample.frameIntervalMs),
    windowSamples.map((sample) => sample.renderDurationMs),
  );
  const firstWindow = summarize(firstSamples);
  const finalWindow = summarize(finalSamples);
  const degradation = firstWindow.frameIntervalP95Ms > 0
    ? Math.max(
      0,
      (finalWindow.frameIntervalP95Ms - firstWindow.frameIntervalP95Ms) /
        firstWindow.frameIntervalP95Ms,
    )
    : 0;
  return Object.freeze({
    measurementDurationMs: rounded(measurementDurationMs),
    windowMs: rounded(windowMs),
    firstWindow,
    finalWindow,
    finalWindowP95DegradationRatio: rounded(degradation),
  });
}

export function assertRendererProbeResult(result) {
  if (!result || result.schemaVersion !== RENDERER_PROBE_SCHEMA_VERSION) {
    throw new TypeError("Renderer probe schemaVersion must be 1");
  }
  if (!RENDERER_BACKENDS.includes(result.requestedBackend)) {
    throw new RangeError("Renderer probe requestedBackend is unsupported");
  }
  if (!RENDERER_BACKENDS.includes(result.actualBackend)) {
    throw new RangeError("Renderer probe actualBackend is unsupported");
  }
  if (
    typeof result.scenarioId !== "string" ||
    !validViewport(result.viewport) ||
    !Number.isInteger(result.contextLosses) ||
    result.contextLosses < 0 ||
    !validPreparation(result.preparation) ||
    !preparationMatchesResult(result) ||
    !validBackendResult(result) ||
    !validSummary(result.measurement)
  ) {
    throw new TypeError("Renderer probe result is incomplete");
  }
  return true;
}

export function assertRendererSustainedResult(result) {
  if (!result || result.schemaVersion !== RENDERER_PROBE_SCHEMA_VERSION) {
    throw new TypeError("Renderer sustained schemaVersion must be 1");
  }
  if (
    !RENDERER_BACKENDS.includes(result.requestedBackend) ||
    !RENDERER_BACKENDS.includes(result.actualBackend) ||
    typeof result.scenarioId !== "string" ||
    !validViewport(result.viewport) ||
    !Number.isInteger(result.contextLosses) ||
    result.contextLosses < 0 ||
    !validPreparation(result.preparation) ||
    !preparationMatchesResult(result) ||
    !validBackendResult(result) ||
    !validSummary(result.sustained?.firstWindow) ||
    !validSummary(result.sustained?.finalWindow) ||
    !Number.isFinite(result.sustained?.measurementDurationMs) ||
    result.sustained.measurementDurationMs <= 0 ||
    !Number.isFinite(result.sustained?.windowMs) ||
    result.sustained.windowMs <= 0 ||
    result.sustained.windowMs > result.sustained.measurementDurationMs ||
    !Number.isFinite(result.sustained?.finalWindowP95DegradationRatio) ||
    result.sustained.finalWindowP95DegradationRatio < 0
  ) {
    throw new TypeError("Renderer sustained result is incomplete");
  }
  return true;
}
