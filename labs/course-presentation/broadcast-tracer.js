import { sampleSmoothPresentationTape } from "./broadcast-camera.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(start, end, value) {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

export const NORTH_INLET_BROADCAST_TRACER = deepFreeze({
  schemaVersion: 1,
  id: "north-inlet-broadcast-tracer-v1",
  launchTimeMs: 280,
  cutTimeMs: 2860,
  fadeStartTimeMs: 4400,
  fadeEndTimeMs: 5080,
  rearHistoryMs: 2400,
  landingHistoryMs: 720,
  sampleIntervalMs: 32,
});

export function createBroadcastTracerTrack(tape, cameraTrack) {
  const launchTimeMs =
    tape.events.find((event) => event.type === "launch")?.timeMs ??
    tape.samples.find((sample) => sample.phase !== "ready")?.timeMs ??
    1;
  const firstContactTimeMs =
    tape.samples.find((sample) => sample.phase === "first-contact")?.timeMs ??
    tape.durationMs;
  const latestFadeEndTimeMs = Math.max(
    launchTimeMs + 2,
    Math.min(firstContactTimeMs - 1, tape.durationMs - 1),
  );
  const earliestFadeEndTimeMs = Math.min(
    latestFadeEndTimeMs,
    cameraTrack.cutTimeMs + 320,
  );
  const fadeEndTimeMs = clamp(
    firstContactTimeMs - 80,
    earliestFadeEndTimeMs,
    latestFadeEndTimeMs,
  );
  const fadeStartTimeMs = Math.min(
    fadeEndTimeMs - 1,
    Math.max(
      launchTimeMs + 1,
      Math.min(cameraTrack.cutTimeMs + 1, fadeEndTimeMs - 1),
      fadeEndTimeMs - 680,
    ),
  );
  const track = deepFreeze({
    schemaVersion: 1,
    id: `${tape.id}-broadcast-tracer-v1`,
    launchTimeMs,
    cutTimeMs: cameraTrack.cutTimeMs,
    fadeStartTimeMs,
    fadeEndTimeMs,
    rearHistoryMs: 2400,
    landingHistoryMs: 720,
    sampleIntervalMs: 32,
  });
  assertBroadcastTracerTrack(track, tape);
  return track;
}

export function assertBroadcastTracerTrack(track, tape) {
  if (!track || track.schemaVersion !== 1) {
    throw new TypeError("Broadcast tracer schemaVersion must be 1");
  }
  const orderedTimes = [
    track.launchTimeMs,
    track.cutTimeMs,
    track.fadeStartTimeMs,
    track.fadeEndTimeMs,
  ];
  if (
    orderedTimes.some((timeMs) => !Number.isFinite(timeMs)) ||
    orderedTimes.some((timeMs, index) => index > 0 && timeMs <= orderedTimes[index - 1]) ||
    track.fadeEndTimeMs >= tape.durationMs
  ) {
    throw new RangeError("Broadcast tracer times must be finite and ordered");
  }
  if (
    track.rearHistoryMs <= 0 ||
    track.landingHistoryMs <= 0 ||
    track.sampleIntervalMs < 8 ||
    track.sampleIntervalMs > 50
  ) {
    throw new RangeError("Broadcast tracer sampling is invalid");
  }
  return true;
}

export function sampleBroadcastTracer(
  track,
  tape,
  requestedTimeMs,
  { rigId = requestedTimeMs < track.cutTimeMs ? "rear" : "landing" } = {},
) {
  const timeMs = clamp(requestedTimeMs, 0, tape.durationMs);
  if (timeMs <= track.launchTimeMs || timeMs >= track.fadeEndTimeMs) {
    return {
      timeMs,
      alpha: 0,
      points: [],
    };
  }

  const historyMs = rigId === "rear" ? track.rearHistoryMs : track.landingHistoryMs;
  const startTimeMs = Math.max(track.launchTimeMs, timeMs - historyMs);
  const points = [];
  for (
    let sampleTimeMs = startTimeMs;
    sampleTimeMs < timeMs;
    sampleTimeMs += track.sampleIntervalMs
  ) {
    const sample = sampleSmoothPresentationTape(tape, sampleTimeMs);
    points.push({
      timeMs: sample.timeMs,
      position: { ...sample.position },
    });
  }
  const endpoint = sampleSmoothPresentationTape(tape, timeMs);
  points.push({
    timeMs: endpoint.timeMs,
    position: { ...endpoint.position },
  });

  return {
    timeMs,
    alpha: 1 - smoothstep(track.fadeStartTimeMs, track.fadeEndTimeMs, timeMs),
    points,
  };
}
