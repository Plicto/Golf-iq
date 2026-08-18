import {
  DEVICE_GATE_BACKEND,
  DEVICE_GATE_SCENARIOS,
  createDeviceGateCandidate,
  deviceGateProtocol,
  normalizeDeviceRun,
  normalizeSustainedRun,
} from "./renderer-device-gate-protocol.js";

const frame = document.querySelector("#renderer-frame");
const startButton = document.querySelector("#start-gate");
const cancelButton = document.querySelector("#cancel-gate");
const shareButton = document.querySelector("#share-gate");
const downloadButton = document.querySelector("#download-gate");
const stageLabel = document.querySelector("#gate-stage");
const progressLabel = document.querySelector("#gate-progress-label");
const progress = document.querySelector("#gate-progress");
const summary = document.querySelector("#gate-summary");
const errorLabel = document.querySelector("#gate-error");
const query = new URLSearchParams(window.location.search);
const localTestHost = ["127.0.0.1", "localhost"].includes(location.hostname);
const testOnly = localTestHost && query.get("test") === "1";

const state = {
  ready: null,
  probe: null,
  protocol: null,
  fingerprint: null,
  candidate: null,
  running: false,
  interruptionReason: null,
  wakeLock: null,
  probeNeedsReload: false,
};

const setStage = (message) => {
  stageLabel.textContent = message;
};

const setProgress = (completed, total) => {
  progress.max = total;
  progress.value = completed;
  progress.textContent = `${completed} of ${total}`;
  progressLabel.textContent = `${completed} of ${total} measurements`;
};

const showError = (cause) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  errorLabel.textContent = message;
  errorLabel.hidden = false;
  setStage("Run invalidated");
};

const clearError = () => {
  errorLabel.hidden = true;
  errorLabel.textContent = "";
};

const hexDigest = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const sourceResponseType = (path) => {
  if (path.endsWith(".js")) return /(?:java|ecma)script/i;
  if (path.endsWith(".css")) return /^text\/css$/i;
  if (path.endsWith(".json")) return /^application\/json$/i;
  return null;
};

const assertSourceResponse = (response, path) => {
  if (!response.ok) throw new Error(`Renderer source is unavailable: ${path}`);
  if (
    response.redirected ||
    new URL(response.url).pathname !== path
  ) {
    throw new Error(`Renderer source redirected unexpectedly: ${path}`);
  }
  if (response.headers.get("cf-mitigated") === "challenge") {
    throw new Error("Renderer source verification was challenged; reload Safari");
  }
  const expectedType = sourceResponseType(path);
  const actualType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim();
  if (!expectedType?.test(actualType ?? "")) {
    throw new Error(`Renderer source has an unexpected content type: ${path}`);
  }
};

const sourceRequestUrl = (path, fingerprint = null) => {
  const url = new URL(path, location.origin);
  url.searchParams.set("sourceCheck", crypto.randomUUID());
  if (fingerprint) {
    url.searchParams.set("rendererSourceFingerprint", fingerprint);
  }
  return url;
};

const rendererSourceManifest = async () => {
  const path = "/quality/renderer-source-manifest.v1.json";
  const response = await fetch(sourceRequestUrl(path), {
    cache: "no-store",
  });
  assertSourceResponse(response, path);
  const manifest = await response.json();
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.algorithm !== "sha256" ||
    !Array.isArray(manifest.entrypoints) ||
    manifest.entrypoints.length === 0 ||
    manifest.entrypoints.some((entrypoint) =>
      !entrypoint ||
      typeof entrypoint !== "object" ||
      typeof entrypoint.path !== "string" ||
      !entrypoint.path.startsWith("/") ||
      !entrypoint.path.endsWith(".html") ||
      !/^[0-9a-f]{64}$/.test(entrypoint.sha256)) ||
    new Set(manifest.entrypoints.map(({ path }) => path)).size !==
      manifest.entrypoints.length ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    new Set(manifest.files).size !== manifest.files.length ||
    manifest.files.some((path) =>
      typeof path !== "string" ||
      !path.startsWith("/") ||
      !/\.(?:css|js|json)$/.test(path)) ||
    !/^[0-9a-f]{64}$/.test(manifest.digest)
  ) {
    throw new Error("Renderer source manifest is invalid");
  }
  return manifest;
};

const verifiedSourceFingerprint = async () => {
  const manifest = await rendererSourceManifest();
  const source = [];
  for (const path of manifest.files) {
    const fileResponse = await fetch(
      sourceRequestUrl(path, manifest.digest),
      { cache: "no-store" },
    );
    assertSourceResponse(fileResponse, path);
    source.push(`${path}\0${await fileResponse.text()}\0`);
  }
  for (const entrypoint of manifest.entrypoints) {
    source.push(`${entrypoint.path}\0sha256:${entrypoint.sha256}\0`);
  }
  const actual = await hexDigest(source.join(""));
  if (actual !== manifest.digest) {
    throw new Error("Renderer source fingerprint does not match this build");
  }
  return actual;
};

const assertCurrentSourceFingerprint = async () => {
  const fingerprint = await verifiedSourceFingerprint();
  if (fingerprint !== state.fingerprint) {
    throw new Error("Renderer source changed; reload the device gate");
  }
};

const probeReady = async () => {
  const deadline = performance.now() + 20_000;
  while (performance.now() < deadline) {
    const probe = frame.contentWindow?.__golfIqRendererProbe;
    if (probe) {
      if (
        typeof probe.run !== "function" ||
        typeof probe.runSustained !== "function"
      ) {
        throw new Error("Renderer probe contract is incomplete");
      }
      await probe.ready;
      return probe;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("Renderer probe did not load");
};

const reloadProbe = async () => {
  const source = new URL(frame.src);
  source.searchParams.set("gateAttempt", String(Date.now()));
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Renderer probe did not reload")),
      20_000,
    );
    frame.addEventListener("load", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    frame.src = source.href;
  });
  state.probe = await probeReady();
  const reloadedFingerprint = await verifiedSourceFingerprint();
  if (reloadedFingerprint !== state.fingerprint) {
    throw new Error("Renderer source changed; reload the device gate");
  }
  state.probeNeedsReload = false;
};

const displayMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true
    ? "standalone-pwa"
    : "safari-tab";

const viewport = () => Object.freeze({
  width: Math.round(window.visualViewport?.width ?? window.innerWidth),
  height: Math.round(window.visualViewport?.height ?? window.innerHeight),
  layoutWidth: Math.round(window.innerWidth),
  layoutHeight: Math.round(window.innerHeight),
  devicePixelRatio: window.devicePixelRatio || 1,
});

const assertPhysicalEnvironment = () => {
  if (!testOnly && !window.isSecureContext) {
    throw new Error("The physical gate requires an HTTPS page");
  }
  if (displayMode() !== "safari-tab") {
    throw new Error("Run this candidate in a normal Safari tab, not standalone");
  }
  const browser = navigator.userAgent;
  if (
    !testOnly &&
    (!/iPhone/i.test(browser) ||
      !/Safari/i.test(browser) ||
      /CriOS|FxiOS|EdgiOS|OPiOS/i.test(browser))
  ) {
    throw new Error("Open this link on a physical iPhone in Safari");
  }
  const currentViewport = viewport();
  if (
    currentViewport.layoutWidth < state.protocol.minimumRendererCssWidth ||
    currentViewport.layoutHeight < state.protocol.minimumRendererCssHeight ||
    currentViewport.devicePixelRatio < state.protocol.minimumDevicePixelRatio
  ) {
    throw new Error("This iPhone viewport is below the supported measurement floor");
  }
  if (!testOnly && currentViewport.width >= currentViewport.height) {
    throw new Error("Rotate the iPhone to portrait before starting");
  }
  return currentViewport;
};

const rendererErrors = () => [
  ...(frame.contentWindow?.__rendererBootErrors ?? []),
];

const assertNotInterrupted = () => {
  if (state.interruptionReason) {
    throw new Error(`Run interrupted: ${state.interruptionReason}`);
  }
  const errors = rendererErrors();
  if (errors.length > 0) {
    throw new Error(`Renderer error: ${errors[0]}`);
  }
};

const interrupt = (reason) => {
  if (!state.running || state.interruptionReason) return;
  state.interruptionReason = reason;
  state.probe?.cancelActiveRun?.(reason);
};

const onVisibility = () => {
  if (document.visibilityState !== "visible") interrupt("page-hidden");
};
const onPageHide = () => interrupt("page-hidden");
const onOrientation = () => interrupt("orientation-changed");
const onViewportResize = () => interrupt("viewport-changed");

const beginInterruptionWatch = () => {
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("orientationchange", onOrientation);
  window.addEventListener("resize", onViewportResize);
  window.visualViewport?.addEventListener("resize", onViewportResize);
};

const endInterruptionWatch = () => {
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("orientationchange", onOrientation);
  window.removeEventListener("resize", onViewportResize);
  window.visualViewport?.removeEventListener("resize", onViewportResize);
};

const acquireWakeLock = async () => {
  if (!navigator.wakeLock?.request) return null;
  const lock = await navigator.wakeLock.request("screen");
  lock.addEventListener("release", onWakeLockRelease);
  return lock;
};

const releaseWakeLock = async () => {
  const lock = state.wakeLock;
  state.wakeLock = null;
  lock?.removeEventListener("release", onWakeLockRelease);
  await lock?.release?.();
};

function onWakeLockRelease() {
  interrupt("wake-lock-released");
}

const isoNow = () => new Date().toISOString();

const runScenario = async (scenarioId, completed, total) => {
  const runs = [];
  for (let index = 0; index < state.protocol.runsPerScenario; index += 1) {
    assertNotInterrupted();
    setStage(`${scenarioId} · formal run ${index + 1} of 3`);
    const startedAt = isoNow();
    const result = await state.probe.run({
      backend: DEVICE_GATE_BACKEND,
      scenarioId,
      warmupMs: state.protocol.warmupMs,
      measurementMs: state.protocol.measurementMs,
      renderScale: state.protocol.renderScale,
      strictBackend: true,
    });
    assertNotInterrupted();
    runs.push(normalizeDeviceRun(result, {
      scenarioId,
      startedAt,
      completedAt: isoNow(),
      protocol: state.protocol,
    }));
    completed += 1;
    setProgress(completed, total);
  }

  assertNotInterrupted();
  setStage(`${scenarioId} · sustained thermal run`);
  const sustainedStartedAt = isoNow();
  const sustainedResult = await state.probe.runSustained({
    backend: DEVICE_GATE_BACKEND,
    scenarioId,
    measurementMs: state.protocol.sustainedMs,
    windowMs: state.protocol.sustainedWindowMs,
    renderScale: state.protocol.renderScale,
    strictBackend: true,
  });
  assertNotInterrupted();
  const sustained = normalizeSustainedRun(sustainedResult, {
    scenarioId,
    startedAt: sustainedStartedAt,
    completedAt: isoNow(),
    protocol: state.protocol,
  });
  completed += 1;
  setProgress(completed, total);
  return Object.freeze({
    scenario: Object.freeze({
      scenarioId,
      runs: Object.freeze(runs),
      sustained,
    }),
    completed,
  });
};

const candidateFile = () => new File(
  [JSON.stringify(state.candidate, null, 2)],
  `golf-iq-iphone-candidate-${state.candidate.runId}.json`,
  { type: "application/json" },
);

const downloadCandidate = () => {
  const file = candidateFile();
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const shareCandidate = async () => {
  const file = candidateFile();
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: "Golf IQ iPhone renderer candidate",
      text: "Physical iPhone renderer candidate run for review.",
      files: [file],
    });
    return;
  }
  downloadCandidate();
};

const startGate = async () => {
  if (state.running) return;
  clearError();
  state.running = true;
  state.candidate = null;
  state.interruptionReason = null;
  document.documentElement.dataset.running = "true";
  startButton.hidden = true;
  cancelButton.hidden = false;
  shareButton.hidden = true;
  downloadButton.hidden = true;
  const total = DEVICE_GATE_SCENARIOS.length *
    (state.protocol.runsPerScenario + 1);
  setProgress(0, total);
  beginInterruptionWatch();
  const wakeLockSupported = Boolean(navigator.wakeLock?.request);
  try {
    if (state.probeNeedsReload) {
      setStage("Resetting renderer session");
      await reloadProbe();
    }
    setStage("Verifying renderer source");
    await assertCurrentSourceFingerprint();
    const measuredViewport = assertPhysicalEnvironment();
    state.wakeLock = await acquireWakeLock();
    const scenarios = [];
    let completed = 0;
    for (const scenarioId of DEVICE_GATE_SCENARIOS) {
      const result = await runScenario(scenarioId, completed, total);
      scenarios.push(result.scenario);
      completed = result.completed;
    }
    assertNotInterrupted();
    await assertCurrentSourceFingerprint();
    assertNotInterrupted();
    state.candidate = createDeviceGateCandidate({
      runId: crypto.randomUUID(),
      testOnly,
      pageUrl: location.href,
      capturedAt: isoNow(),
      rendererSourceFingerprint: state.fingerprint,
      userAgent: navigator.userAgent,
      language: navigator.language,
      displayMode: displayMode(),
      viewport: measuredViewport,
      wakeLockSupported,
      wakeLockAcquired: Boolean(state.wakeLock && !state.wakeLock.released),
      protocol: state.protocol,
      scenarios,
      interruptions: [],
    });
    setStage("Candidate run complete");
    summary.textContent = testOnly
      ? "Short browser-contract candidate complete. It is marked test-only."
      : "The raw candidate is ready to share for validation and review.";
    shareButton.hidden = false;
    downloadButton.hidden = false;
  } catch (cause) {
    state.probeNeedsReload = true;
    showError(cause);
    startButton.hidden = false;
  } finally {
    state.running = false;
    document.documentElement.dataset.running = "false";
    cancelButton.hidden = true;
    endInterruptionWatch();
    await releaseWakeLock();
  }
};

const prepare = async () => {
  const [probe, budgets, fingerprint] = await Promise.all([
    probeReady(),
    fetch("/quality/render-budgets.v1.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Renderer budgets are unavailable");
        return response.json();
      }),
    verifiedSourceFingerprint(),
  ]);
  state.probe = probe;
  state.protocol = deviceGateProtocol(budgets.physicalIphone, { testOnly });
  state.fingerprint = fingerprint;
  const total = DEVICE_GATE_SCENARIOS.length *
    (state.protocol.runsPerScenario + 1);
  setProgress(0, total);
  if (testOnly) {
    summary.textContent = "Short localhost contract run. Export is always test-only.";
  }
  setStage("Ready for physical-device run");
  startButton.disabled = false;
  return Object.freeze({ testOnly, protocol: state.protocol });
};

startButton.addEventListener("click", startGate);
cancelButton.addEventListener("click", () => interrupt("user-cancelled"));
shareButton.addEventListener("click", shareCandidate);
downloadButton.addEventListener("click", downloadCandidate);

state.ready = prepare().catch((cause) => {
  showError(cause);
  throw cause;
});

window.__golfIqDeviceGate = Object.freeze({
  ready: state.ready,
  start: startGate,
  cancel: () => interrupt("test-cancelled"),
  getCandidate: () => state.candidate,
});
