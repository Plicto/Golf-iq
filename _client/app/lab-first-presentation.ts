import type {
  FullShotOutcome,
  PuttOutcome,
} from "./gameplay-v119/game-engine";
import { GOLF_BALL_RADIUS_METERS } from "./gameplay-v119/ground-contact";

type LabPresentationContext = Readonly<{
  scenarioId?: string;
  coordinateSpace?: string;
}>;

const phaseForSample = (
  index: number,
  apexIndex: number,
  firstGroundIndex: number,
  firstRollIndex: number,
  lastIndex: number,
) => {
  if (index === lastIndex) return "rest";
  if (index === firstGroundIndex) return "first-contact";
  if (index === firstRollIndex) return "second-contact";
  if (index > firstRollIndex) return "roll";
  if (index > firstGroundIndex) return "bounce";
  if (index === apexIndex) return "apex";
  if (index > apexIndex) return "descent";
  return "flight";
};

export function createLabFirstPresentationTape(
  outcome: FullShotOutcome,
  context: LabPresentationContext = {},
) {
  const finiteSource = outcome.samples.filter(
    (sample) =>
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      Number.isFinite(sample.z) &&
      Number.isFinite(sample.elapsedSeconds),
  );
  const finalSample = finiteSource.at(-1);
  const priorSample = finiteSource.at(-2);
  const reliefTeleport =
    outcome.penaltyStrokes > 0 &&
    finalSample?.phase === "penalty" &&
    priorSample &&
    Math.hypot(
      finalSample.x - priorSample.x,
      finalSample.z - priorSample.z,
    ) > 0.5;
  const source = reliefTeleport ? finiteSource.slice(0, -1) : finiteSource;
  if (source.length < 2) {
    throw new RangeError("A resolved full shot requires at least two samples.");
  }
  const lastIndex = source.length - 1;
  const apexIndex = source.reduce(
    (highestIndex, sample, index) =>
      sample.y > source[highestIndex].y ? index : highestIndex,
    0,
  );
  const firstGroundCandidate = source.findIndex(
    (sample) => sample.phase !== "flight",
  );
  const firstGroundIndex = Math.max(
    apexIndex + 1,
    firstGroundCandidate >= 0 ? firstGroundCandidate : lastIndex,
  );
  const rollIndex = source.findIndex(
    (sample, index) => index > firstGroundIndex && sample.phase === "roll",
  );
  const firstRollIndex = rollIndex >= 0 ? rollIndex : lastIndex;
  const samples = [
    {
      timeMs: 0,
      phase: "ready",
      position: {
        x: outcome.from.x,
        z: outcome.from.z,
        y: GOLF_BALL_RADIUS_METERS,
      },
    },
  ];
  let lastTimeMs = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sample = source[index];
    const timeMs = Math.max(
      lastTimeMs + 1,
      Math.round(sample.elapsedSeconds * 1000),
    );
    samples.push({
      timeMs,
      phase: phaseForSample(
        index,
        apexIndex,
        firstGroundIndex,
        firstRollIndex,
        lastIndex,
      ),
      position: {
        x: sample.x,
        y: Math.max(0, sample.y) + GOLF_BALL_RADIUS_METERS,
        z: sample.z,
      },
    });
    lastTimeMs = timeMs;
  }
  const eventFor = (phase: string, type: string) => {
    const sample = samples.find((candidate) => candidate.phase === phase);
    return sample ? { timeMs: sample.timeMs, type } : null;
  };
  const events = [
    { timeMs: 0, type: "shot-ready" },
    { timeMs: samples[1].timeMs, type: "launch" },
    eventFor("apex", "apex"),
    eventFor("first-contact", "first-contact"),
    eventFor("bounce", "bounce-apex"),
    eventFor("second-contact", "second-contact"),
    { timeMs: lastTimeMs, type: "rest" },
  ].filter((event): event is { timeMs: number; type: string } => event !== null);

  return Object.freeze({
    schemaVersion: 1,
    id: `${outcome.id}-lab-first-full-shot`,
    scenarioId: context.scenarioId ?? "course-one-hole-one",
    durationMs: lastTimeMs,
    coordinateSpace:
      context.coordinateSpace ??
      "North Inlet presentation metres; shared renderer and physics world",
    samples,
    events,
  });
}

export function createLabFirstPuttPresentationTape(
  outcome: PuttOutcome,
  context: LabPresentationContext = {},
) {
  const source = outcome.samples.filter(
    (sample) =>
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      Number.isFinite(sample.z) &&
      Number.isFinite(sample.elapsedSeconds),
  );
  if (source.length < 2) {
    throw new RangeError("A resolved putt requires at least two samples.");
  }
  const samples = [
    {
      timeMs: 0,
      phase: "ready",
      position: {
        x: outcome.from.x,
        z: outcome.from.z,
        y: GOLF_BALL_RADIUS_METERS,
      },
    },
  ];
  let lastTimeMs = 0;
  let cupEntryTimeMs: number | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const sample = source[index];
    const timeMs = Math.max(
      lastTimeMs + 1,
      Math.round(sample.elapsedSeconds * 1000),
    );
    if (sample.cupEvent === "entry" && cupEntryTimeMs === null) {
      cupEntryTimeMs = timeMs;
    }
    samples.push({
      timeMs,
      phase:
        index === source.length - 1
          ? "rest"
          : sample.phase === "cup" ? "cup" : "putt",
      position: {
        x: sample.x,
        y: sample.cupEvent
          ? sample.y + GOLF_BALL_RADIUS_METERS
          : Math.max(0, sample.y) + GOLF_BALL_RADIUS_METERS,
        z: sample.z,
      },
      ...(sample.cupEvent ? { cupEvent: sample.cupEvent } : {}),
      ...(typeof sample.rotationRadians === "number" && Number.isFinite(sample.rotationRadians)
        ? { rotationRadians: sample.rotationRadians }
        : {}),
      ...(sample.puttMotionPhase
        ? { puttMotionPhase: sample.puttMotionPhase }
        : {}),
      ...(typeof sample.speedMetersPerSecond === "number" && Number.isFinite(sample.speedMetersPerSecond)
        ? { speedMetersPerSecond: sample.speedMetersPerSecond }
        : {}),
      ...(typeof sample.angularSpeedRadiansPerSecond === "number" && Number.isFinite(sample.angularSpeedRadiansPerSecond)
        ? { angularSpeedRadiansPerSecond: sample.angularSpeedRadiansPerSecond }
        : {}),
      ...(typeof sample.slipMetersPerSecond === "number" && Number.isFinite(sample.slipMetersPerSecond)
        ? { slipMetersPerSecond: sample.slipMetersPerSecond }
        : {}),
    });
    lastTimeMs = timeMs;
  }
  const events = [
    { timeMs: 0, type: "shot-ready" },
    { timeMs: samples[1].timeMs, type: "putt-start" },
    ...(cupEntryTimeMs === null
      ? []
      : [{ timeMs: cupEntryTimeMs, type: "cup-entry" }]),
    { timeMs: lastTimeMs, type: "rest" },
  ];

  return Object.freeze({
    schemaVersion: 1,
    id: `${outcome.id}-lab-first-putt`,
    scenarioId: context.scenarioId ?? "course-one-hole-one",
    durationMs: lastTimeMs,
    coordinateSpace:
      context.coordinateSpace ??
      "North Inlet presentation metres; shared renderer, green and cup world",
    samples,
    events,
  });
}
