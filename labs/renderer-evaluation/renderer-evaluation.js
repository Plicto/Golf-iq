import {
  RENDERER_BACKENDS,
  RENDERER_PROBE_DEFAULTS,
  RENDERER_PROBE_SCHEMA_VERSION,
  assertRendererProbeResult,
  assertRendererSustainedResult,
  summarizeRendererSamples,
  summarizeSustainedRendererSamples,
} from "../course-presentation/renderer-probe-contract.js";
import { resolveRequestedRendererBackend } from
  "../course-presentation/renderer-release-policy.js";
import {
  RENDERER_SCENARIO_IDS,
  rendererScenario,
} from "../course-presentation/renderer-scenarios.js";
import { createPlayableRendererSession } from
  "../course-presentation/course-renderer-runtime.js";

const surface = document.querySelector("#renderer-surface");
const backendLabel = document.querySelector("#renderer-backend");
const scenarioLabel = document.querySelector("#renderer-scenario");
const metricsLabel = document.querySelector("#renderer-metrics");
const backendButtons = [...document.querySelectorAll("[data-renderer-backend]")];
const scenarioSelect = document.querySelector("#renderer-scenario-select");
const query = new URLSearchParams(window.location.search);
document.documentElement.dataset.probe = String(query.get("probe") === "1");

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
};

const selectedBackend = () => {
  return resolveRequestedRendererBackend(query.get("backend"));
};

const selectedScenario = () => {
  const scenarioId = query.get("scenario") ?? RENDERER_SCENARIO_IDS[0];
  return RENDERER_SCENARIO_IDS.includes(scenarioId)
    ? scenarioId
    : RENDERER_SCENARIO_IDS[0];
};

const createLayerCanvas = (id, label = null) => {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.className = "renderer-layer";
  if (label) {
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
  } else {
    canvas.setAttribute("aria-hidden", "true");
  }
  return canvas;
};

const assertCapturedFrame = (captured) => {
  if (
    !captured ||
    !(captured.canvas instanceof HTMLCanvasElement) ||
    !Number.isInteger(captured.width) ||
    captured.width <= 0 ||
    !Number.isInteger(captured.height) ||
    captured.height <= 0 ||
    captured.canvas.width !== captured.width ||
    captured.canvas.height !== captured.height ||
    typeof captured.pngDataUrl !== "string" ||
    !captured.pngDataUrl.startsWith("data:image/png;base64,") ||
    !captured.rendererStats ||
    typeof captured.rendererStats !== "object"
  ) {
    throw new TypeError("Playable renderer capture contract is incomplete");
  }
  return captured;
};

const viewportFor = (renderScale = 1) => {
  const cssWidth = Math.max(1, surface.clientWidth || window.innerWidth || 390);
  const cssHeight = Math.max(1, surface.clientHeight || window.innerHeight || 844);
  const devicePixelRatio = Math.min(
    window.devicePixelRatio || 1,
    RENDERER_PROBE_DEFAULTS.maximumDevicePixelRatio,
  );
  const backingScale = devicePixelRatio * renderScale;
  return Object.freeze({
    cssWidth,
    cssHeight,
    backingWidth: Math.max(1, Math.round(cssWidth * backingScale)),
    backingHeight: Math.max(1, Math.round(cssHeight * backingScale)),
    devicePixelRatio,
    renderScale,
  });
};

const state = {
  requestedBackend: selectedBackend(),
  strictBackend: query.get("strict") === "1",
  scenarioId: selectedScenario(),
  worldCanvas: null,
  presentationCanvas: null,
  captureCanvas: null,
  session: null,
  viewport: null,
  rendererStats: null,
  preparationEvidence: null,
  lastResult: null,
};

let activeMeasurement = null;

const beginMeasurement = () => {
  if (activeMeasurement) {
    throw new Error("A renderer measurement is already running");
  }
  const measurement = { cancellationReason: null };
  activeMeasurement = measurement;
  return measurement;
};

const assertMeasurementActive = (measurement) => {
  if (measurement.cancellationReason) {
    throw new Error(
      `Renderer measurement cancelled: ${measurement.cancellationReason}`,
    );
  }
};

const finishMeasurement = (measurement) => {
  if (activeMeasurement === measurement) activeMeasurement = null;
};

const cancelActiveRun = (reason = "cancelled") => {
  if (!activeMeasurement) return false;
  activeMeasurement.cancellationReason = String(reason || "cancelled");
  return true;
};

const removeCaptureCanvas = () => {
  state.captureCanvas?.remove();
  state.captureCanvas = null;
};

const status = () => state.session.getStatus();

const syncStatusDatasets = () => {
  const current = status();
  document.documentElement.dataset.requestedBackend = current.requestedBackend;
  document.documentElement.dataset.actualBackend = current.actualBackend ?? "";
  document.documentElement.dataset.fallbackReason = current.fallbackReason ?? "";
  document.documentElement.dataset.contextLosses = String(current.contextLosses);
  return current;
};

const updateReadout = () => {
  const scenario = rendererScenario(state.scenarioId);
  const current = syncStatusDatasets();
  backendLabel.textContent = current.actualBackend ?? state.requestedBackend;
  scenarioLabel.textContent = scenario.label;
  scenarioSelect.value = state.scenarioId;
  for (const button of backendButtons) {
    const active = button.dataset.rendererBackend === state.requestedBackend;
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }
};

const createSession = async (requestedBackend, strictBackend) => {
  state.session?.dispose();
  removeCaptureCanvas();
  const worldCanvas = createLayerCanvas("renderer-world-canvas");
  const presentationCanvas = createLayerCanvas(
    "renderer-presentation-canvas",
    "Golf IQ renderer evaluation scene",
  );
  surface.replaceChildren(worldCanvas, presentationCanvas);
  const session = createPlayableRendererSession({
    worldCanvas,
    presentationCanvas,
    requestedBackend,
    strictBackend,
  });
  state.requestedBackend = requestedBackend;
  state.strictBackend = strictBackend;
  state.worldCanvas = worldCanvas;
  state.presentationCanvas = presentationCanvas;
  state.session = session;
  await session.ready;
};

const configure = async ({
  backend = state.requestedBackend,
  scenarioId = state.scenarioId,
  renderScale = RENDERER_PROBE_DEFAULTS.renderScale,
  strictBackend = state.strictBackend,
} = {}) => {
  if (!RENDERER_BACKENDS.includes(backend)) {
    throw new RangeError(`Unknown renderer backend: ${backend}`);
  }
  rendererScenario(scenarioId);
  if (
    !state.session ||
    state.requestedBackend !== backend ||
    state.strictBackend !== strictBackend
  ) {
    await createSession(backend, strictBackend);
  }
  state.scenarioId = scenarioId;
  state.viewport = viewportFor(renderScale);
  state.session.resize(state.viewport);
  state.preparationEvidence = await state.session.prepare(
    frameFor(scenarioId),
  );
  updateReadout();
};

const frameFor = (scenarioId, environmentTimeMs) => {
  const original = rendererScenario(scenarioId);
  return environmentTimeMs === undefined
    ? original
    : Object.freeze({ ...original, environmentTimeMs });
};

const render = (environmentTimeMs) => {
  removeCaptureCanvas();
  state.rendererStats = state.session.render(
    frameFor(state.scenarioId, environmentTimeMs),
  );
  syncStatusDatasets();
  return state.rendererStats;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const resultFor = (measurement) => {
  const current = syncStatusDatasets();
  const result = Object.freeze({
    schemaVersion: RENDERER_PROBE_SCHEMA_VERSION,
    requestedBackend: current.requestedBackend,
    actualBackend: current.actualBackend,
    fallbackReason: current.fallbackReason,
    scenarioId: state.scenarioId,
    viewport: state.viewport,
    measurement,
    preparation: state.preparationEvidence,
    rendererStats: state.rendererStats,
    contextLosses: current.contextLosses,
  });
  assertRendererProbeResult(result);
  state.lastResult = result;
  return result;
};

const run = async ({
  backend = state.requestedBackend,
  scenarioId = state.scenarioId,
  renderScale = RENDERER_PROBE_DEFAULTS.renderScale,
  warmupMs = RENDERER_PROBE_DEFAULTS.warmupMs,
  measurementMs = RENDERER_PROBE_DEFAULTS.measurementMs,
  strictBackend = true,
} = {}) => {
  const active = beginMeasurement();
  const boundedWarmupMs = boundedInteger(warmupMs, 3_000, 10, 30_000);
  const boundedMeasurementMs = boundedInteger(
    measurementMs,
    12_000,
    25,
    60_000,
  );
  try {
    await configure({ backend, scenarioId, renderScale, strictBackend });
    let priorTimestamp = null;
    const warmupStarted = performance.now();
    do {
      assertMeasurementActive(active);
      const timestamp = await nextFrame();
      assertMeasurementActive(active);
      render(timestamp);
      priorTimestamp = timestamp;
    } while (performance.now() - warmupStarted < boundedWarmupMs);
    const frameIntervals = [];
    const renderDurations = [];
    const measurementStarted = performance.now();
    do {
      assertMeasurementActive(active);
      const timestamp = await nextFrame();
      assertMeasurementActive(active);
      const renderStart = performance.now();
      render(timestamp);
      renderDurations.push(performance.now() - renderStart);
      frameIntervals.push(priorTimestamp === null ? 0 : timestamp - priorTimestamp);
      priorTimestamp = timestamp;
    } while (performance.now() - measurementStarted < boundedMeasurementMs);
    assertMeasurementActive(active);
    const measurement = Object.freeze({
      ...summarizeRendererSamples(frameIntervals, renderDurations),
      measurementDurationMs: Math.round(
        (performance.now() - measurementStarted) * 1_000,
      ) / 1_000,
    });
    const result = resultFor(measurement);
    metricsLabel.textContent =
      `${result.measurement.frameIntervalP95Ms.toFixed(1)} ms p95 · ` +
      `${result.measurement.renderP95Ms.toFixed(1)} ms render`;
    return result;
  } finally {
    finishMeasurement(active);
  }
};

const runSustained = async ({
  backend = state.requestedBackend,
  scenarioId = state.scenarioId,
  renderScale = RENDERER_PROBE_DEFAULTS.renderScale,
  measurementMs = RENDERER_PROBE_DEFAULTS.sustainedMeasurementMs,
  windowMs = RENDERER_PROBE_DEFAULTS.sustainedWindowMs,
  strictBackend = true,
} = {}) => {
  const active = beginMeasurement();
  const boundedMeasurementMs = boundedInteger(
    measurementMs,
    RENDERER_PROBE_DEFAULTS.sustainedMeasurementMs,
    100,
    RENDERER_PROBE_DEFAULTS.sustainedMeasurementMs,
  );
  const boundedWindowMs = boundedInteger(
    windowMs,
    RENDERER_PROBE_DEFAULTS.sustainedWindowMs,
    25,
    Math.min(RENDERER_PROBE_DEFAULTS.sustainedWindowMs, boundedMeasurementMs),
  );
  let interruption = null;
  const interrupt = (reason) => {
    interruption ??= reason;
  };
  const onVisibility = () => {
    if (document.visibilityState !== "visible") interrupt("page-hidden");
  };
  const onPageHide = () => interrupt("page-hidden");
  const onOrientation = () => interrupt("orientation-changed");
  const onResize = () => interrupt("viewport-changed");
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("orientationchange", onOrientation);
  window.addEventListener("resize", onResize);
  try {
    await configure({ backend, scenarioId, renderScale, strictBackend });
    let priorTimestamp = await nextFrame();
    assertMeasurementActive(active);
    render(priorTimestamp);
    const samples = [];
    const measurementStarted = performance.now();
    do {
      if (interruption) {
        throw new Error(`Sustained renderer run interrupted: ${interruption}`);
      }
      assertMeasurementActive(active);
      const timestamp = await nextFrame();
      if (interruption) {
        throw new Error(`Sustained renderer run interrupted: ${interruption}`);
      }
      assertMeasurementActive(active);
      const renderStart = performance.now();
      render(timestamp);
      const elapsedMs = performance.now() - measurementStarted;
      samples.push(Object.freeze({
        elapsedMs,
        frameIntervalMs: timestamp - priorTimestamp,
        renderDurationMs: performance.now() - renderStart,
      }));
      priorTimestamp = timestamp;
    } while (performance.now() - measurementStarted < boundedMeasurementMs);
    if (interruption) {
      throw new Error(`Sustained renderer run interrupted: ${interruption}`);
    }
    assertMeasurementActive(active);
    const measurementDurationMs = performance.now() - measurementStarted;
    const current = syncStatusDatasets();
    const result = Object.freeze({
      schemaVersion: RENDERER_PROBE_SCHEMA_VERSION,
      requestedBackend: current.requestedBackend,
      actualBackend: current.actualBackend,
      fallbackReason: current.fallbackReason,
      scenarioId: state.scenarioId,
      viewport: state.viewport,
      sustained: summarizeSustainedRendererSamples(
        samples,
        measurementDurationMs,
        boundedWindowMs,
      ),
      preparation: state.preparationEvidence,
      rendererStats: state.rendererStats,
      contextLosses: current.contextLosses,
    });
    assertRendererSustainedResult(result);
    state.lastResult = result;
    metricsLabel.textContent =
      `${result.sustained.finalWindow.frameIntervalP95Ms.toFixed(1)} ms final p95`;
    return result;
  } finally {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("orientationchange", onOrientation);
    window.removeEventListener("resize", onResize);
    finishMeasurement(active);
  }
};

const pixelProbe = (canvas) => {
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 32;
  sampleCanvas.height = 64;
  const sampleContext = sampleCanvas.getContext("2d", { alpha: false });
  sampleContext.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const pixels = sampleContext.getImageData(
    0,
    0,
    sampleCanvas.width,
    sampleCanvas.height,
  ).data;
  let checksum = 0;
  let visiblePixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    checksum = (checksum + pixels[index] * 3 + pixels[index + 1] * 5 + pixels[index + 2] * 7) % 2_147_483_647;
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 12) {
      visiblePixels += 1;
    }
  }
  return Object.freeze({ checksum, visiblePixels, sampledPixels: pixels.length / 4 });
};

const capture = async ({
  backend = state.requestedBackend,
  scenarioId = state.scenarioId,
  renderScale = RENDERER_PROBE_DEFAULTS.renderScale,
  environmentTimeMs,
  strictBackend = true,
} = {}) => {
  await configure({ backend, scenarioId, renderScale, strictBackend });
  const original = rendererScenario(scenarioId);
  const fixedFrame = frameFor(
    scenarioId,
    Number.isFinite(environmentTimeMs)
      ? environmentTimeMs
      : original.environmentTimeMs,
  );
  const captured = assertCapturedFrame(state.session.capture(fixedFrame));
  state.rendererStats = captured.rendererStats;
  const captureCanvas = captured.canvas;
  captureCanvas.id = "renderer-canvas";
  captureCanvas.className = "renderer-layer";
  captureCanvas.setAttribute("role", "img");
  captureCanvas.setAttribute(
    "aria-label",
    "Golf IQ renderer evaluation capture",
  );
  captureCanvas.style.width = `${state.viewport.cssWidth}px`;
  captureCanvas.style.height = `${state.viewport.cssHeight}px`;
  removeCaptureCanvas();
  state.captureCanvas = captureCanvas;
  surface.append(captureCanvas);
  const measurement = summarizeRendererSamples([0], [0]);
  const result = resultFor(measurement);
  return Object.freeze({
    ...result,
    timeMs: original.timeMs,
    environmentTimeMs: fixedFrame.environmentTimeMs,
    pngDataUrl: captured.pngDataUrl,
    pixelProbe: pixelProbe(captureCanvas),
  });
};

for (const scenarioId of RENDERER_SCENARIO_IDS) {
  const option = document.createElement("option");
  option.value = scenarioId;
  option.textContent = rendererScenario(scenarioId).label;
  scenarioSelect.append(option);
}

for (const button of backendButtons) {
  button.addEventListener("click", async () => {
    await configure({
      backend: button.dataset.rendererBackend,
      strictBackend: false,
    });
    render();
  });
}

scenarioSelect.addEventListener("change", async () => {
  await configure({ scenarioId: scenarioSelect.value, strictBackend: false });
  render();
});

window.addEventListener("resize", async () => {
  if (activeMeasurement) {
    cancelActiveRun("viewport-changed");
    return;
  }
  await configure({ strictBackend: state.strictBackend });
  render();
});

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  state.session?.dispose();
});

const ready = Promise.resolve().then(async () => {
  await configure({ strictBackend: state.strictBackend });
  render();
  document.documentElement.dataset.rendererReady = "true";
  const current = syncStatusDatasets();
  return Object.freeze({
    schemaVersion: RENDERER_PROBE_SCHEMA_VERSION,
    requestedBackend: current.requestedBackend,
    actualBackend: current.actualBackend,
    fallbackReason: current.fallbackReason,
    scenarioId: state.scenarioId,
    preparation: state.preparationEvidence,
  });
}).catch((cause) => {
  document.documentElement.dataset.rendererReady = "false";
  document.documentElement.dataset.rendererError =
    cause instanceof Error ? cause.message : String(cause);
  throw cause;
});

window.__golfIqRendererProbe = Object.freeze({
  schemaVersion: RENDERER_PROBE_SCHEMA_VERSION,
  ready,
  run,
  runSustained,
  cancelActiveRun,
  capture,
  getLastResult: () => state.lastResult,
  backends: RENDERER_BACKENDS,
  scenarios: RENDERER_SCENARIO_IDS,
});
