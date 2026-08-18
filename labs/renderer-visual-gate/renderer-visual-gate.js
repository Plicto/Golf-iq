import {
  VISUAL_GATE_BACKEND,
  VISUAL_GATE_RENDERER_FINGERPRINT,
  VISUAL_GATE_SCENARIOS,
  VISUAL_GATE_VIEWPORT,
  createVisualGateCandidate,
  normalizeVisualCapture,
} from "./renderer-visual-gate-protocol.js";

const frame = document.querySelector("#renderer-frame");
const startButton = document.querySelector("#start-gate");
const shareButton = document.querySelector("#share-gate");
const downloadButton = document.querySelector("#download-gate");
const stageLabel = document.querySelector("#gate-stage");
const progressLabel = document.querySelector("#gate-progress-label");
const progress = document.querySelector("#gate-progress");
const summary = document.querySelector("#gate-summary");
const previews = document.querySelector("#capture-previews");
const errorLabel = document.querySelector("#gate-error");
const query = new URLSearchParams(location.search);
const localTestHost = ["127.0.0.1", "localhost", "terminal.local"]
  .includes(location.hostname);
const testOnly = localTestHost && query.get("test") === "1";
let testRunSequence = 0;

const state = {
  probe: null,
  fingerprint: null,
  candidate: null,
  file: null,
  running: false,
  interruptionReason: null,
};

const setStage = (message) => {
  stageLabel.textContent = message;
};

const setProgress = (completed) => {
  progress.value = completed;
  progress.textContent = `${completed} of 8`;
  progressLabel.textContent = `${completed} of 8 captures`;
};

const showError = (cause) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  errorLabel.textContent = message;
  errorLabel.hidden = false;
  setStage("Capture invalidated");
};

const clearError = () => {
  errorLabel.hidden = true;
  errorLabel.textContent = "";
};

const hexDigest = async (bytes) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const textDigest = (value) =>
  hexDigest(new TextEncoder().encode(value));

const randomUuid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (!testOnly) throw new Error("Safari secure random IDs are unavailable");
  testRunSequence += 1;
  return `00000000-0000-4000-8000-${testRunSequence
    .toString(16)
    .padStart(12, "0")}`;
};

const sourceResponseType = (path) => {
  if (path.endsWith(".js")) return /(?:java|ecma)script/i;
  if (path.endsWith(".css")) return /^text\/css$/i;
  if (path.endsWith(".json")) return /^application\/json$/i;
  return null;
};

const PAGE_BASE = location.pathname.match(
  /^(.*)\/labs\/renderer-visual-gate(?:\/|$)/,
)?.[1] || "/Golf-iq";
const hostedSourcePath = (path) => `${PAGE_BASE}${path}`;

const assertSourceResponse = (response, path) => {
  if (!response.ok) throw new Error(`Renderer source is unavailable: ${path}`);
  if (response.redirected || new URL(response.url).pathname !== hostedSourcePath(path)) {
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
  const url = new URL(hostedSourcePath(path), location.origin);
  url.searchParams.set("sourceCheck", randomUuid());
  if (fingerprint) {
    url.searchParams.set("rendererSourceFingerprint", fingerprint);
  }
  return url;
};

const rendererSourceManifest = async () => {
  const path = "/quality/renderer-source-manifest.v1.json";
  const response = await fetch(sourceRequestUrl(path), { cache: "no-store" });
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
    new Set(manifest.entrypoints.map(({ path: entryPath }) => entryPath)).size !==
      manifest.entrypoints.length ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    new Set(manifest.files).size !== manifest.files.length ||
    manifest.files.some((sourcePath) =>
      typeof sourcePath !== "string" ||
      !sourcePath.startsWith("/") ||
      !/\.(?:css|js|json)$/.test(sourcePath)) ||
    !/^[0-9a-f]{64}$/.test(manifest.digest)
  ) {
    throw new Error("Renderer source manifest is invalid");
  }
  return manifest;
};

const verifiedSourceFingerprint = async () => {
  if (testOnly && !crypto.subtle) return VISUAL_GATE_RENDERER_FINGERPRINT;
  const manifest = await rendererSourceManifest();
  const source = [];
  for (const path of manifest.files) {
    const response = await fetch(sourceRequestUrl(path, manifest.digest), {
      cache: "no-store",
    });
    assertSourceResponse(response, path);
    source.push(`${path}\0${await response.text()}\0`);
  }
  for (const entrypoint of manifest.entrypoints) {
    source.push(`${entrypoint.path}\0sha256:${entrypoint.sha256}\0`);
  }
  const actual = await textDigest(source.join(""));
  if (actual !== manifest.digest) {
    throw new Error("Renderer source fingerprint does not match this build");
  }
  return actual;
};

const probeReady = async () => {
  const deadline = performance.now() + 20_000;
  while (performance.now() < deadline) {
    const probe = frame.contentWindow?.__golfIqRendererProbe;
    if (probe) {
      if (typeof probe.capture !== "function") {
        throw new Error("Renderer probe capture contract is incomplete");
      }
      await probe.ready;
      return probe;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("Renderer probe did not load");
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
    throw new Error("The visual gate requires an HTTPS page");
  }
  if (displayMode() !== "safari-tab") {
    throw new Error("Run this capture in a normal Safari tab, not standalone");
  }
  if (
    !testOnly &&
    (!/iPhone/i.test(navigator.userAgent) ||
      !/Safari/i.test(navigator.userAgent) ||
      /CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent))
  ) {
    throw new Error("Open this link on a physical iPhone in Safari");
  }
  const currentViewport = viewport();
  if (
    (!testOnly &&
      (currentViewport.layoutWidth > currentViewport.layoutHeight ||
        currentViewport.devicePixelRatio < 2)) ||
    document.visibilityState !== "visible"
  ) {
    throw new Error("Keep the physical iPhone visible and in portrait");
  }
  const rendererRect = frame.getBoundingClientRect();
  if (
    Math.round(rendererRect.width) !== VISUAL_GATE_VIEWPORT.cssWidth ||
    Math.round(rendererRect.height) !== VISUAL_GATE_VIEWPORT.cssHeight
  ) {
    throw new Error("The canonical renderer viewport is unavailable");
  }
};

const assertCurrentSourceFingerprint = async () => {
  const fingerprint = await verifiedSourceFingerprint();
  if (
    fingerprint !== state.fingerprint ||
    fingerprint !== VISUAL_GATE_RENDERER_FINGERPRINT
  ) {
    throw new Error("Renderer source changed; reload the visual gate");
  }
};

const pngEvidence = async (pngDataUrl) => {
  const separator = pngDataUrl.indexOf(",");
  if (
    separator < 0 ||
    pngDataUrl.slice(0, separator) !== "data:image/png;base64"
  ) {
    throw new TypeError("Renderer capture did not return a PNG");
  }
  const binary = atob(pngDataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return Object.freeze({
    byteLength: bytes.byteLength,
    sha256: await hexDigest(bytes),
  });
};

const captureOnce = async (scenarioId) => {
  if (state.interruptionReason) {
    throw new Error(`Visual capture interrupted: ${state.interruptionReason}`);
  }
  const result = await state.probe.capture({
    backend: VISUAL_GATE_BACKEND,
    scenarioId,
    renderScale: VISUAL_GATE_VIEWPORT.renderScale,
    strictBackend: true,
  });
  const png = await pngEvidence(result.pngDataUrl);
  return Object.freeze({ result, png });
};

const previewCapture = (capture) => {
  const image = previews.querySelector(
    `[data-scenario="${capture.scenarioId}"] img`,
  );
  image.src = capture.pngDataUrl;
  previews.hidden = false;
};

const candidateFile = (candidate) => new File(
  [JSON.stringify(candidate, null, 2)],
  `golf-iq-iphone-visual-candidate-${candidate.runId}.json`,
  { type: "application/json" },
);

const beginInterruptionWatch = () => {
  state.interruptionReason = null;
  const interrupt = (reason) => {
    if (state.running) state.interruptionReason ??= reason;
  };
  const onVisibility = () => {
    if (document.visibilityState !== "visible") interrupt("page-hidden");
  };
  const onPageHide = () => interrupt("page-hidden");
  const onOrientation = () => interrupt("orientation-changed");
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("orientationchange", onOrientation);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("orientationchange", onOrientation);
  };
};

const runGate = async () => {
  if (state.running) return;
  state.running = true;
  state.candidate = null;
  state.file = null;
  document.documentElement.dataset.running = "true";
  document.documentElement.dataset.complete = "false";
  startButton.disabled = true;
  shareButton.hidden = true;
  downloadButton.hidden = true;
  previews.hidden = true;
  clearError();
  setProgress(0);
  const endInterruptionWatch = beginInterruptionWatch();
  try {
    assertPhysicalEnvironment();
    await assertCurrentSourceFingerprint();
    const captures = [];
    let completed = 0;
    for (const scenarioId of VISUAL_GATE_SCENARIOS) {
      setStage(`Capturing ${scenarioId} · first pass`);
      const first = await captureOnce(scenarioId);
      completed += 1;
      setProgress(completed);
      setStage(`Capturing ${scenarioId} · repeat pass`);
      const second = await captureOnce(scenarioId);
      completed += 1;
      setProgress(completed);
      const normalized = normalizeVisualCapture(first.result, {
        pngDataUrl: first.result.pngDataUrl,
        pngByteLength: first.png.byteLength,
        pngSha256: first.png.sha256,
        repeatPngSha256: second.png.sha256,
      });
      normalizeVisualCapture(second.result, {
        pngDataUrl: second.result.pngDataUrl,
        pngByteLength: second.png.byteLength,
        pngSha256: second.png.sha256,
        repeatPngSha256: first.png.sha256,
      });
      captures.push(normalized);
      previewCapture(normalized);
    }
    if (state.interruptionReason) {
      throw new Error(`Visual capture interrupted: ${state.interruptionReason}`);
    }
    assertPhysicalEnvironment();
    await assertCurrentSourceFingerprint();
    state.candidate = createVisualGateCandidate({
      runId: randomUuid(),
      testOnly,
      pageUrl: location.href,
      capturedAt: new Date().toISOString(),
      rendererSourceFingerprint: state.fingerprint,
      userAgent: navigator.userAgent,
      language: navigator.language,
      displayMode: displayMode(),
      viewport: viewport(),
      captures,
    });
    state.file = candidateFile(state.candidate);
    summary.textContent =
      "All four WebGL frames passed byte-identical repeat capture. Share or download the JSON and upload that single file for review.";
    setStage("Visual candidate complete");
    document.documentElement.dataset.complete = "true";
    shareButton.hidden = typeof navigator.share !== "function";
    downloadButton.hidden = false;
  } catch (cause) {
    showError(cause);
    startButton.disabled = false;
  } finally {
    endInterruptionWatch();
    state.running = false;
    document.documentElement.dataset.running = "false";
  }
};

startButton.addEventListener("click", runGate);

shareButton.addEventListener("click", async () => {
  if (!state.file) return;
  try {
    if (navigator.canShare && !navigator.canShare({ files: [state.file] })) {
      throw new Error("Safari cannot share this result; use Download JSON");
    }
    await navigator.share({
      files: [state.file],
      title: "Golf IQ iPhone visual candidate",
    });
  } catch (cause) {
    if (cause?.name !== "AbortError") showError(cause);
  }
});

downloadButton.addEventListener("click", () => {
  if (!state.file) return;
  const url = URL.createObjectURL(state.file);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
});

Promise.resolve().then(async () => {
  assertPhysicalEnvironment();
  state.fingerprint = await verifiedSourceFingerprint();
  if (state.fingerprint !== VISUAL_GATE_RENDERER_FINGERPRINT) {
    throw new Error("This checkpoint does not contain the PR223 renderer source");
  }
  state.probe = await probeReady();
  const ready = await state.probe.ready;
  if (
    ready.actualBackend !== VISUAL_GATE_BACKEND ||
    ready.fallbackReason !== null
  ) {
    throw new Error("Strict WebGL2 renderer did not start");
  }
  setStage("Ready for fixed-frame capture");
  startButton.disabled = false;
}).catch(showError);