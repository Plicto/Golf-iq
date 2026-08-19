import {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  createVisualWaterTerrainWorld,
  createVisualWatercourseWorld,
  replaceVisualWatercourseGeometry as replaceV17WatercourseGeometry,
} from "./webgl-watercourse-visual-v17.js";

export const WEBGL_VISUAL_WATERCOURSE_VERSION = "terrain-shaded-stream-v18";
export {
  WEBGL_VISUAL_WATER_SURFACE_LIFT_METERS,
  createVisualWaterTerrainWorld,
  createVisualWatercourseWorld,
};

const pairedStations = (points) => {
  if (!Array.isArray(points) || points.length < 8 || points.length % 2 !== 0) {
    throw new RangeError("visual stream requires paired banks");
  }
  const stationCount = points.length / 2;
  return Object.freeze({
    left: points.slice(0, stationCount),
    right: [...points.slice(stationCount)].reverse(),
  });
};

const normalizedWaterNormal = (prior, next, left, right) => {
  const tangentX = next.x - prior.x;
  const tangentY = next.y - prior.y;
  const tangentZ = next.z - prior.z;
  const lateralX = right.x - left.x;
  const lateralZ = right.z - left.z;
  let normalX = tangentY * lateralZ;
  let normalY = tangentZ * lateralX - tangentX * lateralZ;
  let normalZ = -tangentY * lateralX;
  if (normalY < 0) {
    normalX = -normalX;
    normalY = -normalY;
    normalZ = -normalZ;
  }
  const length = Math.hypot(normalX, normalY, normalZ);
  if (length <= 1e-8) {
    return Object.freeze({ x: 0, y: 1, z: 0 });
  }
  return Object.freeze({
    x: normalX / length,
    y: normalY / length,
    z: normalZ / length,
  });
};

export function replaceVisualWatercourseGeometry(geometry, world) {
  const replaced = replaceV17WatercourseGeometry(geometry, world);
  const waterBatch = replaced.surfaceBatches.find(
    ({ material }) => material === "water",
  );
  if (!waterBatch) return replaced;

  let firstWaterVertex = Number.POSITIVE_INFINITY;
  for (
    let index = waterBatch.firstIndex;
    index < waterBatch.firstIndex + waterBatch.indexCount;
    index += 1
  ) {
    firstWaterVertex = Math.min(firstWaterVertex, replaced.indices[index]);
  }
  if (!Number.isInteger(firstWaterVertex)) {
    throw new RangeError("terrain-shaded stream batch has no vertices");
  }

  const normals = new Float32Array(replaced.normals);
  let vertex = firstWaterVertex;
  for (const points of world.waterSurfaceGroups ?? []) {
    const { left, right } = pairedStations(points);
    const centers = left.map((leftPoint, index) => Object.freeze({
      x: (leftPoint.x + right[index].x) * 0.5,
      y: (leftPoint.y + right[index].y) * 0.5,
      z: (leftPoint.z + right[index].z) * 0.5,
    }));
    for (let index = 0; index < left.length; index += 1) {
      const prior = centers[Math.max(0, index - 1)];
      const next = centers[Math.min(centers.length - 1, index + 1)];
      const normal = normalizedWaterNormal(
        prior,
        next,
        left[index],
        right[index],
      );
      for (let side = 0; side < 2; side += 1) {
        normals[vertex * 3] = normal.x;
        normals[vertex * 3 + 1] = normal.y;
        normals[vertex * 3 + 2] = normal.z;
        vertex += 1;
      }
    }
  }
  if (vertex !== normals.length / 3) {
    throw new RangeError("terrain-shaded stream vertex range is invalid");
  }
  return Object.freeze({
    ...replaced,
    normals,
  });
}
