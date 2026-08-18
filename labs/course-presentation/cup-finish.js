import {
  NORTH_INLET_GREEN_PRESENTATION,
  NORTH_INLET_PIN,
  greenSurfaceElevationAt,
} from "./course-renderer.js";

export const GOLF_BALL_DIAMETER_METRES = 0.04267;

const BALL_RADIUS_METRES = GOLF_BALL_DIAMETER_METRES / 2;
const CUP_RADIUS_METRES = NORTH_INLET_GREEN_PRESENTATION.cupDiameter / 2;

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

function greenWorldPosition(position) {
  return {
    x: position.x,
    y: greenSurfaceElevationAt(position.x, position.z) + position.y,
    z: position.z,
  };
}

function distanceToCup(position) {
  return Math.hypot(
    position.x - NORTH_INLET_PIN.x,
    position.z - NORTH_INLET_PIN.z,
  );
}

const cameraPosition = Object.freeze({
  x: NORTH_INLET_PIN.x,
  y: greenSurfaceElevationAt(NORTH_INLET_PIN.x, 383.5) + 1.4,
  z: 383.5,
});

const cupGroundY = greenSurfaceElevationAt(
  NORTH_INLET_PIN.x,
  NORTH_INLET_PIN.z,
);

function cameraFor(track, position, timeMs) {
  const approachProgress = smoothstep(
    track.readyEndTimeMs,
    track.approachEndTimeMs,
    timeMs,
  );
  const resultProgress = smoothstep(
    track.approachEndTimeMs,
    track.resultSettleTimeMs,
    timeMs,
  );
  const targetX = track.outcome === "holed"
    ? mix(position.x, NORTH_INLET_PIN.x, approachProgress)
    : mix(
        position.x,
        (position.x + NORTH_INLET_PIN.x) / 2,
        resultProgress,
      );
  const targetZ = track.outcome === "holed"
    ? mix(position.z, NORTH_INLET_PIN.z, approachProgress)
    : mix(
        position.z,
        (position.z + NORTH_INLET_PIN.z) / 2,
        resultProgress,
      );
  const targetGroundY = greenSurfaceElevationAt(targetX, targetZ);
  const fovDegrees = track.outcome === "holed"
    ? mix(mix(23, 20, approachProgress), 21, resultProgress)
    : mix(mix(23, 20.5, approachProgress), 24, resultProgress);

  return {
    position: { ...cameraPosition },
    target: {
      x: targetX,
      y: targetGroundY + 0.045,
      z: targetZ,
    },
    fovDegrees,
    rollDegrees: 0,
    focalShiftX: 0,
    focalShiftY: -0.09,
  };
}

function sampleHoledPosition(track, timeMs) {
  if (timeMs <= track.readyEndTimeMs) {
    return { ...track.start };
  }
  if (timeMs < track.approachEndTimeMs) {
    const linearProgress =
      (timeMs - track.readyEndTimeMs) /
      (track.approachEndTimeMs - track.readyEndTimeMs);
    const rollProgress =
      linearProgress + 0.35 * linearProgress * (1 - linearProgress);
    return {
      x: mix(track.start.x, track.entry.x, rollProgress),
      y: BALL_RADIUS_METRES,
      z: mix(track.start.z, track.entry.z, rollProgress),
    };
  }
  if (timeMs < track.dropEndTimeMs) {
    const dropProgress =
      (timeMs - track.approachEndTimeMs) /
      (track.dropEndTimeMs - track.approachEndTimeMs);
    return {
      x: track.entry.x,
      y: mix(BALL_RADIUS_METRES, track.bottom.y, dropProgress ** 2),
      z: mix(track.entry.z, track.bottom.z, dropProgress),
    };
  }
  return { ...track.bottom };
}

function sampleMissedPosition(track, timeMs) {
  if (timeMs <= track.readyEndTimeMs) {
    return { ...track.start };
  }
  if (timeMs < track.passTimeMs) {
    const linearProgress =
      (timeMs - track.readyEndTimeMs) /
      (track.passTimeMs - track.readyEndTimeMs);
    const rollProgress =
      linearProgress + 0.25 * linearProgress * (1 - linearProgress);
    return {
      x: track.start.x,
      y: BALL_RADIUS_METRES,
      z: mix(track.start.z, track.pass.z, rollProgress),
    };
  }
  if (timeMs < track.approachEndTimeMs) {
    const linearProgress =
      (timeMs - track.passTimeMs) /
      (track.approachEndTimeMs - track.passTimeMs);
    const rollProgress = 1 - (1 - linearProgress) ** 2;
    return {
      x: track.start.x,
      y: BALL_RADIUS_METRES,
      z: mix(track.pass.z, track.rest.z, rollProgress),
    };
  }
  return { ...track.rest };
}

function stageFor(track, timeMs) {
  if (timeMs <= track.readyEndTimeMs) {
    return "ready";
  }
  if (track.outcome === "holed") {
    if (timeMs < track.approachEndTimeMs) {
      return "approach";
    }
    if (timeMs < track.dropEndTimeMs) {
      return "drop";
    }
    return "holed";
  }
  if (timeMs < track.passTimeMs) {
    return "approach";
  }
  if (timeMs < track.approachEndTimeMs) {
    return "slide-past";
  }
  return "rest";
}

export function assertCupFinishTrack(track) {
  if (!track || track.schemaVersion !== 1) {
    throw new TypeError("Cup finish schemaVersion must be 1");
  }
  const orderedTimes = track.outcome === "holed"
    ? [
        track.readyEndTimeMs,
        track.approachEndTimeMs,
        track.dropEndTimeMs,
        track.resultSettleTimeMs,
        track.durationMs,
      ]
    : [
        track.readyEndTimeMs,
        track.passTimeMs,
        track.approachEndTimeMs,
        track.resultSettleTimeMs,
        track.durationMs,
      ];
  if (
    orderedTimes.some((timeMs) => !Number.isFinite(timeMs)) ||
    orderedTimes.some(
      (timeMs, index) => index > 0 && timeMs <= orderedTimes[index - 1],
    )
  ) {
    throw new RangeError("Cup finish times must be finite and ordered");
  }
  if (track.outcome === "holed") {
    const captureMargin = CUP_RADIUS_METRES - BALL_RADIUS_METRES;
    if (distanceToCup(track.entry) > captureMargin) {
      throw new RangeError("Holed finish must enter inside the capture margin");
    }
    if (track.bottom.y + BALL_RADIUS_METRES >= 0) {
      throw new RangeError("Holed finish must end below the green surface");
    }
  } else if (track.outcome === "missed") {
    const edgeClearance = CUP_RADIUS_METRES + BALL_RADIUS_METRES;
    if (Math.abs(track.start.x - NORTH_INLET_PIN.x) <= edgeClearance) {
      throw new RangeError("Missed finish must remain outside the cup edge");
    }
  } else {
    throw new TypeError("Cup finish outcome must be holed or missed");
  }
  return true;
}

export function sampleCupFinish(track, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, track.durationMs);
  const position = track.outcome === "holed"
    ? sampleHoledPosition(track, timeMs)
    : sampleMissedPosition(track, timeMs);
  const cupEntry =
    track.outcome === "holed" && timeMs >= track.approachEndTimeMs;
  const clipToCup = cupEntry && position.y <= 0;
  const visible = position.y + BALL_RADIUS_METRES > 0;
  const shadowAlpha = track.outcome === "holed"
    ? 1 -
      smoothstep(
        track.approachEndTimeMs - 160,
        track.approachEndTimeMs,
        timeMs,
      )
    : 1;
  const worldPosition = greenWorldPosition(position);
  const shadowPosition = greenWorldPosition({
    x: position.x,
    y: 0.008,
    z: position.z,
  });

  return {
    timeMs,
    stage: stageFor(track, timeMs),
    outcome: track.outcome,
    distanceToCupMetres: distanceToCup(position),
    ball: {
      position,
      worldPosition,
      shadowWorldPosition: shadowPosition,
      radiusMetres: BALL_RADIUS_METRES,
      visible,
      cupEntry,
      clipToCup,
      shadowAlpha,
    },
    camera: cameraFor(track, position, timeMs),
  };
}

export const NORTH_INLET_CUP_FINISHES = deepFreeze({
  holed: {
    schemaVersion: 1,
    id: "north-inlet-holed-finish-v1",
    outcome: "holed",
    durationMs: 3200,
    readyEndTimeMs: 220,
    approachEndTimeMs: 1820,
    dropEndTimeMs: 2010,
    resultSettleTimeMs: 2320,
    start: {
      x: NORTH_INLET_PIN.x + 0.018,
      y: BALL_RADIUS_METRES,
      z: NORTH_INLET_PIN.z - 1.45,
    },
    entry: {
      x: NORTH_INLET_PIN.x + 0.018,
      y: BALL_RADIUS_METRES,
      z: NORTH_INLET_PIN.z,
    },
    bottom: {
      x: NORTH_INLET_PIN.x + 0.018,
      y: -0.12,
      z: NORTH_INLET_PIN.z + 0.014,
    },
  },
  missed: {
    schemaVersion: 1,
    id: "north-inlet-near-miss-v1",
    outcome: "missed",
    durationMs: 3400,
    readyEndTimeMs: 220,
    passTimeMs: 1810,
    approachEndTimeMs: 2580,
    resultSettleTimeMs: 2780,
    start: {
      x: NORTH_INLET_PIN.x + 0.105,
      y: BALL_RADIUS_METRES,
      z: NORTH_INLET_PIN.z - 1.45,
    },
    pass: {
      x: NORTH_INLET_PIN.x + 0.105,
      y: BALL_RADIUS_METRES,
      z: NORTH_INLET_PIN.z + 0.12,
    },
    rest: {
      x: NORTH_INLET_PIN.x + 0.105,
      y: BALL_RADIUS_METRES,
      z: NORTH_INLET_PIN.z + 0.55,
    },
  },
});

assertCupFinishTrack(NORTH_INLET_CUP_FINISHES.holed);
assertCupFinishTrack(NORTH_INLET_CUP_FINISHES.missed);

export const CUP_FINISH_VISUAL_AUTHORITY = deepFreeze({
  ballDiameterMetres: GOLF_BALL_DIAMETER_METRES,
  cupDiameterMetres: NORTH_INLET_GREEN_PRESENTATION.cupDiameter,
  cupGroundY,
  layerOrder: ["cup-interior", "flagstick", "ball", "cup-front-rim"],
});
