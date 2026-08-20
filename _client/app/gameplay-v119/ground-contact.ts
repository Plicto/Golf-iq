import {
  classifyCourseSurface,
  courseBarrierBaseHeightAt,
  courseBarrierTopHeightAt,
  courseContactHeightAt,
  courseGroundMaterialAt,
  type CourseBarrier,
  type CourseLayout,
  type CoursePoint,
  type CourseSurfaceKind,
} from "./course-layout.ts";
import type { GroundMaterial } from "./ground-materials.ts";

export const GOLF_BALL_RADIUS_METERS = 0.021_335;
export const GROUND_CONTACT_PHYSICS_VERSION = "sphere-ground-contact-v3";

export type GroundVector = Readonly<{ x: number; y: number; z: number }>;

export type GroundContactSample = Readonly<{
  x: number;
  y: number;
  z: number;
  elapsedSeconds: number;
  phase: "bounce" | "roll";
}>;

export type GroundContactResult = Readonly<{
  final: CoursePoint;
  lastPlayable: CoursePoint;
  samples: readonly GroundContactSample[];
  distanceMeters: number;
  elapsedSeconds: number;
  terminalSpeedMetersPerSecond: number;
  settled: boolean;
  contacts: number;
  barrierHits: number;
  surface: CourseSurfaceKind;
}>;

export type CourseGroundRollStep = Readonly<{
  position: CoursePoint;
  velocity: Readonly<{ x: number; z: number }>;
  surface: CourseSurfaceKind;
  settled: boolean;
  barrierHits: number;
  traveledFraction: number;
}>;

export type CourseGroundRollOptions = Readonly<{
  accelerateFromRest?: boolean;
  greenMaterial?: GroundMaterial;
  settleSpeedMetersPerSecond?: number;
}>;

export type BarrierSweepHit = Readonly<{
  barrier: CourseBarrier;
  fraction: number;
  point: GroundVector;
  normal: GroundVector;
}>;

type MutableVector = { x: number; y: number; z: number };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const roundTime = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;

const ROLLING_GRAVITY = 9.80665 * (5 / 7);

const dot = (left: GroundVector, right: GroundVector) =>
  left.x * right.x + left.y * right.y + left.z * right.z;

const cross = (left: GroundVector, right: GroundVector): MutableVector => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const magnitude = (value: GroundVector) =>
  Math.hypot(value.x, value.y, value.z);

const normalize = (value: GroundVector): MutableVector => {
  const length = magnitude(value);
  if (length <= 0.000_000_1) return { x: 0, y: 0, z: 0 };
  return { x: value.x / length, y: value.y / length, z: value.z / length };
};

const add = (left: GroundVector, right: GroundVector): MutableVector => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z,
});

const scale = (value: GroundVector, amount: number): MutableVector => ({
  x: value.x * amount,
  y: value.y * amount,
  z: value.z * amount,
});

const interpolate = (
  from: GroundVector,
  to: GroundVector,
  fraction: number,
): MutableVector => ({
  x: from.x + (to.x - from.x) * fraction,
  y: from.y + (to.y - from.y) * fraction,
  z: from.z + (to.z - from.z) * fraction,
});

function pointSegmentDistance(
  point: Readonly<{ x: number; z: number }>,
  start: CoursePoint,
  end: CoursePoint,
) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const fraction = lengthSquared <= 0.000_000_1
    ? 0
    : clamp(
      ((point.x - start.x) * dx + (point.z - start.z) * dz) /
        lengthSquared,
      0,
      1,
    );
  const closest = {
    x: start.x + dx * fraction,
    z: start.z + dz * fraction,
  };
  return Object.freeze({
    distance: Math.hypot(point.x - closest.x, point.z - closest.z),
    closest,
  });
}

function sweepBarrierSegment(
  layout: CourseLayout,
  barrier: CourseBarrier,
  start: CoursePoint,
  end: CoursePoint,
  from: GroundVector,
  to: GroundVector,
  radiusMeters: number,
): BarrierSweepHit | null {
  const effectiveRadius = radiusMeters + barrier.thicknessMeters * 0.5;
  const travel = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(4, Math.ceil(travel / Math.max(0.015, effectiveRadius * 0.28)));
  let previousFraction = 0;
  let previousDistance = pointSegmentDistance(from, start, end).distance;
  let previousTopClearance =
    from.y - radiusMeters -
    courseBarrierTopHeightAt(layout, barrier, from);
  for (let index = 1; index <= steps; index += 1) {
    const fraction = index / steps;
    const candidate = interpolate(from, to, fraction);
    const distance = pointSegmentDistance(candidate, start, end).distance;
    if (distance <= effectiveRadius && previousDistance > effectiveRadius) {
      let low = previousFraction;
      let high = fraction;
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const middle = (low + high) * 0.5;
        const probe = interpolate(from, to, middle);
        if (pointSegmentDistance(probe, start, end).distance <= effectiveRadius) {
          high = middle;
        } else {
          low = middle;
        }
      }
      const hitFraction = high;
      const point = interpolate(from, to, hitFraction);
      const baseHeight = courseBarrierBaseHeightAt(layout, barrier, point);
      const topHeight = courseBarrierTopHeightAt(layout, barrier, point);
      if (
        point.y - radiusMeters > topHeight + 0.000_5 ||
        point.y + radiusMeters < baseHeight - 0.000_5
      ) {
        // The sphere entered the horizontal footprint above or below the
        // vertical face. A later interval may still hit the physical cap.
      } else {
        const nearest = pointSegmentDistance(point, start, end).closest;
        let normal = normalize({
          x: point.x - nearest.x,
          y: 0,
          z: point.z - nearest.z,
        });
        if (Math.hypot(normal.x, normal.z) < 0.1) {
          const segmentLength = Math.max(0.000_001, Math.hypot(
            end.x - start.x,
            end.z - start.z,
          ));
          normal = {
            x: -(end.z - start.z) / segmentLength,
            y: 0,
            z: (end.x - start.x) / segmentLength,
          };
        }
        const incoming = { x: to.x - from.x, z: to.z - from.z };
        if (incoming.x * normal.x + incoming.z * normal.z > 0) {
          normal = { x: -normal.x, y: 0, z: -normal.z };
        }
        return Object.freeze({
          barrier,
          fraction: hitFraction,
          point: Object.freeze(point),
          normal: Object.freeze(normal),
        });
      }
    }
    const topClearance =
      candidate.y - radiusMeters -
      courseBarrierTopHeightAt(layout, barrier, candidate);
    if (
      previousDistance <= effectiveRadius &&
      distance <= effectiveRadius &&
      previousTopClearance > 0 &&
      topClearance <= 0
    ) {
      let low = previousFraction;
      let high = fraction;
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const middle = (low + high) * 0.5;
        const probe = interpolate(from, to, middle);
        const clearance =
          probe.y - radiusMeters -
          courseBarrierTopHeightAt(layout, barrier, probe);
        if (clearance <= 0) high = middle;
        else low = middle;
      }
      const point = interpolate(from, to, high);
      const baseHeight = courseBarrierBaseHeightAt(layout, barrier, point);
      if (point.y + radiusMeters >= baseHeight - 0.000_5) {
        return Object.freeze({
          barrier,
          fraction: high,
          point: Object.freeze(point),
          normal: Object.freeze({ x: 0, y: 1, z: 0 }),
        });
      }
    }
    previousFraction = fraction;
    previousDistance = distance;
    previousTopClearance = topClearance;
  }
  return null;
}

export function sweepCourseBarrier(
  layout: CourseLayout,
  from: GroundVector,
  to: GroundVector,
  radiusMeters = GOLF_BALL_RADIUS_METERS,
): BarrierSweepHit | null {
  let first: BarrierSweepHit | null = null;
  for (const barrier of layout.barriers) {
    for (let index = 1; index < barrier.points.length; index += 1) {
      const start = barrier.points[index - 1];
      const end = barrier.points[index];
      if (!start || !end) continue;
      const hit = sweepBarrierSegment(
        layout,
        barrier,
        start,
        end,
        from,
        to,
        radiusMeters,
      );
      if (hit && (!first || hit.fraction < first.fraction)) first = hit;
    }
  }
  return first;
}

export type TerrainSweepHit = Readonly<{
  fraction: number;
  point: GroundVector;
  surface: CourseSurfaceKind;
}>;

function terrainClearance(
  layout: CourseLayout,
  point: GroundVector,
  radiusMeters: number,
) {
  return point.y - courseContactHeightAt(layout, point) - radiusMeters;
}

export function sweepCourseTerrain(
  layout: CourseLayout,
  from: GroundVector,
  to: GroundVector,
  radiusMeters = GOLF_BALL_RADIUS_METERS,
): TerrainSweepHit | null {
  const travel = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(2, Math.min(32, Math.ceil(travel / 0.032)));
  let previousFraction = 0;
  let previousClearance = terrainClearance(layout, from, radiusMeters);
  for (let index = 1; index <= steps; index += 1) {
    const fraction = index / steps;
    const point = interpolate(from, to, fraction);
    const clearance = terrainClearance(layout, point, radiusMeters);
    if (clearance <= 0 && previousClearance > 0) {
      let low = previousFraction;
      let high = fraction;
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const middle = (low + high) * 0.5;
        const probe = interpolate(from, to, middle);
        if (terrainClearance(layout, probe, radiusMeters) <= 0) high = middle;
        else low = middle;
      }
      const hitFraction = high;
      const hit = interpolate(from, to, hitFraction);
      const height = courseContactHeightAt(layout, hit) + radiusMeters;
      const surface = classifyCourseSurface(layout, hit);
      return Object.freeze({
        fraction: hitFraction,
        point: Object.freeze({ x: hit.x, y: height, z: hit.z }),
        surface,
      });
    }
    previousFraction = fraction;
    previousClearance = clearance;
  }
  return null;
}

export function resolveGroundImpact(
  velocity: GroundVector,
  angularVelocity: GroundVector,
  normal: GroundVector,
  material: GroundMaterial,
  firstImpact: boolean,
) {
  const normalSpeed = dot(velocity, normal);
  if (normalSpeed >= 0) {
    return Object.freeze({
      velocity: Object.freeze({ ...velocity }),
      angularVelocity: Object.freeze({ ...angularVelocity }),
    });
  }
  const normalDelta = -(1 + material.normalRestitution) * normalSpeed;
  let nextVelocity = add(velocity, scale(normal, normalDelta));
  const contactArm = scale(normal, -GOLF_BALL_RADIUS_METERS);
  const contactVelocity = add(nextVelocity, cross(angularVelocity, contactArm));
  const slip = add(contactVelocity, scale(normal, -dot(contactVelocity, normal)));
  const slipMagnitude = magnitude(slip);
  const maximumFrictionDelta = material.impactFriction * Math.abs(normalDelta);
  const frictionDelta = slipMagnitude <= 0.000_001
    ? { x: 0, y: 0, z: 0 }
    : scale(
      slip,
      -Math.min(slipMagnitude / 3.5, maximumFrictionDelta) / slipMagnitude,
    );
  nextVelocity = add(nextVelocity, frictionDelta);
  let nextAngular = add(
    angularVelocity,
    scale(
      cross(contactArm, frictionDelta),
      2.5 / (GOLF_BALL_RADIUS_METERS ** 2),
    ),
  );
  const normalPart = scale(normal, dot(nextVelocity, normal));
  const tangentPart = add(nextVelocity, scale(normalPart, -1));
  const deformation = material.deformationLoss * (firstImpact ? 1 : 0.34);
  nextVelocity = add(normalPart, scale(tangentPart, 1 - deformation));
  nextAngular = scale(nextAngular, 1 - deformation * 0.18);
  return Object.freeze({
    velocity: Object.freeze(nextVelocity),
    angularVelocity: Object.freeze(nextAngular),
  });
}

export function resolveRollingConstraint(
  velocity: GroundVector,
  angularVelocity: GroundVector,
  normal: GroundVector,
) {
  const normalPart = scale(normal, dot(velocity, normal));
  const tangentVelocity = add(velocity, scale(normalPart, -1));
  const contactArm = scale(normal, -GOLF_BALL_RADIUS_METERS);
  const contactVelocity = add(
    tangentVelocity,
    cross(angularVelocity, contactArm),
  );
  const slip = add(
    contactVelocity,
    scale(normal, -dot(contactVelocity, normal)),
  );
  // Impact already removes the first, normal-force-limited part of the slip.
  // The first rolling contact relaxes a further fraction instead of snapping
  // an aerodynamically spinning ball straight to no-slip in one frame.
  const frictionDelta = scale(slip, -0.35 / 3.5);
  const nextVelocity = add(velocity, frictionDelta);
  const nextAngular = add(
    angularVelocity,
    scale(
      cross(contactArm, frictionDelta),
      2.5 / (GOLF_BALL_RADIUS_METERS ** 2),
    ),
  );
  return Object.freeze({
    velocity: Object.freeze(nextVelocity),
    angularVelocity: Object.freeze(nextAngular),
  });
}

function barrierResponse(
  velocity: GroundVector,
  hit: BarrierSweepHit,
) {
  const normal = hit.normal;
  const normalSpeed = dot(velocity, normal);
  const normalPart = scale(normal, normalSpeed);
  const tangentPart = add(velocity, scale(normalPart, -1));
  return add(
    scale(tangentPart, hit.barrier.tangentialRetention),
    scale(normalPart, -hit.barrier.normalRestitution),
  );
}

export function advanceGroundRollVelocity(
  velocity: Readonly<{ x: number; z: number }>,
  downhillAcceleration: Readonly<{ x: number; z: number }>,
  material: GroundMaterial,
  dt: number,
) {
  const slopeMagnitude = Math.hypot(
    downhillAcceleration.x,
    downhillAcceleration.z,
  );
  let moving = { ...velocity };
  let speed = Math.hypot(moving.x, moving.z);
  if (speed < 0.04) {
    if (slopeMagnitude <= material.staticResistance) {
      return Object.freeze({
        velocity: Object.freeze({ x: 0, z: 0 }),
        settled: true,
      });
    }
    moving = {
      x: (downhillAcceleration.x / slopeMagnitude) * 0.04,
      z: (downhillAcceleration.z / slopeMagnitude) * 0.04,
    };
    speed = 0.04;
  }
  const unit = { x: moving.x / speed, z: moving.z / speed };
  const resistance = material.rollingResistance +
    material.velocityDrag * speed ** 2;
  let nextVelocity = {
    x: moving.x +
      (downhillAcceleration.x - unit.x * resistance) * dt,
    z: moving.z +
      (downhillAcceleration.z - unit.z * resistance) * dt,
  };
  if (nextVelocity.x * moving.x + nextVelocity.z * moving.z <= 0) {
    if (slopeMagnitude <= material.staticResistance) {
      return Object.freeze({
        velocity: Object.freeze({ x: 0, z: 0 }),
        settled: true,
      });
    }
    nextVelocity = {
      x: (downhillAcceleration.x / slopeMagnitude) * 0.04,
      z: (downhillAcceleration.z / slopeMagnitude) * 0.04,
    };
  }
  return Object.freeze({
    velocity: Object.freeze(nextVelocity),
    settled: false,
  });
}

function exactHazardCrossing(
  layout: CourseLayout,
  from: CoursePoint,
  to: CoursePoint,
) {
  const fromSurface = classifyCourseSurface(layout, from);
  if (fromSurface === "water" || fromSurface === "boundary") return null;
  const fractions: number[] = [];
  const segmentX = to.x - from.x;
  const segmentZ = to.z - from.z;
  const segmentCrossing = (start: CoursePoint, end: CoursePoint) => {
    const edgeX = end.x - start.x;
    const edgeZ = end.z - start.z;
    const divisor = segmentX * edgeZ - segmentZ * edgeX;
    if (Math.abs(divisor) < 0.000_000_001) return;
    const offsetX = start.x - from.x;
    const offsetZ = start.z - from.z;
    const along = (offsetX * edgeZ - offsetZ * edgeX) / divisor;
    const edgeAlong = (offsetX * segmentZ - offsetZ * segmentX) / divisor;
    if (
      along > 0.000_000_1 &&
      along <= 1.000_000_1 &&
      edgeAlong >= -0.000_000_1 &&
      edgeAlong <= 1.000_000_1
    ) fractions.push(clamp(along, 0, 1));
  };
  for (const surface of layout.surfaces) {
    for (let index = 0; index < surface.points.length; index += 1) {
      const start = surface.points[index];
      const end = surface.points[(index + 1) % surface.points.length];
      if (start && end) segmentCrossing(start, end);
    }
  }
  const { minimumX, maximumX, minimumZ, maximumZ } = layout.bounds;
  const bounds = [
    [{ x: minimumX, z: minimumZ }, { x: maximumX, z: minimumZ }],
    [{ x: maximumX, z: minimumZ }, { x: maximumX, z: maximumZ }],
    [{ x: maximumX, z: maximumZ }, { x: minimumX, z: maximumZ }],
    [{ x: minimumX, z: maximumZ }, { x: minimumX, z: minimumZ }],
  ] as const;
  for (const [start, end] of bounds) segmentCrossing(start, end);
  fractions.sort((left, right) => left - right);
  const crossingFraction = fractions.find((fraction) => {
    const after = Math.min(1, fraction + 0.000_01);
    const surface = classifyCourseSurface(layout, {
      x: from.x + segmentX * after,
      z: from.z + segmentZ * after,
    });
    return surface === "water" || surface === "boundary";
  });
  if (crossingFraction === undefined) return null;
  let low = Math.max(0, crossingFraction - 0.000_02);
  let high = crossingFraction;
  for (let iteration = 0; iteration < 22; iteration += 1) {
    const middle = (low + high) * 0.5;
    const point = {
      x: from.x + (to.x - from.x) * middle,
      z: from.z + (to.z - from.z) * middle,
    };
    const surface = classifyCourseSurface(layout, point);
    if (surface === "water" || surface === "boundary") high = middle;
    else low = middle;
  }
  const after = Math.min(1, high + 0.000_01);
  const surface = classifyCourseSurface(layout, {
    x: from.x + (to.x - from.x) * after,
    z: from.z + (to.z - from.z) * after,
  });
  return Object.freeze({
    x: from.x + (to.x - from.x) * high,
    z: from.z + (to.z - from.z) * high,
    fraction: high,
    surface: surface === "water" ? "water" as const : "boundary" as const,
  });
}

function surfaceSpeed(
  velocity: Readonly<{ x: number; z: number }>,
  gradient: Readonly<{ x: number; z: number }>,
) {
  const horizontal = Math.hypot(velocity.x, velocity.z);
  if (horizontal <= 0.000_000_1) return 0;
  const alongGrade =
    gradient.x * (velocity.x / horizontal) +
    gradient.z * (velocity.z / horizontal);
  return horizontal * Math.sqrt(1 + alongGrade ** 2);
}

function energyBalancedRoll(
  layout: CourseLayout,
  position: CoursePoint,
  velocity: Readonly<{ x: number; z: number }>,
  material: GroundMaterial,
  dt: number,
  settleSpeedMetersPerSecond = 0.04,
  accelerateFromRest = false,
) {
  const currentTerrain = layout.sampleTerrain(position);
  const currentHeight = layout.terrainHeightAt(position);
  let moving = { ...velocity };
  let horizontalSpeed = Math.hypot(moving.x, moving.z);
  const slopeMagnitude = Math.hypot(
    currentTerrain.downhillAcceleration.x,
    currentTerrain.downhillAcceleration.z,
  );
  if (horizontalSpeed < settleSpeedMetersPerSecond) {
    if (slopeMagnitude <= material.staticResistance) {
      return Object.freeze({
        position: Object.freeze({ ...position }),
        velocity: Object.freeze({ x: 0, z: 0 }),
        settled: true,
        traveledFraction: 0,
      });
    }
    if (accelerateFromRest) {
      moving = { x: 0, z: 0 };
      horizontalSpeed = 0;
    } else {
      moving = {
        x: (currentTerrain.downhillAcceleration.x / slopeMagnitude) *
          settleSpeedMetersPerSecond,
        z: (currentTerrain.downhillAcceleration.z / slopeMagnitude) *
          settleSpeedMetersPerSecond,
      };
      horizontalSpeed = settleSpeedMetersPerSecond;
    }
  }

  const steered = {
    x: moving.x + currentTerrain.downhillAcceleration.x * dt,
    z: moving.z + currentTerrain.downhillAcceleration.z * dt,
  };
  const steeredSpeed = Math.hypot(steered.x, steered.z);
  const direction = steeredSpeed > 0.000_000_1
    ? { x: steered.x / steeredSpeed, z: steered.z / steeredSpeed }
    : {
      x: moving.x / horizontalSpeed,
      z: moving.z / horizontalSpeed,
    };
  const currentEnergySpeed = surfaceSpeed(moving, currentTerrain.gradient);
  const resistance =
    material.rollingResistance +
    material.velocityDrag * currentEnergySpeed ** 2;

  const evaluate = (candidate: CoursePoint) => {
    const dx = candidate.x - position.x;
    const dz = candidate.z - position.z;
    const height = layout.terrainHeightAt(candidate);
    const surfaceDistance = Math.hypot(dx, dz, height - currentHeight);
    return Object.freeze({
      height,
      surfaceDistance,
      energySpeedSquared:
        currentEnergySpeed ** 2 +
        2 * ROLLING_GRAVITY * (currentHeight - height) -
        2 * resistance * surfaceDistance,
    });
  };

  let candidate = {
    x: position.x + (moving.x + steered.x) * 0.5 * dt,
    z: position.z + (moving.z + steered.z) * 0.5 * dt,
  };
  let energy = evaluate(candidate);
  if (energy.energySpeedSquared <= 0) {
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = (low + high) * 0.5;
      const probe = {
        x: position.x + (candidate.x - position.x) * middle,
        z: position.z + (candidate.z - position.z) * middle,
      };
      if (evaluate(probe).energySpeedSquared <= 0) high = middle;
      else low = middle;
    }
    const stop = Object.freeze({
      x: position.x + (candidate.x - position.x) * high,
      z: position.z + (candidate.z - position.z) * high,
    });
    const downhill = layout.sampleTerrain(stop).downhillAcceleration;
    const downhillMagnitude = Math.hypot(downhill.x, downhill.z);
    if (downhillMagnitude <= material.staticResistance) {
      return Object.freeze({
        position: stop,
        velocity: Object.freeze({ x: 0, z: 0 }),
        settled: true,
        traveledFraction: high,
      });
    }
    return Object.freeze({
      position: stop,
      velocity: accelerateFromRest
        ? Object.freeze({ x: 0, z: 0 })
        : Object.freeze({
          x: (downhill.x / downhillMagnitude) *
            settleSpeedMetersPerSecond,
          z: (downhill.z / downhillMagnitude) *
            settleSpeedMetersPerSecond,
        }),
      settled: false,
      traveledFraction: high,
    });
  }

  let nextVelocity = { x: 0, z: 0 };
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const nextTerrain = layout.sampleTerrain(candidate);
    const alongGrade =
      nextTerrain.gradient.x * direction.x +
      nextTerrain.gradient.z * direction.z;
    const nextHorizontalSpeed =
      Math.sqrt(Math.max(0, energy.energySpeedSquared)) /
      Math.sqrt(1 + alongGrade ** 2);
    nextVelocity = {
      x: direction.x * nextHorizontalSpeed,
      z: direction.z * nextHorizontalSpeed,
    };
    candidate = {
      x: position.x + (moving.x + nextVelocity.x) * 0.5 * dt,
      z: position.z + (moving.z + nextVelocity.z) * 0.5 * dt,
    };
    energy = evaluate(candidate);
  }
  return Object.freeze({
    position: Object.freeze(candidate),
    velocity: Object.freeze(nextVelocity),
    settled: false,
    traveledFraction: 1,
  });
}

export function advanceCourseGroundRoll(
  layout: CourseLayout,
  position: CoursePoint,
  velocity: Readonly<{ x: number; z: number }>,
  dt: number,
  options?: CourseGroundRollOptions,
): CourseGroundRollStep {
  const surface = classifyCourseSurface(layout, position);
  const retainedMaterial = courseGroundMaterialAt(layout, position);
  const material = surface === "green" && options?.greenMaterial
    ? options.greenMaterial
    : retainedMaterial;
  if (!material || surface === "water" || surface === "boundary") {
    return Object.freeze({
      position: Object.freeze({ ...position }),
      velocity: Object.freeze({ ...velocity }),
      surface,
      settled: false,
      barrierHits: 0,
      traveledFraction: 0,
    });
  }
  const settleSpeedMetersPerSecond = options?.settleSpeedMetersPerSecond ?? 0.04;
  const accelerateFromRest = options?.accelerateFromRest ?? false;
  const advanced = energyBalancedRoll(
    layout,
    position,
    velocity,
    material,
    dt,
    settleSpeedMetersPerSecond,
    accelerateFromRest,
  );
  if (advanced.settled) {
    return Object.freeze({
      ...advanced,
      surface,
      barrierHits: 0,
    });
  }
  let candidate = { ...advanced.position };
  let nextVelocity = { ...advanced.velocity };
  let barrierHits = 0;
  let traveledFraction = advanced.traveledFraction;
  const barrierHit = sweepCourseBarrier(
    layout,
    {
      x: position.x,
      y: courseContactHeightAt(layout, position) + GOLF_BALL_RADIUS_METERS,
      z: position.z,
    },
    {
      x: candidate.x,
      y: courseContactHeightAt(layout, candidate) + GOLF_BALL_RADIUS_METERS,
      z: candidate.z,
    },
  );
  if (barrierHit) {
    traveledFraction *= barrierHit.fraction;
    const reflected = barrierResponse(
      { x: nextVelocity.x, y: 0, z: nextVelocity.z },
      barrierHit,
    );
    candidate = {
      x: barrierHit.point.x + barrierHit.normal.x * 0.002,
      z: barrierHit.point.z + barrierHit.normal.z * 0.002,
    };
    nextVelocity = barrierHit.normal.y > 0.5
      ? { x: nextVelocity.x * 0.45, z: nextVelocity.z * 0.45 }
      : { x: reflected.x, z: reflected.z };
    barrierHits = 1;
  }
  const hazard = exactHazardCrossing(layout, position, candidate);
  if (hazard) {
    candidate = { x: hazard.x, z: hazard.z };
    const hazardTravelFraction = traveledFraction * hazard.fraction;
    if (!barrierHit) {
      nextVelocity = {
        ...energyBalancedRoll(
          layout,
          position,
          velocity,
          material,
          dt * hazardTravelFraction,
          settleSpeedMetersPerSecond,
          accelerateFromRest,
        ).velocity,
      };
    }
    traveledFraction = hazardTravelFraction;
  }
  return Object.freeze({
    position: Object.freeze(candidate),
    velocity: Object.freeze(nextVelocity),
    surface: hazard?.surface ?? classifyCourseSurface(layout, candidate),
    settled: false,
    barrierHits,
    traveledFraction,
  });
}

export function simulateGroundContact({
  position: initialPosition,
  velocity: initialVelocity,
  angularVelocity: initialAngularVelocity,
  startedAtSeconds,
  layout,
}: Readonly<{
  position: CoursePoint;
  velocity: GroundVector;
  angularVelocity: GroundVector;
  startedAtSeconds: number;
  layout: CourseLayout;
}>): GroundContactResult {
  const initialSurface = classifyCourseSurface(layout, initialPosition);
  const initialMaterial = courseGroundMaterialAt(layout, initialPosition);
  if (!initialMaterial || initialSurface === "water" || initialSurface === "boundary") {
    return Object.freeze({
      final: Object.freeze({ ...initialPosition }),
      lastPlayable: Object.freeze({ ...initialPosition }),
      samples: Object.freeze([]),
      distanceMeters: 0,
      elapsedSeconds: startedAtSeconds,
      terminalSpeedMetersPerSecond: Math.hypot(initialVelocity.x, initialVelocity.z),
      settled: false,
      contacts: 0,
      barrierHits: 0,
      surface: initialSurface,
    });
  }

  let elapsed = startedAtSeconds;
  let position: MutableVector = {
    x: initialPosition.x,
    y: layout.terrainHeightAt(initialPosition) + GOLF_BALL_RADIUS_METERS,
    z: initialPosition.z,
  };
  let velocity: GroundVector = Object.freeze({ ...initialVelocity });
  let angularVelocity: GroundVector = Object.freeze({ ...initialAngularVelocity });
  let contacts = 0;
  let barrierHits = 0;
  let distanceMeters = 0;
  const samples: GroundContactSample[] = [];

  const firstNormal = layout.sampleTerrain(initialPosition).normal;
  ({ velocity, angularVelocity } = resolveGroundImpact(
    velocity,
    angularVelocity,
    firstNormal,
    initialMaterial,
    true,
  ));
  contacts += 1;
  elapsed += 0.000_001;
  samples.push(Object.freeze({
    x: position.x,
    y: 0,
    z: position.z,
    elapsedSeconds: elapsed,
    phase: "bounce",
  }));

  const bounceDt = 0.008;
  let airborne = dot(velocity, firstNormal) > 0.16;
  for (let step = 0; airborne && step < 1_000; step += 1) {
    const nextVelocity = {
      x: velocity.x,
      y: velocity.y - 9.80665 * bounceDt,
      z: velocity.z,
    };
    const candidate = {
      x: position.x + nextVelocity.x * bounceDt,
      y: position.y + nextVelocity.y * bounceDt,
      z: position.z + nextVelocity.z * bounceDt,
    };
    const barrierHit = sweepCourseBarrier(layout, position, candidate);
    const terrainHit = sweepCourseTerrain(layout, position, candidate);
    if (barrierHit && (!terrainHit || barrierHit.fraction < terrainHit.fraction)) {
      distanceMeters += Math.hypot(
        barrierHit.point.x - position.x,
        barrierHit.point.z - position.z,
      );
      elapsed += bounceDt * barrierHit.fraction;
      velocity = Object.freeze(barrierResponse(nextVelocity, barrierHit));
      angularVelocity = Object.freeze(scale(angularVelocity, 0.82));
      position = {
        x: barrierHit.point.x + barrierHit.normal.x * 0.002,
        y: barrierHit.point.y + barrierHit.normal.y * 0.002,
        z: barrierHit.point.z + barrierHit.normal.z * 0.002,
      };
      barrierHits += 1;
      samples.push(Object.freeze({
        x: position.x,
        y: Math.max(
          0,
          position.y - layout.terrainHeightAt(position) - GOLF_BALL_RADIUS_METERS,
        ),
        z: position.z,
        elapsedSeconds: elapsed,
        phase: "bounce",
      }));
      continue;
    }
    if (terrainHit) {
      distanceMeters += Math.hypot(
        terrainHit.point.x - position.x,
        terrainHit.point.z - position.z,
      );
      elapsed += bounceDt * terrainHit.fraction;
      position = { ...terrainHit.point };
      if (terrainHit.surface === "water" || terrainHit.surface === "boundary") {
        samples.push(Object.freeze({
          x: position.x,
          y: 0,
          z: position.z,
          elapsedSeconds: elapsed,
          phase: "roll",
        }));
        return Object.freeze({
          final: Object.freeze({ x: position.x, z: position.z }),
          lastPlayable: Object.freeze({ ...initialPosition }),
          samples: Object.freeze(samples),
          distanceMeters,
          elapsedSeconds: elapsed,
          terminalSpeedMetersPerSecond: Math.hypot(nextVelocity.x, nextVelocity.z),
          settled: false,
          contacts,
          barrierHits,
          surface: terrainHit.surface,
        });
      }
      const material = courseGroundMaterialAt(layout, position);
      if (!material) break;
      const hitVelocity = interpolate(velocity, nextVelocity, terrainHit.fraction);
      const contactNormal = layout.sampleTerrain(position).normal;
      ({ velocity, angularVelocity } = resolveGroundImpact(
        hitVelocity,
        angularVelocity,
        contactNormal,
        material,
        false,
      ));
      contacts += 1;
      position = {
        x: position.x + contactNormal.x * 0.000_5,
        y: position.y + contactNormal.y * 0.000_5,
        z: position.z + contactNormal.z * 0.000_5,
      };
      samples.push(Object.freeze({
        x: position.x,
        y: 0,
        z: position.z,
        elapsedSeconds: elapsed,
        phase: "bounce",
      }));
      if (
        contacts >= 8 ||
        dot(velocity, contactNormal) <= 0.16
      ) {
        airborne = false;
        break;
      }
      continue;
    }
    distanceMeters += Math.hypot(candidate.x - position.x, candidate.z - position.z);
    elapsed += bounceDt;
    position = candidate;
    velocity = Object.freeze(nextVelocity);
    if (step % 3 === 0) {
      samples.push(Object.freeze({
        x: position.x,
        y: Math.max(
          0,
          position.y - layout.terrainHeightAt(position) - GOLF_BALL_RADIUS_METERS,
        ),
        z: position.z,
        elapsedSeconds: elapsed,
        phase: "bounce",
      }));
    }
  }

  const rollingConstraint = resolveRollingConstraint(
    velocity,
    angularVelocity,
    layout.sampleTerrain(position).normal,
  );
  velocity = rollingConstraint.velocity;
  angularVelocity = rollingConstraint.angularVelocity;
  let planarVelocity = { x: velocity.x, z: velocity.z };
  position.y = layout.terrainHeightAt(position) + GOLF_BALL_RADIUS_METERS;
  let settled = false;
  let retainedSurface = classifyCourseSurface(layout, position);
  let lastPlayable = Object.freeze({ x: position.x, z: position.z });
  const rollHorizonSeconds = startedAtSeconds + 120;
  for (let step = 0; step < 24_000 && elapsed < rollHorizonSeconds; step += 1) {
    const surface = classifyCourseSurface(layout, position);
    retainedSurface = surface;
    if (surface === "water" || surface === "boundary") break;
    lastPlayable = Object.freeze({ x: position.x, z: position.z });
    const planarSpeed = Math.hypot(planarVelocity.x, planarVelocity.z);
    const rollDt = Math.min(
      planarSpeed < 0.25 ? 0.005 : 0.02,
      rollHorizonSeconds - elapsed,
    );
    const advanced = advanceCourseGroundRoll(
      layout,
      position,
      planarVelocity,
      rollDt,
    );
    retainedSurface = advanced.surface;
    elapsed = roundTime(elapsed + rollDt * advanced.traveledFraction);
    if (advanced.settled) {
      planarVelocity = { x: 0, z: 0 };
      position = {
        x: advanced.position.x,
        y: layout.terrainHeightAt(advanced.position) + GOLF_BALL_RADIUS_METERS,
        z: advanced.position.z,
      };
      settled = true;
      break;
    }
    const prior = { x: position.x, z: position.z };
    position = {
      x: advanced.position.x,
      y: courseContactHeightAt(layout, advanced.position) + GOLF_BALL_RADIUS_METERS,
      z: advanced.position.z,
    };
    distanceMeters += Math.hypot(position.x - prior.x, position.z - prior.z);
    planarVelocity = { ...advanced.velocity };
    barrierHits += advanced.barrierHits;
    const hazard = advanced.surface === "water" || advanced.surface === "boundary";
    if (!hazard) {
      lastPlayable = Object.freeze({ x: position.x, z: position.z });
    }
    if (
      step % 2 === 0 ||
      planarSpeed < 0.25 ||
      hazard ||
      advanced.barrierHits > 0
    ) {
      samples.push(Object.freeze({
        x: position.x,
        y: 0,
        z: position.z,
        elapsedSeconds: elapsed,
        phase: "roll",
      }));
    }
    if (hazard) break;
  }

  const terminalSpeed = Math.hypot(planarVelocity.x, planarVelocity.z);
  const terminalSurface = retainedSurface;
  if (
    !settled &&
    terminalSurface !== "water" &&
    terminalSurface !== "boundary"
  ) {
    throw new RangeError("Ground contact did not settle inside the physical horizon.");
  }
  if (settled) {
    const priorElapsed = samples.at(-1)?.elapsedSeconds ?? startedAtSeconds;
    if (elapsed <= priorElapsed) elapsed = roundTime(priorElapsed + 0.001);
    samples.push(Object.freeze({
      x: position.x,
      y: 0,
      z: position.z,
      elapsedSeconds: elapsed,
      phase: "roll",
    }));
  }
  const final = Object.freeze({ x: position.x, z: position.z });
  return Object.freeze({
    final,
    lastPlayable,
    samples: Object.freeze(samples),
    distanceMeters,
    elapsedSeconds: elapsed,
    terminalSpeedMetersPerSecond: terminalSpeed,
    settled,
    contacts,
    barrierHits,
    surface: terminalSurface,
  });
}

