const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const freezePreset = (preset) => Object.freeze(preset);

export const MODE_PROFILES = Object.freeze({
  iron: Object.freeze({
    id: 'iron',
    label: 'Players Cavity 7i',
    shortLabel: '7i',
    maximumBackswingPixels: 116,
    throughPixels: 68,
    railHalfWidthPixels: 26,
    headOffset: Object.freeze({ x: 52, y: -70 }),
    faceHalfWidthPixels: 30,
    maximumDistanceMeters: 155,
    presets: Object.freeze([
      freezePreset({
        id: 'iron-90',
        label: '90 m',
        distanceMeters: 90,
        backswingPixels: 71
      }),
      freezePreset({
        id: 'iron-125',
        label: '125 m',
        distanceMeters: 125,
        backswingPixels: 96
      }),
      freezePreset({
        id: 'iron-155',
        label: '155 m',
        distanceMeters: 155,
        backswingPixels: 116
      })
    ])
  }),
  putter: Object.freeze({
    id: 'putter',
    label: 'Origo Fang Mallet',
    shortLabel: 'Putter',
    maximumBackswingPixels: 160,
    throughPixels: 54,
    railHalfWidthPixels: 20,
    headOffset: Object.freeze({ x: 54, y: -62 }),
    faceHalfWidthPixels: 32,
    maximumDistanceMeters: 15,
    presets: Object.freeze([
      freezePreset({
        id: 'putt-2',
        label: '2 m',
        distanceMeters: 2,
        backswingPixels: 54
      }),
      freezePreset({
        id: 'putt-6',
        label: '6 m',
        distanceMeters: 6,
        backswingPixels: 97
      }),
      freezePreset({
        id: 'putt-15',
        label: '15 m',
        distanceMeters: 15,
        backswingPixels: 160
      })
    ])
  })
});

export const SHAPE_PROFILES = Object.freeze({
  straight: Object.freeze({
    id: 'straight',
    label: 'Straight',
    faceDegrees: 0,
    intendedPathDegrees: 0
  }),
  draw: Object.freeze({
    id: 'draw',
    label: 'Draw',
    faceDegrees: 1.05,
    intendedPathDegrees: 3.25
  }),
  fade: Object.freeze({
    id: 'fade',
    label: 'Fade',
    faceDegrees: -0.75,
    intendedPathDegrees: -3
  })
});

export function modeProfile(modeId) {
  const profile = MODE_PROFILES[modeId];
  if (!profile) throw new RangeError(`Unsupported FaceRail mode: ${modeId}`);
  return profile;
}

export function shapeProfile(shapeId) {
  const profile = SHAPE_PROFILES[shapeId];
  if (!profile) throw new RangeError(`Unsupported FaceRail shape: ${shapeId}`);
  return profile;
}

export function distancePreset(modeId, presetId) {
  const preset = modeProfile(modeId).presets.find((candidate) => candidate.id === presetId);
  if (!preset) throw new RangeError(`Unsupported FaceRail distance preset: ${presetId}`);
  return preset;
}

export function railCenterX({ addressGripX, addressGripY, gripY, pathDegrees }) {
  const radians = (pathDegrees / 180) * Math.PI;
  return addressGripX + Math.tan(radians) * (addressGripY - gripY);
}

export function clampGripToRail({
  requestedX,
  requestedY,
  addressGripX,
  addressGripY,
  pathDegrees,
  railHalfWidthPixels,
  minimumY,
  maximumY
}) {
  const y = clamp(requestedY, minimumY, maximumY);
  const centerX = railCenterX({
    addressGripX,
    addressGripY,
    gripY: y,
    pathDegrees
  });
  return Object.freeze({
    x: clamp(requestedX, centerX - railHalfWidthPixels, centerX + railHalfWidthPixels),
    y,
    centerX,
    railContact: Math.abs(requestedX - centerX) >= railHalfWidthPixels
  });
}

const median = (values) => {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
};

const validateSamples = (samples) =>
  samples
    .filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.y))
    .map((sample, index) =>
      Object.freeze({
        x: sample.x,
        y: sample.y,
        sequence: sample.sequence ?? index
      })
    );

const latestForwardPass = (samples) => {
  if (samples.length < 2) return samples;
  const pass = [samples.at(-1)];
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const candidate = samples[index];
    const next = pass[0];
    if (candidate.y < next.y - 0.25) break;
    if (Math.hypot(candidate.x - next.x, candidate.y - next.y) >= 0.2) pass.unshift(candidate);
  }
  return pass.length >= 2 ? pass : samples.slice(-2);
};

const resampleForwardPass = (samples, stationCount = 9) => {
  const pass = latestForwardPass(samples);
  if (pass.length < 2) return pass;
  const startY = pass[0].y;
  const endY = pass.at(-1).y;
  const forwardSpan = startY - endY;
  if (forwardSpan < 1) return pass;
  const stations = [];
  const stationStep = forwardSpan / (stationCount - 1);
  const averagingRadius = Math.max(1, stationStep * 0.62);
  for (let station = 0; station < stationCount; station += 1) {
    const ratio = station / (stationCount - 1);
    const targetY = startY - forwardSpan * ratio;
    let left = pass[0];
    let right = pass.at(-1);
    for (let index = 1; index < pass.length; index += 1) {
      if (pass[index].y <= targetY) {
        left = pass[index - 1];
        right = pass[index];
        break;
      }
    }
    const span = left.y - right.y;
    const segmentRatio = span <= 0.0001 ? 0 : clamp((left.y - targetY) / span, 0, 1);
    const nearby = pass.filter((sample) => Math.abs(sample.y - targetY) <= averagingRadius);
    const weighted = nearby.reduce(
      (total, sample) => {
        const weight = 1 - Math.abs(sample.y - targetY) / averagingRadius;
        return {
          value: total.value + sample.x * weight,
          weight: total.weight + weight
        };
      },
      { value: 0, weight: 0 }
    );
    const interpolatedX = left.x + (right.x - left.x) * segmentRatio;
    stations.push(
      Object.freeze({
        x: weighted.weight > 0.0001 ? weighted.value / weighted.weight : interpolatedX,
        y: targetY,
        sequence: station
      })
    );
  }
  return stations;
};

export function fitImpactPath(samples) {
  const valid = resampleForwardPass(validateSamples(samples));
  if (valid.length < 2) {
    return Object.freeze({
      pathDegrees: 0,
      residualPixels: 0,
      sampleCount: valid.length
    });
  }

  const slopes = [];
  for (let leftIndex = 0; leftIndex < valid.length - 1; leftIndex += 1) {
    const left = valid[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < valid.length; rightIndex += 1) {
      const right = valid[rightIndex];
      const forwardPixels = left.y - right.y;
      if (Math.abs(forwardPixels) >= 4) slopes.push((right.x - left.x) / forwardPixels);
    }
  }

  const slope = slopes.length > 0 ? median(slopes) : 0;
  const intercept = median(valid.map((sample) => sample.x - slope * -sample.y));
  const residualPixels = median(valid.map((sample) => Math.abs(sample.x - (intercept + slope * -sample.y))));
  const pathDegrees = (Math.atan(slope) / Math.PI) * 180;
  return Object.freeze({
    pathDegrees,
    residualPixels,
    sampleCount: valid.length
  });
}

const fnv1a = (value) => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const fixed = (value, digits = 3) => Number(value.toFixed(digits));

export function resolveSwingDelivery({
  modeId,
  shapeId,
  backswingPixels,
  impactHeadCenterX,
  ballCenterX,
  impactSamples,
  directionReversals = 1,
  connectionBasisPoints = 10_000
}) {
  const mode = modeProfile(modeId);
  const shape = modeId === 'putter' ? SHAPE_PROFILES.straight : shapeProfile(shapeId);
  const fit = fitImpactPath(impactSamples);
  const normalizedBackswing = clamp(backswingPixels / mode.maximumBackswingPixels, 0, 1.05);
  const connection = clamp(connectionBasisPoints, 4_500, 10_000) / 10_000;
  const contactFloor = modeId === 'putter' ? 0.005 : 0.015;
  const energyBasisPoints = Math.round(
    clamp((contactFloor + (1 - contactFloor) * normalizedBackswing) * connection, contactFloor, 1.05) * 10_000
  );
  const strikeOffsetPixels = impactHeadCenterX - ballCenterX;
  const strikeHeelToeBasisPoints = Math.round(clamp(strikeOffsetPixels / mode.faceHalfWidthPixels, -1, 1) * 10_000);
  const faceToTargetDegrees = shape.faceDegrees;
  const pathToTargetDegrees = shape.intendedPathDegrees + clamp(fit.pathDegrees - shape.intendedPathDegrees, -8, 8);
  const faceToPathDegrees = faceToTargetDegrees - pathToTargetDegrees;
  const reversalPenalty = Math.max(0, directionReversals - 1) * 720;
  const residualPenalty = Math.round(fit.residualPixels * 520);
  const tempoQualityBasisPoints = Math.round(clamp(10_000 - reversalPenalty - residualPenalty, 4_500, 10_000));
  const payload = [
    modeId,
    shape.id,
    energyBasisPoints,
    fixed(faceToTargetDegrees),
    fixed(pathToTargetDegrees),
    strikeHeelToeBasisPoints,
    tempoQualityBasisPoints
  ].join(':');

  return Object.freeze({
    schemaVersion: 1,
    id: `swing-delivery-${fnv1a(payload).toString(16).padStart(8, '0')}`,
    modeId,
    shapeId: shape.id,
    energyBasisPoints,
    faceToTargetMilliDegrees: Math.round(faceToTargetDegrees * 1_000),
    pathToTargetMilliDegrees: Math.round(pathToTargetDegrees * 1_000),
    faceToPathMilliDegrees: Math.round(faceToPathDegrees * 1_000),
    strikeHeelToeBasisPoints,
    tempoQualityBasisPoints,
    evidence: Object.freeze({
      backswingPixels: fixed(backswingPixels, 2),
      impactSampleCount: fit.sampleCount,
      impactResidualPixels: fixed(fit.residualPixels, 2),
      directionReversals,
      connectionBasisPoints: Math.round(connection * 10_000)
    })
  });
}

const strikeLabel = (basisPoints) => {
  if (basisPoints <= -2_200) return 'Toe';
  if (basisPoints >= 2_200) return 'Heel';
  return 'Center';
};

const ironFlightLabel = (faceToPathDegrees, strike) => {
  if (Math.abs(strike) >= 6_500) return strike < 0 ? 'Heavy toe strike' : 'Heavy heel strike';
  if (faceToPathDegrees <= -0.7) return 'Draw';
  if (faceToPathDegrees >= 0.7) return 'Fade';
  return 'Straight';
};

const puttLabel = (startDegrees) => {
  if (startDegrees >= 0.35) return 'Push';
  if (startDegrees <= -0.35) return 'Pull';
  return 'On line';
};

export function resolveDeliveryPreview(delivery, presetId) {
  const mode = modeProfile(delivery.modeId);
  const preset = distancePreset(delivery.modeId, presetId);
  const energy = clamp(delivery.energyBasisPoints / 10_000, 0, 1.05);
  const faceDegrees = delivery.faceToTargetMilliDegrees / 1_000;
  const pathDegrees = delivery.pathToTargetMilliDegrees / 1_000;
  const faceToPathDegrees = delivery.faceToPathMilliDegrees / 1_000;
  const strike = delivery.strikeHeelToeBasisPoints;
  const retention = 1 - (delivery.modeId === 'putter' ? 0.08 : 0.16) * (Math.abs(strike) / 10_000);
  const startDegrees =
    delivery.modeId === 'putter' ? faceDegrees * 0.9 + pathDegrees * 0.1 : faceDegrees * 0.82 + pathDegrees * 0.18;
  const distanceMeters =
    delivery.modeId === 'putter'
      ? mode.maximumDistanceMeters * energy ** 1.85 * retention
      : mode.maximumDistanceMeters * energy ** 1.1 * retention;
  const retainedDistanceMeters = delivery.energyBasisPoints > 0 ? Math.max(0.01, distanceMeters) : 0;
  const startLateralMeters = Math.tan((startDegrees / 180) * Math.PI) * distanceMeters;
  const curveLateralMeters =
    delivery.modeId === 'putter' ? 0 : Math.tan(((faceToPathDegrees * 0.82) / 180) * Math.PI) * distanceMeters;
  const endLateralMeters = startLateralMeters + curveLateralMeters;

  return Object.freeze({
    schemaVersion: 1,
    deliveryId: delivery.id,
    modeId: delivery.modeId,
    presetId,
    targetDistanceMeters: preset.distanceMeters,
    distanceMeters: fixed(retainedDistanceMeters, 2),
    distanceErrorMeters: fixed(retainedDistanceMeters - preset.distanceMeters, 2),
    startDegrees: fixed(startDegrees, 3),
    faceToPathDegrees: fixed(faceToPathDegrees, 3),
    endLateralMeters: fixed(endLateralMeters, 2),
    strikeLabel: strikeLabel(strike),
    resultLabel: delivery.modeId === 'putter' ? puttLabel(startDegrees) : ironFlightLabel(faceToPathDegrees, strike),
    authority:
      'This isolated preview visualizes delivery only. It does not call, replace, or modify Golf IQ launch, flight, wind, landing, bounce, roll, terrain, or cup physics.'
  });
}

