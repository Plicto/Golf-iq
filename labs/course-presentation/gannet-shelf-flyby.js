import { assertCinematicFlybyTrack } from "./cinematic-flyby.js";

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export const GANNET_SHELF_CINEMATIC_FLYBY = deepFreeze({
  schemaVersion: 1,
  id: 'gannet-shelf-cinematic-drone-flyby-v1',
  durationMs: 6900,
  keyframes: [
    {
      timeMs: 0,
      position: { x: -40, y: 18, z: -22 },
      target: { x: 0, y: 0.6, z: 38 },
      positionVelocity: { x: 0, y: 0, z: 0 },
      targetVelocity: { x: 0, y: 0, z: 0 },
      fovDegrees: 48,
      fovVelocityDegreesPerSecond: 0,
      rollDegrees: 0,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.055
    },
    {
      timeMs: 900,
      position: { x: -8, y: 22, z: 8 },
      target: { x: -4, y: 0.8, z: 62 },
      positionVelocity: { x: 24, y: 5, z: 36 },
      targetVelocity: { x: -2, y: 0.4, z: 34 },
      fovDegrees: 46,
      fovVelocityDegreesPerSecond: -1.4,
      rollDegrees: -1.5,
      rollVelocityDegreesPerSecond: -0.4,
      focalShiftY: 0.044
    },
    {
      timeMs: 2400,
      position: { x: 34, y: 33, z: 72 },
      target: { x: -8, y: 1.4, z: 135 },
      positionVelocity: { x: 10, y: 6, z: 44 },
      targetVelocity: { x: -3, y: 0.7, z: 46 },
      fovDegrees: 43,
      fovVelocityDegreesPerSecond: -1.2,
      rollDegrees: -2.2,
      rollVelocityDegreesPerSecond: 0.2,
      focalShiftY: 0.031
    },
    {
      timeMs: 3900,
      position: { x: 25, y: 41, z: 136 },
      target: { x: -7, y: 3.4, z: 168 },
      positionVelocity: { x: -18, y: 1, z: 37 },
      targetVelocity: { x: -1, y: 0.2, z: 17 },
      fovDegrees: 39,
      fovVelocityDegreesPerSecond: -1,
      rollDegrees: 0.7,
      rollVelocityDegreesPerSecond: 1,
      focalShiftY: 0.018
    },
    {
      timeMs: 5600,
      position: { x: -35, y: 30, z: 188 },
      target: { x: -9, y: 3.7, z: 176 },
      positionVelocity: { x: -19, y: -4, z: 16 },
      targetVelocity: { x: 0, y: 0, z: 4 },
      fovDegrees: 37,
      fovVelocityDegreesPerSecond: 0,
      rollDegrees: 1.8,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.012
    },
    {
      timeMs: 6700,
      position: { x: -44, y: 27, z: 202 },
      target: { x: -9, y: 3.7, z: 176 },
      positionVelocity: { x: 0, y: 0, z: 0 },
      targetVelocity: { x: 0, y: 0, z: 0 },
      fovDegrees: 38,
      fovVelocityDegreesPerSecond: 0,
      rollDegrees: 0,
      rollVelocityDegreesPerSecond: 0,
      focalShiftY: 0.018
    },
    {
      timeMs: 6900,
      position: { x: -44, y: 27, z: 202 },
      target: { x: -9, y: 3.7, z: 176 },
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
    { timeMs: 500, type: 'tee-reveal', stage: 'tee' },
    { timeMs: 1800, type: 'carry-reveal', stage: 'decision' },
    { timeMs: 3500, type: 'green-reveal', stage: 'green' },
    { timeMs: 6200, type: 'flyby-settled', stage: 'settled' },
    { timeMs: 6900, type: 'flyby-complete', stage: 'complete' }
  ]
});

assertCinematicFlybyTrack(GANNET_SHELF_CINEMATIC_FLYBY);

export const GANNET_SHELF_REDUCED_FLYBY = deepFreeze({
  schemaVersion: 1,
  id: 'gannet-shelf-reduced-flyby-v1',
  durationMs: 2600,
  stills: [
    {
      startMs: 0,
      endMs: 1500,
      stage: 'overview',
      camera: {
        position: { x: -108, y: 76, z: -34 },
        target: { x: -1, y: 1.7, z: 92 },
        fovDegrees: 47,
        rollDegrees: 0,
        focalShiftY: 0.04
      }
    },
    {
      startMs: 1500,
      endMs: 2600,
      stage: 'green',
      camera: {
        position: { x: -44, y: 27, z: 202 },
        target: { x: -9, y: 3.7, z: 176 },
        fovDegrees: 38,
        rollDegrees: 0,
        focalShiftY: 0.018
      }
    }
  ]
});

