import {
  assertCinematicFlybyTrack,
  sampleCinematicFlyby,
  sampleReducedFlyby,
} from "./cinematic-flyby.js";

export const LAB_HOLE_PRESENTATION_SCHEMA_VERSION = 1;

const CAMERA_VECTOR_KEYS = Object.freeze(["x", "y", "z"]);
const CAMERA_SAMPLE_INTERVAL_MS = 100;
const MINIMUM_CAMERA_CLEARANCE_METERS = 2;
const MINIMUM_VIEW_DEPTH_METERS = 1;

const deepFreeze = (value, visited = new WeakSet()) => {
  if (!value || typeof value !== "object" || visited.has(value)) {
    return value;
  }
  visited.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, visited);
  }
  return Object.freeze(value);
};

const assertNonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
};

const assertFiniteCamera = (camera, label) => {
  if (!camera || typeof camera !== "object" || Array.isArray(camera)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const vectorName of ["position", "target"]) {
    const vector = camera[vectorName];
    if (
      !vector ||
      !CAMERA_VECTOR_KEYS.every((key) => Number.isFinite(vector[key]))
    ) {
      throw new TypeError(`${label}.${vectorName} must use finite coordinates`);
    }
  }
  for (const key of ["fovDegrees", "rollDegrees", "focalShiftY"]) {
    if (!Number.isFinite(camera[key])) {
      throw new TypeError(`${label}.${key} must be finite`);
    }
  }
};

const addScaledVector = (point, velocity, scale) => ({
  x: point.x + velocity.x * scale,
  y: point.y + velocity.y * scale,
  z: point.z + velocity.z * scale,
});

const subtractVector = (left, right) => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const dotVector = (left, right) =>
  left.x * right.x + left.y * right.y + left.z * right.z;

const scalarHermiteControls = (
  from,
  to,
  fromVelocity,
  toVelocity,
  durationSeconds,
) => [
  from,
  from + fromVelocity * durationSeconds / 3,
  to - toVelocity * durationSeconds / 3,
  to,
];

const assertCinematicCurveEnvelope = (definition, track, label) => {
  for (let index = 0; index < track.keyframes.length - 1; index += 1) {
    const from = track.keyframes[index];
    const to = track.keyframes[index + 1];
    const durationSeconds = (to.timeMs - from.timeMs) / 1_000;
    const scale = durationSeconds / 3;
    const positionControls = [
      from.position,
      addScaledVector(from.position, from.positionVelocity, scale),
      addScaledVector(to.position, to.positionVelocity, -scale),
      to.position,
    ];
    const targetControls = [
      from.target,
      addScaledVector(from.target, from.targetVelocity, scale),
      addScaledVector(to.target, to.targetVelocity, -scale),
      to.target,
    ];
    for (const position of positionControls) {
      const terrainHeight = definition.world.terrainElevationAt(
        position.x,
        position.z,
      );
      if (
        !Number.isFinite(terrainHeight) ||
        position.y - terrainHeight < MINIMUM_CAMERA_CLEARANCE_METERS
      ) {
        throw new RangeError(
          `${label} segment ${index} control envelope must remain clear of terrain`,
        );
      }
    }
    const viewControls = targetControls.map((target, controlIndex) =>
      subtractVector(target, positionControls[controlIndex])
    );
    const axisSource = {
      x: viewControls[0].x + viewControls[3].x,
      y: viewControls[0].y + viewControls[3].y,
      z: viewControls[0].z + viewControls[3].z,
    };
    const axisLength = Math.hypot(
      axisSource.x,
      axisSource.y,
      axisSource.z,
    );
    if (axisLength < MINIMUM_VIEW_DEPTH_METERS) {
      throw new RangeError(`${label} segment ${index} has no stable view axis`);
    }
    const viewAxis = {
      x: axisSource.x / axisLength,
      y: axisSource.y / axisLength,
      z: axisSource.z / axisLength,
    };
    if (
      viewControls.some(
        (control) =>
          dotVector(control, viewAxis) < MINIMUM_VIEW_DEPTH_METERS,
      )
    ) {
      throw new RangeError(
        `${label} segment ${index} must retain positive view depth`,
      );
    }

    const fovControls = scalarHermiteControls(
      from.fovDegrees,
      to.fovDegrees,
      from.fovVelocityDegreesPerSecond,
      to.fovVelocityDegreesPerSecond,
      durationSeconds,
    );
    if (fovControls.some((value) => value < 36 || value > 50)) {
      throw new RangeError(
        `${label} segment ${index} FOV must stay between 36 and 50 degrees`,
      );
    }
    const rollControls = scalarHermiteControls(
      from.rollDegrees,
      to.rollDegrees,
      from.rollVelocityDegreesPerSecond,
      to.rollVelocityDegreesPerSecond,
      durationSeconds,
    );
    if (rollControls.some((value) => Math.abs(value) > 2.5)) {
      throw new RangeError(
        `${label} segment ${index} roll must stay within 2.5 degrees`,
      );
    }
  }
};

const assertReducedFlybyTrack = (track) => {
  if (!track || track.schemaVersion !== LAB_HOLE_PRESENTATION_SCHEMA_VERSION) {
    throw new TypeError("Reduced flyby schemaVersion must be 1");
  }
  assertNonEmptyString(track.id, "Reduced flyby id");
  if (!Number.isFinite(track.durationMs) || track.durationMs <= 0) {
    throw new RangeError("Reduced flyby duration must be positive");
  }
  if (!Array.isArray(track.stills) || track.stills.length < 1) {
    throw new RangeError("Reduced flyby requires at least one still");
  }
  if (
    track.stills[0].startMs !== 0 ||
    track.stills.at(-1).endMs !== track.durationMs
  ) {
    throw new RangeError("Reduced flyby stills must cover the full duration");
  }
  for (let index = 0; index < track.stills.length; index += 1) {
    const still = track.stills[index];
    if (
      !Number.isFinite(still.startMs) ||
      !Number.isFinite(still.endMs) ||
      still.startMs < 0 ||
      still.endMs <= still.startMs ||
      still.endMs > track.durationMs
    ) {
      throw new RangeError(`Reduced flyby still ${index} has invalid timing`);
    }
    if (index > 0 && still.startMs !== track.stills[index - 1].endMs) {
      throw new RangeError("Reduced flyby stills must be contiguous");
    }
    assertNonEmptyString(still.stage, `Reduced flyby still ${index} stage`);
    assertFiniteCamera(still.camera, `Reduced flyby still ${index} camera`);
  }
};

const sampledTimes = (track) => {
  const times = new Set([0, track.durationMs]);
  for (
    let timeMs = CAMERA_SAMPLE_INTERVAL_MS;
    timeMs < track.durationMs;
    timeMs += CAMERA_SAMPLE_INTERVAL_MS
  ) {
    times.add(timeMs);
  }
  for (const keyframe of track.keyframes ?? []) {
    times.add(keyframe.timeMs);
  }
  for (const still of track.stills ?? []) {
    times.add(still.startMs);
    times.add(still.endMs);
  }
  return [...times].sort((left, right) => left - right);
};

const assertSampledCamera = (definition, camera, label) => {
  assertFiniteCamera(camera, label);
  if (camera.fovDegrees < 36 || camera.fovDegrees > 50) {
    throw new RangeError(`${label} FOV must stay between 36 and 50 degrees`);
  }
  if (Math.abs(camera.rollDegrees) > 2.5) {
    throw new RangeError(`${label} roll must stay within 2.5 degrees`);
  }
  const viewDepth = Math.hypot(
    camera.position.x - camera.target.x,
    camera.position.y - camera.target.y,
    camera.position.z - camera.target.z,
  );
  if (viewDepth < MINIMUM_VIEW_DEPTH_METERS) {
    throw new RangeError(`${label} must retain positive view depth`);
  }
  const terrainHeight = definition.world.terrainElevationAt(
    camera.position.x,
    camera.position.z,
  );
  if (
    !Number.isFinite(terrainHeight) ||
    camera.position.y - terrainHeight < MINIMUM_CAMERA_CLEARANCE_METERS
  ) {
    throw new RangeError(`${label} must remain clear of terrain`);
  }
};

const assertSampledTrack = (definition, track, sample, label) => {
  for (const timeMs of sampledTimes(track)) {
    assertSampledCamera(
      definition,
      sample(track, timeMs).camera,
      `${label} at ${timeMs} ms`,
    );
  }
};

const assertTrackOwnership = (runtimeId, fullFlyby, reducedFlyby) => {
  if (fullFlyby.id !== `${runtimeId}-cinematic-drone-flyby-v1`) {
    throw new RangeError(`Full flyby ownership mismatch: ${runtimeId}`);
  }
  if (reducedFlyby.id !== `${runtimeId}-reduced-flyby-v1`) {
    throw new RangeError(`Reduced flyby ownership mismatch: ${runtimeId}`);
  }
  if (
    fullFlyby.events[0].timeMs !== 0 ||
    fullFlyby.events[0].type !== "flyby-start" ||
    fullFlyby.events.at(-1).timeMs !== fullFlyby.durationMs ||
    fullFlyby.events.at(-1).type !== "flyby-complete"
  ) {
    throw new RangeError(
      `Full flyby events must start and complete the presentation: ${runtimeId}`,
    );
  }
};

export function defineLabHolePresentationV1({
  schemaVersion,
  runtimeId,
  definition,
  fullFlyby,
  reducedFlyby,
}) {
  if (schemaVersion !== LAB_HOLE_PRESENTATION_SCHEMA_VERSION) {
    throw new TypeError("LabHolePresentationV1 schemaVersion must be 1");
  }
  assertNonEmptyString(runtimeId, "LabHolePresentationV1 runtimeId");
  if (definition?.identity?.id !== runtimeId) {
    throw new RangeError(
      `Lab hole presentation definition mismatch: ${runtimeId}`,
    );
  }
  assertCinematicFlybyTrack(fullFlyby);
  assertCinematicCurveEnvelope(
    definition,
    fullFlyby,
    `${runtimeId} full flyby`,
  );
  assertReducedFlybyTrack(reducedFlyby);
  assertTrackOwnership(runtimeId, fullFlyby, reducedFlyby);
  for (const [index, still] of reducedFlyby.stills.entries()) {
    assertSampledCamera(
      definition,
      still.camera,
      `${runtimeId} reduced flyby still ${index}`,
    );
  }
  assertSampledTrack(
    definition,
    fullFlyby,
    sampleCinematicFlyby,
    `${runtimeId} full flyby`,
  );
  assertSampledTrack(
    definition,
    reducedFlyby,
    sampleReducedFlyby,
    `${runtimeId} reduced flyby`,
  );

  return deepFreeze({
    schemaVersion: LAB_HOLE_PRESENTATION_SCHEMA_VERSION,
    runtimeId,
    definition,
    fullFlyby,
    reducedFlyby,
  });
}

export function createLabHolePresentationRegistry(presentations) {
  if (!Array.isArray(presentations)) {
    throw new TypeError("Lab hole presentation registry input must be an array");
  }

  const byId = new Map();
  for (const presentation of presentations) {
    const definedPresentation = defineLabHolePresentationV1(presentation);
    if (byId.has(definedPresentation.runtimeId)) {
      throw new RangeError(
        `Duplicate lab hole presentation: ${definedPresentation.runtimeId}`,
      );
    }
    byId.set(definedPresentation.runtimeId, definedPresentation);
  }

  return deepFreeze(Object.fromEntries(byId));
}
