const VECTOR_KEYS = ['x', 'y', 'z'];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isFiniteVector(vector) {
  return vector && VECTOR_KEYS.every((key) => Number.isFinite(vector[key]));
}

function hermiteScalar(from, to, fromVelocity, toVelocity, durationSeconds, progress) {
  const squared = progress * progress;
  const cubed = squared * progress;
  const h00 = 2 * cubed - 3 * squared + 1;
  const h10 = cubed - 2 * squared + progress;
  const h01 = -2 * cubed + 3 * squared;
  const h11 = cubed - squared;
  return (
    h00 * from +
    h10 * fromVelocity * durationSeconds +
    h01 * to +
    h11 * toVelocity * durationSeconds
  );
}

function hermiteVector(from, to, fromVelocity, toVelocity, durationSeconds, progress) {
  return {
    x: hermiteScalar(
      from.x,
      to.x,
      fromVelocity.x,
      toVelocity.x,
      durationSeconds,
      progress
    ),
    y: hermiteScalar(
      from.y,
      to.y,
      fromVelocity.y,
      toVelocity.y,
      durationSeconds,
      progress
    ),
    z: hermiteScalar(
      from.z,
      to.z,
      fromVelocity.z,
      toVelocity.z,
      durationSeconds,
      progress
    )
  };
}

function stageAt(events, timeMs) {
  let stage = events[0].stage;
  for (const event of events) {
    if (event.timeMs > timeMs) {
      break;
    }
    stage = event.stage;
  }
  return stage;
}

export function assertCinematicFlybyTrack(track) {
  if (!track || track.schemaVersion !== 1) {
    throw new TypeError('Cinematic flyby schemaVersion must be 1');
  }

  if (!Number.isFinite(track.durationMs) || track.durationMs <= 0) {
    throw new RangeError('Cinematic flyby duration must be positive');
  }

  if (!Array.isArray(track.keyframes) || track.keyframes.length < 2) {
    throw new RangeError('Cinematic flyby requires at least two keyframes');
  }

  if (
    track.keyframes[0].timeMs !== 0 ||
    track.keyframes.at(-1).timeMs !== track.durationMs
  ) {
    throw new RangeError('Cinematic flyby keyframes must cover the full duration');
  }

  for (let index = 0; index < track.keyframes.length; index += 1) {
    const keyframe = track.keyframes[index];
    if (
      !Number.isFinite(keyframe.timeMs) ||
      !isFiniteVector(keyframe.position) ||
      !isFiniteVector(keyframe.target) ||
      !isFiniteVector(keyframe.positionVelocity) ||
      !isFiniteVector(keyframe.targetVelocity) ||
      !Number.isFinite(keyframe.fovDegrees) ||
      !Number.isFinite(keyframe.fovVelocityDegreesPerSecond) ||
      !Number.isFinite(keyframe.rollDegrees) ||
      !Number.isFinite(keyframe.rollVelocityDegreesPerSecond) ||
      !Number.isFinite(keyframe.focalShiftY)
    ) {
      throw new TypeError(`Cinematic keyframe ${index} is invalid`);
    }

    if (index > 0 && keyframe.timeMs <= track.keyframes[index - 1].timeMs) {
      throw new RangeError('Cinematic keyframes must be strictly ordered');
    }

    if (keyframe.fovDegrees < 36 || keyframe.fovDegrees > 50) {
      throw new RangeError('Cinematic keyframe FOV must stay between 36 and 50 degrees');
    }

    if (Math.abs(keyframe.rollDegrees) > 2.5) {
      throw new RangeError('Cinematic keyframe roll must stay within 2.5 degrees');
    }
  }

  if (!Array.isArray(track.events) || track.events.length < 2) {
    throw new RangeError('Cinematic flyby requires explicit events');
  }

  for (let index = 0; index < track.events.length; index += 1) {
    const event = track.events[index];
    if (
      !Number.isFinite(event.timeMs) ||
      event.timeMs < 0 ||
      event.timeMs > track.durationMs ||
      typeof event.type !== 'string' ||
      typeof event.stage !== 'string'
    ) {
      throw new TypeError(`Cinematic event ${index} is invalid`);
    }
    if (index > 0 && event.timeMs <= track.events[index - 1].timeMs) {
      throw new RangeError('Cinematic events must be strictly ordered');
    }
  }

  return true;
}

export function sampleCinematicFlyby(track, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, track.durationMs);
  if (timeMs === track.durationMs) {
    const keyframe = track.keyframes.at(-1);
    return {
      timeMs,
      progress: 1,
      stage: stageAt(track.events, timeMs),
      segmentIndex: track.keyframes.length - 2,
      segmentProgress: 1,
      camera: {
        position: { ...keyframe.position },
        target: { ...keyframe.target },
        fovDegrees: keyframe.fovDegrees,
        rollDegrees: keyframe.rollDegrees,
        focalShiftY: keyframe.focalShiftY
      }
    };
  }

  let low = 0;
  let high = track.keyframes.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (track.keyframes[middle].timeMs <= timeMs) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const from = track.keyframes[low];
  const to = track.keyframes[high];
  const segmentDurationMs = to.timeMs - from.timeMs;
  const segmentProgress = (timeMs - from.timeMs) / segmentDurationMs;
  const durationSeconds = segmentDurationMs / 1000;

  return {
    timeMs,
    progress: timeMs / track.durationMs,
    stage: stageAt(track.events, timeMs),
    segmentIndex: low,
    segmentProgress,
    camera: {
      position: hermiteVector(
        from.position,
        to.position,
        from.positionVelocity,
        to.positionVelocity,
        durationSeconds,
        segmentProgress
      ),
      target: hermiteVector(
        from.target,
        to.target,
        from.targetVelocity,
        to.targetVelocity,
        durationSeconds,
        segmentProgress
      ),
      fovDegrees: hermiteScalar(
        from.fovDegrees,
        to.fovDegrees,
        from.fovVelocityDegreesPerSecond,
        to.fovVelocityDegreesPerSecond,
        durationSeconds,
        segmentProgress
      ),
      rollDegrees: hermiteScalar(
        from.rollDegrees,
        to.rollDegrees,
        from.rollVelocityDegreesPerSecond,
        to.rollVelocityDegreesPerSecond,
        durationSeconds,
        segmentProgress
      ),
      focalShiftY:
        from.focalShiftY + (to.focalShiftY - from.focalShiftY) * segmentProgress
    }
  };
}

export function flybyEventAt(track, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, track.durationMs);
  let current = track.events[0];
  for (const event of track.events) {
    if (event.timeMs > timeMs) {
      break;
    }
    current = event;
  }
  return current;
}

export function sampleReducedFlyby(track, requestedTimeMs) {
  const timeMs = clamp(requestedTimeMs, 0, track.durationMs);
  const still =
    track.stills.find(
      (candidate) => timeMs >= candidate.startMs && timeMs < candidate.endMs
    ) ?? track.stills.at(-1);
  return {
    timeMs,
    progress: timeMs / track.durationMs,
    stage: still.stage,
    camera: {
      position: { ...still.camera.position },
      target: { ...still.camera.target },
      fovDegrees: still.camera.fovDegrees,
      rollDegrees: still.camera.rollDegrees,
      focalShiftY: still.camera.focalShiftY
    }
  };
}
