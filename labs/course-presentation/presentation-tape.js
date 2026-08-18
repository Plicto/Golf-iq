const POSITION_KEYS = ["x", "y", "z"];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isFinitePosition(position) {
  return (
    position &&
    POSITION_KEYS.every((key) => Number.isFinite(position[key]))
  );
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

export function assertPresentationTape(tape) {
  if (!tape || tape.schemaVersion !== 1) {
    throw new TypeError("Presentation tape schemaVersion must be 1");
  }

  if (!Number.isFinite(tape.durationMs) || tape.durationMs <= 0) {
    throw new RangeError("Presentation tape durationMs must be positive");
  }

  if (!Array.isArray(tape.samples) || tape.samples.length < 2) {
    throw new RangeError("Presentation tape requires at least two samples");
  }

  if (tape.samples[0].timeMs !== 0) {
    throw new RangeError("Presentation tape must start at zero");
  }

  if (tape.samples.at(-1).timeMs !== tape.durationMs) {
    throw new RangeError("Presentation tape must end at durationMs");
  }

  for (let index = 0; index < tape.samples.length; index += 1) {
    const sample = tape.samples[index];
    if (!Number.isFinite(sample.timeMs) || !isFinitePosition(sample.position)) {
      throw new TypeError(`Presentation sample ${index} is not finite`);
    }

    if (index > 0 && sample.timeMs <= tape.samples[index - 1].timeMs) {
      throw new RangeError("Presentation samples must be strictly ordered");
    }

    if (typeof sample.phase !== "string" || sample.phase.length === 0) {
      throw new TypeError(`Presentation sample ${index} requires a phase`);
    }
  }

  if (!Array.isArray(tape.events)) {
    throw new TypeError("Presentation tape events must be an array");
  }

  for (let index = 0; index < tape.events.length; index += 1) {
    const event = tape.events[index];
    if (
      !Number.isFinite(event.timeMs) ||
      event.timeMs < 0 ||
      event.timeMs > tape.durationMs ||
      typeof event.type !== "string" ||
      event.type.length === 0
    ) {
      throw new TypeError(`Presentation event ${index} is invalid`);
    }

    if (index > 0 && event.timeMs < tape.events[index - 1].timeMs) {
      throw new RangeError("Presentation events must be ordered");
    }
  }

  return true;
}

export function createPresentationTape(definition) {
  const tape = {
    schemaVersion: definition.schemaVersion,
    id: definition.id,
    scenarioId: definition.scenarioId,
    durationMs: definition.durationMs,
    coordinateSpace: definition.coordinateSpace,
    samples: definition.samples.map((sample) => ({
      ...sample,
      position: {
        x: sample.position.x,
        y: sample.position.y,
        z: sample.position.z,
      },
    })),
    events: definition.events.map((event) => ({ ...event })),
  };

  assertPresentationTape(tape);
  return deepFreeze(tape);
}

export function samplePresentationTape(tape, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, tape.durationMs);

  if (timeMs === 0) {
    return {
      ...tape.samples[0],
      timeMs,
      segmentIndex: 0,
      segmentProgress: 0,
      position: { ...tape.samples[0].position },
    };
  }

  if (timeMs === tape.durationMs) {
    const lastIndex = tape.samples.length - 1;
    return {
      ...tape.samples[lastIndex],
      timeMs,
      segmentIndex: lastIndex - 1,
      segmentProgress: 1,
      position: { ...tape.samples[lastIndex].position },
    };
  }

  let low = 0;
  let high = tape.samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (tape.samples[middle].timeMs <= timeMs) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const from = tape.samples[low];
  const to = tape.samples[high];
  const segmentProgress =
    (timeMs - from.timeMs) / (to.timeMs - from.timeMs);
  const selected = segmentProgress < 0.5 ? from : to;
  const interpolatedTelemetry = {};
  for (const key of [
    "rotationRadians",
    "speedMetersPerSecond",
    "angularSpeedRadiansPerSecond",
    "slipMetersPerSecond",
  ]) {
    if (Number.isFinite(from[key]) && Number.isFinite(to[key])) {
      interpolatedTelemetry[key] =
        from[key] + (to[key] - from[key]) * segmentProgress;
    }
  }

  return {
    ...selected,
    ...interpolatedTelemetry,
    timeMs,
    segmentIndex: low,
    segmentProgress,
    position: {
      x: from.position.x + (to.position.x - from.position.x) * segmentProgress,
      y: from.position.y + (to.position.y - from.position.y) * segmentProgress,
      z: from.position.z + (to.position.z - from.position.z) * segmentProgress,
    },
  };
}

export function eventsBetween(tape, fromTimeMs, toTimeMs) {
  const start = clamp(Math.min(fromTimeMs, toTimeMs), 0, tape.durationMs);
  const end = clamp(Math.max(fromTimeMs, toTimeMs), 0, tape.durationMs);
  return tape.events.filter(
    (event) => event.timeMs > start && event.timeMs <= end,
  );
}

export function phaseAt(tape, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, tape.durationMs);
  let phase = tape.samples[0].phase;

  for (const sample of tape.samples) {
    if (sample.timeMs > timeMs) {
      break;
    }
    phase = sample.phase;
  }

  return phase;
}

export const NORTH_INLET_DRIVE_TAPE = createPresentationTape({
  schemaVersion: 1,
  id: "north-inlet-safe-side-drive-v1",
  scenarioId: "course-one-hole-one",
  durationMs: 7800,
  coordinateSpace:
    "metres; x positive screen-right from tee; y height above terrain; z target distance",
  samples: [
    { timeMs: 0, phase: "ready", position: { x: 0, y: 0.08, z: 0 } },
    { timeMs: 280, phase: "launch", position: { x: 0, y: 0.08, z: 0 } },
    { timeMs: 760, phase: "flight", position: { x: -1.1, y: 13.6, z: 35 } },
    { timeMs: 1320, phase: "flight", position: { x: -2.9, y: 29.2, z: 79 } },
    { timeMs: 1960, phase: "flight", position: { x: -5.1, y: 41.1, z: 126 } },
    { timeMs: 2700, phase: "apex", position: { x: -7.2, y: 46.4, z: 171 } },
    { timeMs: 3480, phase: "flight", position: { x: -8.4, y: 39.8, z: 210 } },
    { timeMs: 4260, phase: "flight", position: { x: -8.5, y: 24.1, z: 238 } },
    { timeMs: 4980, phase: "descent", position: { x: -7.4, y: 5.3, z: 253 } },
    { timeMs: 5220, phase: "first-contact", position: { x: -6.8, y: 0.08, z: 256 } },
    { timeMs: 5520, phase: "bounce", position: { x: -6.2, y: 1.25, z: 260.2 } },
    { timeMs: 5840, phase: "second-contact", position: { x: -5.7, y: 0.08, z: 264.4 } },
    { timeMs: 6580, phase: "roll", position: { x: -4.8, y: 0.08, z: 271.7 } },
    { timeMs: 7240, phase: "roll", position: { x: -4.3, y: 0.08, z: 275.3 } },
    { timeMs: 7800, phase: "rest", position: { x: -4.1, y: 0.08, z: 276.1 } },
  ],
  events: [
    { timeMs: 0, type: "shot-ready" },
    { timeMs: 280, type: "launch" },
    { timeMs: 2700, type: "apex" },
    { timeMs: 5220, type: "first-contact", surface: "fairway" },
    { timeMs: 5520, type: "bounce-apex" },
    { timeMs: 5840, type: "second-contact", surface: "fairway" },
    { timeMs: 7800, type: "rest", surface: "fairway" },
  ],
});
