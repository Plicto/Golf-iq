import type {
  ClubId,
  ImpactDelivery,
  PuttDelivery,
  ShotShape,
} from "./game-engine.ts";
import {
  clampGripToRail,
  modeProfile,
  railCenterX,
  resolveSwingDelivery,
  shapeProfile,
} from "./face-rail-model.mjs";

export type ImpactStrokeMode = "iron" | "putter";
export type ImpactStrokeShape = "straight" | "draw" | "fade";
export type ImpactStrokePhase =
  | "ready"
  | "backswing"
  | "forward"
  | "paused"
  | "struck"
  | "follow-through";

export type ImpactStrokePoint = Readonly<{ x: number; y: number }>;

type ImpactStrokeProfile = Readonly<{
  maximumBackswingPixels: number;
  throughPixels: number;
  railHalfWidthPixels: number;
  headOffset: ImpactStrokePoint;
  faceHalfWidthPixels: number;
}>;

type ImpactStrokeShapeProfile = Readonly<{
  faceDegrees: number;
  intendedPathDegrees: number;
}>;

export type SwingDelivery = Readonly<{
  schemaVersion: 1;
  id: string;
  modeId: ImpactStrokeMode;
  shapeId: ImpactStrokeShape;
  energyBasisPoints: number;
  faceToTargetMilliDegrees: number;
  pathToTargetMilliDegrees: number;
  faceToPathMilliDegrees: number;
  strikeHeelToeBasisPoints: number;
  tempoQualityBasisPoints: number;
  evidence: Readonly<{
    backswingPixels: number;
    impactSampleCount: number;
    impactResidualPixels: number;
    directionReversals: number;
    connectionBasisPoints: number;
  }>;
}>;

export type ImpactStrokeGeometry = Readonly<{
  width: number;
  height: number;
  ball: ImpactStrokePoint;
  impactGripY: number;
  addressGripX: number;
  addressGripY: number;
  minimumGripY: number;
  maximumGripY: number;
}>;

export type ImpactStrokeSample = Readonly<{
  x: number;
  y: number;
  sequence: number;
}>;

export type ImpactStrokeSession = Readonly<{
  mode: ImpactStrokeMode;
  shape: ImpactStrokeShape;
  geometry: ImpactStrokeGeometry;
  grip: ImpactStrokePoint;
  lastHead: ImpactStrokePoint;
  phase: ImpactStrokePhase;
  maximumBackswingPixels: number;
  lastDirection: -1 | 0 | 1;
  directionReversals: number;
  impactSamples: readonly ImpactStrokeSample[];
  nextSequence: number;
  railContact: boolean;
  delivery: SwingDelivery | null;
}>;

export type ImpactStrokeUpdate = Readonly<{
  session: ImpactStrokeSession;
  impact: SwingDelivery | null;
}>;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const profileFor = (mode: ImpactStrokeMode) =>
  modeProfile(mode) as ImpactStrokeProfile;

const shapeFor = (mode: ImpactStrokeMode, shape: ImpactStrokeShape) =>
  (mode === "putter" ? shapeProfile("straight") : shapeProfile(shape)) as
    ImpactStrokeShapeProfile;

export function impactStrokeModeForClub(club: ClubId): ImpactStrokeMode {
  return club === "Putter" ? "putter" : "iron";
}

export function impactStrokeClubLabel(club: ClubId) {
  if (club === "Putter") return "ORIGO FANG MALLET";
  if (club === "Driver") return "FOUNDRY TITANIUM · DRIVER";
  if (club === "3 wood") return "FOUNDRY TITANIUM · 3W";
  if (club.endsWith(" iron")) {
    return `FOUNDRY CHROME · ${club.replace(" iron", "i")}`;
  }
  return `FOUNDRY FORGED · ${club}`;
}

export function impactStrokeShape(shape: ShotShape): ImpactStrokeShape {
  if (shape === "Draw") return "draw";
  if (shape === "Fade") return "fade";
  return "straight";
}

export function createImpactStrokeGeometry(
  mode: ImpactStrokeMode,
  width: number,
  height: number,
): ImpactStrokeGeometry {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Impact Stroke geometry requires a positive stage size.");
  }
  const profile = profileFor(mode);
  const ballY = Math.max(
    190,
    Math.min(height * 0.49, height - profile.maximumBackswingPixels - 112),
  );
  const ballX = width * 0.455;
  const impactGripY = ballY - profile.headOffset.y;
  const addressGripY = impactGripY + (mode === "putter" ? 10 : 14);
  const addressGripX = ballX - profile.headOffset.x;
  return Object.freeze({
    width,
    height,
    ball: Object.freeze({ x: ballX, y: ballY }),
    impactGripY,
    addressGripX,
    addressGripY,
    minimumGripY: impactGripY - profile.throughPixels,
    maximumGripY: addressGripY + profile.maximumBackswingPixels + 9,
  });
}

export function createPuttStrokeGeometry(
  width: number,
  height: number,
  ball: ImpactStrokePoint,
): ImpactStrokeGeometry {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(ball.x) ||
    !Number.isFinite(ball.y) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Putt Stroke geometry requires a positive stage and finite ball position.");
  }
  const profile = profileFor("putter");
  const ballX = clamp(ball.x, 72, width - 72);
  const ballY = clamp(ball.y, 180, height - 166);
  const impactGripY = ballY - profile.headOffset.y;
  const addressGripY = impactGripY + 10;
  const addressGripX = ballX - profile.headOffset.x;
  return Object.freeze({
    width,
    height,
    ball: Object.freeze({ x: ballX, y: ballY }),
    impactGripY,
    addressGripX,
    addressGripY,
    minimumGripY: impactGripY - profile.throughPixels,
    maximumGripY:
      addressGripY + profile.maximumBackswingPixels + 9,
  });
}

export function createImpactStrokeSession(
  mode: ImpactStrokeMode,
  shape: ImpactStrokeShape,
  geometry: ImpactStrokeGeometry,
): ImpactStrokeSession {
  const profile = profileFor(mode);
  const grip = Object.freeze({
    x: geometry.addressGripX,
    y: geometry.addressGripY,
  });
  return Object.freeze({
    mode,
    shape: mode === "putter" ? "straight" : shape,
    geometry,
    grip,
    lastHead: Object.freeze({
      x: grip.x + profile.headOffset.x,
      y: grip.y + profile.headOffset.y,
    }),
    phase: "ready",
    maximumBackswingPixels: 0,
    lastDirection: 0,
    directionReversals: 0,
    impactSamples: Object.freeze([]),
    nextSequence: 0,
    railContact: false,
    delivery: null,
  });
}

const appendImpactSample = (
  samples: readonly ImpactStrokeSample[],
  head: ImpactStrokePoint,
  sequence: number,
  ballY: number,
) => {
  if (Math.abs(head.y - ballY) > 72) return samples;
  const retained = samples.length >= 96 ? samples.slice(1) : [...samples];
  retained.push(Object.freeze({ x: head.x, y: head.y, sequence }));
  return Object.freeze(retained);
};

export function moveImpactStroke(
  session: ImpactStrokeSession,
  requestedGrip: ImpactStrokePoint,
): ImpactStrokeUpdate {
  if (session.delivery) {
    return Object.freeze({ session, impact: null });
  }
  const profile = profileFor(session.mode);
  const shape = shapeFor(session.mode, session.shape);
  const geometry = session.geometry;
  const clamped = clampGripToRail({
    requestedX: requestedGrip.x,
    requestedY: requestedGrip.y,
    addressGripX: geometry.addressGripX,
    addressGripY: geometry.addressGripY,
    pathDegrees: shape.intendedPathDegrees,
    railHalfWidthPixels: profile.railHalfWidthPixels,
    minimumY: geometry.minimumGripY,
    maximumY: geometry.maximumGripY,
  }) as Readonly<{
    x: number;
    y: number;
    railContact: boolean;
  }>;
  const nextGrip = Object.freeze({ x: clamped.x, y: clamped.y });
  const nextHead = Object.freeze({
    x: nextGrip.x + profile.headOffset.x,
    y: nextGrip.y + profile.headOffset.y,
  });
  const deltaY = nextGrip.y - session.grip.y;
  const direction: -1 | 0 | 1 = deltaY > 0.35 ? 1 : deltaY < -0.35 ? -1 : 0;
  let reversals = session.directionReversals;
  let samples = session.impactSamples;
  let nextSequence = session.nextSequence;
  if (
    direction !== 0 &&
    session.lastDirection !== 0 &&
    direction !== session.lastDirection
  ) {
    reversals += 1;
    if (direction < 0) samples = Object.freeze([]);
  }
  const maximumBackswingPixels = Math.max(
    session.maximumBackswingPixels,
    nextGrip.y - geometry.addressGripY,
  );
  const phase = direction > 0
    ? "backswing"
    : direction < 0
      ? "forward"
      : session.phase;

  if (
    direction < 0 &&
    session.lastHead.y > geometry.ball.y &&
    nextHead.y <= geometry.ball.y
  ) {
    const span = session.lastHead.y - nextHead.y;
    const ratio = span <= 0.0001
      ? 1
      : (session.lastHead.y - geometry.ball.y) / span;
    const impactHead = Object.freeze({
      x: session.lastHead.x + (nextHead.x - session.lastHead.x) * ratio,
      y: geometry.ball.y,
    });
    samples = appendImpactSample(
      samples,
      impactHead,
      nextSequence,
      geometry.ball.y,
    );
    nextSequence += 1;
    const delivery = resolveSwingDelivery({
      modeId: session.mode,
      shapeId: session.shape,
      backswingPixels: maximumBackswingPixels,
      impactHeadCenterX: impactHead.x,
      ballCenterX: geometry.ball.x,
      impactSamples: samples,
      directionReversals: Math.max(1, reversals),
      connectionBasisPoints: 10_000,
    }) as SwingDelivery;
    const impactGrip = Object.freeze({
      x: impactHead.x - profile.headOffset.x,
      y: geometry.impactGripY,
    });
    const struck = Object.freeze({
      ...session,
      grip: impactGrip,
      lastHead: impactHead,
      phase: "struck" as const,
      maximumBackswingPixels,
      lastDirection: direction,
      directionReversals: reversals,
      impactSamples: samples,
      nextSequence,
      railContact: clamped.railContact,
      delivery,
    });
    const completedStroke = session.mode === "putter"
      ? continuePuttFollowThrough(struck, Object.freeze({
          x: requestedGrip.x,
          y: geometry.minimumGripY,
        }))
      : struck;
    return Object.freeze({ session: completedStroke, impact: delivery });
  }

  if (phase === "forward") {
    samples = appendImpactSample(
      samples,
      nextHead,
      nextSequence,
      geometry.ball.y,
    );
    if (samples !== session.impactSamples) nextSequence += 1;
  }
  const moved = Object.freeze({
    ...session,
    grip: nextGrip,
    lastHead: nextHead,
    phase,
    maximumBackswingPixels,
    lastDirection: direction === 0 ? session.lastDirection : direction,
    directionReversals: reversals,
    impactSamples: samples,
    nextSequence,
    railContact: clamped.railContact,
  });
  return Object.freeze({ session: moved, impact: null });
}

export function pauseImpactStroke(
  session: ImpactStrokeSession,
): ImpactStrokeSession {
  if (session.delivery) return session;
  return Object.freeze({ ...session, phase: "paused" });
}

export function continuePuttFollowThrough(
  session: ImpactStrokeSession,
  requestedGrip: ImpactStrokePoint,
): ImpactStrokeSession {
  if (session.mode !== "putter" || !session.delivery) return session;
  const profile = profileFor("putter");
  const geometry = session.geometry;
  const clamped = clampGripToRail({
    requestedX: requestedGrip.x,
    requestedY: requestedGrip.y,
    addressGripX: geometry.addressGripX,
    addressGripY: geometry.addressGripY,
    pathDegrees: 0,
    railHalfWidthPixels: profile.railHalfWidthPixels,
    minimumY: geometry.minimumGripY,
    maximumY: geometry.impactGripY,
  }) as Readonly<{
    x: number;
    y: number;
    railContact: boolean;
  }>;
  const grip = Object.freeze({
    x: clamped.x,
    y: Math.min(session.grip.y, clamped.y),
  });
  return Object.freeze({
    ...session,
    grip,
    lastHead: Object.freeze({
      x: grip.x + profile.headOffset.x,
      y: grip.y + profile.headOffset.y,
    }),
    phase: "follow-through" as const,
    railContact: session.railContact || clamped.railContact,
  });
}

export function puttFollowThroughComplete(session: ImpactStrokeSession) {
  return (
    session.mode === "putter" &&
    Boolean(session.delivery) &&
    session.phase === "follow-through" &&
    session.grip.y <= session.geometry.minimumGripY + 0.75
  );
}

export function impactStrokeRail(
  geometry: ImpactStrokeGeometry,
  mode: ImpactStrokeMode,
  shape: ImpactStrokeShape,
) {
  const selected = shapeFor(mode, shape);
  return Object.freeze({
    start: Object.freeze({
      x: railCenterX({
        addressGripX: geometry.addressGripX,
        addressGripY: geometry.addressGripY,
        gripY: geometry.maximumGripY,
        pathDegrees: selected.intendedPathDegrees,
      }) as number,
      y: geometry.maximumGripY,
    }),
    end: Object.freeze({
      x: railCenterX({
        addressGripX: geometry.addressGripX,
        addressGripY: geometry.addressGripY,
        gripY: geometry.minimumGripY,
        pathDegrees: selected.intendedPathDegrees,
      }) as number,
      y: geometry.minimumGripY,
    }),
  });
}

export function impactStrokeTargetPoint(
  geometry: ImpactStrokeGeometry,
  mode: ImpactStrokeMode,
  shape: ImpactStrokeShape,
  backswingPixels: number,
) {
  const selected = shapeFor(mode, shape);
  const y = clamp(
    geometry.addressGripY + backswingPixels,
    geometry.addressGripY,
    geometry.maximumGripY,
  );
  return Object.freeze({
    x: railCenterX({
      addressGripX: geometry.addressGripX,
      addressGripY: geometry.addressGripY,
      gripY: y,
      pathDegrees: selected.intendedPathDegrees,
    }) as number,
    y,
  });
}

export function fullShotTargetBackswing(plannedSwingLength: number) {
  const progress = clamp((plannedSwingLength - 0.18) / 0.86, 0, 1);
  const targetEnergy = progress ** (1 / 1.1);
  const normalizedBackswing = clamp((targetEnergy - 0.015) / 0.985, 0, 1);
  return normalizedBackswing * profileFor("iron").maximumBackswingPixels;
}

export function puttTargetBackswing(plannedStrokeLength: number) {
  return clamp(plannedStrokeLength, 0, 1) *
    profileFor("putter").maximumBackswingPixels;
}

export function faceRailToFullShotDelivery(
  delivery: SwingDelivery,
): ImpactDelivery {
  const energy = clamp(delivery.energyBasisPoints / 10_000, 0, 1.05);
  return Object.freeze({
    clubPathDegrees: clamp(delivery.pathToTargetMilliDegrees / 1_000, -8, 8),
    faceAngleDegrees: clamp(delivery.faceToTargetMilliDegrees / 1_000, -8, 8),
    strikeXMillimeters: clamp(
      -(delivery.strikeHeelToeBasisPoints / 10_000) * 12,
      -12,
      12,
    ),
    strikeYMillimeters: 0,
    swingLength: clamp(0.18 + energy ** 1.1 * 0.86, 0.18, 1.04),
  });
}

export function faceRailToPuttDelivery(
  delivery: SwingDelivery,
): PuttDelivery {
  const energy = clamp(delivery.energyBasisPoints / 10_000, 0, 1.05);
  const normalizedBackswing = clamp((energy - 0.005) / 0.995, 0, 1);
  return Object.freeze({
    strokeLengthNormalized: normalizedBackswing,
    startLineErrorDegrees: clamp(
      (delivery.pathToTargetMilliDegrees / 1_000) * 0.1,
      -8,
      8,
    ),
    contactOffsetMillimeters: clamp(
      -(delivery.strikeHeelToeBasisPoints / 10_000) * 9,
      -9,
      9,
    ),
  });
}

export function impactStrokeStrikeLabel(basisPoints: number) {
  if (basisPoints <= -2_200) return "Toe";
  if (basisPoints >= 2_200) return "Heel";
  return "Center";
}
