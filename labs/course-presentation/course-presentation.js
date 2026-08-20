import {
  NORTH_INLET_BROADCAST_TRACK,
  createBroadcastCameraTrack,
  createShotAddressCamera,
  sampleBroadcastPresentation,
  sampleSmoothPresentationTape,
  shotDistanceFromStart,
} from "./broadcast-camera.js";
import {
  NORTH_INLET_BROADCAST_TRACER,
  createBroadcastTracerTrack,
  sampleBroadcastTracer,
} from "./broadcast-tracer.js";
import {
  NORTH_INLET_CUP_FINISHES,
  sampleCupFinish,
} from "./cup-finish.js";
import {
  NORTH_INLET_DRIVE_TAPE,
  createPresentationTape,
  eventsBetween,
  phaseAt,
} from "./presentation-tape.js";
import {
  createPuttAddressCamera,
  createPuttCameraTrack,
  samplePuttPresentation,
} from "./putt-camera.js";
import {
  sampleCinematicFlyby,
  sampleReducedFlyby,
} from "./cinematic-flyby.js";
import {
  GREEN_DETAIL_CAMERA,
  STATIC_OVERVIEW_CAMERA,
} from "./course-renderer.js";
import { createCanonicalCourseOneHolePackage } from "./canonical-course-one-runtime.js";
import { loadRecoveryHolePackage } from "./recovery-hole-catalog.js";
import { createPlayableRendererSession } from "./course-renderer-runtime.js";
import { resolveRequestedRendererBackend } from "./renderer-release-policy.js";

const canvas = document.querySelector("#course-canvas");
const worldCanvas = document.querySelector("#course-world-canvas");
const renderSurface = document.querySelector(".lab-shell");
const playButton = document.querySelector("#play-tape");
const progressInput = document.querySelector("#tape-progress");
const phaseLabel = document.querySelector("#phase-label");
const distanceLabel = document.querySelector("#distance-label");
const eventLabel = document.querySelector("#event-label");
const timeLabel = document.querySelector("#time-label");
const tapeBadge = document.querySelector("#tape-badge");
const viewLabel = document.querySelector("#view-label");
const shotChip = document.querySelector("#shot-chip");
const authorityLabel = document.querySelector("#authority-label");
const modeButtons = [...document.querySelectorAll("[data-presentation-mode]")];
const greenViewSwitch = document.querySelector("#green-view-switch");
const greenViewButtons = [...document.querySelectorAll("[data-green-view]")];
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const query = new URLSearchParams(window.location.search);
const parentQuery = (() => {
  if (window.parent === window) return null;
  try {
    return new URLSearchParams(window.parent.location.search);
  } catch {
    return null;
  }
})();
const queryValue = (name) => query.get(name) ?? parentQuery?.get(name) ?? null;
const gameMode = query.get("game") === "1";
const recoveryTestMode = queryValue("labTest") === "1";
const standaloneFlyby = queryValue("presentation") === "flyby";
const requestedBackend = resolveRequestedRendererBackend(queryValue("renderer"));
const strictBackend = queryValue("strictRenderer") === "1";
const rendererSession = createPlayableRendererSession({
  worldCanvas,
  presentationCanvas: canvas,
  requestedBackend,
  strictBackend,
  onContextLost: () => scheduleRendererRefresh(),
});

const INITIAL_PACKAGE = recoveryTestMode
  ? await loadRecoveryHolePackage("north-inlet")
  : null;
const INITIAL_PRESENTATION = INITIAL_PACKAGE?.presentation ?? null;

const rendererSourceForPackage = (loadedPackage) => Object.freeze({
  sourceKind: loadedPackage.descriptor.sourceKind,
  packageId: loadedPackage.descriptor.packageId,
  packageVersion: loadedPackage.descriptor.packageVersion,
  runtimeId: loadedPackage.descriptor.runtimeId,
  contentRevision: loadedPackage.descriptor.contentRevision,
  world: loadedPackage.definition.world,
});

const PHASE_LABELS = Object.freeze({
  ready: "Ready",
  launch: "Launch",
  flight: "Flight",
  apex: "Apex",
  descent: "Descent",
  "first-contact": "First contact",
  bounce: "Bounce",
  "second-contact": "Second contact",
  roll: "Roll",
  rest: "At rest",
});

const EVENT_LABELS = Object.freeze({
  "shot-ready": "Tape armed",
  launch: "Launch frame",
  apex: "Recorded apex",
  "first-contact": "Fairway contact",
  "bounce-apex": "Recorded bounce",
  "second-contact": "Second contact",
  rest: "Ball at rest",
});

const CAMERA_STAGE_LABELS = Object.freeze({
  "rear-ready": "Behind the ball",
  "rear-flight": "Rear camera tracking",
  "landing-pickup": "Ground camera acquires",
  "landing-tight": "Telephoto follow",
  "landing-context": "Landing context opens",
  landing: "First contact held",
  bounce: "Bounce held in frame",
  roll: "Ground camera follows roll",
  rest: "Ball and result held",
});

const CUP_PHASE_LABELS = Object.freeze({
  ready: "Ready",
  approach: "Approach",
  drop: "At the cup",
  holed: "Holed",
  "slide-past": "Past cup",
  rest: "At rest",
});

const CUP_STAGE_LABELS = Object.freeze({
  ready: "Low camera set on the cup",
  approach: "Ball holds its recorded line",
  drop: "Front rim hides the drop",
  holed: "Holed result held",
  "slide-past": "High-side miss stays clear",
  rest: "Cup and miss held together",
});

const PUTT_STAGE_LABELS = Object.freeze({
  "putt-address": "Wide putting camera",
  "cup-camera": "Cup camera takes the roll",
  "cup-drop": "Physical cup finish",
  "putt-rest": "Ball and cup held",
});

const state = {
  mode: gameMode || standaloneFlyby ? "flyby" : "broadcast",
  greenView: "holed",
  elapsedMs: 0,
  playing: false,
  playAnchorTimestampMs: null,
  playAnchorElapsedMs: 0,
  animationFrameId: null,
  refreshFrameId: null,
  width: 0,
  height: 0,
  backingWidth: 0,
  backingHeight: 0,
  deviceScale: 1,
  rendererReady: false,
  rendererError: null,
  lastRendererFrame: null,
  reducedMotion: reduceMotionQuery.matches,
  environmentEpochMs: performance.now(),
  currentEvent: INITIAL_PACKAGE ? NORTH_INLET_DRIVE_TAPE.events[0] : null,
  activeTape: INITIAL_PACKAGE ? NORTH_INLET_DRIVE_TAPE : null,
  activeBroadcastTrack: INITIAL_PACKAGE ? NORTH_INLET_BROADCAST_TRACK : null,
  activeTracerTrack: INITIAL_PACKAGE ? NORTH_INLET_BROADCAST_TRACER : null,
  activePuttTrack: null,
  addressSample: null,
  shotId: null,
  resumeAfterVisibility: false,
  result: null,
  activePresentation: INITIAL_PRESENTATION,
  activePackageDescriptor: INITIAL_PACKAGE?.descriptor ?? null,
  holeLoadToken: 0,
  holeLoadController: null,
};

function activeCupTrack() {
  return state.greenView === "missed"
    ? NORTH_INLET_CUP_FINISHES.missed
    : NORTH_INLET_CUP_FINISHES.holed;
}

function activeDurationMs() {
  if (!state.activePresentation) {
    return 1;
  }
  if (state.mode === "address") {
    return 1;
  }
  if (state.mode === "flyby") {
    return state.reducedMotion
      ? state.activePresentation.reducedFlyby.durationMs
      : state.activePresentation.fullFlyby.durationMs;
  }
  if (state.mode === "green" && state.greenView !== "detail") {
    return activeCupTrack().durationMs;
  }
  if (state.mode === "putt") {
    return state.activePuttTrack?.durationMs ?? state.activeTape?.durationMs ?? 1;
  }
  return state.activeTape?.durationMs ?? 1;
}

function formatSeconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function resizeCanvas() {
  const bounds = renderSurface.getBoundingClientRect();
  const deviceScale = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const pixelWidth = Math.round(width * deviceScale);
  const pixelHeight = Math.round(height * deviceScale);

  if (
    state.backingWidth !== pixelWidth ||
    state.backingHeight !== pixelHeight ||
    state.width !== width ||
    state.height !== height
  ) {
    rendererSession.resize(Object.freeze({
      cssWidth: width,
      cssHeight: height,
      backingWidth: pixelWidth,
      backingHeight: pixelHeight,
      devicePixelRatio: deviceScale,
      renderScale: 1,
    }));
  }

  state.width = width;
  state.height = height;
  state.backingWidth = pixelWidth;
  state.backingHeight = pixelHeight;
  state.deviceScale = deviceScale;
}

function updateEvent(previousTimeMs, nextTimeMs) {
  if (
    !state.activeTape ||
    state.mode === "flyby" ||
    state.mode === "address" ||
    (state.mode === "green" && state.greenView !== "detail")
  ) {
    return;
  }
  const crossedEvents = eventsBetween(
    state.activeTape,
    previousTimeMs,
    nextTimeMs,
  );
  if (crossedEvents.length > 0) {
    state.currentEvent = crossedEvents.at(-1);
  } else if (nextTimeMs === 0) {
    state.currentEvent = state.activeTape.events[0];
  } else if (nextTimeMs < previousTimeMs) {
    state.currentEvent =
      state.activeTape.events
        .filter((event) => event.timeMs <= nextTimeMs)
        .at(-1) ?? state.activeTape.events[0];
  }
}

function updateModeControls() {
  for (const button of modeButtons) {
    const active = button.dataset.presentationMode === state.mode;
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }

  greenViewSwitch.hidden = state.mode !== "green";
  for (const button of greenViewButtons) {
    const active = button.dataset.greenView === state.greenView;
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function formatCupDistance(sample) {
  if (sample.stage === "holed") {
    return "Holed";
  }
  if (sample.distanceToCupMetres < 1) {
    return `${Math.round(sample.distanceToCupMetres * 100)} cm`;
  }
  return `${sample.distanceToCupMetres.toFixed(1)} m`;
}

function updateInterface(sample) {
  progressInput.value = String(state.elapsedMs);
  progressInput.max = String(activeDurationMs());
  progressInput.setAttribute("aria-valuetext", formatSeconds(state.elapsedMs));
  phaseLabel.textContent =
    state.mode === "flyby"
      ? "Hole flyby"
      : state.mode === "address"
      ? "Ready"
      : state.mode === "putt"
      ? "Putt"
      : state.mode === "green"
      ? state.greenView === "detail"
        ? "Green"
        : CUP_PHASE_LABELS[sample.stage]
      : PHASE_LABELS[phaseAt(state.activeTape, state.elapsedMs)];
  distanceLabel.textContent =
    state.mode === "flyby"
      ? `${state.activePresentation.definition.world.lengthMeters} m`
      : state.mode === "address"
      ? "Address"
      : state.mode === "putt"
      ? formatCupDistance(sample)
      : state.mode === "green"
      ? state.greenView === "detail"
        ? "389 m"
        : formatCupDistance(sample)
      : `${Math.round(shotDistanceFromStart(
          state.activeTape,
          sample.ball.position,
        ))} m`;
  timeLabel.textContent = formatSeconds(state.elapsedMs);
  playButton.dataset.playing = String(state.playing);
  playButton.setAttribute("aria-pressed", String(state.playing));

  if (state.mode === "flyby") {
    eventLabel.textContent = state.activePresentation.definition.world.label;
    tapeBadge.textContent = "Flyby";
    viewLabel.textContent = "Course introduction";
    shotChip.textContent = "One continuous world";
    authorityLabel.textContent = "Presentation only";
  } else if (state.mode === "address") {
    eventLabel.textContent = "Ball and target set";
    tapeBadge.textContent =
      sample.rigId === "putt-address" ? "Putting camera" : "Rear camera";
    viewLabel.textContent = "Live address";
    shotChip.textContent = "Current ball only";
    authorityLabel.textContent = "No future outcome data";
  } else if (state.mode === "broadcast") {
    eventLabel.textContent = CAMERA_STAGE_LABELS[sample.stage];
    tapeBadge.textContent =
      sample.rigId === "rear" ? "Rear camera" : "Ground camera";
    viewLabel.textContent = "TV direction";
    shotChip.textContent = "Two-camera · Tracer";
    authorityLabel.textContent = "Frozen path · Camera only";
  } else if (state.mode === "overview") {
    eventLabel.textContent = EVENT_LABELS[state.currentEvent.type];
    tapeBadge.textContent = "Frozen tape";
    viewLabel.textContent = "Course overview";
    shotChip.textContent = "Driver · Safe side";
    authorityLabel.textContent = "No simulation authority";
  } else if (state.mode === "putt") {
    eventLabel.textContent = PUTT_STAGE_LABELS[sample.stage];
    tapeBadge.textContent =
      sample.rigId === "cup" ? "Cup camera" : "Putting camera";
    viewLabel.textContent = "Live putt direction";
    const holedIsVisible =
      state.result?.holed &&
      (sample.stage === "cup-drop" || sample.stage === "putt-rest");
    shotChip.textContent = holedIsVisible ? "Holed" : "Physical roll";
    authorityLabel.textContent = "Retained putt · Physical cup";
  } else if (state.greenView === "detail") {
    eventLabel.textContent = "Cup, pin and surface";
    tapeBadge.textContent = "Green camera";
    viewLabel.textContent = "Green detail";
    shotChip.textContent = "Presentation only";
    authorityLabel.textContent = "108 mm cup · 2.15 m pin";
  } else {
    eventLabel.textContent = CUP_STAGE_LABELS[sample.stage];
    tapeBadge.textContent = "Cup camera";
    viewLabel.textContent = "Recorded cup finish";
    shotChip.textContent = sample.outcome === "holed" ? "Holed" : "Near miss";
    authorityLabel.textContent = "Presentation clip · No cup physics";
  }

  const replay = state.elapsedMs >= activeDurationMs();
  const action = state.mode === "flyby"
    ? "flyby"
    : state.mode === "address"
    ? "address"
    : state.mode === "broadcast"
    ? "broadcast"
    : state.mode === "putt"
    ? "putt"
    : state.mode === "overview"
      ? "overview"
      : state.greenView === "detail"
        ? "flag"
        : "finish";
  playButton.querySelector("span").textContent = state.playing
    ? `Pause ${action}`
    : replay
      ? `Replay ${action}`
      : `Play ${action}`;
  updateModeControls();
}

function syncRendererStatus() {
  const status = rendererSession.getStatus();
  document.documentElement.dataset.rendererReady = String(state.rendererReady);
  document.documentElement.dataset.requestedBackend = status.requestedBackend;
  document.documentElement.dataset.actualBackend = status.actualBackend ?? "";
  document.documentElement.dataset.fallbackReason = status.fallbackReason ?? "";
  document.documentElement.dataset.contextLosses = String(status.contextLosses);
  return status;
}

function handleRendererFailure(cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  state.rendererReady = false;
  state.rendererError = message;
  document.documentElement.dataset.rendererReady = "false";
  document.documentElement.dataset.rendererError = message;
  canvas.setAttribute("aria-label", `Golf IQ renderer error: ${message}`);
  canvas.textContent = `Golf IQ renderer error: ${message}.`;
  notifyParent("golf-iq:hole-error", { message });
}

function renderFrame() {
  if (!state.activePresentation || !state.activePackageDescriptor) {
    return;
  }
  resizeCanvas();
  const { identity, gameplay, world } = state.activePresentation.definition;
  const flybySample = state.mode === "flyby"
    ? state.reducedMotion
      ? sampleReducedFlyby(
          state.activePresentation.reducedFlyby,
          state.elapsedMs,
        )
      : sampleCinematicFlyby(
          state.activePresentation.fullFlyby,
          state.elapsedMs,
        )
    : null;
  const broadcastSample = state.mode === "broadcast"
    ? sampleBroadcastPresentation(
        world,
        state.activeBroadcastTrack,
        state.activeTape,
        state.elapsedMs,
        { reducedMotion: state.reducedMotion },
      )
    : null;
  const overviewBall = state.activeTape
    ? sampleSmoothPresentationTape(state.activeTape, state.elapsedMs)
    : null;
  const courseReadyBall = {
    position: { x: world.tee.x, y: 0, z: world.tee.z },
  };
  const cupSample =
    state.mode === "green" && state.greenView !== "detail"
      ? sampleCupFinish(activeCupTrack(), state.elapsedMs)
      : null;
  const puttSample =
    state.mode === "putt" && state.activePuttTrack
      ? samplePuttPresentation(
          world,
          state.activePuttTrack,
          state.activeTape,
          state.elapsedMs,
        )
      : null;
  const addressSample = state.mode === "address" ? state.addressSample : null;
  const sample = flybySample
    ? {
        ...flybySample,
        ball: state.activeTape
          ? { position: state.activeTape.samples[0].position }
          : courseReadyBall,
        rigId: "flyby",
      }
    : state.mode === "address"
    ? addressSample
    : state.mode === "broadcast"
    ? broadcastSample
    : state.mode === "putt"
    ? puttSample
    : state.mode === "overview"
      ? {
          ball: overviewBall,
          stage: "overview",
          rigId: "overview",
          camera: gameMode
            ? world.overviewCamera
            : STATIC_OVERVIEW_CAMERA,
        }
      : cupSample ?? {
        ball: overviewBall ?? courseReadyBall,
        stage: "green-detail",
        rigId: "green",
        camera: gameMode
          ? world.greenDetailCamera
          : GREEN_DETAIL_CAMERA,
      };
  const tracer = state.mode === "broadcast"
    ? sampleBroadcastTracer(
        state.activeTracerTrack,
        state.activeTape,
        state.elapsedMs,
        { rigId: sample.rigId },
      )
    : null;

  const rendererFrame = Object.freeze({
    sourceKind: state.activePackageDescriptor.sourceKind,
    packageId: state.activePackageDescriptor.packageId,
    packageVersion: state.activePackageDescriptor.packageVersion,
    runtimeId: identity.id,
    contentRevision: state.activePresentation.definition.contentRevision,
    world,
    wind: gameplay.wind,
    camera: sample.camera,
    tape: state.activeTape,
    timeMs: state.elapsedMs,
    environmentTimeMs: state.reducedMotion
      ? 0
      : performance.now() - state.environmentEpochMs,
    ballPosition: sample.ball.position,
    showBall:
      state.mode !== "flyby" &&
      (state.mode !== "green" || state.greenView !== "detail"),
    strategyAlpha:
      state.mode === "overview" || state.mode === "flyby" ? 0.32 : 0,
    aimGuide: addressSample?.aimGuide ?? null,
    reducedMotion: state.reducedMotion,
    tracer,
    ballPresentation: puttSample?.ball ?? cupSample?.ball ?? null,
  });
  rendererSession.render(rendererFrame);
  state.lastRendererFrame = rendererFrame;
  syncRendererStatus();
  updateInterface(sample);
}

function render({ throwOnFailure = false } = {}) {
  if (!state.rendererReady) return;
  try {
    renderFrame();
  } catch (cause) {
    if (throwOnFailure) {
      throw cause;
    }
    handleRendererFailure(cause);
    pause();
  }
}

function captureCurrentFrame() {
  if (!state.rendererReady || !state.lastRendererFrame) {
    throw new Error("Playable renderer has no completed frame to capture");
  }
  try {
    const definition = state.activePresentation.definition;
    if (
      state.lastRendererFrame.runtimeId !== definition.identity.id ||
      state.lastRendererFrame.packageId !== state.activePackageDescriptor.packageId ||
      state.lastRendererFrame.packageVersion !==
        state.activePackageDescriptor.packageVersion ||
      state.lastRendererFrame.contentRevision !== definition.contentRevision ||
      state.lastRendererFrame.world !== definition.world ||
      state.lastRendererFrame.wind !== definition.gameplay.wind
    ) {
      throw new Error("Playable renderer frame identity is not authoritative");
    }
    const capturedFrame = rendererSession.capture(
      state.lastRendererFrame,
    );
    const capture = {
      width: capturedFrame.width,
      height: capturedFrame.height,
      pngDataUrl: capturedFrame.pngDataUrl,
      rendererStats: capturedFrame.rendererStats,
    };
    return Object.freeze({
      ...capture,
      frameIdentity: Object.freeze({
        sourceKind: state.lastRendererFrame.sourceKind,
        packageId: state.lastRendererFrame.packageId,
        packageVersion: state.lastRendererFrame.packageVersion,
        runtimeId: state.lastRendererFrame.runtimeId,
        contentRevision: definition.contentRevision,
        worldId: state.lastRendererFrame.world.id,
        wind: Object.freeze({ ...state.lastRendererFrame.wind }),
      }),
      status: syncRendererStatus(),
    });
  } catch (cause) {
    handleRendererFailure(cause);
    pause();
    throw cause;
  }
}

function setElapsed(nextTimeMs) {
  const previousTimeMs = state.elapsedMs;
  state.elapsedMs = Math.min(
    activeDurationMs(),
    Math.max(0, nextTimeMs),
  );
  updateEvent(previousTimeMs, state.elapsedMs);
}

function pause() {
  state.playing = false;
  state.playAnchorTimestampMs = null;
  if (state.animationFrameId !== null) {
    window.cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
}

function scheduleFrame() {
  if (state.animationFrameId === null) {
    state.animationFrameId = window.requestAnimationFrame(frame);
  }
}

function scheduleRendererRefresh() {
  if (!state.rendererReady || state.refreshFrameId !== null) {
    return;
  }
  state.refreshFrameId = window.requestAnimationFrame(() => {
    state.refreshFrameId = null;
    render();
  });
}

function play() {
  if (!state.activePresentation) {
    return;
  }
  if (document.hidden) {
    state.resumeAfterVisibility = true;
    return;
  }
  if (state.elapsedMs >= activeDurationMs()) {
    setElapsed(0);
  }
  state.playing = true;
  state.playAnchorTimestampMs = null;
  state.playAnchorElapsedMs = state.elapsedMs;
  scheduleFrame();
}

function switchMode(mode) {
  if (mode === state.mode) {
    return;
  }
  if (
    (mode === "broadcast" && !state.activeBroadcastTrack) ||
    ((mode === "overview" || mode === "putt") && !state.activeTape)
  ) {
    return;
  }
  pause();
  state.mode = mode;
  state.elapsedMs = 0;
  state.currentEvent = state.activeTape?.events[0] ?? null;
  render();
}

function switchGreenView(greenView) {
  if (greenView === state.greenView) {
    return;
  }
  pause();
  state.greenView = greenView;
  state.elapsedMs = 0;
  state.currentEvent = state.activeTape?.events[0] ?? null;
  render();
}

function notifyParent(type, detail = {}) {
  if (window.parent === window) {
    return;
  }
  window.parent.postMessage({ type, ...detail }, window.location.origin);
}

function updateCourseAccessibility() {
  if (!state.activePresentation) {
    const label = recoveryTestMode
      ? "Loading Golf IQ recovery course"
      : "Loading Golf IQ canonical course";
    canvas.setAttribute("aria-label", label);
    canvas.textContent = `${label}.`;
    return;
  }
  const definition = state.activePresentation.definition;
  const label = `Recorded presentation of ${definition.world.label}, ${definition.identity.holeLabel}`;
  canvas.setAttribute("aria-label", label);
  canvas.textContent = `${label}.`;
}

function completeFlyby() {
  pause();
  if (state.activeTape && state.activeBroadcastTrack) {
    state.mode = "broadcast";
    state.elapsedMs = 0;
    state.currentEvent = state.activeTape.events[0];
    render();
  }
  notifyParent("golf-iq:flyby-complete");
}

function frame(timestampMs) {
  state.animationFrameId = null;
  if (!state.playing) {
    return;
  }
  if (state.playAnchorTimestampMs === null) {
    state.playAnchorTimestampMs = timestampMs;
  }
  setElapsed(
    state.playAnchorElapsedMs + timestampMs - state.playAnchorTimestampMs,
  );
  if (state.elapsedMs >= activeDurationMs()) {
    const completedMode = state.mode;
    pause();
    render();
    if (gameMode && completedMode === "flyby") {
      completeFlyby();
      return;
    }
    if (
      gameMode &&
      (completedMode === "broadcast" || completedMode === "putt") &&
      state.result
    ) {
      notifyParent("golf-iq:shot-finished", {
        shotId: state.shotId,
        result: state.result,
      });
    }
    return;
  }
  render();
  if (state.playing) {
    scheduleFrame();
  }
}

playButton.addEventListener("click", () => {
  if (state.playing) {
    pause();
  } else {
    play();
  }
  render();
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    switchMode(button.dataset.presentationMode);
  });
}

for (const button of greenViewButtons) {
  button.addEventListener("click", () => {
    switchGreenView(button.dataset.greenView);
  });
}

progressInput.addEventListener("input", (event) => {
  pause();
  setElapsed(Number(event.currentTarget.value));
  render();
});

reduceMotionQuery.addEventListener("change", (event) => {
  const resumeAfterPreferenceChange = state.playing;
  pause();
  state.reducedMotion = event.matches;
  document.documentElement.dataset.reducedMotion = String(event.matches);
  if (resumeAfterPreferenceChange) {
    play();
  }
  render();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    state.resumeAfterVisibility = state.playing;
    pause();
    render();
  } else if (state.resumeAfterVisibility) {
    state.resumeAfterVisibility = false;
    play();
    render();
  }
});

window.addEventListener("message", async (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) {
    return;
  }
  const message = event.data;
  if (!message || typeof message.type !== "string") {
    return;
  }
  if (message.type === "golf-iq:cancel-hole-load") {
    state.holeLoadToken += 1;
    state.holeLoadController?.abort();
    state.holeLoadController = null;
    return;
  }
  if (message.type === "golf-iq:load-hole") {
    const requestId = message.requestId;
    const runtimeId = message.runtimeId;
    const contentRevision = message.contentRevision;
    if (
      typeof requestId !== "string" ||
      typeof runtimeId !== "string" ||
      typeof contentRevision !== "string"
    ) {
      notifyParent("golf-iq:hole-error", {
        requestId,
        runtimeId,
        contentRevision,
        message: "Hole load identity is incomplete.",
      });
      return;
    }
    if (!message.canonicalSource && !recoveryTestMode) {
      notifyParent("golf-iq:hole-error", {
        requestId,
        runtimeId,
        contentRevision,
        message: "Recovery hole loading requires labTest=1.",
      });
      return;
    }
    state.holeLoadToken += 1;
    state.holeLoadController?.abort();
    const loadController = new AbortController();
    state.holeLoadController = loadController;
    const loadToken = state.holeLoadToken;
    let loadedPackage;
    try {
      loadedPackage = message.canonicalSource
        ? createCanonicalCourseOneHolePackage(message.canonicalSource)
        : await loadRecoveryHolePackage(runtimeId);
      if (loadToken !== state.holeLoadToken) return;
      if (loadedPackage.descriptor.contentRevision !== contentRevision) {
        throw new RangeError(`Hole content revision mismatch: ${runtimeId}`);
      }
    } catch (cause) {
      if (loadToken !== state.holeLoadToken) return;
      if (state.holeLoadController === loadController) {
        state.holeLoadController = null;
      }
      notifyParent("golf-iq:hole-error", {
        requestId,
        runtimeId,
        contentRevision,
        message: cause instanceof Error
          ? cause.message
          : `Unknown hole runtime: ${runtimeId}`,
      });
      return;
    }
    try {
      await rendererSession.ready;
      await rendererSession.prepare(rendererSourceForPackage(loadedPackage), {
        signal: loadController.signal,
      });
      if (
        loadController.signal.aborted ||
        loadToken !== state.holeLoadToken ||
        loadedPackage.descriptor.runtimeId !== runtimeId ||
        loadedPackage.descriptor.contentRevision !== contentRevision
      ) {
        return;
      }
    } catch (cause) {
      if (
        cause?.name === "AbortError" ||
        loadController.signal.aborted ||
        loadToken !== state.holeLoadToken
      ) {
        return;
      }
      handleRendererFailure(cause);
      return;
    } finally {
      if (state.holeLoadController === loadController) {
        state.holeLoadController = null;
      }
    }
    const previous = Object.freeze({
      mode: state.mode,
      elapsedMs: state.elapsedMs,
      activePresentation: state.activePresentation,
      activePackageDescriptor: state.activePackageDescriptor,
      activeTape: state.activeTape,
      activeBroadcastTrack: state.activeBroadcastTrack,
      activeTracerTrack: state.activeTracerTrack,
      activePuttTrack: state.activePuttTrack,
      addressSample: state.addressSample,
      currentEvent: state.currentEvent,
      shotId: state.shotId,
      result: state.result,
      playing: state.playing,
      resumeAfterVisibility: state.resumeAfterVisibility,
    });
    pause();
    state.resumeAfterVisibility = false;
    Object.assign(state, {
      mode: "flyby",
      elapsedMs: 0,
      activePresentation: loadedPackage.presentation,
      activePackageDescriptor: loadedPackage.descriptor,
      activeTape: null,
      activeBroadcastTrack: null,
      activeTracerTrack: null,
      activePuttTrack: null,
      addressSample: null,
      currentEvent: null,
      shotId: null,
      result: null,
    });
    updateCourseAccessibility();
    try {
      render({ throwOnFailure: true });
    } catch (cause) {
      Object.assign(state, previous);
      updateCourseAccessibility();
      render();
      notifyParent("golf-iq:hole-error", {
        requestId,
        runtimeId,
        contentRevision,
        message: cause instanceof Error
          ? cause.message
          : `Hole activation failed: ${runtimeId}`,
      });
      if (previous.playing && state.rendererReady) {
        state.playing = false;
        play();
      }
      return;
    }
    notifyParent("golf-iq:hole-loaded", {
      requestId,
      runtimeId,
      contentRevision,
    });
    play();
    return;
  }
  if (message.type === "golf-iq:skip-flyby" && state.mode === "flyby") {
    completeFlyby();
    return;
  }
  if (message.type === "golf-iq:set-address") {
    const position = message.position;
    const target = message.target;
    if (
      !state.activePresentation ||
      !position ||
      !target ||
      ![position.x, position.y, position.z, target.x, target.z].every(Number.isFinite)
    ) {
      return;
    }
    pause();
    state.resumeAfterVisibility = false;
    const puttAddress = message.presentation === "putt";
    const requestedLineDegrees = Number(message.lineDegrees);
    const lineDegrees = Number.isFinite(requestedLineDegrees)
      ? Math.max(-45, Math.min(45, requestedLineDegrees))
      : 0;
    const camera = puttAddress
      ? createPuttAddressCamera(
          state.activePresentation.definition.world,
          position,
          target,
          lineDegrees,
        )
      : createShotAddressCamera(
          state.activePresentation.definition.world,
          position,
          target,
        );
    state.mode = "address";
    state.elapsedMs = 0;
    state.addressSample = {
      ball: { position: { ...position } },
      stage: puttAddress ? "putt-address" : "rear-ready",
      rigId: puttAddress ? "putt-address" : "rear-address",
      camera,
      aimGuide: puttAddress ? null : message.aimGuide,
    };
    state.activePuttTrack = null;
    state.shotId = null;
    state.result = null;
    render();
    return;
  }
  if (message.type === "golf-iq:reset-drive") {
    if (!recoveryTestMode || !state.activePresentation) {
      notifyParent("golf-iq:hole-error", {
        message: "Recovery drive reset requires labTest=1.",
      });
      return;
    }
    if (
      state.activePresentation.definition.identity.scenarioId !==
        NORTH_INLET_DRIVE_TAPE.scenarioId
    ) {
      notifyParent("golf-iq:hole-error", {
        message: "The retained drive does not belong to the active course",
      });
      return;
    }
    pause();
    state.resumeAfterVisibility = false;
    state.mode = "broadcast";
    state.elapsedMs = 0;
    state.activeTape = NORTH_INLET_DRIVE_TAPE;
    state.activeBroadcastTrack = NORTH_INLET_BROADCAST_TRACK;
    state.activeTracerTrack = NORTH_INLET_BROADCAST_TRACER;
    state.activePuttTrack = null;
    state.addressSample = null;
    state.currentEvent = state.activeTape.events[0];
    state.shotId = null;
    state.result = null;
    render();
    return;
  }
  if (message.type === "golf-iq:restart-hole") {
    if (!state.activePresentation) {
      return;
    }
    pause();
    state.resumeAfterVisibility = false;
    state.mode = "flyby";
    state.elapsedMs = 0;
    state.activeTape = null;
    state.activeBroadcastTrack = null;
    state.activeTracerTrack = null;
    state.activePuttTrack = null;
    state.addressSample = null;
    state.currentEvent = null;
    state.shotId = null;
    state.result = null;
    render();
    play();
    return;
  }
  if (message.type !== "golf-iq:play-shot") {
    return;
  }
  const shotId = typeof message.shotId === "string" ? message.shotId : null;
  try {
    if (!state.activePresentation) {
      throw new Error("Shot presentation requires an active course");
    }
    const tape = createPresentationTape(message.tape);
    if (!shotId || message.tapeId !== tape.id) {
      throw new TypeError("Shot playback must identify its immutable tape");
    }
    if (
      tape.scenarioId !==
        state.activePresentation.definition.identity.scenarioId
    ) {
      throw new RangeError("Shot tape does not belong to the active course");
    }
    const puttTrack = message.presentation === "putt"
      ? createPuttCameraTrack(state.activePresentation.definition.world, tape)
      : null;
    const cameraTrack = puttTrack
      ? null
      : createBroadcastCameraTrack(
          state.activePresentation.definition.world,
          tape,
        );
    const tracerTrack = cameraTrack
      ? createBroadcastTracerTrack(tape, cameraTrack)
      : null;
    pause();
    state.resumeAfterVisibility = false;
    state.activeTape = tape;
    state.currentEvent = tape.events[0];
    state.shotId = shotId;
    state.addressSample = null;
    state.result = message.result ?? null;
    if (puttTrack) {
      state.activePuttTrack = puttTrack;
      state.mode = "putt";
    } else {
      state.activeBroadcastTrack = cameraTrack;
      state.activeTracerTrack = tracerTrack;
      state.activePuttTrack = null;
      state.mode = "broadcast";
    }
    state.elapsedMs = 0;
    render();
    play();
  } catch (error) {
    notifyParent("golf-iq:shot-error", {
      shotId,
      message: error instanceof Error ? error.message : "Shot presentation failed",
    });
  }
});

document.body.dataset.gameMode = String(gameMode);
document.documentElement.dataset.reducedMotion = String(state.reducedMotion);
updateCourseAccessibility();
const rendererReady = rendererSession.ready.then(async () => {
  if (INITIAL_PACKAGE) {
    await rendererSession.prepare(rendererSourceForPackage(INITIAL_PACKAGE));
  }
  state.rendererReady = true;
  syncRendererStatus();
  if (INITIAL_PACKAGE) {
    render({ throwOnFailure: true });
    if (gameMode) {
      play();
    }
  }
  if (gameMode) {
    notifyParent("golf-iq:lab-ready");
  }
  return syncRendererStatus();
}).catch((cause) => {
  handleRendererFailure(cause);
  throw cause;
});

window.__golfIqRuntimeRenderer = Object.freeze({
  schemaVersion: 1,
  ready: rendererReady,
  capture: captureCurrentFrame,
  getStatus: rendererSession.getStatus,
});

const resizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => scheduleRendererRefresh())
  : null;
resizeObserver?.observe(renderSurface);
window.addEventListener("resize", scheduleRendererRefresh);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    scheduleRendererRefresh();
  }
});
window.addEventListener("pagehide", (event) => {
  if (event.persisted) {
    return;
  }
  pause();
  resizeObserver?.disconnect();
  window.removeEventListener("resize", scheduleRendererRefresh);
  if (state.refreshFrameId !== null) {
    window.cancelAnimationFrame(state.refreshFrameId);
    state.refreshFrameId = null;
  }
  rendererSession.dispose();
});
