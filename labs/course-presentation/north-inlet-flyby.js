import { assertCinematicFlybyTrack } from "./cinematic-flyby.js";

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export const NORTH_INLET_CINEMATIC_FLYBY = deepFreeze({
  schemaVersion: 1,
  id: 'north-inlet-cinematic-drone-flyby-v1',
  durationMs: 8400,
  keyframes: [
    {
      timeMs: 0,
      position: { x: -30, y: 20, z: -30 },
      target: { x: 0, y: 1, z: 62 },
      positionVelocity: { x: 0, y: 0, z: 0 },
      targetVelocity: { x: 0, y: 0, z: 0 },
      fovDegrees: 48,
      fovVelocityDegreesPerSecond: 0,
      rollDegrees: 0,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.055
    },
    {
      timeMs: 1000,
      position: { x: -5, y: 24, z: 10 },
      target: { x: -2, y: 1, z: 95 },
      positionVelocity: { x: 17, y: 5, z: 53 },
      targetVelocity: { x: -4, y: 0, z: 51 },
      fovDegrees: 46,
      fovVelocityDegreesPerSecond: -1.2,
      rollDegrees: -1.6,
      rollVelocityDegreesPerSecond: -0.5,
      focalShiftY: 0.045
    },
    {
      timeMs: 3000,
      position: { x: 20, y: 36, z: 130 },
      target: { x: -11, y: 1, z: 215 },
      positionVelocity: { x: 8, y: 6, z: 61 },
      targetVelocity: { x: 2, y: 0, z: 60 },
      fovDegrees: 43,
      fovVelocityDegreesPerSecond: -1.1,
      rollDegrees: -2.4,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.032
    },
    {
      timeMs: 5000,
      position: { x: 25, y: 48, z: 255 },
      target: { x: 4, y: 1, z: 335 },
      positionVelocity: { x: -9, y: 2, z: 60 },
      targetVelocity: { x: 5, y: 0, z: 44 },
      fovDegrees: 40,
      fovVelocityDegreesPerSecond: -1,
      rollDegrees: 0.8,
      rollVelocityDegreesPerSecond: 1.1,
      focalShiftY: 0.02
    },
    {
      timeMs: 7000,
      position: { x: -15, y: 44, z: 370 },
      target: { x: 8.5, y: 1, z: 389 },
      positionVelocity: { x: -20, y: -4, z: 49 },
      targetVelocity: { x: 1, y: 0, z: 17 },
      fovDegrees: 37,
      fovVelocityDegreesPerSecond: 0,
      rollDegrees: 2.1,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.012
    },
    {
      timeMs: 8200,
      position: { x: -40, y: 36, z: 412 },
      target: { x: 8.5, y: 1, z: 389 },
      positionVelocity: { x: 0, y: 0, z: 0 },
      targetVelocity: { x: 0, y: 0, z: 0 },
      fovDegrees: 38,
      fovVelocityDegreesPerSecond: 0,
      rollDegrees: 0,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.018
    },
    {
      timeMs: 8400,
      position: { x: -40, y: 36, z: 412 },
      target: { x: 8.5, y: 1, z: 389 },
      positionVelocity: { x: 0, y: 0, z: 0 },
      targetVelocity: { x: 0, y: 0, z: 0 },
      fovDegrees: 38,
      fovVelocityDegreesPerSecond: 0,
      rollDegrees: 0,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.018
    }
  ],
  events: [
    { timeMs: 0, type: 'flyby-start', stage: 'lifting' },
    { timeMs: 550, type: 'tee-reveal', stage: 'tee' },
    { timeMs: 2300, type: 'decision-reveal', stage: 'decision' },
    { timeMs: 4600, type: 'green-reveal', stage: 'green' },
    { timeMs: 7600, type: 'flyby-settled', stage: 'settled' },
    { timeMs: 8400, type: 'flyby-complete', stage: 'complete' }
  ]
});

assertCinematicFlybyTrack(NORTH_INLET_CINEMATIC_FLYBY);

export const NORTH_INLET_REDUCED_FLYBY = deepFreeze({
  schemaVersion: 1,
  id: 'north-inlet-reduced-flyby-v1',
  durationMs: 3000,
  stills: [
    {
      startMs: 0,
      endMs: 1800,
      stage: 'overview',
      camera: {
        position: { x: -132, y: 112, z: -58 },
        target: { x: 2, y: 1.5, z: 196 },
        fovDegrees: 47,
        rollDegrees: 0,
        focalShiftY: 0.04
      }
    },
    {
      startMs: 1800,
      endMs: 3000,
      stage: 'green',
      camera: {
        position: { x: -40, y: 34, z: 412 },
        target: { x: 8.5, y: 1, z: 389 },
        fovDegrees: 38,
        rollDegrees: 0,
        focalShiftY: 0.018
      }
    }
  ]
});

