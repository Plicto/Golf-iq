import { GOLF_BALL_RADIUS_METERS } from "./ground-contact.ts";
import { REGULATION_CUP_DIAMETER_METERS } from
  "../../public/labs/course-presentation/lab-hole-runtime-v1.js";

export const PUTT_CUP_PHYSICS_VERSION = "rigid-cup-v5";
export const PUTT_CUP_RADIUS_METERS = REGULATION_CUP_DIAMETER_METERS / 2;
export const PUTT_CUP_DEPTH_METERS = 0.101_6;
const PUTT_CUP_RIM_CENTER_RADIUS_METERS = PUTT_CUP_RADIUS_METERS - 0.000_4;

export type PuttCupInteractionStyle =
  | "clean-drop"
  | "dying-drop"
  | "edge-catch"
  | "horseshoe-in"
  | "horseshoe-out"
  | "back-wall-in"
  | "rim-out"
  | "hole-lip-out"
  | "back-wall-out";

export type PuttCupEventKind =
  | "entry"
  | "rim"
  | "wall"
  | "drop"
  | "bottom"
  | "exit";

export type PuttCupEvent = Readonly<{
  x: number;
  y: number;
  z: number;
  elapsedSeconds: number;
  kind: PuttCupEventKind;
  rotationRadians: number;
  speedMetersPerSecond: number;
  angularSpeedRadiansPerSecond: number;
}>;

export type PuttCupInteraction = Readonly<{
  style: PuttCupInteractionStyle;
  side: "left" | "right" | "center";
  entrySpeedMetersPerSecond: number;
  impactParameterMeters: number;
  minimumCenterHeightMeters: number;
  accumulatedRimAngleDegrees: number;
  rimContacts: number;
  wallContacts: number;
  bottomContacts: number;
}>;

export type PuttCupSweepInput = Readonly<{
  from: Readonly<{ x: number; z: number }>;
  to: Readonly<{ x: number; z: number }>;
  velocity: Readonly<{ x: number; z: number }>;
  pin: Readonly<{ x: number; z: number }>;
  stepStartedAtSeconds: number;
  stepDurationSeconds: number;
}>;

export type PuttCupSweepResult = Readonly<{
  holed: boolean;
  final: Readonly<{ x: number; z: number }>;
  velocity: Readonly<{ x: number; z: number }>;
  elapsedSeconds: number;
  events: readonly PuttCupEvent[];
  interaction: PuttCupInteraction;
}>;

type MutableVector = { x: number; y: number; z: number };

const roundTime = (value: number) =>
  Math.round(value * 1_000_000_000) / 1_000_000_000;

const dot = (left: MutableVector, right: MutableVector) =>
  left.x * right.x + left.y * right.y + left.z * right.z;

const cross = (left: MutableVector, right: MutableVector): MutableVector => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const length = (value: MutableVector) =>
  Math.hypot(value.x, value.y, value.z);

const normalized = (value: MutableVector): MutableVector => {
  const magnitude = Math.max(0.000_000_001, length(value));
  return {
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
  };
};

function circleEntryFraction(
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  pin: Readonly<{ x: number; z: number }>,
) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const fx = from.x - pin.x;
  const fz = from.z - pin.z;
  const c = fx * fx + fz * fz - PUTT_CUP_RADIUS_METERS ** 2;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a <= 1e-14) return null;
  const b = 2 * (fx * dx + fz * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  if (first >= -1e-9 && first <= 1 + 1e-9) {
    return Math.max(0, Math.min(1, first));
  }
  return null;
}

export function sweepPuttCupEntry(
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  pin: Readonly<{ x: number; z: number }>,
) {
  const fraction = circleEntryFraction(from, to, pin);
  if (fraction === null) return null;
  return Object.freeze({
    fraction,
    point: Object.freeze({
      x: from.x + (to.x - from.x) * fraction,
      z: from.z + (to.z - from.z) * fraction,
    }),
  });
}

function contactImpulse(
  velocity: MutableVector,
  angularVelocity: MutableVector,
  normal: MutableVector,
  restitution: number,
  friction: number,
) {
  const arm = {
    x: -normal.x * GOLF_BALL_RADIUS_METERS,
    y: -normal.y * GOLF_BALL_RADIUS_METERS,
    z: -normal.z * GOLF_BALL_RADIUS_METERS,
  };
  const spinVelocity = cross(angularVelocity, arm);
  const relative = {
    x: velocity.x + spinVelocity.x,
    y: velocity.y + spinVelocity.y,
    z: velocity.z + spinVelocity.z,
  };
  const normalSpeed = dot(relative, normal);
  if (normalSpeed >= -0.000_001) return false;
  const normalImpulse = -(1 + restitution) * normalSpeed;
  const tangent = {
    x: relative.x - normal.x * normalSpeed,
    y: relative.y - normal.y * normalSpeed,
    z: relative.z - normal.z * normalSpeed,
  };
  const tangentLength = length(tangent);
  const frictionImpulse = Math.min(
    tangentLength / 3.5,
    friction * normalImpulse,
  );
  const tangentDirection = tangentLength <= 0.000_001
    ? { x: 0, y: 0, z: 0 }
    : {
        x: tangent.x / tangentLength,
        y: tangent.y / tangentLength,
        z: tangent.z / tangentLength,
      };
  const impulse = {
    x: normal.x * normalImpulse - tangentDirection.x * frictionImpulse,
    y: normal.y * normalImpulse - tangentDirection.y * frictionImpulse,
    z: normal.z * normalImpulse - tangentDirection.z * frictionImpulse,
  };
  velocity.x += impulse.x;
  velocity.y += impulse.y;
  velocity.z += impulse.z;
  const torqueImpulse = cross(arm, impulse);
  const inverseInertia = 2.5 / GOLF_BALL_RADIUS_METERS ** 2;
  angularVelocity.x += torqueImpulse.x * inverseInertia;
  angularVelocity.y += torqueImpulse.y * inverseInertia;
  angularVelocity.z += torqueImpulse.z * inverseInertia;
  return true;
}

function appendEvent(
  events: PuttCupEvent[],
  position: MutableVector,
  velocity: MutableVector,
  angularVelocity: MutableVector,
  elapsedSeconds: number,
  kind: PuttCupEventKind,
  rotationRadians: number,
) {
  const prior = events.at(-1);
  const retainedTime = roundTime(Math.max(
    elapsedSeconds,
    (prior?.elapsedSeconds ?? Number.NEGATIVE_INFINITY) + 0.000_001,
  ));
  if (
    prior &&
    prior.kind === kind &&
    Math.abs(prior.x - position.x) < 0.000_001 &&
    Math.abs(prior.y - (position.y - GOLF_BALL_RADIUS_METERS)) < 0.000_001 &&
    Math.abs(prior.z - position.z) < 0.000_001
  ) return;
  events.push(Object.freeze({
    x: position.x,
    y: position.y - GOLF_BALL_RADIUS_METERS,
    z: position.z,
    elapsedSeconds: retainedTime,
    kind,
    rotationRadians,
    speedMetersPerSecond: length(velocity),
    angularSpeedRadiansPerSecond: length(angularVelocity),
  }));
}

const wrappedAngleDelta = (from: number, to: number) => {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

export function simulatePuttCupInteraction(
  input: PuttCupSweepInput,
): PuttCupSweepResult | null {
  const entry = sweepPuttCupEntry(input.from, input.to, input.pin);
  if (!entry) return null;
  const entrySpeed = Math.hypot(input.velocity.x, input.velocity.z);
  if (entrySpeed <= 0.000_01) return null;
  const direction = {
    x: input.velocity.x / entrySpeed,
    y: 0,
    z: input.velocity.z / entrySpeed,
  };
  const right = { x: -direction.z, y: 0, z: direction.x };
  const signedImpact =
    (input.from.x - input.pin.x) * right.x +
    (input.from.z - input.pin.z) * right.z;
  const impactParameter = Math.abs(signedImpact);
  if (impactParameter >= PUTT_CUP_RADIUS_METERS) return null;
  const side = impactParameter < 0.001
    ? "center"
    : signedImpact > 0 ? "right" : "left";
  const entryTime = roundTime(
    input.stepStartedAtSeconds + input.stepDurationSeconds * entry.fraction,
  );
  const position: MutableVector = {
    x: entry.point.x,
    y: GOLF_BALL_RADIUS_METERS,
    z: entry.point.z,
  };
  const velocity: MutableVector = {
    x: input.velocity.x,
    y: 0,
    z: input.velocity.z,
  };
  const angularVelocity: MutableVector = {
    x: direction.z * entrySpeed / GOLF_BALL_RADIUS_METERS,
    y: 0,
    z: -direction.x * entrySpeed / GOLF_BALL_RADIUS_METERS,
  };
  const visibleRotationAxis = normalized({
    x: angularVelocity.x,
    y: angularVelocity.y,
    z: angularVelocity.z,
  });
  const events: PuttCupEvent[] = [];
  let elapsed = entryTime;
  let rotationRadians = 0;
  appendEvent(
    events,
    position,
    velocity,
    angularVelocity,
    elapsed,
    "entry",
    rotationRadians,
  );

  const dt = 0.000_5;
  const maximumSeconds = 1.6;
  const linerTop = -0.025_4;
  const gravity = 9.806_65;
  let minimumCenterHeight = position.y;
  let rimContacts = 0;
  let wallContacts = 0;
  let bottomContacts = 0;
  let activeRimAngle = 0;
  let activeRimDirection = 0;
  let maximumContinuousRimAngle = 0;
  let priorRimAngle = 0;
  let rimSupportedLastStep = false;
  let lastContact: PuttCupEventKind | null = null;
  let lastContactTime = Number.NEGATIVE_INFINITY;
  let lastFrameTime = elapsed;
  let committedHoled = false;
  let escaped = false;

  const retainContact = (kind: PuttCupEventKind) => {
    if (kind === "rim") rimContacts += 1;
    if (kind === "wall") wallContacts += 1;
    if (kind === "bottom") bottomContacts += 1;
    lastContact = kind;
    lastContactTime = elapsed;
    appendEvent(
      events,
      position,
      velocity,
      angularVelocity,
      elapsed,
      kind,
      rotationRadians,
    );
  };

  for (let step = 0; step < maximumSeconds / dt; step += 1) {
    elapsed = roundTime(elapsed + dt);
    velocity.y -= gravity * dt;
    const airDamping = 1 - 0.035 * dt;
    velocity.x *= airDamping;
    velocity.z *= airDamping;
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;
    position.z += velocity.z * dt;
    const signedRotationRate = dot(angularVelocity, visibleRotationAxis);
    rotationRadians += signedRotationRate * dt;

    let contactKind: PuttCupEventKind | null = null;
    let rimSupported = false;
    for (let pass = 0; pass < 2; pass += 1) {
      const radialX = position.x - input.pin.x;
      const radialZ = position.z - input.pin.z;
      const radialDistance = Math.max(0.000_000_001, Math.hypot(radialX, radialZ));
      const radial = { x: radialX / radialDistance, y: 0, z: radialZ / radialDistance };

      const ringPoint = {
        x: input.pin.x + radial.x * PUTT_CUP_RIM_CENTER_RADIUS_METERS,
        y: 0,
        z: input.pin.z + radial.z * PUTT_CUP_RIM_CENTER_RADIUS_METERS,
      };
      const ringDelta = {
        x: position.x - ringPoint.x,
        y: position.y,
        z: position.z - ringPoint.z,
      };
      const ringDistance = length(ringDelta);
      if (
        ringDistance <= GOLF_BALL_RADIUS_METERS + 0.000_25 &&
        position.y <= GOLF_BALL_RADIUS_METERS + 0.003 &&
        position.y >= GOLF_BALL_RADIUS_METERS - 0.01
      ) {
        rimSupported = true;
      }
      if (ringDistance < GOLF_BALL_RADIUS_METERS - 0.000_000_1) {
        const normal = normalized(ringDelta);
        const correction = GOLF_BALL_RADIUS_METERS - ringDistance;
        position.x += normal.x * correction;
        position.y += normal.y * correction;
        position.z += normal.z * correction;
        if (contactImpulse(velocity, angularVelocity, normal, 0, 0.28)) {
          contactKind = "rim";
        }
      }

      const wallLimit = PUTT_CUP_RADIUS_METERS - GOLF_BALL_RADIUS_METERS;
      if (
        position.y - GOLF_BALL_RADIUS_METERS < linerTop &&
        position.y + GOLF_BALL_RADIUS_METERS > -PUTT_CUP_DEPTH_METERS &&
        radialDistance > wallLimit
      ) {
        const correction = radialDistance - wallLimit;
        const normal = { x: -radial.x, y: 0, z: -radial.z };
        position.x += normal.x * correction;
        position.z += normal.z * correction;
        if (contactImpulse(velocity, angularVelocity, normal, 0.32, 0.2)) {
          contactKind = "wall";
        }
      }

      const bottomHeight = -PUTT_CUP_DEPTH_METERS + GOLF_BALL_RADIUS_METERS;
      if (position.y < bottomHeight) {
        position.y = bottomHeight;
        if (contactImpulse(
          velocity,
          angularVelocity,
          { x: 0, y: 1, z: 0 },
          0.1,
          0.38,
        )) {
          contactKind = "bottom";
        }
      }

      if (
        radialDistance >= PUTT_CUP_RADIUS_METERS &&
        position.y < GOLF_BALL_RADIUS_METERS
      ) {
        position.y = GOLF_BALL_RADIUS_METERS;
        if (contactImpulse(
          velocity,
          angularVelocity,
          { x: 0, y: 1, z: 0 },
          0.04,
          0.28,
        ) && contactKind === null) {
          contactKind = "rim";
        }
      }
    }

    minimumCenterHeight = Math.min(minimumCenterHeight, position.y);
    const radialX = position.x - input.pin.x;
    const radialZ = position.z - input.pin.z;
    const radialDistance = Math.max(0.000_000_001, Math.hypot(radialX, radialZ));
    const angle = Math.atan2(radialZ, radialX);
    if (rimSupported) {
      if (rimSupportedLastStep) {
        const delta = wrappedAngleDelta(priorRimAngle, angle);
        const direction = Math.abs(delta) <= 0.000_001
          ? activeRimDirection
          : Math.sign(delta);
        if (
          activeRimDirection !== 0 &&
          direction !== 0 &&
          direction !== activeRimDirection
        ) {
          activeRimAngle = delta;
        } else {
          activeRimAngle += delta;
        }
        activeRimDirection = direction;
        maximumContinuousRimAngle = Math.max(
          maximumContinuousRimAngle,
          Math.abs(activeRimAngle),
        );
      }
      priorRimAngle = angle;
    } else {
      activeRimAngle = 0;
      activeRimDirection = 0;
    }
    rimSupportedLastStep = rimSupported;

    if (
      contactKind &&
      (contactKind !== lastContact || elapsed - lastContactTime >= 0.006)
    ) {
      retainContact(contactKind);
    }
    if (!contactKind && elapsed - lastContactTime > 0.004) lastContact = null;

    if (
      radialDistance > PUTT_CUP_RADIUS_METERS + GOLF_BALL_RADIUS_METERS * 0.42 &&
      position.y >= GOLF_BALL_RADIUS_METERS - 0.000_5 &&
      position.y <= GOLF_BALL_RADIUS_METERS + 0.000_001
    ) {
      const outwardSpeed =
        velocity.x * radialX / radialDistance +
        velocity.z * radialZ / radialDistance;
      if (outwardSpeed > 0.015) {
        position.y = GOLF_BALL_RADIUS_METERS;
        velocity.y = 0;
        appendEvent(
          events,
          position,
          velocity,
          angularVelocity,
          elapsed,
          "exit",
          rotationRadians,
        );
        escaped = true;
        break;
      }
    }

    if (contactKind === "bottom") {
      committedHoled = true;
      appendEvent(
        events,
        position,
        velocity,
        angularVelocity,
        elapsed,
        "bottom",
        rotationRadians,
      );
      break;
    }

    if (elapsed - lastFrameTime >= 1 / 60) {
      const kind = contactKind ?? "drop";
      appendEvent(
        events,
        position,
        velocity,
        angularVelocity,
        elapsed,
        kind,
        rotationRadians,
      );
      lastFrameTime = elapsed;
    }
  }

  const holed = committedHoled && !escaped;
  if (holed && events.at(-1)?.kind !== "bottom") {
    appendEvent(
      events,
      position,
      velocity,
      angularVelocity,
      elapsed,
      "bottom",
      rotationRadians,
    );
  }
  if (!holed && !escaped) {
    const radial = normalized({
      x: position.x - input.pin.x,
      y: 0,
      z: position.z - input.pin.z,
    });
    position.x = input.pin.x +
      radial.x * (PUTT_CUP_RADIUS_METERS + GOLF_BALL_RADIUS_METERS * 0.42);
    position.z = input.pin.z +
      radial.z * (PUTT_CUP_RADIUS_METERS + GOLF_BALL_RADIUS_METERS * 0.42);
    position.y = GOLF_BALL_RADIUS_METERS;
    velocity.y = 0;
    appendEvent(
      events,
      position,
      velocity,
      angularVelocity,
      elapsed,
      "exit",
      rotationRadians,
    );
  }

  const accumulatedRimAngleDegrees =
    maximumContinuousRimAngle * 180 / Math.PI;
  const style: PuttCupInteractionStyle = holed
    ? accumulatedRimAngleDegrees >= 175 && rimContacts > 0
      ? "horseshoe-in"
      : entrySpeed < 0.5
        ? "dying-drop"
        : impactParameter < 0.006 && entrySpeed < 1.25
          ? "clean-drop"
          : impactParameter < 0.012 && entrySpeed >= 1.25 && rimContacts > 0
            ? "back-wall-in"
          : accumulatedRimAngleDegrees >= 24 ||
              impactParameter >= 0.012 ||
              rimContacts > 0
            ? "edge-catch"
            : "clean-drop"
    : accumulatedRimAngleDegrees >= 175 && rimContacts > 0
        ? "horseshoe-out"
        : impactParameter < 0.012 && entrySpeed >= 1.25 && rimContacts > 0
          ? "back-wall-out"
          : minimumCenterHeight - GOLF_BALL_RADIUS_METERS < -0.006
            ? "hole-lip-out"
        : "rim-out";
  const final = holed
    ? Object.freeze({ ...input.pin })
    : Object.freeze({ x: position.x, z: position.z });
  return Object.freeze({
    holed,
    final,
    velocity: holed
      ? Object.freeze({ x: 0, z: 0 })
      : Object.freeze({ x: velocity.x, z: velocity.z }),
    elapsedSeconds: events.at(-1)?.elapsedSeconds ?? elapsed,
    events: Object.freeze(events),
    interaction: Object.freeze({
      style,
      side,
      entrySpeedMetersPerSecond: entrySpeed,
      impactParameterMeters: impactParameter,
      minimumCenterHeightMeters: minimumCenterHeight,
      accumulatedRimAngleDegrees,
      rimContacts,
      wallContacts,
      bottomContacts,
    }),
  });
}
