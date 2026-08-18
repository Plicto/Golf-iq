import { courseSurfaceElevationAt } from "./course-renderer.js";
import { samplePresentationTape } from "./presentation-tape.js";

export const PUTT_ADDRESS_CAMERA_DISTANCE_METRES = 5.5;
export const PUTT_CUP_CAMERA_DISTANCE_METRES = 5.5;
export const PUTT_CUP_CAMERA_HEIGHT_METRES = 1.4;
export const PUTT_CUP_CAMERA_CUT_DISTANCE_METRES = 1.45;
export const PUTT_CUP_FOCUS_DISTANCE_METRES = 0.75;
export const PUTT_CUP_FOCUS_DURATION_MS = 650;
export const PUTT_CUP_FOCUS_FOV_DEGREES = 36;

const BALL_RADIUS_METRES = 0.021335;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function smoothstep(start, end, value) {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }
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

function normalizedDirection(from, to) {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.max(0.000_001, Math.hypot(x, z));
  return { x: x / length, z: z / length };
}

function rotateDirection(direction, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: direction.x * cosine - direction.z * sine,
    z: direction.x * sine + direction.z * cosine,
  };
}

function distanceToCup(world, position) {
  const pin = world.pin;
  return Math.hypot(
    position.x - pin.x,
    position.z - pin.z,
  );
}

function worldPosition(world, position) {
  return {
    x: position.x,
    y: courseSurfaceElevationAt(world, position.x, position.z) + position.y,
    z: position.z,
  };
}

function findCutTimeMs(world, tape) {
  if (
    distanceToCup(world, tape.samples[0].position) <=
      PUTT_CUP_CAMERA_CUT_DISTANCE_METRES
  ) {
    return 0;
  }
  for (let index = 1; index < tape.samples.length; index += 1) {
    const before = tape.samples[index - 1];
    const after = tape.samples[index];
    const beforeDistance = distanceToCup(world, before.position);
    const afterDistance = distanceToCup(world, after.position);
    if (
      beforeDistance > PUTT_CUP_CAMERA_CUT_DISTANCE_METRES &&
      afterDistance <= PUTT_CUP_CAMERA_CUT_DISTANCE_METRES
    ) {
      const progress = clamp(
        (beforeDistance - PUTT_CUP_CAMERA_CUT_DISTANCE_METRES) /
          Math.max(0.000_001, beforeDistance - afterDistance),
        0,
        1,
      );
      const cutTimeMs = Math.round(mix(before.timeMs, after.timeMs, progress));
      return cutTimeMs >= tape.durationMs ? null : cutTimeMs;
    }
  }
  return null;
}

function incomingDirectionAt(world, tape, cutTimeMs) {
  const requestedTimeMs = cutTimeMs ?? tape.durationMs;
  let index = tape.samples.findIndex((sample) => sample.timeMs >= requestedTimeMs);
  if (index < 0) index = tape.samples.length - 1;
  for (let radius = 1; radius < tape.samples.length; radius += 1) {
    const fromIndex = Math.max(0, index - radius);
    const toIndex = Math.min(tape.samples.length - 1, index + 1);
    const from = tape.samples[fromIndex].position;
    const to = tape.samples[toIndex].position;
    if (Math.hypot(to.x - from.x, to.z - from.z) > 0.002) {
      return normalizedDirection(from, to);
    }
  }
  return normalizedDirection(tape.samples[0].position, world.pin);
}

function findCupFocus(world, tape, cupEntryTimeMs) {
  if (cupEntryTimeMs !== null) {
    return { timeMs: cupEntryTimeMs, kind: "holed" };
  }

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < tape.samples.length; index += 1) {
    const distance = distanceToCup(world, tape.samples[index].position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  if (
    closestDistance > PUTT_CUP_FOCUS_DISTANCE_METRES ||
    closestIndex === tape.samples.length - 1
  ) {
    return { timeMs: null, kind: null };
  }

  const movedAway = tape.samples
    .slice(closestIndex + 1)
    .some(
      (sample) =>
        distanceToCup(world, sample.position) >= closestDistance + 0.03,
    );
  return movedAway
    ? { timeMs: tape.samples[closestIndex].timeMs, kind: "passed" }
    : { timeMs: null, kind: null };
}

function cameraRigBehind(world, point, direction, distance, height) {
  const x = point.x - direction.x * distance;
  const z = point.z - direction.z * distance;
  return {
    position: {
      x,
      y: courseSurfaceElevationAt(world, x, z) + height,
      z,
    },
    heightAboveTerrain: height,
  };
}

function pairedTarget(world, ballPosition, cupWeight) {
  const pin = world.pin;
  const x = mix(ballPosition.x, pin.x, cupWeight);
  const z = mix(ballPosition.z, pin.z, cupWeight);
  return {
    x,
    y: courseSurfaceElevationAt(world, x, z) + 0.045,
    z,
  };
}

export function createPuttAddressCamera(
  world,
  start,
  target = world.pin,
  lineDegrees = 0,
) {
  const direction = rotateDirection(normalizedDirection(start, target), lineDegrees);
  const rig = cameraRigBehind(
    world,
    start,
    direction,
    PUTT_ADDRESS_CAMERA_DISTANCE_METRES,
    1.55,
  );
  return deepFreeze({
    position: rig.position,
    target: pairedTarget(world, start, 0.5),
    fovDegrees: 44,
    rollDegrees: 0,
    focalShiftX: 0,
    focalShiftY: -0.04,
  });
}

export function createPuttCameraTrack(world, tape) {
  const pin = world.pin;
  const start = tape.samples[0].position;
  const cutTimeMs = findCutTimeMs(world, tape);
  const addressDirection = incomingDirectionAt(world, tape, 0);
  const cupDirection = incomingDirectionAt(world, tape, cutTimeMs);
  const cupEntryTimeMs = tape.events.find(
    (event) => event.type === "cup-entry",
  )?.timeMs ?? null;
  const cupFocus = findCupFocus(world, tape, cupEntryTimeMs);
  const durationMs = cupFocus.timeMs === null
    ? tape.durationMs
    : Math.max(
        tape.durationMs,
        cupFocus.timeMs + PUTT_CUP_FOCUS_DURATION_MS,
      );
  const track = deepFreeze({
    schemaVersion: 1,
    id: `${tape.id}-putt-camera-v3`,
    durationMs,
    tapeDurationMs: tape.durationMs,
    cutTimeMs,
    cupEntryTimeMs,
    focusTimeMs: cupFocus.timeMs,
    focusKind: cupFocus.kind,
    rigs: {
      address: cameraRigBehind(
        world,
        start,
        addressDirection,
        PUTT_ADDRESS_CAMERA_DISTANCE_METRES,
        1.55,
      ),
      cup: cameraRigBehind(
        world,
        pin,
        cupDirection,
        PUTT_CUP_CAMERA_DISTANCE_METRES,
        PUTT_CUP_CAMERA_HEIGHT_METRES,
      ),
    },
    events: [
      ...(cutTimeMs === 0
        ? [{ timeMs: 0, stage: "cup-camera" }]
        : [{ timeMs: 0, stage: "putt-address" }]),
      ...(cutTimeMs !== null && cutTimeMs > 0
        ? [{ timeMs: cutTimeMs, stage: "cup-camera" }]
        : []),
      ...(cupFocus.timeMs === null
        ? []
        : [{ timeMs: cupFocus.timeMs, stage: "cup-focus" }]),
      { timeMs: durationMs, stage: "putt-rest" },
    ],
  });
  assertPuttCameraTrack(track, tape);
  return track;
}

export function assertPuttCameraTrack(track, tape) {
  if (!track || track.schemaVersion !== 1) {
    throw new TypeError("Putt camera schemaVersion must be 1");
  }
  if (
    track.tapeDurationMs !== tape.durationMs ||
    track.durationMs < tape.durationMs
  ) {
    throw new RangeError("Putt camera must retain the complete presentation tape");
  }
  if (
    track.cutTimeMs !== null &&
    (
      !Number.isFinite(track.cutTimeMs) ||
      track.cutTimeMs < 0 ||
      track.cutTimeMs > track.tapeDurationMs
    )
  ) {
    throw new RangeError("Putt camera cut must be null or inside the retained roll");
  }
  if (
    track.cupEntryTimeMs !== null &&
    (
      !Number.isFinite(track.cupEntryTimeMs) ||
      track.cupEntryTimeMs < 0 ||
      track.cupEntryTimeMs > track.tapeDurationMs
    )
  ) {
    throw new RangeError("Putt cup entry must be null or inside the retained roll");
  }
  if (
    (track.focusTimeMs === null) !== (track.focusKind === null) ||
    (
      track.focusTimeMs !== null &&
      (
        !Number.isFinite(track.focusTimeMs) ||
        track.focusTimeMs < 0 ||
        track.focusTimeMs > track.tapeDurationMs ||
        !["holed", "passed"].includes(track.focusKind)
      )
    )
  ) {
    throw new RangeError("Putt cup focus must follow a retained cup event");
  }
  for (const rigId of ["address", "cup"]) {
    const rig = track.rigs[rigId];
    if (
      !rig ||
      ![rig.position.x, rig.position.y, rig.position.z].every(Number.isFinite)
    ) {
      throw new TypeError(`Putt camera rig ${rigId} is invalid`);
    }
  }
  return true;
}

export function samplePuttPresentation(world, track, tape, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, track.durationMs);
  const ballTimeMs = Math.min(timeMs, tape.durationMs);
  const ball = samplePresentationTape(tape, ballTimeMs);
  const position = ball.position;
  const distance = distanceToCup(world, position);
  const cupCameraActive = track.cutTimeMs !== null && timeMs >= track.cutTimeMs;
  const rigId = cupCameraActive ? "cup" : "address";
  const cupEntry = track.cupEntryTimeMs !== null && timeMs >= track.cupEntryTimeMs;
  const belowSurface = cupEntry && position.y < BALL_RADIUS_METRES - 0.000_25;
  const focusProgress = track.focusTimeMs === null
    ? 0
    : smoothstep(
        track.focusTimeMs,
        track.focusTimeMs + PUTT_CUP_FOCUS_DURATION_MS,
        timeMs,
      );
  const target = pairedTarget(world, position, mix(0.5, 1, focusProgress));
  const isRest = timeMs >= track.durationMs;
  const cupCameraFov = clamp(48 + distance * 3, 48, 64);

  return {
    timeMs,
    rigId,
    stage: isRest
      ? "putt-rest"
      : belowSurface
        ? "cup-drop"
        : rigId === "cup"
          ? "cup-camera"
          : "putt-address",
    distanceToCupMetres: distance,
    focusKind: track.focusKind,
    focusProgress,
    ball: {
      ...ball,
      worldPosition: worldPosition(world, position),
      shadowWorldPosition: worldPosition(world, {
        x: position.x,
        y: 0.003,
        z: position.z,
      }),
      radiusMetres: BALL_RADIUS_METRES,
      visible: position.y + BALL_RADIUS_METRES > 0,
      cupEntry,
      clipToCup: belowSurface,
      shadowAlpha: belowSurface ? 0 : 1,
    },
    camera: {
      position: { ...track.rigs[rigId].position },
      target,
      fovDegrees: rigId === "address"
        ? 44
        : mix(cupCameraFov, PUTT_CUP_FOCUS_FOV_DEGREES, focusProgress),
      rollDegrees: 0,
      focalShiftX: 0,
      focalShiftY: rigId === "address" ? -0.04 : -0.06,
    },
  };
}
