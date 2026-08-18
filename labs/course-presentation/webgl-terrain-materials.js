import {
  WEBGL_BUNKER_ART_VERSION,
  createWebglBunkerPatches,
} from "./webgl-bunker-art.js";

export const WEBGL_GROUND_ART_VERSION = "links-ground-v6";
export const WEBGL_WATERCOURSE_ART_VERSION =
  "watercourse-edge-and-surface-v5";
export const WEBGL_WATER_SHORELINE_WIDTH_METERS = 1.35;
export const WEBGL_WATER_SHORELINE_OUTER_LIFT_METERS = 0.09;
export const WEBGL_WATER_SHORELINE_INNER_LIFT_METERS = 0.06;
export const WEBGL_WATER_SURFACE_RENDER_LIFT_METERS = 0.052;
export const WEBGL_WATERCOURSE_MIN_RIBBON_STATIONS = 44;
export const WEBGL_WATERCOURSE_MAX_RIBBON_STATIONS = 48;
export const WEBGL_WATER_SHORELINE_MAX_VERTICES = 192;
export const WEBGL_WATER_SHORELINE_MAX_TRIANGLES = 192;
export const WEBGL_WATER_SHORELINE_MAX_BYTES = 7_104;
export const WEBGL_TERRAIN_COLUMNS = 96;
export const WEBGL_TERRAIN_ROWS = 192;
export const WEBGL_TEE_RADIUS_X_METERS = 7.5;
export const WEBGL_TEE_RADIUS_Z_METERS = 9;
export const WEBGL_TEE_SEGMENTS = 48;
export const WEBGL_TERRAIN_MATERIAL_ID_MASK = 0b0000_0111;
export const WEBGL_TERRAIN_RELIEF_SHIFT = 3;
export const WEBGL_TERRAIN_RELIEF_LEVELS = 31;

export const WEBGL_SURFACE_MATERIAL_IDS = Object.freeze({
  rough: 0,
  fairway: 1,
  green: 2,
  bunker: 3,
  water: 4,
  bunkerRevetted: 5,
  waterShoreline: 6,
});

const packedTerrainMaterial = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError("packed terrain material must be an unsigned byte");
  }
  return value;
};

export const webglTerrainMaterialId = (value) =>
  packedTerrainMaterial(value) & WEBGL_TERRAIN_MATERIAL_ID_MASK;

export const webglTerrainReliefLevel = (value) =>
  packedTerrainMaterial(value) >> WEBGL_TERRAIN_RELIEF_SHIFT;

const finitePositiveInteger = (value, name) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
};

const finitePoint = (point, name) => {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    throw new TypeError(`${name} must contain finite x-z coordinates`);
  }
  return point;
};

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const normalize = (x, y, z) => {
  const length = Math.hypot(x, y, z) || 1;
  return Object.freeze({ x: x / length, y: y / length, z: z / length });
};

export const WEBGL_TERRAIN_RELIEF_SUN_DIRECTION = normalize(-0.42, 0, -0.38);

const RELIEF_SAMPLE_DISTANCES_METERS = Object.freeze([9, 21, 39, 63]);
const RELIEF_SAMPLE_WEIGHTS = Object.freeze([0.4, 0.3, 0.2, 0.1]);

export function pointInCoursePolygon(points, point) {
  finitePoint(point, "point");
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (
    let index = 0, prior = points.length - 1;
    index < points.length;
    prior = index, index += 1
  ) {
    const current = points[index];
    const previous = points[prior];
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

const WATER_SURFACE_GROUP_CACHE = new WeakMap();

const AUTHORED_WATER_SURFACE_GROUP_CACHE = new WeakMap();

const authoredWaterSurfaceGroupsFor = (world) => {
  const cached = AUTHORED_WATER_SURFACE_GROUP_CACHE.get(world);
  if (cached) return cached;
  const authored = world.waterSurfaceGroups ?? (
    world.waterSurfacePoints.length < 3 ? [] : [world.waterSurfacePoints]
  );
  const groups = Object.freeze(authored.map((points) => Object.freeze(points)));
  AUTHORED_WATER_SURFACE_GROUP_CACHE.set(world, groups);
  return groups;
};

const waterEdgeHash = (cellX, cellZ) => {
  let value = Math.imul(cellX | 0, 374761393) ^
    Math.imul(cellZ | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return ((value >>> 0) / 4294967295) * 2 - 1;
};

const waterEdgeNoise = (x, z) => {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const localX = x - cellX;
  const localZ = z - cellZ;
  const blendX = localX * localX * (3 - 2 * localX);
  const blendZ = localZ * localZ * (3 - 2 * localZ);
  const lower = waterEdgeHash(cellX, cellZ) * (1 - blendX) +
    waterEdgeHash(cellX + 1, cellZ) * blendX;
  const upper = waterEdgeHash(cellX, cellZ + 1) * (1 - blendX) +
    waterEdgeHash(cellX + 1, cellZ + 1) * blendX;
  return lower * (1 - blendZ) + upper * blendZ;
};

const waterCrossSectionAt = (points, primaryAxis, coordinate) => {
  const crossAxis = primaryAxis === "z" ? "x" : "z";
  const intersections = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const startPrimary = start[primaryAxis];
    const endPrimary = end[primaryAxis];
    if (Math.abs(endPrimary - startPrimary) <= 1e-9) continue;
    const minimum = Math.min(startPrimary, endPrimary);
    const maximum = Math.max(startPrimary, endPrimary);
    if (coordinate < minimum || coordinate >= maximum) continue;
    const progress = (coordinate - startPrimary) /
      (endPrimary - startPrimary);
    intersections.push(
      start[crossAxis] + (end[crossAxis] - start[crossAxis]) * progress,
    );
  }
  intersections.sort((left, right) => left - right);
  if (intersections.length < 2 || intersections.length % 2 !== 0) {
    return null;
  }
  let selected = null;
  for (let index = 0; index < intersections.length; index += 2) {
    const minimum = intersections[index];
    const maximum = intersections[index + 1];
    if (!selected || maximum - minimum > selected.maximum - selected.minimum) {
      selected = { minimum, maximum };
    }
  }
  return selected;
};

const waterRibbonEdgeFitsAuthored = (authored, start, end) => {
  for (const progress of [0.2, 0.4, 0.6, 0.8]) {
    if (!pointInCoursePolygon(authored, {
      x: start.x + (end.x - start.x) * progress,
      z: start.z + (end.z - start.z) * progress,
    })) {
      return false;
    }
  }
  return true;
};

const buildWatercourseRibbon = (authored, groupIndex) => {
  const minimumX = Math.min(...authored.map(({ x }) => x));
  const maximumX = Math.max(...authored.map(({ x }) => x));
  const minimumZ = Math.min(...authored.map(({ z }) => z));
  const maximumZ = Math.max(...authored.map(({ z }) => z));
  const spanX = maximumX - minimumX;
  const spanZ = maximumZ - minimumZ;
  const primaryAxis = spanZ >= spanX ? "z" : "x";
  const primaryMinimum = primaryAxis === "z" ? minimumZ : minimumX;
  const primaryMaximum = primaryAxis === "z" ? maximumZ : maximumX;
  const primarySpan = primaryMaximum - primaryMinimum;
  const stationCount = clamp(
    Math.round(primarySpan / 3),
    WEBGL_WATERCOURSE_MIN_RIBBON_STATIONS,
    WEBGL_WATERCOURSE_MAX_RIBBON_STATIONS,
  );
  const sections = [];
  for (let index = 0; index < stationCount; index += 1) {
    const progress = 0.025 + (index / (stationCount - 1)) * 0.95;
    const primary = primaryMinimum + primarySpan * progress;
    const intersection = waterCrossSectionAt(authored, primaryAxis, primary);
    if (!intersection) continue;
    const authoredCenter = (intersection.minimum + intersection.maximum) * 0.5;
    const authoredHalfWidth = (intersection.maximum - intersection.minimum) * 0.5;
    if (authoredHalfWidth <= 1.1) continue;
    sections.push(Object.freeze({
      primary,
      progress,
      authoredCenter,
      authoredHalfWidth,
    }));
  }
  if (sections.length < WEBGL_WATERCOURSE_MIN_RIBBON_STATIONS - 2) {
    throw new RangeError("watercourse ribbon has insufficient interior cross-sections");
  }
  const buildCandidate = (amplitudeScale) => {
    const proposals = sections.map((section) => {
      const broad = waterEdgeNoise(
        section.primary * 0.014 + groupIndex * 11.3,
        section.primary * 0.005 - groupIndex * 7.1,
      );
      const detail = waterEdgeNoise(
        section.primary * 0.033 + 17.7 + groupIndex * 5.2,
        section.primary * 0.011 - 9.3 - groupIndex * 3.4,
      );
      const widthNoise = waterEdgeNoise(
        section.primary * 0.022 - 8.4,
        section.primary * 0.008 + 4.2 + groupIndex * 2.7,
      );
      const maximumOffset = Math.min(
        1.35,
        section.authoredHalfWidth * 0.22,
      );
      const offset = clamp(
        (broad * 0.96 + detail * 0.24) *
          maximumOffset * amplitudeScale,
        -maximumOffset,
        maximumOffset,
      );
      const desiredHalfWidth = clamp(
        section.authoredHalfWidth * (0.50 + widthNoise * 0.045),
        1.40,
        2.80,
      );
      const capProgress = clamp(
        Math.min(section.progress, 1 - section.progress) / 0.095,
        0,
        1,
      );
      const capBlend = capProgress * capProgress * (3 - 2 * capProgress);
      return Object.freeze({
        center: section.authoredCenter + offset,
        halfWidth: desiredHalfWidth * (0.42 + capBlend * 0.58),
      });
    });
    const smoothProposal = (index, property) => {
      const weights = [1, 2, 3, 2, 1];
      let total = 0;
      let weightTotal = 0;
      for (let offset = -2; offset <= 2; offset += 1) {
        const candidate = clamp(index + offset, 0, proposals.length - 1);
        const weight = weights[offset + 2];
        total += proposals[candidate][property] * weight;
        weightTotal += weight;
      }
      return total / weightTotal;
    };
    const left = [];
    const right = [];
    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      let halfWidth = smoothProposal(index, "halfWidth");
      const maximumHalfWidth = Math.max(
        0.58,
        section.authoredHalfWidth - 0.46,
      );
      halfWidth = Math.min(maximumHalfWidth, halfWidth);
      const maximumCenterOffset = Math.max(
        0,
        section.authoredHalfWidth - halfWidth - 0.42,
      );
      const center = clamp(
        smoothProposal(index, "center"),
        section.authoredCenter - maximumCenterOffset,
        section.authoredCenter + maximumCenterOffset,
      );
      const first = primaryAxis === "z"
        ? Object.freeze({ x: center - halfWidth, z: section.primary })
        : Object.freeze({ x: section.primary, z: center - halfWidth });
      const second = primaryAxis === "z"
        ? Object.freeze({ x: center + halfWidth, z: section.primary })
        : Object.freeze({ x: section.primary, z: center + halfWidth });
      left.push(first);
      right.push(second);
    }
    const candidate = [...left, ...right.reverse()];
    if (candidate.some((point) => !pointInCoursePolygon(authored, point))) {
      return null;
    }
    for (let index = 0; index < candidate.length; index += 1) {
      if (!waterRibbonEdgeFitsAuthored(
        authored,
        candidate[index],
        candidate[(index + 1) % candidate.length],
      )) {
        return null;
      }
    }
    try {
      triangulateCourseSurface(candidate);
    } catch {
      return null;
    }
    return Object.freeze(candidate);
  };
  for (const amplitudeScale of [1, 0.82, 0.66, 0.5, 0.34]) {
    const candidate = buildCandidate(amplitudeScale);
    if (candidate) return candidate;
  }
  throw new RangeError("watercourse ribbon cannot remain inside authored hazard");
};

export const waterSurfaceGroupsFor = (world) => {
  const cached = WATER_SURFACE_GROUP_CACHE.get(world);
  if (cached) return cached;
  const rendered = Object.freeze(
    authoredWaterSurfaceGroupsFor(world).map((points, index) =>
      buildWatercourseRibbon(points, index)
    ),
  );
  WATER_SURFACE_GROUP_CACHE.set(world, rendered);
  return rendered;
};

const authoredWaterSurfaceIndexAt = (world, point) =>
  authoredWaterSurfaceGroupsFor(world).findIndex((points) =>
    pointInCoursePolygon(points, point)
  );



export function pointInCourseTee(world, point, padding = 0) {
  finitePoint(point, "tee point");
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError("tee padding must be a non-negative finite number");
  }
  const radiusX = WEBGL_TEE_RADIUS_X_METERS + padding;
  const radiusZ = WEBGL_TEE_RADIUS_Z_METERS + padding;
  const dx = (point.x - world.tee.x) / radiusX;
  const dz = (point.z - world.tee.z) / radiusZ;
  return dx * dx + dz * dz <= 1;
}

const waterSurfaceIndexAt = (world, point) =>
  waterSurfaceGroupsFor(world).findIndex((points) =>
    pointInCoursePolygon(points, point)
  );

const surfaceMaterialAt = (world, point, waterSurfaceIndex) => {
  if (waterSurfaceIndex >= 0) return "water";
  if (world.bunkerPoints.some((points) =>
    pointInCoursePolygon(points, point)
  )) {
    return "bunker";
  }
  if (pointInCourseTee(world, point)) return "green";
  if (pointInCoursePolygon(world.greenPoints, point)) return "green";
  if (world.fairwayPoints.some((points) =>
    pointInCoursePolygon(points, point)
  )) {
    return "fairway";
  }
  return "rough";
};

export function courseSurfaceMaterialAt(world, point) {
  finitePoint(point, "course surface point");
  return surfaceMaterialAt(world, point, waterSurfaceIndexAt(world, point));
}

const polygonCross = (first, second, third) =>
  (second.x - first.x) * (third.z - first.z) -
  (second.z - first.z) * (third.x - first.x);

const polygonSignedArea = (points) => points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length];
  return area + point.x * next.z - next.x * point.z;
}, 0) / 2;

const pointOnCoursePolygonBoundary = (points, point) => points.some(
  (start, index) => {
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared <= 1e-12) {
      return Math.hypot(point.x - start.x, point.z - start.z) <= 2e-5;
    }
    const progress = clamp(
      ((point.x - start.x) * dx + (point.z - start.z) * dz) /
        lengthSquared,
      0,
      1,
    );
    return Math.hypot(
      point.x - (start.x + dx * progress),
      point.z - (start.z + dz * progress),
    ) <= 2e-5;
  },
);

export const pointInOrOnCoursePolygon = (points, point) =>
  pointInCoursePolygon(points, point) ||
  pointOnCoursePolygonBoundary(points, point);

const inwardCoursePolygonNormal = (start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-8) {
    throw new RangeError("water shoreline polygon has a degenerate edge");
  }
  return Object.freeze({ x: -dz / length, z: dx / length });
};

export function createWebglWaterShoreline(points, waterLevel) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new RangeError("water shoreline requires at least three points");
  }
  if (!Number.isFinite(waterLevel)) {
    throw new RangeError("water shoreline level must be finite");
  }
  const source = points.map((point) => {
    finitePoint(point, "water shoreline point");
    return Object.freeze({ x: point.x, z: point.z });
  });
  if (Math.abs(polygonSignedArea(source)) <= 1e-8) {
    throw new RangeError("water shoreline polygon must have positive area");
  }
  const outer = polygonSignedArea(source) > 0
    ? source
    : [...source].reverse();
  const inner = outer.map((point, index) => {
    const prior = outer[(index + outer.length - 1) % outer.length];
    const next = outer[(index + 1) % outer.length];
    const priorNormal = inwardCoursePolygonNormal(prior, point);
    const nextNormal = inwardCoursePolygonNormal(point, next);
    let directionX = priorNormal.x + nextNormal.x;
    let directionZ = priorNormal.z + nextNormal.z;
    const directionLength = Math.hypot(directionX, directionZ);
    if (directionLength <= 1e-8) {
      directionX = nextNormal.x;
      directionZ = nextNormal.z;
    } else {
      directionX /= directionLength;
      directionZ /= directionLength;
    }
    let distance = WEBGL_WATER_SHORELINE_WIDTH_METERS;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = Object.freeze({
        x: point.x + directionX * distance,
        z: point.z + directionZ * distance,
      });
      if (pointInCoursePolygon(outer, candidate)) return candidate;
      distance *= 0.5;
    }
    throw new RangeError("water shoreline cannot remain inside its polygon");
  });
  return Object.freeze({
    waterLevel,
    outer: Object.freeze(outer),
    inner: Object.freeze(inner),
  });
}

const coursePolygonEdgeParameters = (points, start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const parameters = [0, 1];
  for (let index = 0; index < points.length; index += 1) {
    const edgeStart = points[index];
    const edgeEnd = points[(index + 1) % points.length];
    const edgeDx = edgeEnd.x - edgeStart.x;
    const edgeDz = edgeEnd.z - edgeStart.z;
    const offsetX = edgeStart.x - start.x;
    const offsetZ = edgeStart.z - start.z;
    const denominator = dx * edgeDz - dz * edgeDx;
    if (Math.abs(denominator) > 1e-12) {
      const progress = (offsetX * edgeDz - offsetZ * edgeDx) / denominator;
      const edgeProgress = (offsetX * dz - offsetZ * dx) / denominator;
      if (
        progress >= -1e-9 &&
        progress <= 1 + 1e-9 &&
        edgeProgress >= -1e-9 &&
        edgeProgress <= 1 + 1e-9
      ) {
        parameters.push(clamp(progress, 0, 1));
      }
      continue;
    }
    if (
      lengthSquared > 1e-12 &&
      Math.abs(offsetX * dz - offsetZ * dx) <= 1e-9
    ) {
      parameters.push(clamp(
        (offsetX * dx + offsetZ * dz) / lengthSquared,
        0,
        1,
      ));
      parameters.push(clamp(
        ((edgeEnd.x - start.x) * dx + (edgeEnd.z - start.z) * dz) /
          lengthSquared,
        0,
        1,
      ));
    }
  }
  return parameters.sort((first, second) => first - second).filter(
    (parameter, index, sorted) =>
      index === 0 || parameter - sorted[index - 1] > 1e-9,
  );
};

const surfaceEdgeFitsPolygon = (points, start, end) => {
  const parameters = coursePolygonEdgeParameters(points, start, end);
  for (let index = 1; index < parameters.length; index += 1) {
    const progress = (parameters[index - 1] + parameters[index]) / 2;
    if (!pointInOrOnCoursePolygon(points, {
      x: start.x + (end.x - start.x) * progress,
      z: start.z + (end.z - start.z) * progress,
    })) {
      return false;
    }
  }
  return true;
};

const surfaceTriangleFitsPolygon = (points, first, second, third) => {
  const centroid = {
    x: (first.x + second.x + third.x) / 3,
    z: (first.z + second.z + third.z) / 3,
  };
  return pointInOrOnCoursePolygon(points, centroid) &&
    surfaceEdgeFitsPolygon(points, first, second) &&
    surfaceEdgeFitsPolygon(points, second, third) &&
    surfaceEdgeFitsPolygon(points, third, first);
};

const pointStrictlyInsideClockwiseTriangle = (point, first, second, third) =>
  polygonCross(first, second, point) < -1e-9 &&
  polygonCross(second, third, point) < -1e-9 &&
  polygonCross(third, first, point) < -1e-9;

const pointInsideClockwiseEdge = (point, start, end) =>
  polygonCross(start, end, point) <= 1e-9;

const lineIntersection = (start, end, clipStart, clipEnd) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const clipDx = clipEnd.x - clipStart.x;
  const clipDz = clipEnd.z - clipStart.z;
  const denominator = dx * clipDz - dz * clipDx;
  if (Math.abs(denominator) <= 1e-12) return end;
  const offsetX = clipStart.x - start.x;
  const offsetZ = clipStart.z - start.z;
  const progress = clamp(
    (offsetX * clipDz - offsetZ * clipDx) / denominator,
    0,
    1,
  );
  return Object.freeze({
    x: start.x + dx * progress,
    z: start.z + dz * progress,
  });
};

const deduplicatePolygon = (points) => {
  const unique = [];
  for (const point of points) {
    const prior = unique.at(-1);
    if (!prior || Math.hypot(point.x - prior.x, point.z - prior.z) > 1e-7) {
      unique.push(point);
    }
  }
  if (
    unique.length > 1 &&
    Math.hypot(
      unique[0].x - unique.at(-1).x,
      unique[0].z - unique.at(-1).z,
    ) <= 1e-7
  ) {
    unique.pop();
  }
  return unique;
};

const intersectClockwiseTriangles = (subject, clipTriangle) => {
  let output = [...subject];
  for (let edge = 0; edge < 3 && output.length >= 3; edge += 1) {
    const clipStart = clipTriangle[edge];
    const clipEnd = clipTriangle[(edge + 1) % 3];
    const input = output;
    output = [];
    let prior = input.at(-1);
    let priorInside = pointInsideClockwiseEdge(
      prior,
      clipStart,
      clipEnd,
    );
    for (const point of input) {
      const inside = pointInsideClockwiseEdge(point, clipStart, clipEnd);
      if (inside !== priorInside) {
        output.push(lineIntersection(prior, point, clipStart, clipEnd));
      }
      if (inside) output.push(point);
      prior = point;
      priorInside = inside;
    }
    output = deduplicatePolygon(output);
  }
  return Math.abs(polygonSignedArea(output)) > 1e-8 ? output : [];
};

export function triangulateCourseSurface(points) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new TypeError("course surface requires at least three points");
  }
  points.forEach((point, index) => finitePoint(point, `surface point ${index}`));
  const vertices = points.map((point, sourceIndex) => ({ point, sourceIndex }));
  let simplified = true;
  while (simplified && vertices.length > 3) {
    simplified = false;
    for (let index = 0; index < vertices.length; index += 1) {
      const prior = vertices[(index - 1 + vertices.length) % vertices.length];
      const current = vertices[index];
      const next = vertices[(index + 1) % vertices.length];
      const firstX = current.point.x - prior.point.x;
      const firstZ = current.point.z - prior.point.z;
      const secondX = current.point.x - next.point.x;
      const secondZ = current.point.z - next.point.z;
      if (
        Math.abs(polygonCross(prior.point, current.point, next.point)) <=
          1e-9 &&
        firstX * secondX + firstZ * secondZ <= 1e-9
      ) {
        vertices.splice(index, 1);
        simplified = true;
        break;
      }
    }
  }
  const simplifiedPoints = vertices.map(({ point }) => point);
  const remaining = vertices.map((_, index) => index);
  if (polygonSignedArea(simplifiedPoints) > 0) remaining.reverse();
  const triangles = [];
  while (remaining.length > 3) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const prior = remaining[(index - 1 + remaining.length) % remaining.length];
      const current = remaining[index];
      const next = remaining[(index + 1) % remaining.length];
      if (polygonCross(
        simplifiedPoints[prior],
        simplifiedPoints[current],
        simplifiedPoints[next],
      ) >= -1e-9) {
        continue;
      }
      if (remaining.some((candidate) =>
        candidate !== prior &&
        candidate !== current &&
          candidate !== next &&
          pointStrictlyInsideClockwiseTriangle(
          simplifiedPoints[candidate],
          simplifiedPoints[prior],
          simplifiedPoints[current],
          simplifiedPoints[next],
        )
      )) {
        continue;
      }
      triangles.push(
        vertices[prior].sourceIndex,
        vertices[current].sourceIndex,
        vertices[next].sourceIndex,
      );
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      throw new RangeError("course surface polygon cannot be triangulated");
    }
  }
  if (polygonCross(
    simplifiedPoints[remaining[0]],
    simplifiedPoints[remaining[1]],
    simplifiedPoints[remaining[2]],
  ) >= -1e-9) {
    throw new RangeError("course surface polygon has a degenerate triangle");
  }
  triangles.push(...remaining.map((index) => vertices[index].sourceIndex));
  return Object.freeze(triangles);
}

const teeSurfacePoints = (world) => Object.freeze(Array.from(
  { length: WEBGL_TEE_SEGMENTS },
  (_, index) => {
    const angle = (index / WEBGL_TEE_SEGMENTS) * Math.PI * 2;
    return Object.freeze({
      x: world.tee.x + Math.cos(angle) * WEBGL_TEE_RADIUS_X_METERS,
      z: world.tee.z + Math.sin(angle) * WEBGL_TEE_RADIUS_Z_METERS,
    });
  },
));

export function courseSurfaceNormalAt(world, point, sampleStep = 0.4) {
  finitePoint(point, "course normal point");
  if (!Number.isFinite(sampleStep) || sampleStep <= 0) {
    throw new RangeError("sampleStep must be a positive finite number");
  }
  if (courseSurfaceMaterialAt(world, point) === "water") {
    return Object.freeze({ x: 0, y: 1, z: 0 });
  }
  const dx = (
    world.surfaceElevationAt(point.x + sampleStep, point.z) -
    world.surfaceElevationAt(point.x - sampleStep, point.z)
  ) / (sampleStep * 2);
  const dz = (
    world.surfaceElevationAt(point.x, point.z + sampleStep) -
    world.surfaceElevationAt(point.x, point.z - sampleStep)
  ) / (sampleStep * 2);
  return normalize(-dx, 1, -dz);
}

export function createWebglTerrainGeometry(world, {
  columns = WEBGL_TERRAIN_COLUMNS,
  rows = WEBGL_TERRAIN_ROWS,
} = {}) {
  finitePositiveInteger(columns, "columns");
  finitePositiveInteger(rows, "rows");
  if (
    !world?.bounds ||
    typeof world.surfaceElevationAt !== "function" ||
    !Object.values(world.bounds).every(Number.isFinite)
  ) {
    throw new TypeError("world must provide finite bounds and surface elevation");
  }
  const positions = [];
  const normals = [];
  const materials = [];
  const waterSamples = [];
  const indices = [];
  const materialCounts = Object.fromEntries(
    Object.keys(WEBGL_SURFACE_MATERIAL_IDS).map((material) => [material, 0]),
  );
  const spanX = world.bounds.maximumX - world.bounds.minimumX;
  const spanZ = world.bounds.maximumZ - world.bounds.minimumZ;
  if (!(spanX > 0) || !(spanZ > 0)) {
    throw new RangeError("world bounds must have a positive span");
  }
  const stepX = spanX / columns;
  const stepZ = spanZ / rows;
  const renderedSurfaceHeightAt = (x, z) => {
    const waterSurfaceIndex = authoredWaterSurfaceIndexAt(world, { x, z });
    return waterSurfaceIndex >= 0
      ? (world.waterLevels?.[waterSurfaceIndex] ?? world.waterLevel) + 0.012
      : world.surfaceElevationAt(x, z);
  };
  for (let row = 0; row <= rows; row += 1) {
    const z = world.bounds.minimumZ + (row / rows) * spanZ;
    for (let column = 0; column <= columns; column += 1) {
      const x = world.bounds.minimumX + (column / columns) * spanX;
      const waterSurfaceIndex = waterSurfaceIndexAt(world, { x, z });
      const material = "rough";
      const y = renderedSurfaceHeightAt(x, z);
      if (![x, y, z].every(Number.isFinite)) {
        throw new RangeError("terrain geometry contains a non-finite sample");
      }
      positions.push(x, y, z);
      materials.push(WEBGL_SURFACE_MATERIAL_IDS[material]);
      waterSamples.push(waterSurfaceIndex >= 0);
      materialCounts[material] += 1;
    }
  }
  const rowWidth = columns + 1;
  const coarseHeightAt = (x, z) => {
    const xGrid = clamp(
      ((x - world.bounds.minimumX) / spanX) * columns,
      0,
      columns,
    );
    const zGrid = clamp(
      ((z - world.bounds.minimumZ) / spanZ) * rows,
      0,
      rows,
    );
    const column = Math.min(columns - 1, Math.floor(xGrid));
    const row = Math.min(rows - 1, Math.floor(zGrid));
    const localX = xGrid - column;
    const localZ = zGrid - row;
    const topLeft = row * rowWidth + column;
    const bottomLeft = (row + 1) * rowWidth + column;
    const topRight = topLeft + 1;
    const bottomRight = bottomLeft + 1;
    const height = (vertex) => positions[vertex * 3 + 1];
    return localX + localZ <= 1
      ? height(topLeft) * (1 - localX - localZ) +
          height(bottomLeft) * localZ + height(topRight) * localX
      : height(topRight) * (1 - localZ) +
          height(bottomLeft) * (1 - localX) +
          height(bottomRight) * (localX + localZ - 1);
  };
  const heightAt = (row, column, centerHeight) => {
    const index = row * rowWidth + column;
    return waterSamples[index] ? centerHeight : positions[index * 3 + 1];
  };
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const index = row * rowWidth + column;
      if (waterSamples[index]) {
        normals.push(0, 1, 0);
        continue;
      }
      const left = Math.max(0, column - 1);
      const right = Math.min(columns, column + 1);
      const prior = Math.max(0, row - 1);
      const next = Math.min(rows, row + 1);
      const centerHeight = positions[index * 3 + 1];
      const dx = (
        heightAt(row, right, centerHeight) -
        heightAt(row, left, centerHeight)
      ) / ((right - left) * stepX);
      const dz = (
        heightAt(next, column, centerHeight) -
        heightAt(prior, column, centerHeight)
      ) / ((next - prior) * stepZ);
      const normal = normalize(-dx, 1, -dz);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  const coarseNormalAt = (point) => {
    const xGrid = clamp(
      ((point.x - world.bounds.minimumX) / spanX) * columns,
      0,
      columns,
    );
    const zGrid = clamp(
      ((point.z - world.bounds.minimumZ) / spanZ) * rows,
      0,
      rows,
    );
    const column = Math.min(columns - 1, Math.floor(xGrid));
    const row = Math.min(rows - 1, Math.floor(zGrid));
    const localX = xGrid - column;
    const localZ = zGrid - row;
    const topLeft = row * rowWidth + column;
    const bottomLeft = (row + 1) * rowWidth + column;
    const topRight = topLeft + 1;
    const bottomRight = bottomLeft + 1;
    const weightedNormal = (samples) => normalize(
      samples.reduce((sum, [vertex, weight]) =>
        sum + normals[vertex * 3] * weight, 0),
      samples.reduce((sum, [vertex, weight]) =>
        sum + normals[vertex * 3 + 1] * weight, 0),
      samples.reduce((sum, [vertex, weight]) =>
        sum + normals[vertex * 3 + 2] * weight, 0),
    );
    return localX + localZ <= 1
      ? weightedNormal([
        [topLeft, 1 - localX - localZ],
        [bottomLeft, localZ],
        [topRight, localX],
      ])
      : weightedNormal([
        [topRight, 1 - localZ],
        [bottomLeft, 1 - localX],
        [bottomRight, localX + localZ - 1],
      ]);
  };
  const baseGeometry = { columns, rows, positions };
  const bunkerArt = createWebglBunkerPatches(world, {
    columns,
    rows,
    coarseHeightAt: (x, z) =>
      webglTerrainHeightAt(world, { x, z }, baseGeometry),
    coarseNormalAt,
    excludedSurfaceGroups: authoredWaterSurfaceGroupsFor(world),
    normalAt: (point) => courseSurfaceNormalAt(world, point),
    surfaceHeightAt: renderedSurfaceHeightAt,
  });
  const occupiedBunkerCells = new Set(bunkerArt.occupiedCells);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (occupiedBunkerCells.has(`${row}:${column}`)) continue;
      const topLeft = row * rowWidth + column;
      const bottomLeft = (row + 1) * rowWidth + column;
      indices.push(
        topLeft,
        bottomLeft,
        topLeft + 1,
        topLeft + 1,
        bottomLeft,
        bottomLeft + 1,
      );
    }
  }
  const patchRuntime = bunkerArt.patches.map((patch) => {
    const firstGridVertex = positions.length / 3;
    for (const vertex of patch.collarVertices) {
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z);
      materials.push(WEBGL_SURFACE_MATERIAL_IDS.rough);
      materialCounts.rough += 1;
    }
    const firstGridIndex = indices.length;
    for (const index of patch.collarIndices) {
      indices.push(firstGridVertex + index);
    }
    const collarTriangles = [];
    for (let index = 0; index < patch.collarIndices.length; index += 3) {
      collarTriangles.push([0, 1, 2].map((offset) => {
        const vertex = firstGridVertex + patch.collarIndices[index + offset];
        return Object.freeze({
          x: positions[vertex * 3],
          y: positions[vertex * 3 + 1],
          z: positions[vertex * 3 + 2],
        });
      }));
    }
    return {
      patch,
      collarTriangles: Object.freeze(collarTriangles),
      metadata: {
        bunkerIndex: patch.bunkerIndex,
        style: patch.style,
        angleCount: patch.angleCount,
        cellBounds: patch.cellBounds,
        rectangle: patch.rectangle,
        firstGridVertex,
        gridVertexCount: patch.collarVertices.length,
        firstGridIndex,
        gridIndexCount: patch.collarIndices.length,
        firstBunkerVertex: null,
        bunkerVertexCount: null,
        firstBunkerIndex: null,
        bunkerIndexCount: null,
      },
    };
  });
  const coarseGridTriangleCount = columns * rows * 2;
  const gridVertexCount = positions.length / 3;
  const gridTriangleCount = indices.length / 3;
  const bunkerCollarTriangleCount = patchRuntime.reduce(
    (total, { patch }) => total + patch.collarIndices.length / 3,
    0,
  );
  let surfaceTriangleCount = 0;
  let waterShorelineVertexCount = 0;
  let waterShorelineTriangleCount = 0;
  const surfaceBatches = [];
  const gridPoint = (row, column) => {
    const vertex = row * rowWidth + column;
    return Object.freeze({
      x: positions[vertex * 3],
      y: positions[vertex * 3 + 1],
      z: positions[vertex * 3 + 2],
    });
  };
  const triangleHeightAt = (triangle, point) => {
    const [first, second, third] = triangle;
    const denominator = polygonCross(first, second, third);
    if (Math.abs(denominator) <= 1e-12) {
      throw new RangeError("WebGL terrain triangle must have positive area");
    }
    const secondWeight = polygonCross(first, point, third) / denominator;
    const thirdWeight = polygonCross(first, second, point) / denominator;
    const firstWeight = 1 - secondWeight - thirdWeight;
    return first.y * firstWeight + second.y * secondWeight +
      third.y * thirdWeight;
  };
  const appendSurface = ({
    points,
    material,
    materialId = WEBGL_SURFACE_MATERIAL_IDS[material],
    materialCountName = material,
    includeBunkerTriangles = false,
    surfaceIndex = null,
  }) => {
    const clockwisePoints = polygonSignedArea(points) > 0
      ? [...points].reverse()
      : points;
    const authoredIndices = triangulateCourseSurface(clockwisePoints);
    const authoredTriangles = [];
    for (let index = 0; index < authoredIndices.length; index += 3) {
      authoredTriangles.push([
        clockwisePoints[authoredIndices[index]],
        clockwisePoints[authoredIndices[index + 1]],
        clockwisePoints[authoredIndices[index + 2]],
      ]);
    }
    const appendClippedSurface = (surfacePoints, baseTriangle) => {
      const surfaceIndices = [];
      for (let index = 1; index < surfacePoints.length - 1; index += 1) {
        if (polygonCross(
          surfacePoints[0],
          surfacePoints[index],
          surfacePoints[index + 1],
        ) < -1e-7) {
          surfaceIndices.push(0, index, index + 1);
        }
      }
      if (surfaceIndices.length === 0) return;
      const firstVertex = positions.length / 3;
      for (const point of surfacePoints) {
        const y = material === "water"
          ? (world.waterLevels?.[surfaceIndex] ?? world.waterLevel) +
            WEBGL_WATER_SURFACE_RENDER_LIFT_METERS
          : triangleHeightAt(baseTriangle, point);
        const normal = material === "water"
          ? { x: 0, y: 1, z: 0 }
          : courseSurfaceNormalAt(world, point);
        positions.push(point.x, y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        materials.push(materialId);
        materialCounts[materialCountName] += 1;
      }
      for (const index of surfaceIndices) {
        indices.push(firstVertex + index);
      }
      surfaceTriangleCount += surfaceIndices.length / 3;
    };
    const minimumX = Math.min(...points.map(({ x }) => x));
    const maximumX = Math.max(...points.map(({ x }) => x));
    const minimumZ = Math.min(...points.map(({ z }) => z));
    const maximumZ = Math.max(...points.map(({ z }) => z));
    const firstColumn = clamp(
      Math.floor((minimumX - world.bounds.minimumX) / stepX),
      0,
      columns - 1,
    );
    const lastColumn = clamp(
      Math.floor((maximumX - world.bounds.minimumX) / stepX),
      0,
      columns - 1,
    );
    const firstRow = clamp(
      Math.floor((minimumZ - world.bounds.minimumZ) / stepZ),
      0,
      rows - 1,
    );
    const lastRow = clamp(
      Math.floor((maximumZ - world.bounds.minimumZ) / stepZ),
      0,
      rows - 1,
    );
    const processBaseTriangle = (baseTriangle) => {
      const clipped = intersectClockwiseTriangles(
        clockwisePoints,
        baseTriangle,
      );
      if (clipped.length < 3) return;
      let validWholeIntersection = true;
      for (let index = 1; index < clipped.length - 1; index += 1) {
        const first = clipped[0];
        const second = clipped[index];
        const third = clipped[index + 1];
        if (
          polygonCross(first, second, third) < -1e-7 &&
          !surfaceTriangleFitsPolygon(points, first, second, third)
        ) {
          validWholeIntersection = false;
          break;
        }
      }
      if (validWholeIntersection) {
        appendClippedSurface(clipped, baseTriangle);
        return;
      }
      for (const authoredTriangle of authoredTriangles) {
        const exactClipped = intersectClockwiseTriangles(
          authoredTriangle,
          baseTriangle,
        );
        if (exactClipped.length >= 3) {
          appendClippedSurface(exactClipped, baseTriangle);
        }
      }
    };
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (occupiedBunkerCells.has(`${row}:${column}`)) continue;
        const topLeft = gridPoint(row, column);
        const bottomLeft = gridPoint(row + 1, column);
        const topRight = gridPoint(row, column + 1);
        const bottomRight = gridPoint(row + 1, column + 1);
        for (const baseTriangle of [
          [topLeft, bottomLeft, topRight],
          [topRight, bottomLeft, bottomRight],
        ]) {
          processBaseTriangle(baseTriangle);
        }
      }
    }
    for (const runtime of patchRuntime) {
      const rectangle = runtime.patch.rectangle;
      if (
        rectangle.maximumX < minimumX ||
        rectangle.minimumX > maximumX ||
        rectangle.maximumZ < minimumZ ||
        rectangle.minimumZ > maximumZ
      ) {
        continue;
      }
      runtime.collarTriangles.forEach(processBaseTriangle);
      if (includeBunkerTriangles && runtime.sandTriangles) {
        runtime.sandTriangles.forEach(processBaseTriangle);
      }
    }
  };
  const appendWaterShoreline = (points, waterSurfaceIndex) => {
    const waterLevel =
      world.waterLevels?.[waterSurfaceIndex] ?? world.waterLevel;
    const shoreline = createWebglWaterShoreline(points, waterLevel);
    const firstVertex = positions.length / 3;
    for (const point of shoreline.outer) {
      positions.push(
        point.x,
        waterLevel + WEBGL_WATER_SHORELINE_OUTER_LIFT_METERS,
        point.z,
      );
      normals.push(0, 1, 0);
      materials.push(WEBGL_SURFACE_MATERIAL_IDS.waterShoreline);
      materialCounts.waterShoreline += 1;
    }
    for (const point of shoreline.inner) {
      positions.push(
        point.x,
        waterLevel + WEBGL_WATER_SHORELINE_INNER_LIFT_METERS,
        point.z,
      );
      normals.push(0, 1, 0);
      materials.push(WEBGL_SURFACE_MATERIAL_IDS.waterShoreline);
      materialCounts.waterShoreline += 1;
    }
    const innerOffset = shoreline.outer.length;
    const appendClockwiseShorelineTriangle = (
      firstIndex,
      secondIndex,
      thirdIndex,
      firstPoint,
      secondPoint,
      thirdPoint,
    ) => {
      const winding = polygonCross(firstPoint, secondPoint, thirdPoint);
      if (Math.abs(winding) <= 1e-7) {
        throw new RangeError("water shoreline triangle is degenerate");
      }
      if (winding < 0) {
        indices.push(firstIndex, secondIndex, thirdIndex);
      } else {
        indices.push(firstIndex, thirdIndex, secondIndex);
      }
    };
    for (let index = 0; index < shoreline.outer.length; index += 1) {
      const next = (index + 1) % shoreline.outer.length;
      appendClockwiseShorelineTriangle(
        firstVertex + index,
        firstVertex + innerOffset + index,
        firstVertex + innerOffset + next,
        shoreline.outer[index],
        shoreline.inner[index],
        shoreline.inner[next],
      );
      appendClockwiseShorelineTriangle(
        firstVertex + index,
        firstVertex + innerOffset + next,
        firstVertex + next,
        shoreline.outer[index],
        shoreline.inner[next],
        shoreline.outer[next],
      );
    }
    const addedVertices = shoreline.outer.length + shoreline.inner.length;
    const addedTriangles = shoreline.outer.length * 2;
    waterShorelineVertexCount += addedVertices;
    waterShorelineTriangleCount += addedTriangles;
    surfaceTriangleCount += addedTriangles;
  };
  const appendWaterRibbonSurface = (points, surfaceIndex) => {
    if (points.length % 2 !== 0 || points.length < 8) {
      throw new RangeError("watercourse ribbon requires paired banks");
    }
    const stationCount = points.length / 2;
    const left = points.slice(0, stationCount);
    const right = [...points.slice(stationCount)].reverse();
    const waterLevel =
      world.waterLevels?.[surfaceIndex] ?? world.waterLevel;
    const firstVertex = positions.length / 3;
    for (let index = 0; index < stationCount; index += 1) {
      for (const point of [left[index], right[index]]) {
        positions.push(
          point.x,
          waterLevel + WEBGL_WATER_SURFACE_RENDER_LIFT_METERS,
          point.z,
        );
        normals.push(0, 1, 0);
        materials.push(WEBGL_SURFACE_MATERIAL_IDS.water);
        materialCounts.water += 1;
      }
    }
    const appendClockwiseWaterTriangle = (
      firstIndex,
      secondIndex,
      thirdIndex,
      firstPoint,
      secondPoint,
      thirdPoint,
    ) => {
      const winding = polygonCross(firstPoint, secondPoint, thirdPoint);
      if (Math.abs(winding) <= 1e-7) {
        throw new RangeError("watercourse ribbon triangle is degenerate");
      }
      if (winding < 0) {
        indices.push(firstIndex, secondIndex, thirdIndex);
      } else {
        indices.push(firstIndex, thirdIndex, secondIndex);
      }
    };
    for (let index = 0; index < stationCount - 1; index += 1) {
      const leftCurrent = left[index];
      const rightCurrent = right[index];
      const leftNext = left[index + 1];
      const rightNext = right[index + 1];
      const currentLeftIndex = firstVertex + index * 2;
      const currentRightIndex = currentLeftIndex + 1;
      const nextLeftIndex = currentLeftIndex + 2;
      const nextRightIndex = currentLeftIndex + 3;
      appendClockwiseWaterTriangle(
        currentLeftIndex,
        nextLeftIndex,
        currentRightIndex,
        leftCurrent,
        leftNext,
        rightCurrent,
      );
      appendClockwiseWaterTriangle(
        currentRightIndex,
        nextLeftIndex,
        nextRightIndex,
        rightCurrent,
        leftNext,
        rightNext,
      );
    }
    const addedTriangles = (stationCount - 1) * 2;
    surfaceTriangleCount += addedTriangles;
  };

  const appendSurfaceBatch = (material, surfaceGroups, options = {}) => {
    const { afterSurface, ...surfaceOptions } = options;
    const firstIndex = indices.length;
    for (let index = 0; index < surfaceGroups.length; index += 1) {
      const points = surfaceGroups[index];
      appendSurface({
        points,
        material,
        surfaceIndex: index,
        ...surfaceOptions,
      });
      afterSurface?.(points, index);
    }
    const indexCount = indices.length - firstIndex;
    if (indexCount > 0) {
      surfaceBatches.push(Object.freeze({
        material,
        firstIndex,
        indexCount,
        triangleCount: indexCount / 3,
      }));
    }
  };
  appendSurfaceBatch("fairway", world.fairwayPoints);
  appendSurfaceBatch("green", [
    teeSurfacePoints(world),
    ...(world.greenPoints.length >= 3 ? [world.greenPoints] : []),
  ]);
  const firstBunkerBatchIndex = indices.length;
  for (const runtime of patchRuntime) {
    const materialCountName = runtime.patch.style === "revetted-pot"
      ? "bunkerRevetted"
      : "bunker";
    const materialId = WEBGL_SURFACE_MATERIAL_IDS[materialCountName];
    const firstVertex = positions.length / 3;
    for (const vertex of runtime.patch.sandVertices) {
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z);
      materials.push(materialId);
      materialCounts[materialCountName] += 1;
    }
    runtime.metadata.firstBunkerIndex = indices.length;
    runtime.metadata.firstBunkerVertex = firstVertex;
    runtime.metadata.bunkerVertexCount = runtime.patch.sandVertices.length;
    for (const index of runtime.patch.sandIndices) {
      indices.push(firstVertex + index);
    }
    runtime.metadata.bunkerIndexCount = runtime.patch.sandIndices.length;
    const sandTriangles = [];
    for (let index = 0; index < runtime.patch.sandIndices.length; index += 3) {
      sandTriangles.push([0, 1, 2].map((offset) => {
        const vertex = firstVertex + runtime.patch.sandIndices[index + offset];
        return Object.freeze({
          x: positions[vertex * 3],
          y: positions[vertex * 3 + 1],
          z: positions[vertex * 3 + 2],
        });
      }));
    }
    runtime.sandTriangles = Object.freeze(sandTriangles);
    surfaceTriangleCount += runtime.patch.sandIndices.length / 3;
  }
  const bunkerBatchIndexCount = indices.length - firstBunkerBatchIndex;
  if (bunkerBatchIndexCount > 0) {
    surfaceBatches.push(Object.freeze({
      material: "bunker",
      firstIndex: firstBunkerBatchIndex,
      indexCount: bunkerBatchIndexCount,
      triangleCount: bunkerBatchIndexCount / 3,
    }));
  }
  const firstWaterBatchIndex = indices.length;
  for (let index = 0; index < waterSurfaceGroupsFor(world).length; index += 1) {
    const points = waterSurfaceGroupsFor(world)[index];
    appendWaterRibbonSurface(points, index);
    appendWaterShoreline(points, index);
  }
  const waterBatchIndexCount = indices.length - firstWaterBatchIndex;
  if (waterBatchIndexCount > 0) {
    surfaceBatches.push(Object.freeze({
      material: "water",
      firstIndex: firstWaterBatchIndex,
      indexCount: waterBatchIndexCount,
      triangleCount: waterBatchIndexCount / 3,
    }));
  }
  const bunkerPatches = Object.freeze(patchRuntime.map(({ metadata }) =>
    Object.freeze({
      ...metadata,
      cellBounds: Object.freeze({ ...metadata.cellBounds }),
      rectangle: Object.freeze({ ...metadata.rectangle }),
    })
  ));
  for (let vertex = 0; vertex < materials.length; vertex += 1) {
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    let weightedSlope = 0;
    let horizonSlope = Number.NEGATIVE_INFINITY;
    for (let sample = 0;
      sample < RELIEF_SAMPLE_DISTANCES_METERS.length;
      sample += 1) {
      const distance = RELIEF_SAMPLE_DISTANCES_METERS[sample];
      const sampleHeight = coarseHeightAt(
        x + WEBGL_TERRAIN_RELIEF_SUN_DIRECTION.x * distance,
        z + WEBGL_TERRAIN_RELIEF_SUN_DIRECTION.z * distance,
      );
      const slope = (sampleHeight - y) / distance;
      weightedSlope += slope * RELIEF_SAMPLE_WEIGHTS[sample];
      horizonSlope = Math.max(horizonSlope, slope);
    }
    const visibility = clamp(
      0.58 - weightedSlope * 5.2 - Math.max(0, horizonSlope) * 1.8,
      0,
      1,
    );
    const reliefLevel = Math.round(
      visibility * WEBGL_TERRAIN_RELIEF_LEVELS,
    );
    materials[vertex] =
      (reliefLevel << WEBGL_TERRAIN_RELIEF_SHIFT) |
      webglTerrainMaterialId(materials[vertex]);
  }
  const geometry = Object.freeze({
    columns,
    rows,
    coarseGridTriangleCount,
    gridVertexCount,
    gridTriangleCount,
    bunkerArtVersion: WEBGL_BUNKER_ART_VERSION,
    bunkerPatchCount: bunkerPatches.length,
    bunkerCollarTriangleCount,
    bunkerReliefTriangleCount: bunkerBatchIndexCount / 3,
    bunkerPatches,
    watercourseArtVersion: WEBGL_WATERCOURSE_ART_VERSION,
    waterShorelineVertexCount,
    waterShorelineTriangleCount,
    waterShorelineByteLength:
      waterShorelineVertexCount * (
        Float32Array.BYTES_PER_ELEMENT * 6 + Uint8Array.BYTES_PER_ELEMENT
      ) +
      waterShorelineTriangleCount * 3 * Uint32Array.BYTES_PER_ELEMENT,
    surfaceTriangleCount,
    surfaceBatches: Object.freeze(surfaceBatches),
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    materials: new Uint8Array(materials),
    indices: new Uint32Array(indices),
    materialCounts: Object.freeze(materialCounts),
  });
  return geometry;
}

const webglTerrainCellAt = (world, point, geometry) => {
  finitePoint(point, "WebGL terrain material point");
  if (!geometry || geometry.columns <= 0 || geometry.rows <= 0) {
    throw new TypeError("WebGL terrain lookup requires geometry");
  }
  const xRatio = clamp(
    (point.x - world.bounds.minimumX) /
      (world.bounds.maximumX - world.bounds.minimumX),
    0,
    1,
  );
  const zRatio = clamp(
    (point.z - world.bounds.minimumZ) /
      (world.bounds.maximumZ - world.bounds.minimumZ),
    0,
    1,
  );
  const xGrid = xRatio * geometry.columns;
  const zGrid = zRatio * geometry.rows;
  const column = Math.min(geometry.columns - 1, Math.floor(xGrid));
  const row = Math.min(geometry.rows - 1, Math.floor(zGrid));
  const localX = xGrid - column;
  const localZ = zGrid - row;
  const rowWidth = geometry.columns + 1;
  return Object.freeze({ column, row, localX, localZ, rowWidth });
};

export function webglTerrainMaterialAt(world, point, geometry) {
  webglTerrainCellAt(world, point, geometry);
  return courseSurfaceMaterialAt(world, point);
}

const geometryTriangleHeightAt = (geometry, firstIndex, point) => {
  const vertices = [0, 1, 2].map((offset) => {
    const vertex = geometry.indices[firstIndex + offset];
    return {
      x: geometry.positions[vertex * 3],
      y: geometry.positions[vertex * 3 + 1],
      z: geometry.positions[vertex * 3 + 2],
    };
  });
  const denominator = polygonCross(vertices[0], vertices[1], vertices[2]);
  if (Math.abs(denominator) <= 1e-12) return null;
  const secondWeight = polygonCross(vertices[0], point, vertices[2]) /
    denominator;
  const thirdWeight = polygonCross(vertices[0], vertices[1], point) /
    denominator;
  const firstWeight = 1 - secondWeight - thirdWeight;
  if (
    firstWeight < -1e-5 ||
    secondWeight < -1e-5 ||
    thirdWeight < -1e-5 ||
    firstWeight > 1 + 1e-5 ||
    secondWeight > 1 + 1e-5 ||
    thirdWeight > 1 + 1e-5
  ) {
    return null;
  }
  return vertices[0].y * firstWeight + vertices[1].y * secondWeight +
    vertices[2].y * thirdWeight;
};

const bunkerPatchHeightAt = (geometry, point) => {
  if (!Array.isArray(geometry.bunkerPatches)) return null;
  for (const patch of geometry.bunkerPatches) {
    const rectangle = patch.rectangle;
    if (
      point.x < rectangle.minimumX - 1e-5 ||
      point.x > rectangle.maximumX + 1e-5 ||
      point.z < rectangle.minimumZ - 1e-5 ||
      point.z > rectangle.maximumZ + 1e-5
    ) {
      continue;
    }
    for (const [firstIndex, indexCount] of [
      [patch.firstGridIndex, patch.gridIndexCount],
      [patch.firstBunkerIndex, patch.bunkerIndexCount],
    ]) {
      for (let index = firstIndex;
        index < firstIndex + indexCount;
        index += 3) {
        const height = geometryTriangleHeightAt(geometry, index, point);
        if (height !== null) return height;
      }
    }
    throw new RangeError("WebGL bunker patch does not cover its guard rectangle");
  }
  return null;
};

export function webglTerrainHeightAt(world, point, geometry) {
  const bunkerHeight = bunkerPatchHeightAt(geometry, point);
  if (bunkerHeight !== null) return bunkerHeight;
  const { column, row, localX, localZ, rowWidth } = webglTerrainCellAt(
    world,
    point,
    geometry,
  );
  const topLeft = row * rowWidth + column;
  const bottomLeft = (row + 1) * rowWidth + column;
  const topRight = topLeft + 1;
  const bottomRight = bottomLeft + 1;
  const heightAt = (index) => geometry.positions[index * 3 + 1];
  if (localX + localZ <= 1) {
    return heightAt(topLeft) * (1 - localX - localZ) +
      heightAt(bottomLeft) * localZ +
      heightAt(topRight) * localX;
  }
  return heightAt(topRight) * (1 - localZ) +
    heightAt(bottomLeft) * (1 - localX) +
    heightAt(bottomRight) * (localX + localZ - 1);
}
