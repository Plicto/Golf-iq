import {
  classifyCourseSurface,
  courseContactHeightAt,
  type CourseLayout,
} from "./course-layout.ts";
import {
  courseCharacter,
  type CourseArchetype,
  type CourseCharacterProfile,
} from "./course-character.ts";
import {
  GOLF_BALL_RADIUS_METERS,
  GROUND_CONTACT_PHYSICS_VERSION,
  advanceCourseGroundRoll,
  simulateGroundContact,
  sweepCourseBarrier,
  sweepCourseTerrain,
  type GroundContactResult,
  type GroundVector,
} from "./ground-contact.ts";
import type { GroundMaterial } from "./ground-materials.ts";
import {
  PUTT_CUP_PHYSICS_VERSION,
  PUTT_CUP_RADIUS_METERS,
  simulatePuttCupInteraction,
  type PuttCupEventKind,
  type PuttCupInteraction,
} from "./putt-cup-physics.ts";

export type Point = { readonly x: number; readonly z: number };
export type SurfaceKind = "rough" | "fairway" | "green" | "bunker" | "water" | "boundary";
export type CourseEnvironment = CourseArchetype | CourseLayout;
export type RouteId = "safe-right" | "aggressive-left";
export type ShotShape = "Draw" | "Straight" | "Fade";
export type CarryModel = "native" | "club-window";
export type ShotTrajectory =
  | "BumpAndRun"
  | "Punch"
  | "Low"
  | "Standard"
  | "High"
  | "Flop";
export type ShotIntent = "Safe" | "Balanced" | "Attack";
export type PuttStrategy = "Lag" | "Balanced" | "Attack";
export type ClubId = "Driver" | "3 wood" | "5 iron" | "6 iron" | "7 iron" | "8 iron" | "9 iron" | "PW" | "GW" | "SW" | "Putter";

export type Surface = {
  readonly id: string;
  readonly kind: Exclude<SurfaceKind, "boundary">;
  readonly points: readonly Point[];
};

export type Route = {
  readonly id: RouteId;
  readonly label: string;
  readonly target: Point;
  readonly radius: number;
  readonly carry: number;
  readonly approach: number;
  readonly risk: string;
};

export type Wind = {
  readonly speed: number;
  readonly towardDegrees: number;
  readonly label: string;
};

export type BallState = {
  readonly position: Point;
  readonly lie: Exclude<SurfaceKind, "water" | "boundary"> | "tee";
  readonly remainingMeters: number;
};

export type LiePerformanceRead = Readonly<{
  label: "Tee" | "Fairway" | "Rough" | "Sand" | "Green";
  carryFactor: number;
  spinFactor: number;
  carryDeltaPercent: number;
  spinDeltaPercent: number;
}>;

export type ImpactDelivery = {
  readonly clubPathDegrees: number;
  readonly faceAngleDegrees?: number;
  readonly strikeXMillimeters: number;
  readonly strikeYMillimeters: number;
  readonly swingLength?: number;
};

export type FullShotDecision = {
  readonly club: ClubId;
  readonly route: RouteId;
  readonly shape: ShotShape;
  readonly trajectory: ShotTrajectory;
  readonly intent: ShotIntent;
  readonly aimOffsetMeters?: number;
  readonly targetCarryMeters?: number;
  readonly carryModel?: CarryModel;
  readonly plannedSwingLength?: number;
  readonly delivery?: ImpactDelivery;
};

export type FlightSample = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly elapsedSeconds: number;
  readonly phase: "flight" | "bounce" | "roll" | "penalty" | "putt" | "cup";
  readonly cupEvent?: PuttCupEventKind;
  readonly rotationRadians?: number;
  readonly puttMotionPhase?: "hop" | "skid" | "roll";
  readonly speedMetersPerSecond?: number;
  readonly angularSpeedRadiansPerSecond?: number;
  readonly slipMetersPerSecond?: number;
};

export type FullShotOutcome = {
  readonly kind: "full";
  readonly id: string;
  readonly courseLayoutId: string;
  readonly coursePhysicsVersion: string;
  readonly courseArchetype: CourseArchetype;
  readonly club: ClubId;
  readonly decision: Readonly<FullShotDecision>;
  readonly from: Point;
  readonly landing: Point;
  readonly final: Point;
  readonly nextBall: BallState;
  readonly landingSurface: SurfaceKind;
  readonly surface: SurfaceKind;
  readonly carryMeters: number;
  readonly rollMeters: number;
  readonly totalMeters: number;
  readonly apexMeters: number;
  readonly flightSeconds: number;
  readonly penaltyStrokes: number;
  readonly samples: readonly FlightSample[];
  readonly execution: {
    readonly strike: "center" | "slight toe" | "slight heel" | "thin";
    readonly faceAngleDegrees: number;
    readonly clubPathDegrees: number;
    readonly faceToPathDegrees: number;
    readonly attackAngleDegrees: number;
    readonly dynamicLoftDegrees: number;
    readonly dynamicLieDegrees: number;
    readonly strikeXMillimeters: number;
    readonly strikeYMillimeters: number;
    readonly spinLoftDegrees: number;
    readonly spinAxisDegrees: number;
    readonly spinRateRPM: number;
    readonly landingSpinRateRPM: number;
    readonly descentAngleDegrees: number;
    readonly strikeEfficiency: number;
    readonly swingLength: number;
    readonly launchDegrees: number;
    readonly ballSpeedMetersPerSecond: number;
    readonly startErrorDegrees: number;
    readonly windDriftMeters: number;
    readonly cause: string;
  };
  readonly summary: string;
  readonly decisionRead: string;
};

export type PuttDelivery = {
  readonly strokeLengthNormalized: number;
  readonly startLineErrorDegrees: number;
  readonly contactOffsetMillimeters: number;
};

export type PuttDecision = {
  readonly lineDegrees: number;
  readonly strategy: PuttStrategy;
  readonly paceMetersPastCup?: number;
  readonly delivery?: PuttDelivery;
};

export type GreenRead = {
  readonly breakDirection: "left" | "right";
  readonly breakDegrees: number;
  readonly recommendedLineDegrees: number;
  readonly elevationChangeMeters: number;
  readonly paceRead: "uphill" | "level" | "downhill";
  readonly summary: string;
};

export type PuttOutcome = {
  readonly kind: "putt";
  readonly id: string;
  readonly from: Point;
  readonly final: Point;
  readonly nextBall: BallState;
  readonly surface: SurfaceKind;
  readonly penaltyStrokes: number;
  readonly strategy: PuttStrategy;
  readonly committedLineDegrees: number;
  readonly committedPaceMetersPastCup: number;
  readonly actualLineDegrees: number;
  readonly startSpeedMetersPerSecond: number;
  readonly speedAtCupMetersPerSecond: number | null;
  readonly lineErrorDegrees: number;
  readonly paceErrorPercent: number;
  readonly delivery: Readonly<PuttDelivery> | null;
  readonly leaveDistanceMeters: number;
  readonly holed: boolean;
  readonly lipOut: boolean;
  readonly cupInteraction: PuttCupInteraction | null;
  readonly samples: readonly FlightSample[];
  readonly elapsedSeconds: number;
  readonly summary: string;
  readonly decisionRead: string;
};

export type GameOutcome = FullShotOutcome | PuttOutcome;

type ClubProfile = {
  readonly speed: number;
  readonly launch: number;
  readonly spin: number;
  readonly drag: number;
  readonly stockCarry: number;
  readonly attack: number;
  readonly dynamicLoft: number;
  readonly dynamicLie: number;
};

function courseArchetypeFor(
  environment: CourseEnvironment = "open-parkland",
) {
  return typeof environment === "string"
    ? environment
    : environment.courseArchetype;
}

export function liePerformanceFor(
  lie: BallState["lie"],
  environment: CourseEnvironment = "open-parkland",
): LiePerformanceRead {
  const courseArchetype = courseArchetypeFor(environment);
  const course = courseCharacter(courseArchetype);
  const label = lie === "tee"
    ? "Tee"
    : lie === "fairway"
      ? "Fairway"
      : lie === "rough"
        ? "Rough"
        : lie === "bunker"
          ? "Sand"
          : "Green";
  const carryFactor = lie === "rough"
    ? course.roughEnergyRetention
    : lie === "bunker"
      ? 0.78
      : 1;
  const spinFactor = lie === "rough"
    ? course.roughSpinRetention
    : lie === "bunker"
      ? 0.88
      : 1;
  return Object.freeze({
    label,
    carryFactor,
    spinFactor,
    carryDeltaPercent: Math.round((carryFactor - 1) * 100),
    spinDeltaPercent: Math.round((spinFactor - 1) * 100),
  });
}

const CLUBS: Readonly<Record<ClubId, ClubProfile>> = Object.freeze({
  Driver: Object.freeze({ speed: 78, launch: 12.5, spin: 2_600, drag: 0.22, stockCarry: 220, attack: 2.4, dynamicLoft: 14.2, dynamicLie: 58.5 }),
  "3 wood": Object.freeze({ speed: 72.5, launch: 15.5, spin: 3_600, drag: 0.24, stockCarry: 195, attack: -1.1, dynamicLoft: 18.4, dynamicLie: 58.5 }),
  "5 iron": Object.freeze({ speed: 61, launch: 16.5, spin: 5_550, drag: 0.31, stockCarry: 172, attack: -3.5, dynamicLoft: 24.8, dynamicLie: 61 }),
  "6 iron": Object.freeze({ speed: 57.5, launch: 18, spin: 6_200, drag: 0.31, stockCarry: 158, attack: -3.8, dynamicLoft: 27.3, dynamicLie: 61.5 }),
  "7 iron": Object.freeze({ speed: 54, launch: 19.5, spin: 6_900, drag: 0.31, stockCarry: 146, attack: -4.1, dynamicLoft: 30.2, dynamicLie: 62 }),
  "8 iron": Object.freeze({ speed: 50.5, launch: 21.5, spin: 7_600, drag: 0.31, stockCarry: 134, attack: -4.4, dynamicLoft: 33.5, dynamicLie: 62.5 }),
  "9 iron": Object.freeze({ speed: 47, launch: 24, spin: 8_200, drag: 0.31, stockCarry: 122, attack: -4.8, dynamicLoft: 37.2, dynamicLie: 63 }),
  PW: Object.freeze({ speed: 41, launch: 29, spin: 9_000, drag: 0.31, stockCarry: 105, attack: -5.2, dynamicLoft: 42.5, dynamicLie: 63.5 }),
  GW: Object.freeze({ speed: 34, launch: 32, spin: 9_200, drag: 0.31, stockCarry: 82, attack: -5.8, dynamicLoft: 48, dynamicLie: 64 }),
  SW: Object.freeze({ speed: 28, launch: 34, spin: 9_500, drag: 0.31, stockCarry: 62, attack: -6.4, dynamicLoft: 54, dynamicLie: 64 }),
  Putter: Object.freeze({ speed: 2, launch: 0, spin: 0, drag: 0, stockCarry: 0, attack: 0, dynamicLoft: 3, dynamicLie: 70 }),
});

const INTENT = Object.freeze({
  Safe: Object.freeze({ speed: 0.965, dispersion: 0.68, target: "safe" as const }),
  Balanced: Object.freeze({ speed: 1, dispersion: 1, target: "balanced" as const }),
  Attack: Object.freeze({ speed: 1.045, dispersion: 1.42, target: "attack" as const }),
});

const TRAJECTORY = Object.freeze({
  BumpAndRun: Object.freeze({ launch: -9, attack: -2.4, speed: 0.84, spin: -1_800, groundRelease: 2.05 }),
  Punch: Object.freeze({ launch: -5.8, attack: -1.55, speed: 0.985, spin: -1_180, groundRelease: 1.52 }),
  Low: Object.freeze({ launch: -2.4, attack: -0.9, speed: 1.025, spin: -260, groundRelease: 1.28 }),
  Standard: Object.freeze({ launch: 0, attack: 0, speed: 1, spin: 0, groundRelease: 1 }),
  High: Object.freeze({ launch: 4.2, attack: 0.95, speed: 0.955, spin: 880, groundRelease: 0.58 }),
  Flop: Object.freeze({ launch: 15.5, attack: 2.4, speed: 0.72, spin: 1_850, groundRelease: 0.14 }),
});

const SHAPE_DELIVERY = Object.freeze({
  Draw: Object.freeze({ path: 2.8, faceToPath: -2.45 }),
  Straight: Object.freeze({ path: 0, faceToPath: 0 }),
  Fade: Object.freeze({ path: -2.8, faceToPath: 2.45 }),
});

const PUTT_STRATEGY = Object.freeze({
  Lag: Object.freeze({ pastCupMeters: 0.16, paceNoise: 0.038, lineNoiseDegrees: 1.4 }),
  Balanced: Object.freeze({ pastCupMeters: 0.48, paceNoise: 0.031, lineNoiseDegrees: 1.15 }),
  Attack: Object.freeze({ pastCupMeters: 1.04, paceNoise: 0.062, lineNoiseDegrees: 5.5 }),
});

const CUP_CAPTURE_RADIUS = 0.055;
const PUTT_STROKE_MINIMUM_SPEED = 0.08;
const PUTT_STROKE_MAXIMUM_SPEED = 4.8;
const PUTT_STROKE_SPEED_EXPONENT = 1;
const PUTT_SETTLE_SPEED = 0.012;
const PUTT_GRAVITY = 9.80665;
const PUTT_SLIP_SETTLE_SPEED = 0.006;
export const PUTT_ROLL_PHYSICS_VERSION = "green-roll-v3";

const PUTT_GREEN_ROLL_PROFILE: Readonly<Record<
  CourseArchetype,
  Readonly<{
    rollingResistance: number;
    staticResistance: number;
    velocityDrag: number;
    slidingFriction: number;
    launchAngleDegrees: number;
    initialRollRatio: number;
  }>
>> = Object.freeze({
  links: Object.freeze({
    rollingResistance: 0.46,
    staticResistance: 0.52,
    velocityDrag: 0.003,
    slidingFriction: 0.23,
    launchAngleDegrees: 1.8,
    initialRollRatio: 0.52,
  }),
  "open-parkland": Object.freeze({
    rollingResistance: 0.54,
    staticResistance: 0.68,
    velocityDrag: 0.0035,
    slidingFriction: 0.28,
    launchAngleDegrees: 1.8,
    initialRollRatio: 0.52,
  }),
  woodland: Object.freeze({
    rollingResistance: 0.62,
    staticResistance: 0.78,
    velocityDrag: 0.004,
    slidingFriction: 0.32,
    launchAngleDegrees: 1.7,
    initialRollRatio: 0.52,
  }),
  "florida-soft": Object.freeze({
    rollingResistance: 0.62,
    staticResistance: 0.72,
    velocityDrag: 0.0045,
    slidingFriction: 0.31,
    launchAngleDegrees: 1.7,
    initialRollRatio: 0.52,
  }),
});

export function isBallWithinCup(point: Point, pin: Point) {
  return distanceBetween(point, pin) <= CUP_CAPTURE_RADIUS;
}

function hash32(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

export function randomUnit(seed: number, channel: number): number {
  return mix32((seed ^ Math.imul(channel + 1, 0x9e3779b1)) >>> 0) / 0x1_0000_0000;
}

function centeredNoise(seed: number, channel: number): number {
  return randomUnit(seed, channel) + randomUnit(seed, channel + 1) - 1;
}

export function classifySurface(
  point: Point,
  layout: CourseLayout,
): SurfaceKind {
  return classifyCourseSurface(layout, point);
}

function retainedPenaltyRelief(
  layout: CourseLayout,
  address: Point,
  hazardContact: Point,
  priorPlayable?: Point | null,
) {
  const playable = (point: Point) => {
    const surface = classifySurface(point, layout);
    return (
      surface !== "water" &&
      surface !== "boundary" &&
      !isBallWithinCup(point, layout.pin)
    );
  };
  if (priorPlayable && playable(priorPlayable)) {
    const distance = distanceBetween(priorPlayable, hazardContact);
    const retreat = Math.min(1, 0.08 / Math.max(0.000_001, distance));
    const candidate = Object.freeze({
      x: hazardContact.x + (priorPlayable.x - hazardContact.x) * retreat,
      z: hazardContact.z + (priorPlayable.z - hazardContact.z) * retreat,
    });
    if (playable(candidate)) return candidate;
    return Object.freeze({ ...priorPlayable });
  }
  for (let fraction = 0.98; fraction >= 0; fraction -= 0.02) {
    const candidate = Object.freeze({
      x: address.x + (hazardContact.x - address.x) * fraction,
      z: address.z + (hazardContact.z - address.z) * fraction,
    });
    if (playable(candidate)) return candidate;
  }
  if (playable(address)) return Object.freeze({ ...address });
  throw new RangeError("Penalty relief could not find a playable point.");
}

export function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.z - left.z);
}

export function createRoundWind(seed: number): Wind {
  const speed = 1.8 + randomUnit(seed, 70) * 4;
  const towardDegrees = Math.round(randomUnit(seed, 71) * 359);
  const direction =
    towardDegrees < 45 || towardDegrees >= 315
      ? "helping"
      : towardDegrees < 135
        ? "across to the right"
        : towardDegrees < 225
          ? "into you"
          : "across to the left";
  return Object.freeze({ speed, towardDegrees, label: `${speed.toFixed(1)} m/s · ${direction}` });
}

export function aimPointFor(
  from: BallState,
  decision: FullShotDecision,
  layout: CourseLayout,
): Point {
  const offset = decision.aimOffsetMeters;
  if (decision.targetCarryMeters !== undefined) {
    const base = from.lie === "tee"
      ? layout.aim.tee
      : decision.intent === "Attack"
        ? layout.pin
        : decision.intent === "Safe"
          ? layout.aim.safe
          : layout.aim.balanced;
    const baseDistance = Math.max(0.001, distanceBetween(from.position, base));
    const forward = {
      x: (base.x - from.position.x) / baseDistance,
      z: (base.z - from.position.z) / baseDistance,
    };
    const right = { x: -forward.z, z: forward.x };
    const targetDistance = clamp(decision.targetCarryMeters, 8, 260);
    const lateralLimit = from.lie === "tee"
      ? layout.aim.lateralLimit.tee
      : layout.aim.lateralLimit.approach;
    const radialCarry = decision.carryModel === "club-window";
    const lateral = clamp(
      offset ?? 0,
      -Math.min(lateralLimit, radialCarry ? targetDistance : lateralLimit),
      Math.min(lateralLimit, radialCarry ? targetDistance : lateralLimit),
    );
    const forwardDistance = radialCarry
      ? Math.sqrt(Math.max(0, targetDistance ** 2 - lateral ** 2))
      : targetDistance;
    return Object.freeze({
      x: from.position.x + forward.x * forwardDistance + right.x * lateral,
      z: from.position.z + forward.z * forwardDistance + right.z * lateral,
    });
  }
  if (from.lie === "tee" && offset !== undefined) {
    const teeTarget = layout.aim.tee;
    const limit = layout.aim.lateralLimit.tee;
    return Object.freeze({
      x: teeTarget.x + clamp(offset, -limit, limit),
      z: teeTarget.z - Math.max(0, -offset) * 0.38,
    });
  }
  const base = from.lie === "tee"
    ? layout.aim.routes[decision.route]
    : decision.intent === "Attack"
      ? layout.pin
      : decision.intent === "Safe"
        ? layout.aim.safe
        : layout.aim.balanced;
  if (offset === undefined || from.lie === "tee") return base;
  const distance = Math.max(0.001, distanceBetween(from.position, base));
  const forward = {
    x: (base.x - from.position.x) / distance,
    z: (base.z - from.position.z) / distance,
  };
  const right = { x: -forward.z, z: forward.x };
  return Object.freeze({
    x:
      base.x + right.x * clamp(
        offset,
        -layout.aim.lateralLimit.approach,
        layout.aim.lateralLimit.approach,
      ),
    z:
      base.z + right.z * clamp(
        offset,
        -layout.aim.lateralLimit.approach,
        layout.aim.lateralLimit.approach,
      ),
  });
}

export function suggestedClubs(
  ball: BallState,
  route: RouteId,
  environment: CourseEnvironment = "open-parkland",
): readonly ClubId[] {
  if (ball.lie === "tee") return route === "safe-right" ? Object.freeze(["3 wood", "Driver"]) : Object.freeze(["Driver", "3 wood"]);
  if (ball.lie === "green") return Object.freeze(["Putter"]);
  const lieFactor = liePerformanceFor(ball.lie, environment).carryFactor;
  const candidates = (Object.keys(CLUBS) as ClubId[]).filter((club) => club !== "Driver" && club !== "3 wood" && club !== "Putter");
  return Object.freeze(candidates.sort((left, right) => Math.abs(CLUBS[left].stockCarry * lieFactor - ball.remainingMeters) - Math.abs(CLUBS[right].stockCarry * lieFactor - ball.remainingMeters)).slice(0, 3));
}

export function projectedCarry(
  ball: BallState,
  decision: FullShotDecision,
  layout: CourseLayout,
): number {
  const profile = CLUBS[decision.club];
  const lieFactor = liePerformanceFor(ball.lie, layout).carryFactor;
  const stock = profile.stockCarry * INTENT[decision.intent].speed * TRAJECTORY[decision.trajectory].speed * lieFactor;
  const targetDistance = distanceBetween(
    ball.position,
    aimPointFor(ball, decision, layout),
  );
  const isScoringWedge = decision.club === "PW" || decision.club === "GW" || decision.club === "SW";
  const release = TRAJECTORY[decision.trajectory].groundRelease;
  return isScoringWedge && targetDistance < stock * 0.88
    ? Math.max(3, targetDistance - (release >= 1.28 ? 5 : release <= 0.58 ? 1 : 2.5))
    : stock;
}

export function landingReleaseScale(
  landingSpinRateRPM: number,
  descentAngleDegrees: number,
) {
  if (
    !Number.isFinite(landingSpinRateRPM) ||
    !Number.isFinite(descentAngleDegrees) ||
    landingSpinRateRPM < 0 ||
    descentAngleDegrees < 0
  ) {
    throw new RangeError("Landing dynamics must be finite and non-negative.");
  }
  return clamp(
    (1.18 - landingSpinRateRPM / 16_000 * 0.55) *
      (1.25 - descentAngleDegrees / 90),
    0.52,
    1.08,
  );
}

function strikeLabel(strikeX: number, strikeY: number): FullShotOutcome["execution"]["strike"] {
  if (strikeY < -3.8) return "thin";
  if (strikeX > 5.6) return "slight toe";
  if (strikeX < -5.6) return "slight heel";
  return "center";
}

type ResolvedDelivery = Omit<
  FullShotOutcome["execution"],
  | "swingLength"
  | "launchDegrees"
  | "ballSpeedMetersPerSecond"
  | "startErrorDegrees"
  | "windDriftMeters"
  | "spinRateRPM"
  | "landingSpinRateRPM"
  | "descentAngleDegrees"
  | "cause"
>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function deliveryCause(delivery: ResolvedDelivery): string {
  if (delivery.strike !== "center") return `${delivery.strike} contact cost speed and changed the spin axis.`;
  if (Math.abs(delivery.faceAngleDegrees) >= 1.8)
    return `Face ${Math.abs(delivery.faceAngleDegrees).toFixed(1)}° ${delivery.faceAngleDegrees > 0 ? "right" : "left"} set the start line.`;
  if (Math.abs(delivery.faceToPathDegrees) >= 1.4)
    return `Face-to-path ${delivery.faceToPathDegrees > 0 ? "open" : "closed"} by ${Math.abs(delivery.faceToPathDegrees).toFixed(1)}° created the curve.`;
  if (Math.abs(delivery.attackAngleDegrees) >= 5.5)
    return `${Math.abs(delivery.attackAngleDegrees).toFixed(1)}° downward attack raised spin loft and softened the flight.`;
  return "Centered strike and a neutral face-to-path delivered the planned window.";
}

function resolveDelivery(
  ball: BallState,
  decision: FullShotDecision,
  profile: ClubProfile,
  seed: number,
): ResolvedDelivery {
  const intent = INTENT[decision.intent];
  const lieDispersion = ball.lie === "rough" ? 1.32 : ball.lie === "bunker" ? 1.58 : 1;
  const routeDispersion = ball.lie === "tee" &&
    decision.aimOffsetMeters === undefined &&
    decision.route === "aggressive-left"
    ? 1.28
    : 1;
  const spread = intent.dispersion * lieDispersion * routeDispersion;
  const planned = SHAPE_DELIVERY[decision.shape];
  const strikeXMillimeters = decision.delivery
    ? clamp(decision.delivery.strikeXMillimeters, -12, 12)
    : centeredNoise(seed, 10) * 7.4 * spread;
  const strikeYMillimeters = decision.delivery
    ? clamp(decision.delivery.strikeYMillimeters, -8, 8)
    : centeredNoise(seed, 12) * 4.8 * spread -
      (ball.lie === "rough" ? 0.55 : ball.lie === "bunker" ? 1.35 : 0);
  const dynamicLieDelta =
    (decision.delivery ? 0 : centeredNoise(seed, 17) * 0.9 * spread) +
    (ball.lie === "rough" ? 0.45 : ball.lie === "bunker" ? 0.9 : 0);
  const dynamicLieDegrees = profile.dynamicLie + dynamicLieDelta;
  const clubPathDegrees = decision.delivery
    ? clamp(decision.delivery.clubPathDegrees, -8, 8)
    : planned.path + centeredNoise(seed, 14) * 1.55 * spread;
  const plannedFaceAngleDegrees = planned.path + planned.faceToPath;
  const seededFaceToPathDegrees = planned.faceToPath + centeredNoise(seed, 16) * 1.2 * spread;
  const faceAngleDegrees = decision.delivery
    ? clamp(
        decision.delivery.faceAngleDegrees ?? plannedFaceAngleDegrees,
        -8,
        8,
      ) - dynamicLieDelta * 0.22
    : clubPathDegrees + seededFaceToPathDegrees - dynamicLieDelta * 0.22;
  const faceToPathDegrees = decision.delivery
    ? faceAngleDegrees - clubPathDegrees
    : seededFaceToPathDegrees;
  const attackAngleDegrees =
    profile.attack +
    TRAJECTORY[decision.trajectory].attack +
    (decision.delivery ? 0 : centeredNoise(seed, 19) * 0.85 * spread) -
    (ball.lie === "rough" ? 0.45 : ball.lie === "bunker" ? 1.2 : 0);
  const dynamicLoftDegrees =
    profile.dynamicLoft +
    TRAJECTORY[decision.trajectory].launch * 0.82 +
    (decision.intent === "Safe" ? 0.45 : decision.intent === "Attack" ? -0.55 : 0) +
    (decision.delivery ? 0 : centeredNoise(seed, 21) * 0.8 * spread) -
    strikeYMillimeters * 0.08;
  const spinLoftDegrees = Math.max(6, dynamicLoftDegrees - attackAngleDegrees);
  const gearEffect = decision.club === "Driver" || decision.club === "3 wood" ? 0.34 : 0.12;
  const spinAxisDegrees =
    -faceToPathDegrees * 3.05 + strikeXMillimeters * gearEffect - dynamicLieDelta * 0.42;
  const strikeEfficiency = decision.delivery
    ? clamp(
        1.006 -
          Math.hypot(
            strikeXMillimeters / 12,
            strikeYMillimeters / 8,
          ) ** 1.35 * 0.34,
        0.56,
        1.006,
      )
    : clamp(
        1.006 - Math.abs(strikeXMillimeters) * 0.0025 - Math.abs(strikeYMillimeters) * 0.004,
        0.9,
        1.006,
      );
  return Object.freeze({
    strike: strikeLabel(strikeXMillimeters, strikeYMillimeters),
    faceAngleDegrees,
    clubPathDegrees,
    faceToPathDegrees,
    attackAngleDegrees,
    dynamicLoftDegrees,
    dynamicLieDegrees,
    strikeXMillimeters,
    strikeYMillimeters,
    spinLoftDegrees,
    spinAxisDegrees,
    strikeEfficiency,
  });
}

export const SWING_LENGTH_LIMITS = Object.freeze({ minimum: 0.58, maximum: 1.04 });
export const PARTIAL_SHOT_SWING_LENGTHS = Object.freeze({ minimum: 0.18, maximum: 1.04 });

export function swingSpeedScale(swingLength: number): number {
  const progress = clamp(
    (swingLength - SWING_LENGTH_LIMITS.minimum) /
      (SWING_LENGTH_LIMITS.maximum - SWING_LENGTH_LIMITS.minimum),
    0,
    1,
  );
  const smooth = progress * progress * (3 - 2 * progress);
  return 0.62 + smooth * 0.42;
}

export function partialShotSpeedScale(swingLength: number): number {
  if (swingLength >= SWING_LENGTH_LIMITS.minimum) {
    return swingSpeedScale(swingLength);
  }
  const progress = clamp(
    (swingLength - PARTIAL_SHOT_SWING_LENGTHS.minimum) /
      (SWING_LENGTH_LIMITS.minimum - PARTIAL_SHOT_SWING_LENGTHS.minimum),
    0,
    1,
  );
  const smooth = progress * progress * (3 - 2 * progress);
  return 0.18 + smooth * 0.44;
}

function speedScaleForDecision(
  decision: FullShotDecision,
  swingLength: number,
) {
  return decision.carryModel === "club-window"
    ? partialShotSpeedScale(swingLength)
    : swingSpeedScale(swingLength);
}

function plannedDelivery(
  ball: BallState,
  decision: FullShotDecision,
  profile: ClubProfile,
): ResolvedDelivery {
  const planned = SHAPE_DELIVERY[decision.shape];
  const dynamicLieDelta =
    ball.lie === "rough" ? 0.45 : ball.lie === "bunker" ? 0.9 : 0;
  const attackAngleDegrees =
    profile.attack +
    TRAJECTORY[decision.trajectory].attack -
    (ball.lie === "rough" ? 0.45 : ball.lie === "bunker" ? 1.2 : 0);
  const dynamicLoftDegrees =
    profile.dynamicLoft +
    TRAJECTORY[decision.trajectory].launch * 0.82 +
    (decision.intent === "Safe" ? 0.45 : decision.intent === "Attack" ? -0.55 : 0);
  const faceAngleDegrees = planned.path + planned.faceToPath - dynamicLieDelta * 0.22;
  const faceToPathDegrees = faceAngleDegrees - planned.path;
  const spinLoftDegrees = Math.max(6, dynamicLoftDegrees - attackAngleDegrees);
  return Object.freeze({
    strike: "center",
    faceAngleDegrees,
    clubPathDegrees: planned.path,
    faceToPathDegrees,
    attackAngleDegrees,
    dynamicLoftDegrees,
    dynamicLieDegrees: profile.dynamicLie + dynamicLieDelta,
    strikeXMillimeters: 0,
    strikeYMillimeters: 0,
    spinLoftDegrees,
    spinAxisDegrees: -faceToPathDegrees * 3.05 - dynamicLieDelta * 0.42,
    strikeEfficiency: 1.006,
  });
}

type SimulatedFlight = Readonly<{
  landing: Point;
  impactVelocity: Readonly<{ x: number; y: number; z: number }>;
  samples: readonly FlightSample[];
  apexMeters: number;
  elapsedSeconds: number;
  ballSpeedMetersPerSecond: number;
  launchDegrees: number;
  targetHeading: number;
  startErrorDegrees: number;
  impactAngularVelocity: GroundVector;
  spinRateRPM: number;
  landingSpinRateRPM: number;
  descentAngleDegrees: number;
}>;

function simulateFlight(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  course: CourseCharacterProfile,
  layout: CourseLayout,
  profile: ClubProfile,
  delivery: ResolvedDelivery,
  speedScale: number,
  seed: number,
  executionVariation: boolean,
  keepSamples: boolean,
  contactMode: "layout" | "launch-datum" = "layout",
): SimulatedFlight {
  const target = aimPointFor(ball, decision, layout);
  const dx = target.x - ball.position.x;
  const dz = target.z - ball.position.z;
  const targetHeading = Math.atan2(dx, -dz);
  const intent = INTENT[decision.intent];
  const trajectory = TRAJECTORY[decision.trajectory];
  const liePerformance = liePerformanceFor(ball.lie, course.id);
  const lieSpeed = liePerformance.carryFactor;
  const trajectorySpeed = decision.carryModel === "club-window"
    ? 1
    : trajectory.speed;
  const ballSpeed =
    profile.speed * intent.speed * trajectorySpeed * lieSpeed * speedScale *
    delivery.strikeEfficiency *
    (executionVariation ? 1 + centeredNoise(seed, 24) * 0.006 : 1);
  const launchDegrees =
    profile.launch + trajectory.launch +
    (delivery.dynamicLoftDegrees - profile.dynamicLoft - trajectory.launch * 0.82) * 0.24 -
    (delivery.attackAngleDegrees - profile.attack) * 0.08;
  const startErrorDegrees = delivery.faceAngleDegrees;
  const heading = targetHeading + (startErrorDegrees * Math.PI) / 180;
  const launchRadians = (launchDegrees * Math.PI) / 180;
  const groundSpeed = ballSpeed * Math.cos(launchRadians);
  let velocity = { x: groundSpeed * Math.sin(heading), y: ballSpeed * Math.sin(launchRadians), z: -groundSpeed * Math.cos(heading) };
  const launchGroundHeight = layout.terrainHeightAt(ball.position);
  let position = {
    x: ball.position.x,
    y: launchGroundHeight + 0.04,
    z: ball.position.z,
  };
  const stockSpinLoft = profile.dynamicLoft - profile.attack;
  const spinLoftScale = clamp(1 + (delivery.spinLoftDegrees - stockSpinLoft) * 0.018, 0.76, 1.3);
  const spinEnergyScale = decision.carryModel === "club-window"
    ? Math.pow(clamp(speedScale / 1.04, 0.12, 1), 0.72)
    : 1;
  const spinRateRPM =
    (profile.spin + trajectory.spin) * spinLoftScale * spinEnergyScale *
    liePerformance.spinFactor;
  const spinMagnitude = (spinRateRPM * Math.PI * 2) / 60;
  const spinAxis = (delivery.spinAxisDegrees * Math.PI) / 180;
  const backspin = spinMagnitude * Math.cos(spinAxis);
  let angular = {
    x: backspin * Math.cos(heading),
    y: spinMagnitude * Math.sin(spinAxis),
    z: backspin * Math.sin(heading),
  };
  const windRadians = (wind.towardDegrees * Math.PI) / 180;
  const exposedWindSpeed = wind.speed * course.windExposure.flightScale;
  const windBase = { x: Math.sin(windRadians) * exposedWindSpeed, y: 0, z: -Math.cos(windRadians) * exposedWindSpeed };
  const samples: FlightSample[] = keepSamples
    ? [Object.freeze({
        x: position.x,
        y: Math.max(
          0,
          position.y - launchGroundHeight - GOLF_BALL_RADIUS_METERS,
        ),
        z: position.z,
        elapsedSeconds: 0,
        phase: "flight",
      })]
    : [];
  let apex = position.y - launchGroundHeight;
  let elapsed = 0;
  let impactAngularVelocity: GroundVector = Object.freeze({ ...angular });
  let contacted = false;
  const dt = 0.01;
  const area = Math.PI * (0.04267 / 2) ** 2;
  const mass = 0.04593;

  for (let step = 1; step <= 1_200; step += 1) {
    const priorPosition = position;
    const priorVelocity = velocity;
    elapsed = step * dt;
    const heightAboveTerrain = Math.max(
      0,
      position.y - layout.terrainHeightAt(position),
    );
    const heightScale = Math.max(1, heightAboveTerrain) ** 0.14 / 10 ** 0.14;
    const gust = executionVariation
      ? 1 + Math.sin(elapsed * 1.13 + randomUnit(seed, 31) * Math.PI * 2) *
        course.windExposure.gustAmplitude
      : 1;
    const windVelocity = { x: windBase.x * heightScale * gust, y: 0, z: windBase.z * heightScale * gust };
    const air = { x: velocity.x - windVelocity.x, y: velocity.y, z: velocity.z - windVelocity.z };
    const airSpeed = Math.hypot(air.x, air.y, air.z);
    const dragFactor = airSpeed === 0 ? 0 : (0.5 * 1.225 * profile.drag * area * airSpeed) / mass;
    const cross = { x: angular.y * air.z - angular.z * air.y, y: angular.z * air.x - angular.x * air.z, z: angular.x * air.y - angular.y * air.x };
    const crossMagnitude = Math.hypot(cross.x, cross.y, cross.z);
    const spin = Math.hypot(angular.x, angular.y, angular.z);
    const liftCoefficient = airSpeed === 0 ? 0 : Math.min(0.26, 0.8 * ((spin * 0.021335) / airSpeed));
    const liftMagnitude = (0.5 * 1.225 * liftCoefficient * area * airSpeed ** 2) / mass;
    const lift = crossMagnitude === 0 ? { x: 0, y: 0, z: 0 } : { x: (cross.x / crossMagnitude) * liftMagnitude, y: (cross.y / crossMagnitude) * liftMagnitude, z: (cross.z / crossMagnitude) * liftMagnitude };
    velocity = {
      x: velocity.x + (-air.x * dragFactor + lift.x) * dt,
      y: velocity.y + (-9.80665 - air.y * dragFactor + lift.y) * dt,
      z: velocity.z + (-air.z * dragFactor + lift.z) * dt,
    };
    position = { x: position.x + velocity.x * dt, y: position.y + velocity.y * dt, z: position.z + velocity.z * dt };
    const spinScale = Math.exp(-0.06 * dt);
    angular = { x: angular.x * spinScale, y: angular.y * spinScale, z: angular.z * spinScale };
    apex = Math.max(apex, position.y - launchGroundHeight);
    if (contactMode === "layout") {
      const barrierHit = sweepCourseBarrier(layout, priorPosition, position);
      const terrainHit = sweepCourseTerrain(layout, priorPosition, position);
      if (barrierHit && (!terrainHit || barrierHit.fraction < terrainHit.fraction)) {
        const crossingVelocity = {
          x: priorVelocity.x + (velocity.x - priorVelocity.x) * barrierHit.fraction,
          y: priorVelocity.y + (velocity.y - priorVelocity.y) * barrierHit.fraction,
          z: priorVelocity.z + (velocity.z - priorVelocity.z) * barrierHit.fraction,
        };
        const normal = barrierHit.normal;
        const normalSpeed =
          crossingVelocity.x * normal.x +
          crossingVelocity.y * normal.y +
          crossingVelocity.z * normal.z;
        const tangent = {
          x: crossingVelocity.x - normal.x * normalSpeed,
          y: crossingVelocity.y - normal.y * normalSpeed,
          z: crossingVelocity.z - normal.z * normalSpeed,
        };
        velocity = {
          x:
            tangent.x * barrierHit.barrier.tangentialRetention -
            normal.x * normalSpeed * barrierHit.barrier.normalRestitution,
          y:
            tangent.y * barrierHit.barrier.tangentialRetention -
            normal.y * normalSpeed * barrierHit.barrier.normalRestitution,
          z:
            tangent.z * barrierHit.barrier.tangentialRetention -
            normal.z * normalSpeed * barrierHit.barrier.normalRestitution,
        };
        position = {
          x: barrierHit.point.x + normal.x * 0.002,
          y: barrierHit.point.y + normal.y * 0.002,
          z: barrierHit.point.z + normal.z * 0.002,
        };
        angular = {
          x: angular.x * 0.82,
          y: angular.y * 0.82,
          z: angular.z * 0.82,
        };
        elapsed = (step - 1 + barrierHit.fraction) * dt;
        if (keepSamples) {
          samples.push(Object.freeze({
            x: position.x,
            y: Math.max(
              0,
              position.y - courseContactHeightAt(layout, position) -
                GOLF_BALL_RADIUS_METERS,
            ),
            z: position.z,
            elapsedSeconds: elapsed,
            phase: "bounce",
          }));
        }
        continue;
      }
      if (terrainHit) {
        position = { ...terrainHit.point };
        velocity = {
          x: priorVelocity.x + (velocity.x - priorVelocity.x) * terrainHit.fraction,
          y: priorVelocity.y + (velocity.y - priorVelocity.y) * terrainHit.fraction,
          z: priorVelocity.z + (velocity.z - priorVelocity.z) * terrainHit.fraction,
        };
        elapsed = (step - 1 + terrainHit.fraction) * dt;
        impactAngularVelocity = Object.freeze({ ...angular });
        contacted = true;
        if (keepSamples) {
          samples.push(Object.freeze({
            x: position.x,
            y: 0,
            z: position.z,
            elapsedSeconds: elapsed,
            phase: "flight",
          }));
        }
        break;
      }
    } else {
      const contactHeight = launchGroundHeight + GOLF_BALL_RADIUS_METERS;
      const priorClearance = priorPosition.y - contactHeight;
      const nextClearance = position.y - contactHeight;
      if (nextClearance <= 0 && velocity.y < 0) {
        const crossing = clamp(
          priorClearance /
            Math.max(0.000_001, priorClearance - nextClearance),
          0,
          1,
        );
        position = {
          x: priorPosition.x + (position.x - priorPosition.x) * crossing,
          y: contactHeight,
          z: priorPosition.z + (position.z - priorPosition.z) * crossing,
        };
        velocity = {
          x: priorVelocity.x + (velocity.x - priorVelocity.x) * crossing,
          y: priorVelocity.y + (velocity.y - priorVelocity.y) * crossing,
          z: priorVelocity.z + (velocity.z - priorVelocity.z) * crossing,
        };
        elapsed = (step - 1 + crossing) * dt;
        impactAngularVelocity = Object.freeze({ ...angular });
        contacted = true;
        break;
      }
    }
    if (keepSamples && step % 5 === 0) {
      samples.push(Object.freeze({
        x: position.x,
        y: Math.max(
          0,
          position.y - courseContactHeightAt(layout, position) -
            GOLF_BALL_RADIUS_METERS,
        ),
        z: position.z,
        elapsedSeconds: elapsed,
        phase: "flight",
      }));
    }
  }

  if (!contacted) {
    throw new RangeError("Ball flight did not reach a physical contact inside the horizon.");
  }

  const landingSpinRateRPM =
    Math.hypot(angular.x, angular.y, angular.z) * 60 / (Math.PI * 2);
  const landingHorizontalSpeed = Math.hypot(velocity.x, velocity.z);
  const descentAngleDegrees = Math.atan2(
    Math.max(0, -velocity.y),
    Math.max(0.000_001, landingHorizontalSpeed),
  ) * 180 / Math.PI;
  return Object.freeze({
    landing: Object.freeze({ x: position.x, z: position.z }),
    impactVelocity: Object.freeze({ ...velocity }),
    samples: Object.freeze(samples),
    apexMeters: apex,
    elapsedSeconds: elapsed,
    ballSpeedMetersPerSecond: ballSpeed,
    launchDegrees,
    targetHeading,
    startErrorDegrees,
    impactAngularVelocity,
    spinRateRPM,
    landingSpinRateRPM,
    descentAngleDegrees,
  });
}

export type ExpectedFullShotFlight = Readonly<{
  courseLayoutId: string;
  courseArchetype: CourseArchetype;
  landing: Point;
  carryMeters: number;
  samples: readonly FlightSample[];
  apexMeters: number;
  flightSeconds: number;
}>;

export function expectedFullShotFlight(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  layout: CourseLayout,
  swingLength = decision.plannedSwingLength ?? 1,
): ExpectedFullShotFlight {
  const profile = CLUBS[decision.club];
  if (!profile || decision.club === "Putter") {
    throw new RangeError("Expected flight requires a flight club.");
  }
  const courseArchetype = layout.courseArchetype;
  const course = courseCharacter(courseArchetype);
  const flight = simulateFlight(
    ball,
    decision,
    wind,
    course,
    layout,
    profile,
    plannedDelivery(ball, decision, profile),
    speedScaleForDecision(decision, swingLength),
    0,
    false,
    true,
  );
  return Object.freeze({
    courseLayoutId: layout.id,
    courseArchetype,
    landing: flight.landing,
    carryMeters: distanceBetween(ball.position, flight.landing),
    samples: flight.samples,
    apexMeters: flight.apexMeters,
    flightSeconds: flight.elapsedSeconds,
  });
}

function expectedCarryAtSwing(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  swingLength: number,
  courseArchetype: CourseArchetype,
  layout: CourseLayout,
) {
  const profile = CLUBS[decision.club];
  if (!profile || decision.club === "Putter") return 0;
  const course = courseCharacter(courseArchetype);
  const delivery = decision.carryModel === "club-window" && decision.delivery
    ? resolveDelivery(ball, decision, profile, 0)
    : plannedDelivery(ball, decision, profile);
  const flight = simulateFlight(
    ball,
    decision,
    wind,
    course,
    layout,
    profile,
    delivery,
    speedScaleForDecision(decision, swingLength),
    0,
    false,
    false,
    decision.carryModel === "club-window" ? "launch-datum" : "layout",
  );
  return distanceBetween(ball.position, flight.landing);
}

export type SwingSolution = Readonly<{
  swingLength: number;
  expectedCarry: number;
  minimumCarry: number;
  maximumCarry: number;
  attainable: boolean;
}>;

export type SwingLengthWindow = Readonly<{
  minimum: number;
  maximum: number;
}>;

function solveSwingLengthInWindow(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  targetCarryMeters: number,
  layout: CourseLayout,
  window: SwingLengthWindow,
  iterations: number,
): SwingSolution {
  if (
    !Number.isFinite(targetCarryMeters) ||
    !Number.isFinite(window.minimum) ||
    !Number.isFinite(window.maximum) ||
    window.minimum >= window.maximum
  ) {
    throw new RangeError("Carry target and swing window must be finite and ordered.");
  }
  const courseArchetype = layout.courseArchetype;
  const minimumCarry = expectedCarryAtSwing(
    ball,
    decision,
    wind,
    window.minimum,
    courseArchetype,
    layout,
  );
  const maximumCarry = expectedCarryAtSwing(
    ball,
    decision,
    wind,
    window.maximum,
    courseArchetype,
    layout,
  );
  const target = clamp(targetCarryMeters, minimumCarry, maximumCarry);
  let low = window.minimum;
  let high = window.maximum;
  for (let index = 0; index < iterations; index += 1) {
    const candidate = (low + high) / 2;
    if (
      expectedCarryAtSwing(
        ball,
        decision,
        wind,
        candidate,
        courseArchetype,
        layout,
      ) < target
    ) low = candidate;
    else high = candidate;
  }
  const swingLength = (low + high) / 2;
  return Object.freeze({
    swingLength,
    expectedCarry: expectedCarryAtSwing(
      ball,
      decision,
      wind,
      swingLength,
      courseArchetype,
      layout,
    ),
    minimumCarry,
    maximumCarry,
    attainable: targetCarryMeters >= minimumCarry && targetCarryMeters <= maximumCarry,
  });
}

export function solveSwingLengthForCarry(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  targetCarryMeters: number,
  layout: CourseLayout,
): SwingSolution {
  return solveSwingLengthInWindow(
    ball,
    decision,
    wind,
    targetCarryMeters,
    layout,
    SWING_LENGTH_LIMITS,
    11,
  );
}

export function solveClubWindowSwingLengthForCarry(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  targetCarryMeters: number,
  layout: CourseLayout,
): SwingSolution {
  return solveSwingLengthInWindow(
    ball,
    Object.freeze({ ...decision, carryModel: "club-window" }),
    wind,
    targetCarryMeters,
    layout,
    PARTIAL_SHOT_SWING_LENGTHS,
    13,
  );
}

export function maximumClubWindowCarry(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  layout: CourseLayout,
) {
  const courseArchetype = layout.courseArchetype;
  return expectedCarryAtSwing(
    ball,
    Object.freeze({ ...decision, carryModel: "club-window" }),
    wind,
    PARTIAL_SHOT_SWING_LENGTHS.maximum,
    courseArchetype,
    layout,
  );
}

export function resolveFullShot(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  roundSeed: number,
  shotNumber: number,
  layout: CourseLayout,
): FullShotOutcome {
  const profile = CLUBS[decision.club];
  if (!profile || decision.club === "Putter") throw new RangeError("Full-shot physics requires a flight club.");
  const courseArchetype = layout.courseArchetype;
  const course = courseCharacter(courseArchetype);
  const deliveryKey = decision.delivery
    ? `${decision.delivery.clubPathDegrees}:${decision.delivery.faceAngleDegrees ?? "called"}:${decision.delivery.strikeXMillimeters}:${decision.delivery.strikeYMillimeters}:${decision.delivery.swingLength ?? "stock"}`
    : "seeded";
  const layoutPhysicsVersion = `${layout.physicsVersion}:${layout.terrainVersion}`;
  const physicsVersion = `${layoutPhysicsVersion}:${GROUND_CONTACT_PHYSICS_VERSION}:lie-spin-v1`;
  const carryModelKey = decision.carryModel === "club-window"
    ? ":club-window"
    : "";
  const outcomeSeed = hash32(`${physicsVersion}:${courseArchetype}:${roundSeed}:${shotNumber}:${ball.position.x}:${ball.position.z}:${ball.lie}:${wind.speed}:${wind.towardDegrees}:${decision.club}:${decision.route}:${decision.shape}:${decision.trajectory}:${decision.intent}${carryModelKey}:${decision.aimOffsetMeters ?? "default"}:${decision.targetCarryMeters ?? "stock"}:${decision.plannedSwingLength ?? "stock"}:${deliveryKey}`);
  const seed = hash32(`${roundSeed}:${shotNumber}:${ball.position.x}:${ball.position.z}:full-execution`);
  const delivery = resolveDelivery(ball, decision, profile, seed);
  const stockProjection =
    profile.stockCarry *
    INTENT[decision.intent].speed *
    TRAJECTORY[decision.trajectory].speed *
    liePerformanceFor(ball.lie, courseArchetype).carryFactor;
  const desiredCarry = projectedCarry(ball, decision, layout);
  const legacyTouchScale = desiredCarry < stockProjection
    ? Math.sqrt(desiredCarry / stockProjection)
    : 1;
  const swingWindow = decision.carryModel === "club-window"
    ? PARTIAL_SHOT_SWING_LENGTHS
    : SWING_LENGTH_LIMITS;
  const swingLength = clamp(
    decision.delivery?.swingLength ?? decision.plannedSwingLength ?? 1,
    swingWindow.minimum,
    swingWindow.maximum,
  );
  const speedScale = decision.delivery?.swingLength !== undefined || decision.plannedSwingLength !== undefined
    ? speedScaleForDecision(decision, swingLength)
    : legacyTouchScale;
  const flight = simulateFlight(
    ball,
    decision,
    wind,
    course,
    layout,
    profile,
    delivery,
    speedScale,
    seed,
    decision.delivery === undefined,
    true,
  );
  const {
    landing,
    impactVelocity: velocity,
    samples: flightSamples,
    apexMeters: apex,
    elapsedSeconds: elapsed,
    ballSpeedMetersPerSecond: ballSpeed,
    launchDegrees,
    targetHeading,
    startErrorDegrees,
    impactAngularVelocity,
    spinRateRPM,
    landingSpinRateRPM,
    descentAngleDegrees,
  } = flight;
  const samples = [...flightSamples];
  let windDrift = 0;
  const carryMeters = distanceBetween(ball.position, landing);
  const landingSurface = classifySurface(landing, layout);
  const solidLanding = landingSurface !== "water" && landingSurface !== "boundary";
  let rolled: Point = landing;
  let groundContact: GroundContactResult | null = null;
  let rollMeters = 0;
  let groundEndTime = elapsed;
  if (solidLanding) {
    const ground = simulateGroundContact({
      position: landing,
      velocity,
      angularVelocity: impactAngularVelocity,
      startedAtSeconds: elapsed,
      layout,
    });
    groundContact = ground;
    samples.push(...ground.samples);
    rolled = ground.final;
    rollMeters = ground.distanceMeters;
    groundEndTime = ground.elapsedSeconds;
  } else {
    samples.push(Object.freeze({
      x: landing.x,
      y: 0,
      z: landing.z,
      elapsedSeconds: elapsed + 0.04,
      phase: "penalty",
    }));
    samples.push(Object.freeze({
      x: landing.x,
      y: 0,
      z: landing.z,
      elapsedSeconds: elapsed + 0.72,
      phase: "penalty",
    }));
    groundEndTime = elapsed + 0.72;
  }
  let surface = solidLanding
    ? groundContact?.surface ?? classifySurface(rolled, layout)
    : landingSurface;
  const outcomeSurface = surface;
  let final = rolled;
  let penaltyStrokes = 0;
  let decisionRead = "The committed plan and execution produced the retained result.";

  if (surface === "water" || surface === "boundary") {
    penaltyStrokes = 1;
    const hazardContact = groundContact?.final ?? landing;
    const candidate = retainedPenaltyRelief(
      layout,
      ball.position,
      hazardContact,
      groundContact?.lastPlayable,
    );
    const dropSurface = classifySurface(candidate, layout);
    final = candidate;
    surface = dropSurface;
    samples.push(Object.freeze({ x: final.x, y: 0, z: final.z, elapsedSeconds: groundEndTime + 0.05, phase: "penalty" }));
    decisionRead = outcomeSurface === "water" ? "The inlet collected the shot. One penalty stroke and a measured lateral drop." : "The shot crossed the playable boundary. One penalty stroke and a measured return point.";
  }

  const remainingMeters = distanceBetween(final, layout.pin);
  const nextLie = surface === "green" ? "green" : surface === "bunker" ? "bunker" : surface === "fairway" ? "fairway" : "rough";
  const totalMeters = distanceBetween(ball.position, final);
  const strike = delivery.strike;
  const windlessEnd = { x: ball.position.x + Math.sin(targetHeading) * carryMeters, z: ball.position.z - Math.cos(targetHeading) * carryMeters };
  windDrift = distanceBetween(windlessEnd, landing);
  const summary = penaltyStrokes > 0 ? decisionRead : nextLie === "green" ? `${strike === "center" ? "Pure contact" : `A ${strike} strike`} finds the green, ${remainingMeters.toFixed(1)} metres from the cup.` : nextLie === "bunker" ? "The approach catches the right bunker. The next decision is a recovery, not a reroll." : nextLie === "fairway" ? `${strike === "center" ? "Centered contact" : `A ${strike} strike`} finishes in the fairway with ${remainingMeters.toFixed(0)} metres remaining.` : `${strike === "center" ? "Solid contact" : `A ${strike} strike`} finishes in the rough with ${remainingMeters.toFixed(0)} metres remaining.`;

  return Object.freeze({
    kind: "full",
    id: `shot-${outcomeSeed.toString(16).padStart(8, "0")}`,
    courseLayoutId: layout.id,
    coursePhysicsVersion: physicsVersion,
    courseArchetype,
    club: decision.club,
    decision: Object.freeze({ ...decision }),
    from: Object.freeze({ ...ball.position }),
    landing,
    final: Object.freeze({ ...final }),
    nextBall: Object.freeze({ position: Object.freeze({ ...final }), lie: nextLie, remainingMeters }),
    landingSurface,
    surface: outcomeSurface,
    carryMeters,
    rollMeters,
    totalMeters,
    apexMeters: apex,
    flightSeconds: elapsed,
    penaltyStrokes,
    samples: Object.freeze(samples),
    execution: Object.freeze({
      ...delivery,
      spinRateRPM,
      landingSpinRateRPM,
      descentAngleDegrees,
      swingLength,
      launchDegrees,
      ballSpeedMetersPerSecond: ballSpeed,
      startErrorDegrees,
      windDriftMeters: windDrift,
      cause: deliveryCause(delivery),
    }),
    summary,
    decisionRead,
  });
}

export type ExpectedFullShotRelease = Readonly<{
  courseLayoutId: string;
  courseArchetype: CourseArchetype;
  landing: Point;
  finish: Point;
  carryMeters: number;
  releaseMeters: number;
  landingSurface: SurfaceKind;
  finishSurface: SurfaceKind;
  penaltyExposure: boolean;
  flightSamples: readonly FlightSample[];
  apexMeters: number;
  flightSeconds: number;
}>;

/**
 * A seed-free centred projection of the selected landing picture through the
 * same bounce and terrain-following release model used by the retained shot.
 */
export function expectedFullShotRelease(
  ball: BallState,
  decision: FullShotDecision,
  wind: Wind,
  layout: CourseLayout,
): ExpectedFullShotRelease {
  const courseArchetype = layout.courseArchetype;
  const planned = SHAPE_DELIVERY[decision.shape];
  const outcome = resolveFullShot(
    ball,
    {
      ...decision,
      delivery: Object.freeze({
        clubPathDegrees: planned.path,
        faceAngleDegrees: planned.path + planned.faceToPath,
        strikeXMillimeters: 0,
        strikeYMillimeters: 0,
        swingLength: decision.plannedSwingLength ?? 1,
      }),
    },
    wind,
    0,
    0,
    layout,
  );
  return Object.freeze({
    courseLayoutId: layout.id,
    courseArchetype,
    landing: outcome.landing,
    finish: outcome.final,
    carryMeters: outcome.carryMeters,
    releaseMeters: outcome.rollMeters,
    landingSurface: outcome.landingSurface,
    finishSurface: outcome.surface,
    penaltyExposure: outcome.penaltyStrokes > 0,
    flightSamples: Object.freeze(
      outcome.samples.filter((sample) => sample.phase === "flight"),
    ),
    apexMeters: outcome.apexMeters,
    flightSeconds: outcome.flightSeconds,
  });
}

export function initialBallState(layout: CourseLayout): BallState {
  return Object.freeze({
    position: layout.tee,
    lie: "tee",
    remainingMeters: distanceBetween(layout.tee, layout.pin),
  });
}

type PuttPhysics = Readonly<{
  pin: Point;
  layout: CourseLayout;
  rollingDeceleration: number;
  groundMaterial: GroundMaterial | null;
  maximumStartSpeed: number;
  slidingFriction: number;
  launchAngleDegrees: number;
  initialRollRatio: number;
  terrainHeightAt: (point: Point) => number;
  sampleTerrain: (point: Point) => Readonly<{
    downhillAcceleration: Point;
  }>;
  bounds: Readonly<{
    minimumX: number;
    maximumX: number;
    minimumZ: number;
    maximumZ: number;
  }>;
  seedKey: string;
}>;

function puttGreenMaterial(
  courseArchetype: CourseArchetype,
  groundMaterial: GroundMaterial,
): GroundMaterial {
  const profile = PUTT_GREEN_ROLL_PROFILE[courseArchetype];
  return Object.freeze({
    ...groundMaterial,
    id: `${groundMaterial.id}-${PUTT_ROLL_PHYSICS_VERSION}`,
    rollingResistance: profile.rollingResistance,
    staticResistance: profile.staticResistance,
    velocityDrag: profile.velocityDrag,
  });
}

function puttStartSpeedForStrokeLength(
  strokeLengthNormalized: number,
  maximumStartSpeed: number,
) {
  const retainedLength = clamp(strokeLengthNormalized, 0, 1);
  return PUTT_STROKE_MINIMUM_SPEED +
    (maximumStartSpeed - PUTT_STROKE_MINIMUM_SPEED) *
      retainedLength ** PUTT_STROKE_SPEED_EXPONENT;
}

function puttStrokeLengthForStartSpeed(
  startSpeed: number,
  maximumStartSpeed: number,
) {
  const normalizedSpeed = clamp(
    (startSpeed - PUTT_STROKE_MINIMUM_SPEED) /
      (maximumStartSpeed - PUTT_STROKE_MINIMUM_SPEED),
    0,
    1,
  );
  return normalizedSpeed ** (1 / PUTT_STROKE_SPEED_EXPONENT);
}

function puttPhysics(layout: CourseLayout): PuttPhysics {
  const courseArchetype = layout.courseArchetype;
  const rollProfile = PUTT_GREEN_ROLL_PROFILE[courseArchetype];
  const rollingDeceleration = layout.groundMaterials.green.rollingResistance;
  const greenMaterial = puttGreenMaterial(
    courseArchetype,
    layout.groundMaterials.green,
  );
  return Object.freeze({
    pin: layout.pin,
    layout,
    rollingDeceleration,
    groundMaterial: greenMaterial,
    maximumStartSpeed: PUTT_STROKE_MAXIMUM_SPEED,
    slidingFriction: rollProfile.slidingFriction,
    launchAngleDegrees: rollProfile.launchAngleDegrees,
    initialRollRatio: rollProfile.initialRollRatio,
    terrainHeightAt: layout.terrainHeightAt,
    sampleTerrain: layout.sampleTerrain,
    bounds: layout.bounds,
    seedKey: `${layout.id}:${layout.physicsVersion}:${layout.terrainVersion}:${GROUND_CONTACT_PHYSICS_VERSION}:${courseArchetype}:green-${rollingDeceleration}:${greenMaterial?.id ?? "legacy"}:${PUTT_ROLL_PHYSICS_VERSION}:${PUTT_CUP_PHYSICS_VERSION}`,
  });
}

export function greenSlopeAt(
  point: Point,
  layout: CourseLayout,
): Point {
  return puttPhysics(layout).sampleTerrain(point).downhillAcceleration;
}

function rotateDirection(direction: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: direction.x * cosine - direction.z * sine,
    z: direction.x * sine + direction.z * cosine,
  };
}

type PuttSimulation = {
  readonly final: Point;
  readonly samples: readonly FlightSample[];
  readonly holed: boolean;
  readonly lipOut: boolean;
  readonly elapsedSeconds: number;
  readonly speedAtCup: number | null;
  readonly closestToCup: number;
  readonly surface: SurfaceKind;
  readonly settled: boolean;
  readonly terminalSpeedMetersPerSecond: number;
  readonly lastPlayable: Point;
  readonly cupInteraction: PuttCupInteraction | null;
};

function simulatePutt(
  from: Point,
  lineDegrees: number,
  initialSpeed: number,
  keepSamples: boolean,
  interactWithCup: boolean,
  physics: PuttPhysics,
): PuttSimulation {
  const roundPuttTime = (value: number) =>
    Math.round(value * 1_000_000_000) / 1_000_000_000;
  const distance = Math.max(0.001, distanceBetween(from, physics.pin));
  const direct = {
    x: (physics.pin.x - from.x) / distance,
    z: (physics.pin.z - from.z) / distance,
  };
  const direction = rotateDirection(direct, lineDegrees);
  let position = { x: from.x, z: from.z };
  let velocity = { x: direction.x * initialSpeed, z: direction.z * initialSpeed };
  const samples: FlightSample[] = [];
  let elapsed = 0;
  let closestToCup = distance;
  let speedAtCup: number | null = null;
  let lipOut = false;
  let cupArmed = true;
  let cupInteraction: PuttCupInteraction | null = null;
  let rollingRotationRadians = 0;
  let angularSpeedRadiansPerSecond =
    (initialSpeed / GOLF_BALL_RADIUS_METERS) * physics.initialRollRatio;
  const launchAngleRadians = (physics.launchAngleDegrees * Math.PI) / 180;
  const verticalLaunchSpeed = initialSpeed * Math.tan(launchAngleRadians);
  const hopDurationSeconds = Math.max(
    0,
    (verticalLaunchSpeed * 2) / PUTT_GRAVITY,
  );
  let puttHeightMeters = 0;
  let puttMotionPhase: NonNullable<FlightSample["puttMotionPhase"]> =
    hopDurationSeconds >= 0.004 ? "hop" : "skid";
  let settled = false;
  let exitedBounds = false;
  let surface: SurfaceKind = physics.layout
    ? classifySurface(position, physics.layout)
    : "green";
  let lastPlayable = { ...position };
  const dt = 0.01;
  let segmentRotationRadians = 0;
  let segmentMotionPhase: NonNullable<FlightSample["puttMotionPhase"]> =
    puttMotionPhase;
  let segmentEnd = { ...position };
  const retainMotionRotation = (fromPoint: Point, toPoint: Point) => {
    const retainedTravel = distanceBetween(fromPoint, toPoint);
    const fullTravel = distanceBetween(fromPoint, segmentEnd);
    const fraction = fullTravel <= 0.000_000_1
      ? 1
      : clamp(retainedTravel / fullTravel, 0, 1);
    rollingRotationRadians += segmentMotionPhase === "roll"
      ? retainedTravel / GOLF_BALL_RADIUS_METERS
      : segmentRotationRadians * fraction;
  };
  const sampleTelemetry = () => {
    const speedMetersPerSecond = Math.hypot(velocity.x, velocity.z);
    return Object.freeze({
      puttMotionPhase,
      speedMetersPerSecond,
      angularSpeedRadiansPerSecond,
      slipMetersPerSecond: Math.max(
        0,
        speedMetersPerSecond -
          angularSpeedRadiansPerSecond * GOLF_BALL_RADIUS_METERS,
      ),
    });
  };

  if (keepSamples) {
    samples.push(Object.freeze({
      ...position,
      y: 0,
      elapsedSeconds: 0,
      phase: "putt",
      rotationRadians: rollingRotationRadians,
      ...sampleTelemetry(),
    }));
  }
  // The retained North Inlet integrator can take a little over 30 seconds to
  // settle on its steepest playable green reads. A 20 second horizon used to
  // return a visibly moving ball as if it had stopped. Keep the active layout
  // solver's wider horizon and give the legacy path enough room to reach a
  // physical rest as well.
  const maximumSteps = physics.groundMaterial ? 12_000 : 6_000;
  let completedSteps = 0;
  let sampledMotionPhase: NonNullable<FlightSample["puttMotionPhase"]> =
    puttMotionPhase;
  for (let step = 1; step <= maximumSteps; step += 1) {
    completedSteps = step;
    const stepStartedAt = elapsed;
    elapsed = roundPuttTime(stepStartedAt + dt);
    const speed = Math.hypot(velocity.x, velocity.z);
    if (
      !cupArmed &&
      distanceBetween(position, physics.pin) > PUTT_CUP_RADIUS_METERS + 0.0075
    ) {
      cupArmed = true;
    }
    const slope = physics.sampleTerrain(position).downhillAcceleration;
    const prior = { ...position };
    segmentMotionPhase = puttMotionPhase;
    segmentRotationRadians = 0;
    if (puttMotionPhase === "hop") {
      position = {
        x: position.x + velocity.x * dt,
        z: position.z + velocity.z * dt,
      };
      puttHeightMeters = Math.max(
        0,
        verticalLaunchSpeed * elapsed -
          0.5 * PUTT_GRAVITY * elapsed ** 2,
      );
      segmentRotationRadians = angularSpeedRadiansPerSecond * dt;
      if (elapsed >= hopDurationSeconds) {
        puttHeightMeters = 0;
        puttMotionPhase = "skid";
      }
      surface = physics.layout
        ? classifySurface(position, physics.layout)
        : "green";
      lastPlayable = { ...position };
    } else if (puttMotionPhase === "skid") {
      if (speed <= PUTT_SETTLE_SPEED) {
        velocity = { x: 0, z: 0 };
        angularSpeedRadiansPerSecond = 0;
        puttMotionPhase = "roll";
        settled = true;
        break;
      }
      const speedDirection = {
        x: velocity.x / speed,
        z: velocity.z / speed,
      };
      const slidingAcceleration = physics.slidingFriction * PUTT_GRAVITY;
      const nextVelocity = {
        x: velocity.x +
          (slope.x - speedDirection.x * slidingAcceleration) * dt,
        z: velocity.z +
          (slope.z - speedDirection.z * slidingAcceleration) * dt,
      };
      const retainedAlongSpeed =
        nextVelocity.x * speedDirection.x + nextVelocity.z * speedDirection.z;
      const retainedVelocity = retainedAlongSpeed <= 0
        ? { x: 0, z: 0 }
        : nextVelocity;
      position = {
        x: position.x + (velocity.x + retainedVelocity.x) * 0.5 * dt,
        z: position.z + (velocity.z + retainedVelocity.z) * 0.5 * dt,
      };
      const priorAngularSpeed = angularSpeedRadiansPerSecond;
      angularSpeedRadiansPerSecond +=
        (2.5 * slidingAcceleration * dt) / GOLF_BALL_RADIUS_METERS;
      velocity = retainedVelocity;
      const nextSpeed = Math.hypot(velocity.x, velocity.z);
      const nextSlip =
        nextSpeed - angularSpeedRadiansPerSecond * GOLF_BALL_RADIUS_METERS;
      if (nextSlip <= PUTT_SLIP_SETTLE_SPEED) {
        angularSpeedRadiansPerSecond =
          nextSpeed / GOLF_BALL_RADIUS_METERS;
        puttMotionPhase = "roll";
      }
      segmentRotationRadians =
        (priorAngularSpeed + angularSpeedRadiansPerSecond) * 0.5 * dt;
      surface = physics.layout
        ? classifySurface(position, physics.layout)
        : "green";
      if (surface === "water" || surface === "boundary") {
        segmentEnd = { ...position };
        retainMotionRotation(prior, position);
        lastPlayable = prior;
        if (keepSamples) {
          samples.push(Object.freeze({
            ...position,
            y: 0,
            elapsedSeconds: elapsed,
            phase: "putt",
            rotationRadians: rollingRotationRadians,
            ...sampleTelemetry(),
          }));
        }
        break;
      }
      lastPlayable = { ...position };
    } else if (physics.groundMaterial && physics.layout) {
      const advanced = advanceCourseGroundRoll(
        physics.layout,
        position,
        velocity,
        dt,
        {
          accelerateFromRest: true,
          greenMaterial: physics.groundMaterial,
          settleSpeedMetersPerSecond: PUTT_SETTLE_SPEED,
        },
      );
      elapsed = roundPuttTime(
        stepStartedAt + dt * advanced.traveledFraction,
      );
      if (advanced.settled) {
        velocity = { x: 0, z: 0 };
        position = { ...advanced.position };
        segmentEnd = { ...position };
        retainMotionRotation(prior, position);
        angularSpeedRadiansPerSecond = 0;
        surface = advanced.surface;
        lastPlayable = { ...position };
        settled = true;
        break;
      }
      velocity = { ...advanced.velocity };
      position = { ...advanced.position };
      angularSpeedRadiansPerSecond =
        Math.hypot(velocity.x, velocity.z) / GOLF_BALL_RADIUS_METERS;
      surface = advanced.surface;
      if (surface === "water" || surface === "boundary") {
        segmentEnd = { ...position };
        retainMotionRotation(prior, position);
        lastPlayable = prior;
        if (keepSamples) {
          samples.push(Object.freeze({
            ...position,
            y: 0,
            elapsedSeconds: elapsed,
            phase: "putt",
            rotationRadians: rollingRotationRadians,
            ...sampleTelemetry(),
          }));
        }
        break;
      }
      lastPlayable = { ...position };
    } else {
      if (speed <= 0.018) break;
      const rolling = {
        x: (-velocity.x / speed) * physics.rollingDeceleration,
        z: (-velocity.z / speed) * physics.rollingDeceleration,
      };
      velocity = {
        x: velocity.x + (rolling.x + slope.x) * dt,
        z: velocity.z + (rolling.z + slope.z) * dt,
      };
      position = {
        x: position.x + velocity.x * dt,
        z: position.z + velocity.z * dt,
      };
      angularSpeedRadiansPerSecond =
        Math.hypot(velocity.x, velocity.z) / GOLF_BALL_RADIUS_METERS;
    }
    segmentEnd = { ...position };
    const nextSpeed = Math.hypot(velocity.x, velocity.z);
    if (
      puttMotionPhase === "roll" &&
      !physics.groundMaterial &&
      velocity.x * direction.x + velocity.z * direction.z < 0 &&
      nextSpeed < 0.06
    ) {
      retainMotionRotation(prior, position);
      velocity = { x: 0, z: 0 };
      angularSpeedRadiansPerSecond = 0;
      break;
    }
    const cupDistance = distanceBetween(position, physics.pin);
    closestToCup = Math.min(closestToCup, cupDistance);
    if (
      interactWithCup &&
      cupArmed &&
      surface === "green" &&
      puttHeightMeters <= 0.000_25
    ) {
      const cup = simulatePuttCupInteraction({
        from: prior,
        to: position,
        velocity,
        pin: physics.pin,
        stepStartedAtSeconds: stepStartedAt,
        stepDurationSeconds: Math.max(0.000_001, elapsed - stepStartedAt),
      });
      if (cup) {
        const cupEntry = cup.events[0] ?? cup.final;
        retainMotionRotation(prior, cupEntry);
        speedAtCup ??= cup.interaction.entrySpeedMetersPerSecond;
        cupInteraction = cup.interaction;
        closestToCup = Math.min(
          closestToCup,
          cup.interaction.impactParameterMeters,
        );
        if (keepSamples) {
          const cupRotationStart = rollingRotationRadians;
          for (const event of cup.events) {
            samples.push(Object.freeze({
              x: event.x,
              y: event.y,
              z: event.z,
              elapsedSeconds: event.elapsedSeconds,
              phase: event.kind === "drop" || event.kind === "bottom"
                ? "cup"
                : "putt",
              cupEvent: event.kind,
              rotationRadians: cupRotationStart + event.rotationRadians,
              puttMotionPhase: "roll",
              speedMetersPerSecond:
                event.kind === "bottom"
                  ? 0
                  : event.speedMetersPerSecond,
              angularSpeedRadiansPerSecond:
                event.kind === "bottom"
                  ? 0
                  : event.angularSpeedRadiansPerSecond,
              slipMetersPerSecond: 0,
            }));
          }
        }
        rollingRotationRadians += cup.events.at(-1)?.rotationRadians ?? 0;
        elapsed = cup.elapsedSeconds;
        position = { ...cup.final };
        velocity = { ...cup.velocity };
        puttMotionPhase = "roll";
        angularSpeedRadiansPerSecond =
          Math.hypot(velocity.x, velocity.z) / GOLF_BALL_RADIUS_METERS;
        if (cup.holed) {
          return {
            final: physics.pin,
            samples: Object.freeze(samples),
            holed: true,
            lipOut: false,
            elapsedSeconds: elapsed,
            speedAtCup,
            closestToCup: 0,
            surface: "green",
            settled: true,
            terminalSpeedMetersPerSecond: 0,
            lastPlayable: physics.pin,
            cupInteraction,
          };
        }
        lipOut = true;
        cupArmed = false;
        lastPlayable = { ...position };
        continue;
      }
    }
    retainMotionRotation(prior, position);
    const motionPhaseChanged = puttMotionPhase !== sampledMotionPhase;
    if (
      keepSamples &&
      (
        step % 4 === 0 ||
        nextSpeed < 0.2 ||
        motionPhaseChanged ||
        segmentMotionPhase === "hop"
      )
    ) {
      samples.push(Object.freeze({
        ...position,
        y: puttHeightMeters,
        elapsedSeconds: elapsed,
        phase: "putt",
        rotationRadians: rollingRotationRadians,
        ...sampleTelemetry(),
      }));
      sampledMotionPhase = puttMotionPhase;
    }
    if (
      position.x < physics.bounds.minimumX ||
      position.x > physics.bounds.maximumX ||
      position.z < physics.bounds.minimumZ ||
      position.z > physics.bounds.maximumZ
    ) {
      exitedBounds = true;
      break;
    }
  }

  if (keepSamples) {
    const prior = samples.at(-1);
    if (
      !prior ||
      Math.abs(prior.elapsedSeconds - elapsed) > 0.000_000_001 ||
      Math.hypot(prior.x - position.x, prior.z - position.z) > 0.000_001 ||
      Math.abs(prior.y) > 0.000_001
    ) {
      samples.push(Object.freeze({
        ...position,
        y: puttHeightMeters,
        elapsedSeconds: elapsed,
        phase: "putt",
        rotationRadians: rollingRotationRadians,
        ...sampleTelemetry(),
      }));
    }
  }
  const terminalSpeedMetersPerSecond = Math.hypot(velocity.x, velocity.z);
  if (
    (completedSteps >= maximumSteps || exitedBounds) &&
    !settled &&
    surface !== "water" &&
    surface !== "boundary" &&
    terminalSpeedMetersPerSecond > 0.075
  ) {
    throw new RangeError("Putt roll did not settle inside the physical horizon.");
  }
  return {
    final: position,
    samples: Object.freeze(samples),
    holed: false,
    lipOut,
    elapsedSeconds: elapsed,
    speedAtCup,
    closestToCup,
    surface,
    settled,
    terminalSpeedMetersPerSecond,
    lastPlayable,
    cupInteraction,
  };
}

function puttTravelAlongDirect(from: Point, final: Point, physics: PuttPhysics) {
  const distance = Math.max(0.001, distanceBetween(from, physics.pin));
  const direct = {
    x: (physics.pin.x - from.x) / distance,
    z: (physics.pin.z - from.z) / distance,
  };
  return (final.x - from.x) * direct.x + (final.z - from.z) * direct.z;
}

function simulatePuttPlan(
  from: Point,
  lineDegrees: number,
  initialSpeed: number,
  physics: PuttPhysics,
) {
  const distance = Math.max(0.001, distanceBetween(from, physics.pin));
  const direct = {
    x: (physics.pin.x - from.x) / distance,
    z: (physics.pin.z - from.z) / distance,
  };
  const direction = rotateDirection(direct, lineDegrees);
  let position = { ...from };
  let velocity = {
    x: direction.x * initialSpeed,
    z: direction.z * initialSpeed,
  };
  let closestToCup = distance;
  let elapsed = 0;
  let angularSpeedRadiansPerSecond =
    (initialSpeed / GOLF_BALL_RADIUS_METERS) * physics.initialRollRatio;
  const launchAngleRadians = (physics.launchAngleDegrees * Math.PI) / 180;
  const verticalLaunchSpeed = initialSpeed * Math.tan(launchAngleRadians);
  const hopDurationSeconds = Math.max(
    0,
    (verticalLaunchSpeed * 2) / PUTT_GRAVITY,
  );
  let motionPhase: "hop" | "skid" | "roll" =
    hopDurationSeconds >= 0.004 ? "hop" : "skid";
  const dt = 0.03;

  for (let step = 0; step < 4_800; step += 1) {
    elapsed += dt;
    const speed = Math.hypot(velocity.x, velocity.z);
    const slope = physics.sampleTerrain(position).downhillAcceleration;
    if (motionPhase === "hop") {
      position = {
        x: position.x + velocity.x * dt,
        z: position.z + velocity.z * dt,
      };
      if (elapsed >= hopDurationSeconds) motionPhase = "skid";
    } else if (motionPhase === "skid") {
      if (speed <= PUTT_SETTLE_SPEED) break;
      const speedDirection = {
        x: velocity.x / speed,
        z: velocity.z / speed,
      };
      const slidingAcceleration = physics.slidingFriction * PUTT_GRAVITY;
      const candidateVelocity = {
        x: velocity.x +
          (slope.x - speedDirection.x * slidingAcceleration) * dt,
        z: velocity.z +
          (slope.z - speedDirection.z * slidingAcceleration) * dt,
      };
      const retainedAlongSpeed =
        candidateVelocity.x * speedDirection.x +
        candidateVelocity.z * speedDirection.z;
      const nextVelocity = retainedAlongSpeed <= 0
        ? { x: 0, z: 0 }
        : candidateVelocity;
      position = {
        x: position.x + (velocity.x + nextVelocity.x) * 0.5 * dt,
        z: position.z + (velocity.z + nextVelocity.z) * 0.5 * dt,
      };
      angularSpeedRadiansPerSecond +=
        (2.5 * slidingAcceleration * dt) / GOLF_BALL_RADIUS_METERS;
      velocity = nextVelocity;
      const nextSpeed = Math.hypot(velocity.x, velocity.z);
      if (
        nextSpeed -
          angularSpeedRadiansPerSecond * GOLF_BALL_RADIUS_METERS <=
        PUTT_SLIP_SETTLE_SPEED
      ) {
        angularSpeedRadiansPerSecond =
          nextSpeed / GOLF_BALL_RADIUS_METERS;
        motionPhase = "roll";
      }
    } else if (physics.groundMaterial && physics.layout) {
      const advanced = advanceCourseGroundRoll(
        physics.layout,
        position,
        velocity,
        dt,
        {
          accelerateFromRest: true,
          greenMaterial: physics.groundMaterial,
          settleSpeedMetersPerSecond: PUTT_SETTLE_SPEED,
        },
      );
      position = { ...advanced.position };
      velocity = { ...advanced.velocity };
      if (
        advanced.settled ||
        advanced.surface === "water" ||
        advanced.surface === "boundary"
      ) break;
    } else {
      if (speed <= 0.018) break;
      const rolling = {
        x: (-velocity.x / speed) * physics.rollingDeceleration,
        z: (-velocity.z / speed) * physics.rollingDeceleration,
      };
      velocity = {
        x: velocity.x + (rolling.x + slope.x) * dt,
        z: velocity.z + (rolling.z + slope.z) * dt,
      };
      position = {
        x: position.x + velocity.x * dt,
        z: position.z + velocity.z * dt,
      };
    }
    closestToCup = Math.min(
      closestToCup,
      distanceBetween(position, physics.pin),
    );
    if (
      position.x < physics.bounds.minimumX ||
      position.x > physics.bounds.maximumX ||
      position.z < physics.bounds.minimumZ ||
      position.z > physics.bounds.maximumZ
    ) break;
  }

  return Object.freeze({
    final: Object.freeze(position),
    closestToCup,
  });
}

const PUTT_SPEED_PLAN_CACHE = new Map<string, number>();

function puttSpeedPlanKey(
  ball: BallState,
  pastCupMeters: number,
  lineDegrees: number,
  physics: PuttPhysics,
) {
  return `physical-plan-v3:${physics.seedKey}:${ball.position.x}:${ball.position.z}:${pastCupMeters}:${lineDegrees}`;
}

function basePuttSpeedForPastCup(
  ball: BallState,
  pastCupMeters: number,
  lineDegrees: number,
  physics: PuttPhysics,
): number {
  const cacheKey = puttSpeedPlanKey(
    ball,
    pastCupMeters,
    lineDegrees,
    physics,
  );
  const cached = PUTT_SPEED_PLAN_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;
  const distanceMeters = distanceBetween(ball.position, physics.pin);
  const targetTravel = Math.max(0.08, distanceMeters + pastCupMeters);
  let low = 0.18;
  let high = Math.min(6.4, physics.maximumStartSpeed);
  if (physics.maximumStartSpeed > high) {
    const stockCeiling = simulatePuttPlan(
      ball.position,
      lineDegrees,
      high,
      physics,
    );
    if (
      puttTravelAlongDirect(ball.position, stockCeiling.final, physics) <
        targetTravel
    ) {
      low = high;
      high = physics.maximumStartSpeed;
    }
  }
  for (let index = 0; index < 7; index += 1) {
    const candidate = (low + high) * 0.5;
    const simulation = simulatePuttPlan(
      ball.position,
      lineDegrees,
      candidate,
      physics,
    );
    if (puttTravelAlongDirect(ball.position, simulation.final, physics) < targetTravel) {
      low = candidate;
    } else {
      high = candidate;
    }
  }
  const retained = (low + high) * 0.5;
  PUTT_SPEED_PLAN_CACHE.set(cacheKey, retained);
  if (PUTT_SPEED_PLAN_CACHE.size > 4_096) {
    const oldest = PUTT_SPEED_PLAN_CACHE.keys().next().value;
    if (oldest !== undefined) PUTT_SPEED_PLAN_CACHE.delete(oldest);
  }
  return retained;
}

function solvePuttPlan(
  ball: BallState,
  strategy: PuttStrategy,
  physics: PuttPhysics,
) {
  const pace = PUTT_STRATEGY[strategy];
  const speed = basePuttSpeedForPastCup(
    ball,
    pace.pastCupMeters,
    0,
    physics,
  );
  const missAt = (line: number) =>
    simulatePuttPlan(ball.position, line, speed, physics).closestToCup;
  const goldenRatio = (Math.sqrt(5) - 1) / 2;
  let minimum = -7;
  let maximum = 7;
  let left = maximum - goldenRatio * (maximum - minimum);
  let right = minimum + goldenRatio * (maximum - minimum);
  let leftMiss = missAt(left);
  let rightMiss = missAt(right);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    if (leftMiss <= rightMiss) {
      maximum = right;
      right = left;
      rightMiss = leftMiss;
      left = maximum - goldenRatio * (maximum - minimum);
      leftMiss = missAt(left);
    } else {
      minimum = left;
      left = right;
      leftMiss = rightMiss;
      right = minimum + goldenRatio * (maximum - minimum);
      rightMiss = missAt(right);
    }
  }
  const bestLine = leftMiss <= rightMiss ? left : right;
  return Object.freeze({
    lineDegrees: Math.round(bestLine * 10) / 10,
    speed,
  });
}

export function plannedPuttStrokeLength(
  ball: BallState,
  paceMetersPastCup: number,
  layout: CourseLayout,
  lineDegrees?: number,
) {
  if (ball.lie !== "green") {
    throw new RangeError("A putting stroke plan requires a ball on the green.");
  }
  const physics = puttPhysics(layout);
  const line = lineDegrees ?? solvePuttPlan(ball, "Balanced", physics).lineDegrees;
  const startSpeed = basePuttSpeedForPastCup(
    ball,
    paceMetersPastCup,
    line,
    physics,
  );
  return clamp(
    puttStrokeLengthForStartSpeed(startSpeed, physics.maximumStartSpeed),
    0,
    1,
  );
}

export function previewPuttPath(
  ball: BallState,
  lineDegrees: number,
  paceMetersPastCup: number,
  layout: CourseLayout,
): readonly FlightSample[] {
  if (ball.lie !== "green") throw new RangeError("Putting requires a ball on the green.");
  if (!Number.isFinite(lineDegrees) || Math.abs(lineDegrees) > 12) throw new RangeError("Putt line must be within ±12 degrees.");
  if (!Number.isFinite(paceMetersPastCup)) throw new RangeError("Putt pace must be finite.");
  const pace = clamp(paceMetersPastCup, -0.2, 1.5);
  const physics = puttPhysics(layout);
  return simulatePutt(
    ball.position,
    lineDegrees,
    basePuttSpeedForPastCup(ball, pace, lineDegrees, physics),
    true,
    true,
    physics,
  ).samples;
}

function recommendedPuttLine(
  ball: BallState,
  strategy: PuttStrategy,
  physics: PuttPhysics,
): number {
  return solvePuttPlan(ball, strategy, physics).lineDegrees;
}

export function readGreen(
  ball: BallState,
  strategy: PuttStrategy,
  layout: CourseLayout,
): GreenRead {
  if (ball.lie !== "green") throw new RangeError("A green read requires a ball on the green.");
  const physics = puttPhysics(layout);
  const recommendedLineDegrees = recommendedPuttLine(ball, strategy, physics);
  const direction = recommendedLineDegrees >= 0 ? "right" : "left";
  const elevationChangeMeters =
    physics.terrainHeightAt(physics.pin) - physics.terrainHeightAt(ball.position);
  const paceRead = elevationChangeMeters > 0.035 ? "uphill" : elevationChangeMeters < -0.035 ? "downhill" : "level";
  const breakDegrees = Math.abs(recommendedLineDegrees);
  return Object.freeze({
    breakDirection: direction,
    breakDegrees,
    recommendedLineDegrees,
    elevationChangeMeters,
    paceRead,
    summary: `${paceRead[0]?.toUpperCase()}${paceRead.slice(1)} · plays ${breakDegrees.toFixed(1)}° ${direction}`,
  });
}

export function resolvePutt(
  ball: BallState,
  decision: PuttDecision,
  roundSeed: number,
  strokeNumber: number,
  layout: CourseLayout,
): PuttOutcome {
  if (ball.lie !== "green") throw new RangeError("Putting requires a ball on the green.");
  if (!Number.isFinite(decision.lineDegrees) || Math.abs(decision.lineDegrees) > 12) throw new RangeError("Putt line must be within ±12 degrees.");
  if (decision.paceMetersPastCup !== undefined && !Number.isFinite(decision.paceMetersPastCup)) throw new RangeError("Putt pace must be finite.");
  const strategy = PUTT_STRATEGY[decision.strategy];
  const physics = puttPhysics(layout);
  const committedPace = clamp(
    decision.paceMetersPastCup ?? strategy.pastCupMeters,
    -0.2,
    1.5,
  );
  const activeDelivery = decision.delivery
    ? Object.freeze({
        strokeLengthNormalized: clamp(
          decision.delivery.strokeLengthNormalized,
          0,
          1,
        ),
        startLineErrorDegrees: clamp(decision.delivery.startLineErrorDegrees, -8, 8),
        contactOffsetMillimeters: clamp(decision.delivery.contactOffsetMillimeters, -9, 9),
      })
    : null;
  const deliveryKey = activeDelivery
    ? `${activeDelivery.strokeLengthNormalized}:${activeDelivery.startLineErrorDegrees}:${activeDelivery.contactOffsetMillimeters}`
    : "assisted";
  const seed = hash32(`${physics.seedKey}:${roundSeed}:${strokeNumber}:${ball.position.x}:${ball.position.z}:${decision.strategy}:${decision.lineDegrees}:${committedPace}:${deliveryKey}:putt`);
  const executionSeed = hash32(`${roundSeed}:${strokeNumber}:${ball.position.x}:${ball.position.z}:putt-execution`);
  const lineExecutionScale = Math.min(1, Math.max(0.25, ball.remainingMeters / 8));
  const paceExecutionScale = Math.min(1, Math.max(0.35, ball.remainingMeters / 10));
  const contactDirectionBias = (activeDelivery?.contactOffsetMillimeters ?? 0) * 0.025;
  const lineErrorDegrees = activeDelivery
    ? activeDelivery.startLineErrorDegrees + contactDirectionBias
    : centeredNoise(executionSeed, 101) * strategy.lineNoiseDegrees * lineExecutionScale;
  const contactEfficiency = activeDelivery
    ? 1 - Math.min(0.1, Math.abs(activeDelivery.contactOffsetMillimeters) * 0.008)
    : 1;
  const plannedStartSpeed = basePuttSpeedForPastCup(
    ball,
    committedPace,
    decision.lineDegrees,
    physics,
  );
  const startSpeed = activeDelivery
    ? puttStartSpeedForStrokeLength(
        activeDelivery.strokeLengthNormalized,
        physics.maximumStartSpeed,
      ) * contactEfficiency
    : plannedStartSpeed *
      (1 + centeredNoise(executionSeed, 105) * strategy.paceNoise * paceExecutionScale);
  const paceErrorPercent = startSpeed / plannedStartSpeed - 1;
  const actualLine = decision.lineDegrees + lineErrorDegrees;
  const simulation = simulatePutt(
    ball.position,
    actualLine,
    startSpeed,
    true,
    true,
    physics,
  );
  const outcomeSurface = simulation.surface;
  let penaltyStrokes = 0;
  let final = Object.freeze({ ...simulation.final });
  const retainedSamples = [...simulation.samples];
  if (
    physics.layout &&
    (outcomeSurface === "water" || outcomeSurface === "boundary")
  ) {
    penaltyStrokes = 1;
    final = retainedPenaltyRelief(
      physics.layout,
      ball.position,
      simulation.final,
      simulation.lastPlayable,
    );
    retainedSamples.push(Object.freeze({
      ...final,
      y: 0,
      elapsedSeconds: simulation.elapsedSeconds + 0.05,
      phase: "penalty",
    }));
  }
  const retainedSurface = physics.layout
    ? classifySurface(final, physics.layout)
    : "green";
  const leaveDistance = simulation.holed
    ? 0
    : distanceBetween(final, physics.pin);
  const cupStyle = simulation.cupInteraction?.style ?? null;
  const cupSide = simulation.cupInteraction?.side ?? "center";
  const cupSideLabel = cupSide === "center" ? "centre" : `${cupSide} edge`;
  const summary = penaltyStrokes > 0
    ? outcomeSurface === "water"
      ? "The putt reached water. One penalty stroke and a measured relief point."
      : "The putt left the playable boundary. One penalty stroke and a measured relief point."
    : simulation.holed
    ? cupStyle === "dying-drop"
      ? "The ball spends its last rotation on the rim and falls."
      : cupStyle === "back-wall-in"
        ? "The ball catches the back edge, loses its speed and drops."
        : cupStyle === "horseshoe-in"
          ? `The ball rides the ${cupSideLabel} and turns into the cup.`
          : cupStyle === "edge-catch"
            ? `The ${cupSide} edge catches the ball and it drops.`
            : `${decision.strategy} pace holds its line and drops.`
    : simulation.lipOut
      ? cupStyle === "back-wall-out"
        ? "The ball catches the back edge hard and rebounds out."
        : cupStyle === "horseshoe-out"
          ? `The ball rides around the ${cupSideLabel} and comes back out.`
          : cupStyle === "hole-lip-out"
            ? `The ball dives below the ${cupSideLabel} and escapes.`
            : `The ball burns the ${cupSideLabel} and stays out.`
      : leaveDistance <= 0.65
        ? `A committed read leaves a tap-in of ${leaveDistance.toFixed(2)} metres.`
        : leaveDistance <= 1.8
          ? `The break wins late. ${leaveDistance.toFixed(1)} metres remain.`
          : `${decision.strategy} pace and the chosen line leave ${leaveDistance.toFixed(1)} metres.`;
  const decisionRead = penaltyStrokes > 0
    ? "The retained roll crossed the first exact hazard boundary."
    : simulation.holed
    ? "The physical ball cleared the rim and finished below the putting surface."
    : simulation.lipOut
      ? "A swept rim or wall contact redirected the physical ball back onto the green."
      : `The retained roll missed the cup centre by ${simulation.closestToCup.toFixed(2)} metres.`;
  const nextLie = retainedSurface === "green"
    ? "green"
    : retainedSurface === "bunker"
      ? "bunker"
      : retainedSurface === "fairway"
        ? "fairway"
        : "rough";
  return Object.freeze({
    kind: "putt",
    id: `putt-${seed.toString(16).padStart(8, "0")}`,
    from: Object.freeze({ ...ball.position }),
    final,
    nextBall: Object.freeze({ position: final, lie: nextLie, remainingMeters: leaveDistance }),
    surface: outcomeSurface,
    penaltyStrokes,
    strategy: decision.strategy,
    committedLineDegrees: decision.lineDegrees,
    committedPaceMetersPastCup: committedPace,
    actualLineDegrees: actualLine,
    startSpeedMetersPerSecond: startSpeed,
    speedAtCupMetersPerSecond: simulation.speedAtCup,
    lineErrorDegrees,
    paceErrorPercent: paceErrorPercent * 100,
    delivery: activeDelivery,
    leaveDistanceMeters: leaveDistance,
    holed: simulation.holed,
    lipOut: simulation.lipOut,
    cupInteraction: simulation.cupInteraction,
    samples: Object.freeze(retainedSamples),
    elapsedSeconds: simulation.elapsedSeconds + (penaltyStrokes > 0 ? 0.05 : 0),
    summary,
    decisionRead,
  });
}
