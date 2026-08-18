import { assertCinematicFlybyTrack } from "./cinematic-flyby.js";
import {
  NORTH_INLET_CINEMATIC_FLYBY,
  NORTH_INLET_REDUCED_FLYBY,
} from "./north-inlet-flyby.js";

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const machairPoint = (point) => ({
  ...point,
  x: point.x * 1.08,
  z: point.z * (382 / 389),
});

const machairVelocity = (velocity) => ({
  ...velocity,
  x: velocity.x * 1.08,
  z: velocity.z * (382 / 389),
});

export const MACHAIR_RUN_CINEMATIC_FLYBY = deepFreeze({
  ...NORTH_INLET_CINEMATIC_FLYBY,
  id: 'machair-run-cinematic-drone-flyby-v1',
  keyframes: NORTH_INLET_CINEMATIC_FLYBY.keyframes.map((keyframe) => ({
    ...keyframe,
    position: machairPoint(keyframe.position),
    target: machairPoint(keyframe.target),
    positionVelocity: machairVelocity(keyframe.positionVelocity),
    targetVelocity: machairVelocity(keyframe.targetVelocity)
  }))
});

assertCinematicFlybyTrack(MACHAIR_RUN_CINEMATIC_FLYBY);

export const MACHAIR_RUN_REDUCED_FLYBY = deepFreeze({
  ...NORTH_INLET_REDUCED_FLYBY,
  id: 'machair-run-reduced-flyby-v1',
  stills: NORTH_INLET_REDUCED_FLYBY.stills.map((still) => ({
    ...still,
    camera: {
      ...still.camera,
      position: machairPoint(still.camera.position),
      target: machairPoint(still.camera.target)
    }
  }))
});

