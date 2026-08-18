import { courseSurfaceElevationAt } from "./course-renderer.js";
import { NORTH_INLET_WORLD } from "./north-inlet-world.js";

const POSITION_KEYS = ["x", "y", "z"];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
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

function slopeBetween(samples, key, fromIndex, toIndex) {
  const from = samples[fromIndex];
  const to = samples[toIndex];
  return (to.position[key] - from.position[key]) / (to.timeMs - from.timeMs);
}

function endpointTangent(firstInterval, secondInterval, firstSlope, secondSlope) {
  let tangent =
    ((2 * firstInterval + secondInterval) * firstSlope -
      firstInterval * secondSlope) /
    (firstInterval + secondInterval);

  if (Math.sign(tangent) !== Math.sign(firstSlope)) {
    tangent = 0;
  } else if (
    Math.sign(firstSlope) !== Math.sign(secondSlope) &&
    Math.abs(tangent) > Math.abs(3 * firstSlope)
  ) {
    tangent = 3 * firstSlope;
  }

  return tangent;
}

function tangentAt(samples, key, index) {
  if (samples.length === 2) {
    return slopeBetween(samples, key, 0, 1);
  }

  if (index === 0) {
    const firstInterval = samples[1].timeMs - samples[0].timeMs;
    const secondInterval = samples[2].timeMs - samples[1].timeMs;
    return endpointTangent(
      firstInterval,
      secondInterval,
      slopeBetween(samples, key, 0, 1),
      slopeBetween(samples, key, 1, 2),
    );
  }

  if (index === samples.length - 1) {
    const lastIndex = samples.length - 1;
    const firstInterval = samples[lastIndex].timeMs - samples[lastIndex - 1].timeMs;
    const secondInterval =
      samples[lastIndex - 1].timeMs - samples[lastIndex - 2].timeMs;
    return endpointTangent(
      firstInterval,
      secondInterval,
      slopeBetween(samples, key, lastIndex - 1, lastIndex),
      slopeBetween(samples, key, lastIndex - 2, lastIndex - 1),
    );
  }

  const beforeSlope = slopeBetween(samples, key, index - 1, index);
  const afterSlope = slopeBetween(samples, key, index, index + 1);
  if (
    beforeSlope === 0 ||
    afterSlope === 0 ||
    Math.sign(beforeSlope) !== Math.sign(afterSlope)
  ) {
    return 0;
  }

  const beforeInterval = samples[index].timeMs - samples[index - 1].timeMs;
  const afterInterval = samples[index + 1].timeMs - samples[index].timeMs;
  const beforeWeight = 2 * afterInterval + beforeInterval;
  const afterWeight = afterInterval + 2 * beforeInterval;
  return (
    (beforeWeight + afterWeight) /
    (beforeWeight / beforeSlope + afterWeight / afterSlope)
  );
}

function interpolateMonotone(from, to, fromTangent, toTangent, progress) {
  const interval = to.timeMs - from.timeMs;
  const squared = progress * progress;
  const cubed = squared * progress;
  return (
    (2 * cubed - 3 * squared + 1) * from.value +
    (cubed - 2 * squared + progress) * interval * fromTangent +
    (-2 * cubed + 3 * squared) * to.value +
    (cubed - squared) * interval * toTangent
  );
}

function segmentAt(samples, timeMs) {
  if (timeMs === samples.at(-1).timeMs) {
    return {
      index: samples.length - 2,
      progress: 1,
    };
  }

  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeMs <= timeMs) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return {
    index: low,
    progress:
      (timeMs - samples[low].timeMs) /
      (samples[high].timeMs - samples[low].timeMs),
  };
}

function smoothingSectionAt(tape, timeMs) {
  const firstContactIndex = tape.samples.findIndex(
    (sample) => sample.phase === "first-contact",
  );
  const secondContactIndex = tape.samples.findIndex(
    (sample) => sample.phase === "second-contact",
  );
  if (
    firstContactIndex <= 0 ||
    secondContactIndex <= firstContactIndex ||
    secondContactIndex >= tape.samples.length - 1
  ) {
    return {
      samples: tape.samples,
      startIndex: 0,
    };
  }
  if (timeMs < tape.samples[firstContactIndex].timeMs) {
    return {
      samples: tape.samples.slice(0, firstContactIndex + 1),
      startIndex: 0,
    };
  }
  if (timeMs < tape.samples[secondContactIndex].timeMs) {
    return {
      samples: tape.samples.slice(firstContactIndex, secondContactIndex + 1),
      startIndex: firstContactIndex,
    };
  }
  return {
    samples: tape.samples.slice(secondContactIndex),
    startIndex: secondContactIndex,
  };
}

function worldPosition(world, position) {
  return {
    x: position.x,
    y: courseSurfaceElevationAt(world, position.x, position.z) + position.y,
    z: position.z,
  };
}

export function createShotAddressCamera(world, start, target) {
  const travelX = target.x - start.x;
  const travelZ = target.z - start.z;
  const distance = Math.max(0.000_001, Math.hypot(travelX, travelZ));
  const forward = { x: travelX / distance, z: travelZ / distance };
  const right = { x: forward.z, z: -forward.x };
  const rearDistance = clamp(5.6 + distance * 0.01, 5.8, 8.4);
  const cameraHeight = clamp(1.55 + distance * 0.0015, 1.6, 1.95);
  const lateralOffset = clamp(rearDistance * 0.06, 0.4, 0.52);
  const cameraX = start.x - forward.x * rearDistance + right.x * lateralOffset;
  const cameraZ = start.z - forward.z * rearDistance + right.z * lateralOffset;
  const focusDistance = clamp(distance * 0.16, 10, 42);
  const focusX = start.x + forward.x * focusDistance;
  const focusZ = start.z + forward.z * focusDistance;
  return deepFreeze({
    position: {
      x: cameraX,
      y: courseSurfaceElevationAt(world, cameraX, cameraZ) + cameraHeight,
      z: cameraZ,
    },
    target: {
      x: focusX,
      y: courseSurfaceElevationAt(world, focusX, focusZ) + 0.65,
      z: focusZ,
    },
    fovDegrees: distance < 40 ? 48 : 44,
    focalShiftX: 0,
    focalShiftY: -0.035,
    rollDegrees: 0,
  });
}

function cameraStageAt(track, timeMs) {
  let current = track.events[0];
  for (const event of track.events) {
    if (event.timeMs > timeMs) {
      break;
    }
    current = event;
  }
  return current;
}

function operatorDrift(timeMs) {
  const seconds = timeMs / 1000;
  return {
    x:
      Math.sin(seconds * 2.47 + 0.8) * 0.012 +
      Math.sin(seconds * 4.31 + 1.7) * 0.004,
    y:
      Math.sin(seconds * 2.03 + 2.2) * 0.011 +
      Math.sin(seconds * 3.57 + 0.2) * 0.003,
  };
}

function rearFieldOfView(track, timeMs) {
  const launchZoom = smoothstep(280, 1550, timeMs);
  const apexZoom = smoothstep(1550, track.cutTimeMs, timeMs);
  return mix(mix(42, 32, launchZoom), 28, apexZoom);
}

function landingFieldOfView(track, timeMs) {
  const zoom = track.shotDistanceMeters >= 190
    ? { pickup: 24, tight: 14, contact: 20, rest: 18 }
    : track.shotDistanceMeters >= 80
      ? { pickup: 20, tight: 12, contact: 20, rest: 17 }
      : { pickup: 22, tight: 14, contact: 23, rest: 21 };
  const pickupEndMs = track.cutTimeMs + 520;
  const contextStartMs = Math.max(
    pickupEndMs + 280,
    track.firstContactTimeMs - 1080,
  );
  const contextEndMs = Math.max(
    contextStartMs + 320,
    track.firstContactTimeMs - 100,
  );
  if (timeMs <= pickupEndMs) {
    return mix(
      zoom.pickup,
      zoom.tight + 4,
      smoothstep(track.cutTimeMs, pickupEndMs, timeMs),
    );
  }
  if (timeMs <= contextStartMs) {
    return mix(
      zoom.tight + 4,
      zoom.tight,
      smoothstep(pickupEndMs, contextStartMs, timeMs),
    );
  }
  if (timeMs <= contextEndMs) {
    return mix(
      zoom.tight,
      zoom.contact,
      smoothstep(contextStartMs, contextEndMs, timeMs),
    );
  }
  return mix(
    zoom.contact,
    zoom.rest,
    smoothstep(contextEndMs, track.durationMs, timeMs),
  );
}

export function shotDistanceFromStart(tape, position) {
  const start = tape.samples[0].position;
  return Math.hypot(position.x - start.x, position.z - start.z);
}

function trackingLagMs(track, rigId, timeMs) {
  if (rigId === "rear") {
    return mix(70, 105, smoothstep(280, 1800, timeMs));
  }
  if (!track.landingProfile) {
    return mix(
      175,
      125,
      smoothstep(track.cutTimeMs, track.cutTimeMs + 650, timeMs),
    );
  }
  return mix(
    155,
    0,
    smoothstep(
      track.cutTimeMs,
      Math.max(track.cutTimeMs + 360, track.firstContactTimeMs - 420),
      timeMs,
    ),
  );
}

function focalShiftFor(track, rigId, timeMs, reducedMotion) {
  const compositionY =
    rigId === "rear"
      ? mix(-0.015, -0.045, smoothstep(650, 2200, timeMs))
      : mix(
          -0.035,
          -0.085,
          smoothstep(
            track.focalShiftStartTimeMs,
            track.focalShiftEndTimeMs,
            timeMs,
          ),
        );

  if (reducedMotion) {
    return { x: 0, y: compositionY };
  }

  const drift = operatorDrift(timeMs);
  const pickup =
    rigId === "landing"
      ? 1 -
        smoothstep(
          track.cutTimeMs,
          track.cutTimeMs + 540,
          timeMs,
        )
      : 0;
  return {
    x: drift.x + pickup * 0.038,
    y: compositionY + drift.y - pickup * 0.024,
  };
}

export function sampleSmoothPresentationTape(tape, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, tape.durationMs);
  const section = smoothingSectionAt(tape, timeMs);
  const { index, progress } = segmentAt(section.samples, timeMs);
  const from = section.samples[index];
  const to = section.samples[index + 1];
  const position = {};

  for (const key of POSITION_KEYS) {
    position[key] = interpolateMonotone(
      { timeMs: from.timeMs, value: from.position[key] },
      { timeMs: to.timeMs, value: to.position[key] },
      tangentAt(section.samples, key, index),
      tangentAt(section.samples, key, index + 1),
      progress,
    );
  }

  return {
    timeMs,
    phase: progress < 0.5 ? from.phase : to.phase,
    segmentIndex: section.startIndex + index,
    segmentProgress: progress,
    position,
  };
}

export function assertBroadcastCameraTrack(track, tape) {
  if (!track || track.schemaVersion !== 1) {
    throw new TypeError("Broadcast camera schemaVersion must be 1");
  }
  if (track.durationMs !== tape.durationMs) {
    throw new RangeError("Broadcast camera duration must match its presentation tape");
  }
  if (Math.abs(track.cutTimeMs - track.apexTimeMs) > 250) {
    throw new RangeError("Broadcast camera cut must stay within 250 ms of apex");
  }
  if (!Number.isFinite(track.shotDistanceMeters) || track.shotDistanceMeters <= 0) {
    throw new RangeError("Broadcast camera shot distance must be positive");
  }
  for (const rigId of ["rear", "landing"]) {
    const rig = track.rigs[rigId];
    if (!rig || !POSITION_KEYS.every((key) => Number.isFinite(rig.position[key]))) {
      throw new TypeError(`Broadcast camera rig ${rigId} is invalid`);
    }
    if (rig.heightAboveTerrain < 1.3 || rig.heightAboveTerrain > 2) {
      throw new RangeError(`Broadcast camera rig ${rigId} must stand on the ground`);
    }
  }
  if (!Array.isArray(track.events) || track.events.length < 2) {
    throw new RangeError("Broadcast camera requires ordered director events");
  }
  for (let index = 0; index < track.events.length; index += 1) {
    const event = track.events[index];
    if (
      !Number.isFinite(event.timeMs) ||
      event.timeMs < 0 ||
      event.timeMs > track.durationMs ||
      typeof event.stage !== "string" ||
      (index > 0 && event.timeMs <= track.events[index - 1].timeMs)
    ) {
      throw new TypeError(`Broadcast camera event ${index} is invalid`);
    }
  }
  return true;
}

export function sampleBroadcastPresentation(
  world,
  track,
  tape,
  requestedTimeMs,
  { reducedMotion = false } = {},
) {
  const timeMs = clamp(requestedTimeMs, 0, track.durationMs);
  const rigId = timeMs < track.cutTimeMs ? "rear" : "landing";
  const rig = track.rigs[rigId];
  const lagMs = reducedMotion ? 0 : trackingLagMs(track, rigId, timeMs);
  const trackedBall = sampleSmoothPresentationTape(tape, timeMs - lagMs);
  const ball = sampleSmoothPresentationTape(tape, timeMs);
  const trackedWorldPosition = worldPosition(world, trackedBall.position);
  if (rigId === "rear") {
    const fullShot = track.shotDistanceMeters >= 80;
    trackedWorldPosition.y -= clamp(
      trackedBall.position.y * (fullShot ? 0.52 : 0.32),
      0,
      fullShot ? 22.5 : 14,
    );
  }
  const shift = focalShiftFor(track, rigId, timeMs, reducedMotion);

  return {
    timeMs,
    rigId,
    stage: cameraStageAt(track, timeMs).stage,
    ball,
    ballWorldPosition: worldPosition(world, ball.position),
    camera: {
      position: { ...rig.position },
      target: trackedWorldPosition,
      fovDegrees:
        rigId === "rear"
          ? rearFieldOfView(track, timeMs)
          : landingFieldOfView(track, timeMs),
      focalShiftX: shift.x,
      focalShiftY: shift.y,
      rollDegrees: 0,
    },
  };
}

function firstSampleAtOrAfter(tape, phase, fallback) {
  return tape.samples.find((sample) => sample.phase === phase) ?? fallback;
}

export function createBroadcastCameraTrack(world, tape) {
  const start = tape.samples[0];
  const rest = tape.samples.at(-1);
  const apex = tape.samples.reduce(
    (highest, sample) =>
      sample.position.y > highest.position.y ? sample : highest,
    start,
  );
  const firstContact = firstSampleAtOrAfter(tape, "first-contact", rest);
  const bounce = firstSampleAtOrAfter(tape, "bounce", firstContact);
  const roll = firstSampleAtOrAfter(tape, "roll", bounce);
  const cutTimeMs = clamp(
    apex.timeMs + 160,
    Math.min(apex.timeMs, tape.durationMs - 1),
    Math.max(apex.timeMs + 1, firstContact.timeMs - 260),
  );
  const travelX = firstContact.position.x - start.position.x;
  const travelZ = firstContact.position.z - start.position.z;
  const travelDistance = Math.max(0.000_001, Math.hypot(travelX, travelZ));
  const forward = {
    x: travelX / travelDistance,
    z: travelZ / travelDistance,
  };
  const right = { x: forward.z, z: -forward.x };
  const rearX = start.position.x - forward.x * 6 + right.x * 1.2;
  const rearZ = start.position.z - forward.z * 6 + right.z * 1.2;
  const rearPosition = {
    x: rearX,
    y: courseSurfaceElevationAt(world, rearX, rearZ) + 1.68,
    z: rearZ,
  };
  const shortShot = travelDistance < 80;
  const landingLead = shortShot
    ? clamp(travelDistance * 0.16, 7, 18)
    : 28;
  const landingOffset = shortShot
    ? clamp(travelDistance * 0.045, 2.8, 4.2)
    : 5.5;
  const landingX =
    firstContact.position.x + forward.x * landingLead + right.x * landingOffset;
  const landingZ =
    firstContact.position.z + forward.z * landingLead + right.z * landingOffset;
  const landingPosition = {
    x: landingX,
    y: courseSurfaceElevationAt(world, landingX, landingZ) + 1.62,
    z: landingZ,
  };
  const eventCandidates = [
    { timeMs: 0, type: "rear-ready", stage: "rear-ready" },
    { timeMs: Math.min(280, Math.max(1, apex.timeMs - 1)), type: "rear-flight", stage: "rear-flight" },
    { timeMs: cutTimeMs, type: "camera-cut", stage: "landing-pickup" },
    { timeMs: Math.min(firstContact.timeMs - 2, cutTimeMs + 520), type: "ball-acquired", stage: "landing-tight" },
    { timeMs: Math.min(firstContact.timeMs - 1, Math.max(cutTimeMs + 521, firstContact.timeMs - 980)), type: "context-open", stage: "landing-context" },
    { timeMs: firstContact.timeMs, type: "first-contact", stage: "landing" },
    { timeMs: bounce.timeMs, type: "bounce", stage: "bounce" },
    { timeMs: roll.timeMs, type: "roll", stage: "roll" },
    { timeMs: tape.durationMs, type: "rest", stage: "rest" },
  ];
  const events = [];
  for (const event of eventCandidates) {
    const previous = events.at(-1);
    const timeMs = Math.min(
      tape.durationMs,
      Math.max(previous ? previous.timeMs + 1 : 0, event.timeMs),
    );
    if (previous && timeMs <= previous.timeMs) {
      continue;
    }
    events.push({ ...event, timeMs });
  }
  const track = deepFreeze({
    schemaVersion: 1,
    id: `${tape.id}-broadcast-camera-v1`,
    durationMs: tape.durationMs,
    apexTimeMs: apex.timeMs,
    cutTimeMs,
    firstContactTimeMs: firstContact.timeMs,
    focalShiftStartTimeMs: cutTimeMs + 740,
    focalShiftEndTimeMs: Math.max(cutTimeMs + 741, firstContact.timeMs - 180),
    shotDistanceMeters: travelDistance,
    landingProfile: shortShot ? "short-shot" : "full-shot-28-5.5",
    rigs: {
      rear: { position: rearPosition, heightAboveTerrain: 1.68 },
      landing: { position: landingPosition, heightAboveTerrain: 1.62 },
    },
    events,
  });
  assertBroadcastCameraTrack(track, tape);
  return track;
}

const northInlet = NORTH_INLET_WORLD;
const rearGround = courseSurfaceElevationAt(northInlet, 1.2, -6);
const landingGround = courseSurfaceElevationAt(northInlet, -2.1, 286.14);

export const NORTH_INLET_BROADCAST_TRACK = deepFreeze({
  schemaVersion: 1,
  id: "north-inlet-broadcast-camera-v1",
  durationMs: 7800,
  apexTimeMs: 2700,
  cutTimeMs: 2860,
  firstContactTimeMs: 5220,
  focalShiftStartTimeMs: 3600,
  focalShiftEndTimeMs: 5000,
  shotDistanceMeters: Math.hypot(-6.8, 256),
  landingProfile: "full-shot-28-5.5",
  rigs: {
    rear: {
      position: { x: 1.2, y: rearGround + 1.68, z: -6 },
      heightAboveTerrain: 1.68,
    },
    landing: {
      position: { x: -2.1, y: landingGround + 1.62, z: 286.14 },
      heightAboveTerrain: 1.62,
    },
  },
  events: [
    { timeMs: 0, type: "rear-ready", stage: "rear-ready" },
    { timeMs: 280, type: "rear-flight", stage: "rear-flight" },
    { timeMs: 2860, type: "camera-cut", stage: "landing-pickup" },
    { timeMs: 3380, type: "ball-acquired", stage: "landing-tight" },
    { timeMs: 4140, type: "context-open", stage: "landing-context" },
    { timeMs: 5220, type: "first-contact", stage: "landing" },
    { timeMs: 5520, type: "bounce", stage: "bounce" },
    { timeMs: 5840, type: "roll", stage: "roll" },
    { timeMs: 7800, type: "rest", stage: "rest" },
  ],
});

assertBroadcastCameraTrack(NORTH_INLET_BROADCAST_TRACK, {
  durationMs: NORTH_INLET_BROADCAST_TRACK.durationMs,
});
