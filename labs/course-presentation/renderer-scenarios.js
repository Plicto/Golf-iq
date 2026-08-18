import {
  createBroadcastCameraTrack,
  sampleBroadcastPresentation,
} from "./broadcast-camera.js";
import {
  NORTH_INLET_BROADCAST_TRACER,
  sampleBroadcastTracer,
} from "./broadcast-tracer.js";
import { NORTH_INLET_DRIVE_TAPE } from "./presentation-tape.js";
import { NORTH_INLET_RECOVERY_HOLE_PACKAGE } from "./north-inlet-hole-package.js";
import { RENDERER_SCENARIO_IDS } from "./renderer-probe-contract.js";

export { RENDERER_SCENARIO_IDS };

const northInletPresentation = NORTH_INLET_RECOVERY_HOLE_PACKAGE.presentation;
const northInletDescriptor = NORTH_INLET_RECOVERY_HOLE_PACKAGE.descriptor;
const northInletDefinition = northInletPresentation.definition;
const northInlet = northInletDefinition.world;
const driveTrack = createBroadcastCameraTrack(
  northInlet,
  NORTH_INLET_DRIVE_TAPE,
);
const watercourseOverviewCamera = Object.freeze({
  position: Object.freeze({ x: 10, y: 40, z: 80 }),
  target: Object.freeze({ x: 30, y: northInlet.waterLevel, z: 185 }),
  fovDegrees: 38,
  rollDegrees: 0,
  focalShiftY: 0.025,
});

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const freezeScene = (scene) => deepFreeze({
  sourceKind: northInletDescriptor.sourceKind,
  packageId: northInletDescriptor.packageId,
  packageVersion: northInletDescriptor.packageVersion,
  runtimeId: northInletDescriptor.runtimeId,
  contentRevision: northInletDescriptor.contentRevision,
  aimGuide: null,
  reducedMotion: false,
  tracer: null,
  ballPresentation: null,
  world: northInlet,
  wind: northInletDefinition.gameplay.wind,
  ...scene,
  camera: {
    ...scene.camera,
    position: { ...scene.camera.position },
    target: { ...scene.camera.target },
  },
  ballPosition: scene.ballPosition ? { ...scene.ballPosition } : null,
});

const driveScene = (id, label, timeMs) => {
  const sample = sampleBroadcastPresentation(
    northInlet,
    driveTrack,
    NORTH_INLET_DRIVE_TAPE,
    timeMs,
  );
  return freezeScene({
    id,
    label,
    timeMs,
    environmentTimeMs: 4_800,
    camera: sample.camera,
    tape: NORTH_INLET_DRIVE_TAPE,
    ballPosition: sample.ball.position,
    showBall: true,
    strategyAlpha: 0,
    tracer: sampleBroadcastTracer(
      NORTH_INLET_BROADCAST_TRACER,
      NORTH_INLET_DRIVE_TAPE,
      timeMs,
      { rigId: sample.rigId },
    ),
  });
};

export const RENDERER_SCENARIOS = Object.freeze({
  "north-inlet.watercourse.overview": freezeScene({
    id: "north-inlet.watercourse.overview",
    label: "Watercourse overview",
    timeMs: 0,
    environmentTimeMs: 4_800,
    camera: watercourseOverviewCamera,
    tape: null,
    ballPosition: null,
    showBall: false,
    strategyAlpha: 0,
  }),
  "north-inlet.drive.rear": driveScene(
    "north-inlet.drive.rear",
    "Rear drive camera",
    1_960,
  ),
  "north-inlet.drive.landing": driveScene(
    "north-inlet.drive.landing",
    "Landing camera",
    5_840,
  ),
  "north-inlet.green.read": freezeScene({
    id: "north-inlet.green.read",
    label: "Green read",
    timeMs: 0,
    environmentTimeMs: 4_800,
    camera: northInlet.greenDetailCamera,
    tape: null,
    ballPosition: Object.freeze({ x: -4.2, y: 0.021335, z: 376.5 }),
    showBall: true,
    strategyAlpha: 0,
  }),
});

if (
  RENDERER_SCENARIO_IDS.some((id, index) =>
    Object.keys(RENDERER_SCENARIOS)[index] !== id
  ) ||
  Object.keys(RENDERER_SCENARIOS).length !== RENDERER_SCENARIO_IDS.length
) {
  throw new Error("Renderer scenario contract does not match its definitions");
}

export function rendererScenario(scenarioId) {
  const scenario = RENDERER_SCENARIOS[scenarioId];
  if (!scenario) {
    throw new RangeError(`Unknown renderer scenario: ${scenarioId}`);
  }
  return scenario;
}
