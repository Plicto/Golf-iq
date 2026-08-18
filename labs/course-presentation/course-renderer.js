import { samplePresentationTape } from "./presentation-tape.js";

export {
  GREEN_DETAIL_CAMERA,
  NORTH_INLET_BUNKERS,
  NORTH_INLET_BUNKER_POINTS,
  NORTH_INLET_FAIRWAY_POINTS,
  NORTH_INLET_GREEN_POINTS,
  NORTH_INLET_GREEN_PRESENTATION,
  NORTH_INLET_PIN,
  NORTH_INLET_ROUGH_POINTS,
  NORTH_INLET_WATER_LEVEL,
  NORTH_INLET_WATER_POINTS,
  NORTH_INLET_WATER_SURFACE_POINTS,
  NORTH_INLET_WORLD,
  STATIC_OVERVIEW_CAMERA,
  courseCenterAt,
  fairwayHalfWidthAt,
  greenSurfaceElevationAt,
  isOnNorthInletGreen,
  northInletCourseSurfaceElevationAt,
  roughHalfWidthAt,
  terrainElevationAt,
} from "./north-inlet-world.js";

const TAU = Math.PI * 2;
const WORLD_UP = { x: 0, y: 1, z: 0 };
const TERRAIN_RELIEF_CACHE = new WeakMap();
export const GOLF_BALL_RADIUS_METRES = 0.021335;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function subtract(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function rotateAroundAxis(vector, axis, angleRadians) {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  const axisDot = dot(axis, vector);
  const axisCross = cross(axis, vector);
  return {
    x:
      vector.x * cosine +
      axisCross.x * sine +
      axis.x * axisDot * (1 - cosine),
    y:
      vector.y * cosine +
      axisCross.y * sine +
      axis.y * axisDot * (1 - cosine),
    z:
      vector.z * cosine +
      axisCross.z * sine +
      axis.z * axisDot * (1 - cosine),
  };
}

function buildRibbon(
  startZ,
  endZ,
  steps,
  centerAt,
  halfWidthAt,
  yOffset = 0,
  elevationAt,
) {
  const left = [];
  const right = [];
  for (let index = 0; index <= steps; index += 1) {
    const z = mix(startZ, endZ, index / steps);
    const center = centerAt(z);
    const halfWidth = halfWidthAt(z);
    left.push({
      x: center - halfWidth,
      y: elevationAt(center - halfWidth, z) + yOffset,
      z,
    });
    right.push({
      x: center + halfWidth,
      y: elevationAt(center + halfWidth, z) + yOffset,
      z,
    });
  }
  return [...left, ...right.reverse()];
}

function buildEllipse(
  center,
  radiusX,
  radiusZ,
  segments = 32,
  yOffset = 0,
  elevationAt,
) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * TAU;
    const x = center.x + Math.cos(angle) * radiusX;
    const z = center.z + Math.sin(angle) * radiusZ;
    points.push({
      x,
      y: elevationAt(x, z) + yOffset,
      z,
    });
  }
  return points;
}

function surfaceWorldPoints(
  points,
  yOffset = 0,
  elevationAt,
) {
  return points.map(({ x, z }) => ({
    x,
    y: elevationAt(x, z) + yOffset,
    z,
  }));
}

function pointInSurface(points, point) {
  let inside = false;
  for (
    let index = 0, prior = points.length - 1;
    index < points.length;
    prior = index, index += 1
  ) {
    const current = points[index];
    const previous = points[prior];
    if (!current || !previous) continue;
    if (
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          (previous.z - current.z) +
          current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function scaledSurfaceWorldPoints(
  points,
  center,
  scaleAmount,
  yOffset,
  elevationAt,
) {
  return points.map((point) => {
    const x = center.x + (point.x - center.x) * scaleAmount;
    const z = center.z + (point.z - center.z) * scaleAmount;
    return {
      x,
      y: elevationAt(x, z) + yOffset,
      z,
    };
  });
}

const waterSurfaceGroupsFor = (world) => world.waterSurfaceGroups ?? (
  world.waterSurfacePoints.length < 3 ? [] : [world.waterSurfacePoints]
);

const barrierPointGroupsFor = (world) => world.barrierPointGroups ?? (
  world.wallPoints.length < 2 ? [] : [world.wallPoints]
);

export function courseAllowsFescueAt(world, x, z) {
  const point = { x, z };
  const isRough = pointInSurface(world.roughPoints, point);
  const isFairway = world.fairwayPoints.some((points) =>
    pointInSurface(points, point)
  );
  const isGreen = pointInSurface(world.greenPoints, point);
  const isBunker = world.bunkerPoints.some((points) =>
    pointInSurface(points, point)
  );
  const isWater = waterSurfaceGroupsFor(world).some((points) =>
    pointInSurface(points, point)
  );
  return isRough && !isFairway && !isGreen && !isBunker && !isWater;
}

export function courseSurfaceElevationAt(world, x, z) {
  return world.surfaceElevationAt(x, z);
}

function createProjector(camera, width, height) {
  const forward = normalize(subtract(camera.target, camera.position));
  let right = normalize(cross(forward, WORLD_UP));
  let up = normalize(cross(right, forward));
  const roll = ((camera.rollDegrees ?? 0) * Math.PI) / 180;
  if (roll !== 0) {
    right = rotateAroundAxis(right, forward, roll);
    up = rotateAroundAxis(up, forward, roll);
  }

  const focal = height / (2 * Math.tan((camera.fovDegrees * Math.PI) / 360));
  const centerX = width * (0.5 + (camera.focalShiftX ?? 0));
  const centerY = height * (0.5 + (camera.focalShiftY ?? 0));
  const nearPlane = 0.45;
  const toCameraSpace = (worldPoint) => {
    const relative = subtract(worldPoint, camera.position);
    return {
      horizontal: dot(relative, right),
      vertical: dot(relative, up),
      depth: dot(relative, forward),
    };
  };
  const toScreenSpace = (cameraPoint) => {
    const { depth } = cameraPoint;
    return {
      x: centerX + (cameraPoint.horizontal * focal) / depth,
      y: centerY - (cameraPoint.vertical * focal) / depth,
      depth,
      scale: focal / depth,
    };
  };
  const project = (worldPoint) => {
    const cameraPoint = toCameraSpace(worldPoint);
    return cameraPoint.depth <= nearPlane
      ? null
      : toScreenSpace(cameraPoint);
  };
  project.nearPlane = nearPlane;
  project.toCameraSpace = toCameraSpace;
  project.toScreenSpace = toScreenSpace;
  return project;
}

export function projectCoursePoint(camera, width, height, worldPoint) {
  return createProjector(camera, width, height)(worldPoint);
}

function projectedPath(project, worldPoints) {
  return worldPoints.map(project).filter(Boolean);
}

function clipPolygonToNearPlane(project, worldPoints) {
  const nearPlane = project.nearPlane;
  const cameraPoints = worldPoints.map(project.toCameraSpace);
  const clipped = [];
  for (let index = 0; index < cameraPoints.length; index += 1) {
    const current = cameraPoints[index];
    const previous = cameraPoints[
      (index - 1 + cameraPoints.length) % cameraPoints.length
    ];
    const currentInside = current.depth > nearPlane;
    const previousInside = previous.depth > nearPlane;
    if (currentInside !== previousInside) {
      const progress =
        (nearPlane - previous.depth) / (current.depth - previous.depth);
      clipped.push({
        horizontal: mix(previous.horizontal, current.horizontal, progress),
        vertical: mix(previous.vertical, current.vertical, progress),
        depth: nearPlane,
      });
    }
    if (currentInside) {
      clipped.push(current);
    }
  }
  return clipped.map(project.toScreenSpace);
}

function fillProjectedPolygon(context, project, worldPoints, fillStyle) {
  const points = clipPolygonToNearPlane(project, worldPoints);
  if (points.length < 3) {
    return;
  }
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
}

function clipToWorldPolygons(context, project, polygons) {
  context.beginPath();
  let hasPolygon = false;
  for (const worldPoints of polygons) {
    const points = clipPolygonToNearPlane(project, worldPoints);
    if (points.length < 3) continue;
    hasPolygon = true;
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.closePath();
  }
  if (hasPolygon) {
    context.clip();
  }
  return hasPolygon;
}

function strokeWorldLine(context, project, worldPoints, style) {
  const points = projectedPath(project, worldPoints);
  if (points.length < 2) {
    return;
  }
  context.save();
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.strokeStyle = style.strokeStyle;
  context.lineWidth = style.lineWidth;
  context.globalAlpha = style.globalAlpha ?? 1;
  context.lineCap = style.lineCap ?? "round";
  context.lineJoin = "round";
  if (style.dash) {
    context.setLineDash(style.dash);
  }
  context.stroke();
  context.restore();
}

function drawSky(context, world, width, height, camera) {
  const { palette } = world;
  const sky = context.createLinearGradient(0, 0, 0, height * 0.72);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.42, palette.skyMiddle);
  sky.addColorStop(0.72, palette.skyHorizon);
  sky.addColorStop(1, palette.horizon);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const sunX = width * clamp(0.72 - camera.position.x / 900, 0.58, 0.82);
  const sunY = height * 0.115;
  const glow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, height * 0.3);
  glow.addColorStop(0, "rgba(255,247,202,.68)");
  glow.addColorStop(0.12, "rgba(255,236,179,.24)");
  glow.addColorStop(1, "rgba(255,230,180,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height * 0.55);

  context.fillStyle = palette.distantRidge ?? "rgba(116,105,65,.28)";
  const ridgeShift = clamp(camera.position.x * 0.085, -18, 18);
  context.beginPath();
  context.moveTo(-24, height * 0.39);
  for (let index = 0; index <= 12; index += 1) {
    const x = (index / 12) * (width + 48) - 24 + ridgeShift;
    const y = height * (0.39 - Math.sin(index * 1.47) * 0.018);
    context.lineTo(x, y);
  }
  context.lineTo(width, height * 0.53);
  context.lineTo(0, height * 0.53);
  context.closePath();
  context.fill();
}

function drawWater(context, world, project, width, height) {
  const waterSurfaceGroups = waterSurfaceGroupsFor(world);
  if (waterSurfaceGroups.length === 0) {
    return;
  }
  const gradient = context.createLinearGradient(width * 0.42, height * 0.32, width, height);
  gradient.addColorStop(0, "#4d7d7f");
  gradient.addColorStop(0.48, "#285b61");
  gradient.addColorStop(1, "#173e44");
  waterSurfaceGroups.forEach((waterSurfacePoints, groupIndex) => {
    const waterLevel = world.waterLevels?.[groupIndex] ?? world.waterLevel;
    const waterWorldPoints = waterSurfacePoints.map(({ x, z }) => ({
      x,
      y: waterLevel,
      z,
    }));
    fillProjectedPolygon(context, project, waterWorldPoints, gradient);
    const waterX = waterSurfacePoints.map((point) => point.x);
    const waterZ = waterSurfacePoints.map((point) => point.z);
    const minimumX = Math.min(...waterX);
    const maximumX = Math.max(...waterX);
    const minimumZ = Math.min(...waterZ);
    const maximumZ = Math.max(...waterZ);
    context.save();
    clipToWorldPolygons(context, project, [waterWorldPoints]);
    for (let index = 0; index < 7; index += 1) {
      const z = mix(minimumZ, maximumZ, (index + 1) / 8);
      strokeWorldLine(
        context,
        project,
        [
          { x: mix(minimumX, maximumX, 0.25) + Math.sin(index) * 3, y: waterLevel + 0.02, z },
          { x: mix(minimumX, maximumX, 0.82), y: waterLevel + 0.02, z: z - 5 },
        ],
        {
          strokeStyle: "rgba(202,232,223,.26)",
          lineWidth: 0.8,
        },
      );
    }
    context.restore();
  });
}

function drawFairwayStripes(context, world, project) {
  context.save();
  context.globalAlpha = 0.34;
  for (let z = world.stripeStartZ, stripe = 0; z < world.stripeEndZ; z += 25, stripe += 1) {
    const start = z;
    const end = Math.min(z + 25, world.stripeEndZ);
    const ribbon = buildRibbon(
      start,
      end,
      4,
      world.centerAt,
      (sampleZ) => world.fairwayHalfWidthAt(sampleZ) * 0.97,
      0.0015,
      world.terrainElevationAt,
    );
    fillProjectedPolygon(
      context,
      project,
      ribbon,
      stripe % 2 === 0
        ? world.palette.fairwayStripeLight
        : world.palette.fairwayStripeDark,
    );
  }
  context.restore();
}

function drawTerrainRelief(context, world, project) {
  let relief = TERRAIN_RELIEF_CACHE.get(world);
  if (!relief) {
    const xSteps = world.id === "north-inlet" ? 16 : 14;
    const zSteps = world.id === "north-inlet" ? 32 : 28;
    const stepX = (world.bounds.maximumX - world.bounds.minimumX) / xSteps;
    const stepZ = (world.bounds.maximumZ - world.bounds.minimumZ) / zSteps;
    const sampleStep = Math.max(0.8, Math.min(stepX, stepZ) * 0.22);
    const light = normalize({ x: 0.48, y: 0.78, z: -0.4 });
    relief = [];
    for (let zIndex = 0; zIndex < zSteps; zIndex += 1) {
      const z0 = world.bounds.minimumZ + zIndex * stepZ;
      const z1 = z0 + stepZ;
      for (let xIndex = 0; xIndex < xSteps; xIndex += 1) {
        const x0 = world.bounds.minimumX + xIndex * stepX;
        const x1 = x0 + stepX;
        const centerX = (x0 + x1) * 0.5;
        const centerZ = (z0 + z1) * 0.5;
        const gradientX =
          (world.terrainElevationAt(centerX + sampleStep, centerZ) -
            world.terrainElevationAt(centerX - sampleStep, centerZ)) /
          (sampleStep * 2);
        const gradientZ =
          (world.terrainElevationAt(centerX, centerZ + sampleStep) -
            world.terrainElevationAt(centerX, centerZ - sampleStep)) /
          (sampleStep * 2);
        const normal = normalize({ x: -gradientX, y: 1, z: -gradientZ });
        const lightAmount = dot(normal, light) - 0.78;
        relief.push({
          lightAmount,
          alpha: clamp(Math.abs(lightAmount) * 2.8, 0, 0.3),
          cell: [
            { x: x0, y: world.terrainElevationAt(x0, z0) + 0.012, z: z0 },
            { x: x1, y: world.terrainElevationAt(x1, z0) + 0.012, z: z0 },
            { x: x1, y: world.terrainElevationAt(x1, z1) + 0.012, z: z1 },
            { x: x0, y: world.terrainElevationAt(x0, z1) + 0.012, z: z1 },
          ],
        });
      }
    }
    TERRAIN_RELIEF_CACHE.set(world, relief);
  }
  context.save();
  context.globalCompositeOperation = "soft-light";
  context.filter = "blur(4px)";
  for (const { cell, lightAmount, alpha } of relief) {
    if (alpha < 0.008) continue;
    fillProjectedPolygon(
      context,
      project,
      cell,
      lightAmount >= 0
        ? `rgba(255,232,169,${alpha})`
        : `rgba(36,43,27,${alpha})`,
    );
  }
  context.restore();
}

function drawFescue(context, world, project, timeMs, reducedMotion) {
  const startZ = world.bounds.minimumZ + 16;
  const endZ = world.bounds.maximumZ - 12;
  const tufts = [];
  const tuftCount = world.id === "north-inlet" ? 72 : 64;
  const seconds = timeMs / 1000;
  const gust = reducedMotion
    ? 0
    : 0.5 + Math.sin(seconds * 0.82) * 0.22 +
      Math.sin(seconds * 1.91 + 0.8) * 0.12;
  for (let index = 0; index < tuftCount; index += 1) {
    const z = mix(startZ, endZ, (index + 0.5) / tuftCount);
    const center = world.centerAt(z);
    const fairwayEdge = world.fairwayHalfWidthAt(z);
    for (const side of [-1, 1]) {
      for (let lane = 0; lane < 3; lane += 1) {
        const bladeIndex = index * 3 + lane;
        const offset = fairwayEdge + 3.5 + lane * 6.1 + (index % 4) * 1.45;
        const rootZ = z + (lane - 1) * 1.6 + Math.sin(bladeIndex * 0.8) * 0.9;
        const x = center + side * offset + Math.sin(bladeIndex * 2.37) * 2.2;
        const root = { x, z: rootZ };
        if (!courseAllowsFescueAt(world, root.x, root.z)) {
          continue;
        }
        const baseY = world.terrainElevationAt(x, rootZ) + 0.02;
        const height = 0.46 + (bladeIndex % 8) * 0.085;
        const sway =
          gust * (0.22 + height * 0.22) *
          Math.sin(seconds * 1.18 + bladeIndex * 0.53 + side * 0.35);
        const windX = reducedMotion ? 0 : 0.18 + sway;
        const windZ = reducedMotion ? 0 : -0.12 - sway * 0.36;
        const base = project({ x, y: baseY, z: rootZ });
        const top = project({
          x: x + windX,
          y: baseY + height,
          z: rootZ + windZ,
        });
        if (base && top) {
          tufts.push({ base, top, index: bladeIndex, side, sway });
        }
      }
    }
  }
  tufts.sort((left, right) => right.base.depth - left.base.depth);
  context.save();
  context.lineCap = "round";
  for (const tuft of tufts) {
    context.strokeStyle = tuft.index % 3 === 0
      ? "rgba(226,196,116,.68)"
      : tuft.index % 3 === 1
        ? "rgba(154,137,77,.68)"
        : "rgba(104,106,59,.62)";
    context.lineWidth = clamp(1.35 - tuft.base.depth / 520, 0.42, 1.15);
    for (const spread of [-1, 0, 1]) {
      context.beginPath();
      context.moveTo(tuft.base.x + spread * 0.65, tuft.base.y);
      context.quadraticCurveTo(
        mix(tuft.base.x, tuft.top.x, 0.58) + spread * 0.9,
        mix(tuft.base.y, tuft.top.y, 0.58) - Math.abs(tuft.sway) * 0.25,
        tuft.top.x + spread * 0.42,
        tuft.top.y + Math.abs(spread) * 0.5,
      );
      context.stroke();
    }
  }
  context.restore();
}

function buildGreenStripe(world, startZ, endZ, steps = 5) {
  const { center, radiusX, radiusZ } = world.greenPresentation;
  const left = [];
  const right = [];
  for (let index = 0; index <= steps; index += 1) {
    const z = mix(startZ, endZ, index / steps);
    const normalizedZ = clamp((z - center.z) / radiusZ, -1, 1);
    const halfWidth = radiusX * Math.sqrt(Math.max(0, 1 - normalizedZ ** 2));
    const leftX = center.x - halfWidth;
    const rightX = center.x + halfWidth;
    left.push({
      x: leftX,
      y: world.greenElevationAt(leftX, z) + 0.0015,
      z,
    });
    right.push({
      x: rightX,
      y: world.greenElevationAt(rightX, z) + 0.0015,
      z,
    });
  }
  return [...left, ...right.reverse()];
}

function drawGreenSurface(context, world, project) {
  const { center, radiusX, radiusZ } = world.greenPresentation;
  const fringe = buildEllipse(
    center,
    radiusX + 3.1,
    radiusZ + 3.2,
    48,
    0.001,
    world.terrainElevationAt,
  );
  fillProjectedPolygon(context, project, fringe, world.palette.fringe);

  const green = surfaceWorldPoints(
    world.greenPoints,
    0.001,
    world.greenElevationAt,
  );
  const greenFill = context.createLinearGradient(0, 0, 0, context.canvas.height);
  greenFill.addColorStop(0, world.palette.greenTop);
  greenFill.addColorStop(0.58, world.palette.greenMiddle);
  greenFill.addColorStop(1, world.palette.greenBottom);
  fillProjectedPolygon(context, project, green, greenFill);

  context.save();
  clipToWorldPolygons(context, project, [green]);
  const stripeCount = 9;
  for (let index = 0; index < stripeCount; index += 1) {
    const startZ = mix(
      center.z - radiusZ,
      center.z + radiusZ,
      index / stripeCount,
    );
    const endZ = mix(
      center.z - radiusZ,
      center.z + radiusZ,
      (index + 1) / stripeCount,
    );
    fillProjectedPolygon(
      context,
      project,
      buildGreenStripe(world, startZ, endZ),
      index % 2 === 0
        ? "rgba(205,231,166,.075)"
        : "rgba(20,76,42,.045)",
    );
  }
  context.restore();
}

function drawBunker(context, world, project, bunker, surfacePoints) {
  const center = { x: bunker.x, z: bunker.z };
  const outer = scaledSurfaceWorldPoints(
    surfacePoints,
    center,
    1.2,
    0.001,
    world.terrainElevationAt,
  );
  fillProjectedPolygon(context, project, outer, "rgba(67,65,37,.86)");
  const sand = surfaceWorldPoints(surfacePoints, 0.012, world.terrainElevationAt);
  const projected = projectedPath(project, sand);
  if (projected.length < 3) {
    return;
  }
  const gradient = context.createLinearGradient(
    projected[0].x,
    projected[0].y,
    projected[Math.floor(projected.length / 2)].x,
    projected[Math.floor(projected.length / 2)].y,
  );
  gradient.addColorStop(0, "#f0dfb2");
  gradient.addColorStop(0.54, "#d8bd81");
  gradient.addColorStop(1, "#a98d59");
  fillProjectedPolygon(context, project, sand, gradient);

  const floor = scaledSurfaceWorldPoints(
    surfacePoints,
    center,
    bunker.floorRadius * 0.96,
    0.02,
    world.terrainElevationAt,
  );
  const floorFill = context.createLinearGradient(
    projected[0].x,
    projected[0].y,
    projected[Math.floor(projected.length * 0.64)].x,
    projected[Math.floor(projected.length * 0.64)].y,
  );
  floorFill.addColorStop(0, "rgba(241,222,176,.98)");
  floorFill.addColorStop(1, "rgba(184,151,91,.98)");
  fillProjectedPolygon(context, project, floor, floorFill);

  const stepCount = bunker.style === "revetted-pot" ? 4 : 2;
  for (let step = 0; step < stepCount; step += 1) {
    const amount = mix(
      bunker.floorRadius * 1.08,
      0.79,
      (step + 1) / (stepCount + 1),
    );
    const ring = scaledSurfaceWorldPoints(
      surfacePoints,
      center,
      amount,
      0.024,
      world.terrainElevationAt,
    );
    strokeWorldLine(context, project, [...ring, ring[0]], {
      strokeStyle: bunker.style === "revetted-pot"
        ? "rgba(103,78,45,.5)"
        : "rgba(244,225,179,.32)",
      lineWidth: bunker.style === "revetted-pot" ? 1.15 : 0.8,
      globalAlpha: 0.9,
    });
  }
}

function drawTrees(context, world, project) {
  const trees = world.treePositions.map(([x, z, height], index) => {
    const base = project({ x, y: world.terrainElevationAt(x, z), z });
    const top = project({ x, y: world.terrainElevationAt(x, z) + height, z });
    return { base, top, height, index };
  })
    .filter((tree) => tree.base && tree.top)
    .sort((left, right) => right.base.depth - left.base.depth);

  for (const tree of trees) {
    const screenHeight = Math.max(8, tree.base.y - tree.top.y);
    const canopyWidth = screenHeight * (0.55 + (tree.index % 3) * 0.05);
    context.save();
    context.globalAlpha = clamp(1.18 - tree.base.depth / 780, 0.42, 0.95);
    context.strokeStyle = "#493c2b";
    context.lineWidth = Math.max(0.8, canopyWidth * 0.09);
    context.beginPath();
    context.moveTo(tree.base.x, tree.base.y);
    context.lineTo(tree.top.x, tree.top.y + screenHeight * 0.48);
    context.stroke();

    const canopy = context.createRadialGradient(
      tree.top.x - canopyWidth * 0.18,
      tree.top.y,
      0,
      tree.top.x,
      tree.top.y + screenHeight * 0.2,
      canopyWidth,
    );
    canopy.addColorStop(0, "#749064");
    canopy.addColorStop(0.38, "#3c674c");
    canopy.addColorStop(1, "#173d31");
    context.fillStyle = canopy;
    context.beginPath();
    context.ellipse(
      tree.top.x,
      tree.top.y + screenHeight * 0.24,
      canopyWidth,
      screenHeight * 0.55,
      0,
      0,
      TAU,
    );
    context.fill();
    context.restore();
  }
}

function drawStoneWall(context, world, project) {
  const barrierPointGroups = barrierPointGroupsFor(world);
  if (barrierPointGroups.length === 0) {
    return;
  }
  barrierPointGroups.forEach((wallPoints) => {
    const base = wallPoints.map(({ x, z }) => ({
      x,
      y: world.terrainElevationAt(x, z) + 0.05,
      z,
    }));
    const top = wallPoints.map(({ x, z }) => ({
      x,
      y: world.terrainElevationAt(x, z) + 0.72,
      z,
    }));
    strokeWorldLine(context, project, base, {
      strokeStyle: "rgba(47,47,41,.86)",
      lineWidth: 4.6,
    });
    strokeWorldLine(context, project, top, {
      strokeStyle: "rgba(150,144,119,.9)",
      lineWidth: 2.2,
    });
  });
}

function flagFabricWorldPoints(world, topWorld, timeMs, reducedMotion) {
  const { flagWidth, flagHeight } = world.greenPresentation;
  const wave = reducedMotion ? 0 : Math.sin(timeMs / 410) * 0.055;
  return [
    topWorld,
    {
      x: topWorld.x + flagWidth * 0.56,
      y: topWorld.y - flagHeight * 0.08,
      z: topWorld.z + wave,
    },
    {
      x: topWorld.x + flagWidth,
      y: topWorld.y - flagHeight * 0.22,
      z: topWorld.z - wave * 0.55,
    },
    {
      x: topWorld.x + flagWidth * 0.92,
      y: topWorld.y - flagHeight,
      z: topWorld.z + wave * 0.35,
    },
    {
      x: topWorld.x,
      y: topWorld.y - flagHeight * 0.82,
      z: topWorld.z,
    },
  ];
}

function flagShadowWorldGeometry(
  world,
  groundY,
  topWorld,
  timeMs,
  reducedMotion,
) {
  const shadowPoint = (point) => {
    const height = Math.max(0, point.y - groundY);
    const x = point.x - height * 0.72;
    const z = point.z + height * 0.49;
    return {
      x,
      y: world.greenElevationAt(x, z) + 0.004,
      z,
    };
  };
  return {
    pole: [
      { ...world.pin, y: groundY + 0.002 },
      shadowPoint(topWorld),
    ],
    fabric: flagFabricWorldPoints(
      world,
      topWorld,
      timeMs,
      reducedMotion,
    ).map(shadowPoint),
  };
}

export function projectFlagShadowGeometry(
  world,
  camera,
  width,
  height,
  timeMs = 0,
  reducedMotion = false,
) {
  const groundY = world.greenElevationAt(world.pin.x, world.pin.z);
  const topWorld = {
    ...world.pin,
    y: groundY + world.greenPresentation.flagstickHeight,
  };
  const shadow = flagShadowWorldGeometry(
    world,
    groundY,
    topWorld,
    timeMs,
    reducedMotion,
  );
  const project = createProjector(camera, width, height);
  return {
    pole: shadow.pole.map(project),
    fabric: shadow.fabric.map(project),
  };
}

function drawFlagShadow(
  context,
  world,
  project,
  groundY,
  topWorld,
  timeMs,
  reducedMotion,
) {
  const shadow = flagShadowWorldGeometry(
    world,
    groundY,
    topWorld,
    timeMs,
    reducedMotion,
  );
  strokeWorldLine(
    context,
    project,
    shadow.pole,
    {
      strokeStyle: "rgba(28,37,23,.3)",
      lineWidth: 3.2,
      lineCap: "round",
    },
  );
  context.save();
  context.shadowColor = "rgba(31,37,22,.24)";
  context.shadowBlur = 2.4;
  fillProjectedPolygon(
    context,
    project,
    shadow.fabric,
    "rgba(38,43,25,.24)",
  );
  context.restore();
}

function createCupRimGeometry(world, project, camera, groundY) {
  const pin = world.pin;
  const radius = world.greenPresentation.cupDiameter / 2;
  const points = [];
  for (let index = 0; index < 36; index += 1) {
    const angle = (index / 36) * TAU;
    const rimWorld = {
      x: pin.x + Math.cos(angle) * radius,
      y: groundY + 0.001,
      z: pin.z + Math.sin(angle) * radius,
    };
    const screen = project(rimWorld);
    if (screen) {
      points.push({ world: rimWorld, screen });
    }
  }
  if (points.length < 3) {
    return null;
  }

  const cameraDirection = {
    x: camera.position.x - pin.x,
    z: camera.position.z - pin.z,
  };
  const nearFlags = points.map(({ world }) =>
    (world.x - pin.x) * cameraDirection.x +
      (world.z - pin.z) * cameraDirection.z >=
    0,
  );
  const startIndex = nearFlags.findIndex(
    (isNear, index) =>
      isNear && !nearFlags[(index - 1 + nearFlags.length) % nearFlags.length],
  );
  const nearRim = [];
  if (startIndex >= 0) {
    for (let offset = 0; offset < nearFlags.length; offset += 1) {
      const index = (startIndex + offset) % nearFlags.length;
      if (!nearFlags[index]) {
        break;
      }
      nearRim.push(points[index].screen);
    }
  }

  return {
    rim: points.map(({ screen }) => screen),
    nearRim,
  };
}

export function projectCupGeometry(world, camera, width, height) {
  const pin = world.pin;
  const groundY = world.greenElevationAt(pin.x, pin.z);
  const project = createProjector(camera, width, height);
  const geometry = createCupRimGeometry(world, project, camera, groundY);
  if (!geometry) {
    return null;
  }
  return {
    center: project({
      ...pin,
      y: groundY + 0.001,
    }),
    rim: geometry.rim.map((point) => ({ ...point })),
    nearRim: geometry.nearRim.map((point) => ({ ...point })),
  };
}

function drawCupInterior(context, geometry) {
  if (!geometry) {
    return;
  }
  const { rim } = geometry;

  context.save();
  context.beginPath();
  context.moveTo(rim[0].x, rim[0].y);
  for (const point of rim.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fillStyle = "#07100c";
  context.fill();
  context.strokeStyle = "rgba(32,71,41,.9)";
  context.lineWidth = 1.8;
  context.stroke();
  context.restore();
}

function drawFlagFabric(
  context,
  world,
  project,
  topWorld,
  timeMs,
  reducedMotion,
) {
  const points = flagFabricWorldPoints(
    world,
    topWorld,
    timeMs,
    reducedMotion,
  ).map(project);
  if (points.some((point) => !point)) {
    return;
  }

  const flagFill = context.createLinearGradient(
    points[0].x,
    points[0].y,
    points[2].x,
    points[2].y,
  );
  flagFill.addColorStop(0, "#ffe986");
  flagFill.addColorStop(0.58, "#efcc50");
  flagFill.addColorStop(1, "#c99d2f");
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fillStyle = flagFill;
  context.fill();
  context.strokeStyle = "rgba(116,78,18,.34)";
  context.lineWidth = 0.7;
  context.stroke();
}

function prepareCupScene(
  context,
  world,
  project,
  camera,
  timeMs,
  reducedMotion,
) {
  const pin = world.pin;
  const groundY = world.greenElevationAt(pin.x, pin.z);
  const baseWorld = { ...pin, y: groundY + 0.001 };
  const topWorld = {
    ...pin,
    y: groundY + world.greenPresentation.flagstickHeight,
  };
  const base = project(baseWorld);
  const top = project(topWorld);
  if (!base || !top) {
    return null;
  }

  drawFlagShadow(
    context,
    world,
    project,
    groundY,
    topWorld,
    timeMs,
    reducedMotion,
  );
  const geometry = createCupRimGeometry(world, project, camera, groundY);
  drawCupInterior(context, geometry);
  return { base, top, topWorld, geometry };
}

function drawFlag(
  context,
  world,
  project,
  scene,
  timeMs,
  reducedMotion,
) {
  const { base, top, topWorld } = scene;
  context.save();
  context.strokeStyle = "rgba(29,41,31,.38)";
  context.lineWidth = clamp(top.scale * 0.058, 1.8, 3.2);
  context.beginPath();
  context.moveTo(base.x, base.y);
  context.lineTo(top.x, top.y);
  context.stroke();
  context.strokeStyle = "rgba(248,249,239,.96)";
  context.lineWidth = clamp(top.scale * 0.026, 0.9, 1.7);
  context.beginPath();
  context.moveTo(base.x, base.y);
  context.lineTo(top.x, top.y);
  context.stroke();
  drawFlagFabric(
    context,
    world,
    project,
    topWorld,
    timeMs,
    reducedMotion,
  );
  context.restore();
}

function drawCupFrontRim(context, geometry) {
  if (!geometry || geometry.nearRim.length < 2) {
    return;
  }
  context.save();
  context.beginPath();
  context.moveTo(geometry.nearRim[0].x, geometry.nearRim[0].y);
  for (const point of geometry.nearRim.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(31,72,42,.94)";
  context.lineWidth = 3.1;
  context.stroke();
  context.strokeStyle = "rgba(225,228,211,.58)";
  context.lineWidth = 0.75;
  context.stroke();
  context.restore();
}

function drawBroadcastTracer(
  context,
  world,
  project,
  tracer,
  reducedMotion,
) {
  if (!tracer || tracer.alpha <= 0.001 || tracer.points.length < 2) {
    return;
  }
  const projected = tracer.points
    .map(({ position }) =>
      project({
        x: position.x,
        y: courseSurfaceElevationAt(world, position.x, position.z) + position.y,
        z: position.z,
      }),
    )
    .filter(Boolean);
  if (projected.length < 2) {
    return;
  }

  const first = projected[0];
  const last = projected.at(-1);
  const tracerFill = context.createLinearGradient(
    first.x,
    first.y,
    last.x,
    last.y,
  );
  tracerFill.addColorStop(0, "rgba(255,218,91,0)");
  tracerFill.addColorStop(0.28, `rgba(255,218,91,${tracer.alpha * 0.3})`);
  tracerFill.addColorStop(1, `rgba(255,238,155,${tracer.alpha * 0.96})`);

  context.save();
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of projected.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.lineCap = "round";
  context.lineJoin = "round";
  if (!reducedMotion) {
    context.strokeStyle = `rgba(246,197,56,${tracer.alpha * 0.2})`;
    context.lineWidth = 5;
    context.shadowColor = `rgba(246,197,56,${tracer.alpha * 0.28})`;
    context.shadowBlur = 5;
    context.stroke();
  }
  context.shadowBlur = 0;
  context.strokeStyle = tracerFill;
  context.lineWidth = 1.75;
  context.stroke();
  context.restore();
}

function drawBall(
  context,
  world,
  project,
  tape,
  timeMs,
  ballPosition,
  ballPresentation,
  cupGeometry,
) {
  if (ballPresentation && !ballPresentation.visible) {
    return;
  }

  const position = ballPresentation
    ? ballPresentation.position
    : ballPosition ?? samplePresentationTape(tape, timeMs).position;
  const groundY = courseSurfaceElevationAt(world, position.x, position.z);
  const worldPosition = ballPresentation?.worldPosition ?? {
    x: position.x,
    y: groundY + position.y,
    z: position.z,
  };
  const shadowWorldPosition = ballPresentation?.shadowWorldPosition ?? {
    x: position.x,
    y: groundY + 0.003,
    z: position.z,
  };
  const ball = project(worldPosition);
  const shadow = project(shadowWorldPosition);
  if (!ball) {
    return;
  }

  const radius = ballPresentation
    ? ball.scale * ballPresentation.radiusMetres
    : ball.scale * GOLF_BALL_RADIUS_METRES;
  const heightFactor = ballPresentation
    ? clamp(
        (worldPosition.y - shadowWorldPosition.y) /
          (ballPresentation.radiusMetres * 8),
        0,
        1,
      )
    : clamp(position.y / 46, 0, 1);
  const shadowAlpha = ballPresentation?.shadowAlpha ?? 1;
  if (shadow && shadowAlpha > 0.001) {
    context.save();
    context.globalAlpha =
      (0.12 + (1 - heightFactor) * 0.2) * shadowAlpha;
    context.fillStyle = "#07150f";
    context.beginPath();
    context.ellipse(
      shadow.x,
      shadow.y,
      radius * (1.5 + heightFactor),
      radius * 0.58,
      0,
      0,
      TAU,
    );
    context.fill();
    context.restore();
  }

  context.save();
  if (ballPresentation?.clipToCup && cupGeometry) {
    context.beginPath();
    context.moveTo(cupGeometry.rim[0].x, cupGeometry.rim[0].y);
    for (const point of cupGeometry.rim.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.closePath();
    context.clip();
  }

  const ballFill = context.createRadialGradient(
    ball.x - radius * 0.32,
    ball.y - radius * 0.38,
    radius * 0.05,
    ball.x,
    ball.y,
    radius,
  );
  ballFill.addColorStop(0, "#ffffff");
  ballFill.addColorStop(0.62, "#eff1e8");
  ballFill.addColorStop(1, "#abb4a5");
  context.fillStyle = ballFill;
  context.beginPath();
  context.arc(ball.x, ball.y, radius, 0, TAU);
  context.fill();
  if (
    Number.isFinite(ballPresentation?.rotationRadians) &&
    radius >= 1.2
  ) {
    context.save();
    context.translate(ball.x, ball.y);
    context.rotate(ballPresentation.rotationRadians % TAU);
    context.strokeStyle = "rgba(50, 67, 58, 0.58)";
    context.lineWidth = Math.max(0.7, radius * 0.11);
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(0, -radius * 0.62);
    context.quadraticCurveTo(radius * 0.25, 0, 0, radius * 0.62);
    context.stroke();
    context.restore();
  }
  context.restore();
}

function drawStrategy(context, world, project, alpha) {
  if (alpha <= 0.01) {
    return;
  }
  for (const [index, route] of world.strategyPaths.entries()) {
    const points = route.points.map(({ x, z }) => ({
      x,
      y: world.terrainElevationAt(x, z) + (index === 0 ? 0.36 : 0.42),
      z,
    }));
    strokeWorldLine(context, project, points, {
      strokeStyle: route.color,
      lineWidth: index === 0 ? 1.8 : 1.5,
      globalAlpha: alpha * (index === 0 ? 0.82 : 0.64),
      dash: index === 0 ? [5, 6] : [3, 7],
    });
  }
}

function drawAimGuide(context, world, project, guide) {
  if (
    !guide ||
    !guide.from ||
    !guide.target ||
    ![guide.from.x, guide.from.z, guide.target.x, guide.target.z].every(Number.isFinite)
  ) {
    return;
  }
  const dx = guide.target.x - guide.from.x;
  const dz = guide.target.z - guide.from.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.5) {
    return;
  }
  const forward = { x: dx / distance, z: dz / distance };
  const right = { x: -forward.z, z: forward.x };
  const lineStart = Math.min(3.5, distance * 0.08);
  const lineEnd = Math.max(lineStart, distance - Math.min(3.2, distance * 0.1));
  const lineSteps = Math.max(5, Math.ceil((lineEnd - lineStart) / 10));
  const line = [];
  for (let index = 0; index <= lineSteps; index += 1) {
    const along = mix(lineStart, lineEnd, index / lineSteps);
    const x = guide.from.x + forward.x * along;
    const z = guide.from.z + forward.z * along;
    line.push({ x, y: courseSurfaceElevationAt(world, x, z) + 0.055, z });
  }
  const accent = guide.attainable === false ? "#e5aa62" : "#f4dd79";
  strokeWorldLine(context, project, line, {
    strokeStyle: accent,
    lineWidth: 1.55,
    globalAlpha: 0.52,
    dash: [5, 8],
  });

  const radius = clamp(distance * 0.014, 1.65, 3.4);
  const ring = [];
  for (let index = 0; index <= 40; index += 1) {
    const angle = (index / 40) * TAU;
    const x = guide.target.x + Math.cos(angle) * radius;
    const z = guide.target.z + Math.sin(angle) * radius;
    ring.push({ x, y: courseSurfaceElevationAt(world, x, z) + 0.07, z });
  }
  strokeWorldLine(context, project, ring, {
    strokeStyle: accent,
    lineWidth: 2.1,
    globalAlpha: 0.9,
  });

  const tickLength = radius * 1.55;
  const gap = radius * 0.62;
  for (const direction of [forward, right]) {
    for (const sign of [-1, 1]) {
      const startDistance = gap * sign;
      const endDistance = tickLength * sign;
      const startX = guide.target.x + direction.x * startDistance;
      const startZ = guide.target.z + direction.z * startDistance;
      const endX = guide.target.x + direction.x * endDistance;
      const endZ = guide.target.z + direction.z * endDistance;
      strokeWorldLine(context, project, [
        {
          x: startX,
          y: courseSurfaceElevationAt(world, startX, startZ) + 0.075,
          z: startZ,
        },
        {
          x: endX,
          y: courseSurfaceElevationAt(world, endX, endZ) + 0.075,
          z: endZ,
        },
      ], {
        strokeStyle: accent,
        lineWidth: 2.2,
        globalAlpha: 0.96,
        lineCap: "round",
      });
    }
  }
}

function drawAtmosphere(context, width, height) {
  const haze = context.createLinearGradient(0, height * 0.23, 0, height * 0.72);
  haze.addColorStop(0, "rgba(255,224,174,.18)");
  haze.addColorStop(0.48, "rgba(237,218,177,.055)");
  haze.addColorStop(1, "rgba(6,18,14,0)");
  context.fillStyle = haze;
  context.fillRect(0, 0, width, height);

  const vignette = context.createRadialGradient(
    width * 0.5,
    height * 0.44,
    Math.min(width, height) * 0.16,
    width * 0.5,
    height * 0.46,
    Math.max(width, height) * 0.7,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.72, "rgba(18,14,5,.04)");
  vignette.addColorStop(1, "rgba(12,13,5,.38)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function renderCoursePresentationDetails(
  context,
  {
    world,
    width,
    height,
    camera = world.overviewCamera,
    tape,
    timeMs = 0,
    environmentTimeMs = timeMs,
    ballPosition,
    showBall = true,
    strategyAlpha = 0.42,
    aimGuide = null,
    reducedMotion = false,
    tracer = null,
    ballPresentation = null,
  },
  { clear = false, includeBunkers = true } = {},
) {
  if (clear) {
    context.clearRect(0, 0, width, height);
  }
  const project = createProjector(camera, width, height);

  if (includeBunkers) {
    for (const [index, bunker] of world.bunkers.entries()) {
      drawBunker(
        context,
        world,
        project,
        bunker,
        world.bunkerPoints[index],
      );
    }
  }

  drawWater(context, world, project, width, height);
  drawStrategy(context, world, project, strategyAlpha);
  drawAimGuide(context, world, project, aimGuide);
  drawStoneWall(context, world, project);
  drawTrees(context, world, project);
  const cupScene = prepareCupScene(
    context,
    world,
    project,
    camera,
    environmentTimeMs,
    reducedMotion,
  );
  const cupGeometry = cupScene?.geometry ?? null;
  const retainedBallPosition = ballPresentation?.position ??
    ballPosition ??
    (tape ? samplePresentationTape(tape, timeMs).position : null);
  const retainedBallWorldPosition = ballPresentation?.worldPosition ??
    (retainedBallPosition
      ? {
          x: retainedBallPosition.x,
          y:
            courseSurfaceElevationAt(
              world,
              retainedBallPosition.x,
              retainedBallPosition.z,
            ) + retainedBallPosition.y,
          z: retainedBallPosition.z,
        }
      : null);
  const ballDepth = retainedBallWorldPosition
    ? project(retainedBallWorldPosition)?.depth ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  const ballInFrontOfFlag = Boolean(
    cupScene && ballDepth <= cupScene.base.depth,
  );
  drawBroadcastTracer(context, world, project, tracer, reducedMotion);
  if (cupScene && ballInFrontOfFlag) {
    drawFlag(
      context,
      world,
      project,
      cupScene,
      environmentTimeMs,
      reducedMotion,
    );
  }
  if (showBall) {
    drawBall(
      context,
      world,
      project,
      tape,
      timeMs,
      ballPosition,
      ballPresentation,
      cupGeometry,
    );
  }
  if (cupScene && !ballInFrontOfFlag) {
    drawFlag(
      context,
      world,
      project,
      cupScene,
      environmentTimeMs,
      reducedMotion,
    );
  }
  if (ballPresentation?.cupEntry) {
    drawCupFrontRim(context, cupGeometry);
  }
  drawAtmosphere(context, width, height);
}

export function renderCoursePresentationLayer(context, frame, options = {}) {
  renderCoursePresentationDetails(context, frame, {
    clear: true,
    ...options,
  });
}

export function renderCourseFrame(
  context,
  {
    world,
    width,
    height,
    camera = world.overviewCamera,
    tape,
    timeMs = 0,
    environmentTimeMs = timeMs,
    ballPosition,
    showBall = true,
    strategyAlpha = 0.42,
    aimGuide = null,
    reducedMotion = false,
    tracer = null,
    ballPresentation = null,
  },
) {
  context.clearRect(0, 0, width, height);
  drawSky(context, world, width, height, camera);
  const project = createProjector(camera, width, height);

  const landscape = buildRibbon(
    world.bounds.minimumZ,
    world.bounds.maximumZ,
    56,
    () => 0,
    () => Math.max(Math.abs(world.bounds.minimumX), Math.abs(world.bounds.maximumX)),
    0,
    world.terrainElevationAt,
  );
  const landscapeFill = context.createLinearGradient(0, height * 0.34, 0, height);
  landscapeFill.addColorStop(0, world.palette.landscapeTop);
  landscapeFill.addColorStop(0.48, world.palette.landscapeMiddle);
  landscapeFill.addColorStop(1, world.palette.landscapeBottom);
  fillProjectedPolygon(context, project, landscape, landscapeFill);

  const rough = surfaceWorldPoints(world.roughPoints, 0, world.terrainElevationAt);
  const roughFill = context.createLinearGradient(0, height * 0.32, 0, height);
  roughFill.addColorStop(0, world.palette.roughTop);
  roughFill.addColorStop(0.55, world.palette.roughMiddle);
  roughFill.addColorStop(1, world.palette.roughBottom);
  fillProjectedPolygon(context, project, rough, roughFill);

  const fairwayFill = context.createLinearGradient(0, height * 0.32, 0, height);
  fairwayFill.addColorStop(0, world.palette.fairwayTop);
  fairwayFill.addColorStop(0.5, world.palette.fairwayMiddle);
  fairwayFill.addColorStop(1, world.palette.fairwayBottom);
  for (const fairwayPoints of world.fairwayPoints) {
    const fairway = surfaceWorldPoints(fairwayPoints, 0.001, world.terrainElevationAt);
    fillProjectedPolygon(context, project, fairway, fairwayFill);
  }
  const fairwayWorldPolygons = world.fairwayPoints.map((points) =>
    surfaceWorldPoints(points, 0.001, world.terrainElevationAt)
  );
  context.save();
  clipToWorldPolygons(context, project, fairwayWorldPolygons);
  drawFairwayStripes(context, world, project);
  context.restore();

  const tee = buildEllipse(
    world.tee,
    7.5,
    9,
    28,
    0.001,
    world.terrainElevationAt,
  );
  fillProjectedPolygon(context, project, tee, world.palette.greenMiddle);

  drawGreenSurface(context, world, project);
  drawTerrainRelief(context, world, project);
  drawFescue(context, world, project, environmentTimeMs, reducedMotion);
  renderCoursePresentationDetails(context, {
    world,
    width,
    height,
    camera,
    tape,
    timeMs,
    environmentTimeMs,
    ballPosition,
    showBall,
    strategyAlpha,
    aimGuide,
    reducedMotion,
    tracer,
    ballPresentation,
  });
}
