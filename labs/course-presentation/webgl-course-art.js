import {
  WEBGL_GROUND_ART_VERSION,
  WEBGL_SURFACE_MATERIAL_IDS,
  WEBGL_WATERCOURSE_ART_VERSION,
  WEBGL_WATER_SHORELINE_MAX_BYTES,
  WEBGL_WATER_SHORELINE_MAX_TRIANGLES,
  WEBGL_WATER_SHORELINE_MAX_VERTICES,
  webglTerrainMaterialId,
} from "./webgl-terrain-materials.js";
import { WEBGL_BUNKER_ART_VERSION } from "./webgl-bunker-art.js";

export const WEBGL_COURSE_ART_REQUEST_SCHEMA_VERSION = 1;
export const WEBGL_MAX_PREPARED_WORLDS = 3;
export const WEBGL_MAX_PREPARED_BYTES = 6 * 1_024 * 1_024;

const stableString = (value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
};

const recoverySourceKind = (value) => {
  if (value !== "recovery-unmapped") {
    throw new RangeError("WebGL art sourceKind must be recovery-unmapped");
  }
  return value;
};

export const webglCourseArtIdentity = (source) => Object.freeze({
  schemaVersion: WEBGL_COURSE_ART_REQUEST_SCHEMA_VERSION,
  sourceKind: recoverySourceKind(source?.sourceKind),
  packageId: stableString(source?.packageId, "WebGL art packageId"),
  packageVersion: stableString(
    source?.packageVersion,
    "WebGL art packageVersion",
  ),
  runtimeId: stableString(source?.runtimeId, "WebGL art runtimeId"),
  contentRevision: stableString(
    source?.contentRevision,
    "WebGL art contentRevision",
  ),
  groundArtVersion: WEBGL_GROUND_ART_VERSION,
});

export const webglCourseArtKey = (source) =>
  JSON.stringify(Object.values(webglCourseArtIdentity(source)));

const terrainBytes = (geometry) =>
  geometry.positions.byteLength +
  geometry.normals.byteLength +
  geometry.materials.byteLength +
  geometry.indices.byteLength;

export const preparedWebglCourseArtBytes = (art) =>
  terrainBytes(art.terrainGeometry) + art.vegetationInstances.byteLength;

const assertTypedArray = (value, Type, label) => {
  if (!(value instanceof Type) || value.byteLength === 0) {
    throw new TypeError(`${label} must be a non-empty ${Type.name}`);
  }
};

const SURFACE_BATCH_ORDER = Object.freeze([
  "fairway",
  "green",
  "bunker",
  "water",
]);
const BUNKER_STYLES = Object.freeze(["soft-pot", "revetted-pot"]);
const MATERIAL_IDS = Object.freeze(Object.values(WEBGL_SURFACE_MATERIAL_IDS));
const validatedPreparedArt = new WeakSet();

const assertFiniteArray = (value, label) => {
  if (!value.every(Number.isFinite)) {
    throw new RangeError(`${label} must contain only finite values`);
  }
};

const assertBunkerMetadata = (geometry, baseVertexCount, vertexCount) => {
  if (
    geometry.coarseGridTriangleCount !== geometry.columns * geometry.rows * 2 ||
    !Number.isInteger(geometry.gridVertexCount) ||
    geometry.gridVertexCount < baseVertexCount ||
    geometry.gridVertexCount > vertexCount ||
    geometry.bunkerArtVersion !== WEBGL_BUNKER_ART_VERSION ||
    !Number.isInteger(geometry.bunkerPatchCount) ||
    geometry.bunkerPatchCount < 0 ||
    !Number.isInteger(geometry.bunkerCollarTriangleCount) ||
    geometry.bunkerCollarTriangleCount < 0 ||
    !Number.isInteger(geometry.bunkerReliefTriangleCount) ||
    geometry.bunkerReliefTriangleCount < 0 ||
    !Array.isArray(geometry.bunkerPatches) ||
    geometry.bunkerPatches.length !== geometry.bunkerPatchCount
  ) {
    throw new RangeError("Prepared WebGL bunker metadata is invalid");
  }

  const occupiedCells = new Set();
  let removedCoarseTriangles = 0;
  let gridVertexCount = baseVertexCount;
  let collarTriangleCount = 0;
  let reliefTriangleCount = 0;
  for (let index = 0; index < geometry.bunkerPatches.length; index += 1) {
    const patch = geometry.bunkerPatches[index];
    const bounds = patch?.cellBounds;
    const rectangle = patch?.rectangle;
    if (
      patch?.bunkerIndex !== index ||
      !BUNKER_STYLES.includes(patch.style) ||
      !Number.isInteger(patch.angleCount) ||
      patch.angleCount < 3 ||
      !bounds ||
      !Number.isInteger(bounds.firstColumn) ||
      !Number.isInteger(bounds.lastColumn) ||
      !Number.isInteger(bounds.firstRow) ||
      !Number.isInteger(bounds.lastRow) ||
      bounds.firstColumn < 0 ||
      bounds.lastColumn >= geometry.columns ||
      bounds.firstColumn > bounds.lastColumn ||
      bounds.firstRow < 0 ||
      bounds.lastRow >= geometry.rows ||
      bounds.firstRow > bounds.lastRow ||
      !rectangle ||
      ![
        rectangle.minimumX,
        rectangle.maximumX,
        rectangle.minimumZ,
        rectangle.maximumZ,
      ].every(Number.isFinite) ||
      rectangle.minimumX >= rectangle.maximumX ||
      rectangle.minimumZ >= rectangle.maximumZ ||
      patch.firstGridVertex !== gridVertexCount ||
      patch.gridVertexCount !== patch.angleCount * 2 ||
      !Number.isInteger(patch.firstGridIndex) ||
      !Number.isInteger(patch.gridIndexCount) ||
      patch.gridIndexCount !== patch.angleCount * 6 ||
      !Number.isInteger(patch.firstBunkerVertex) ||
      patch.firstBunkerVertex < geometry.gridVertexCount ||
      patch.bunkerVertexCount !== 1 + patch.angleCount * 8 ||
      !Number.isInteger(patch.firstBunkerIndex) ||
      !Number.isInteger(patch.bunkerIndexCount) ||
      patch.bunkerIndexCount !== patch.angleCount * 45
    ) {
      throw new RangeError("Prepared WebGL bunker patch is invalid");
    }
    for (let row = bounds.firstRow; row <= bounds.lastRow; row += 1) {
      for (let column = bounds.firstColumn;
        column <= bounds.lastColumn;
        column += 1) {
        const key = `${row}:${column}`;
        if (occupiedCells.has(key)) {
          throw new RangeError("Prepared WebGL bunker patches overlap");
        }
        occupiedCells.add(key);
        removedCoarseTriangles += 2;
      }
    }
    gridVertexCount += patch.gridVertexCount;
    collarTriangleCount += patch.gridIndexCount / 3;
    reliefTriangleCount += patch.bunkerIndexCount / 3;
  }

  const keptCoarseTriangles = geometry.coarseGridTriangleCount -
    removedCoarseTriangles;
  let nextGridIndex = keptCoarseTriangles * 3;
  let nextBunkerVertex = geometry.bunkerPatches[0]?.firstBunkerVertex ?? null;
  let nextBunkerIndex = geometry.bunkerPatches[0]?.firstBunkerIndex ?? null;
  for (const patch of geometry.bunkerPatches) {
    if (
      patch.firstGridIndex !== nextGridIndex ||
      patch.firstBunkerVertex !== nextBunkerVertex ||
      patch.firstBunkerIndex !== nextBunkerIndex
    ) {
      throw new RangeError("Prepared WebGL bunker patch ranges are invalid");
    }
    nextGridIndex += patch.gridIndexCount;
    nextBunkerVertex += patch.bunkerVertexCount;
    nextBunkerIndex += patch.bunkerIndexCount;
  }
  if (
    keptCoarseTriangles < 0 ||
    gridVertexCount !== geometry.gridVertexCount ||
    collarTriangleCount !== geometry.bunkerCollarTriangleCount ||
    reliefTriangleCount !== geometry.bunkerReliefTriangleCount ||
    geometry.gridTriangleCount !== keptCoarseTriangles + collarTriangleCount ||
    nextGridIndex !== geometry.gridTriangleCount * 3 ||
    nextBunkerVertex > vertexCount
  ) {
    throw new RangeError("Prepared WebGL bunker totals are invalid");
  }
  return Object.freeze({
    firstBunkerIndex: geometry.bunkerPatches[0]?.firstBunkerIndex ?? null,
    firstBunkerVertex: geometry.bunkerPatches[0]?.firstBunkerVertex ?? null,
    nextBunkerVertex,
    nextBunkerIndex,
  });
};

const assertPreparedArt = (expectedIdentity, art) => {
  if (
    !art ||
    art.identity?.schemaVersion !== expectedIdentity.schemaVersion ||
    art.identity?.sourceKind !== expectedIdentity.sourceKind ||
    art.identity?.packageId !== expectedIdentity.packageId ||
    art.identity?.packageVersion !== expectedIdentity.packageVersion ||
    art.identity?.runtimeId !== expectedIdentity.runtimeId ||
    art.identity?.contentRevision !== expectedIdentity.contentRevision ||
    art.identity?.groundArtVersion !== expectedIdentity.groundArtVersion
  ) {
    throw new TypeError("Prepared WebGL course art identity is invalid");
  }
  if (validatedPreparedArt.has(art)) return art;
  if (
    art.executionContext !== "dedicated-worker" ||
    !Number.isFinite(art.workerDurationMs) ||
    art.workerDurationMs < 0
  ) {
    throw new TypeError("Prepared WebGL course art identity is invalid");
  }
  const geometry = art.terrainGeometry;
  if (
    !geometry ||
    !Number.isInteger(geometry.columns) ||
    geometry.columns <= 0 ||
    !Number.isInteger(geometry.rows) ||
    geometry.rows <= 0 ||
    !Number.isInteger(geometry.gridTriangleCount) ||
    geometry.gridTriangleCount <= 0 ||
    !Number.isInteger(geometry.surfaceTriangleCount) ||
    geometry.surfaceTriangleCount < 0 ||
    geometry.watercourseArtVersion !== WEBGL_WATERCOURSE_ART_VERSION ||
    !Number.isInteger(geometry.waterShorelineVertexCount) ||
    geometry.waterShorelineVertexCount < 0 ||
    !Number.isInteger(geometry.waterShorelineTriangleCount) ||
    geometry.waterShorelineTriangleCount < 0 ||
    !Number.isInteger(geometry.waterShorelineByteLength) ||
    geometry.waterShorelineByteLength < 0 ||
    !Array.isArray(geometry.surfaceBatches) ||
    !geometry.materialCounts ||
    typeof geometry.materialCounts !== "object"
  ) {
    throw new TypeError("Prepared WebGL terrain metadata is invalid");
  }
  assertTypedArray(geometry.positions, Float32Array, "terrain positions");
  assertTypedArray(geometry.normals, Float32Array, "terrain normals");
  assertTypedArray(geometry.materials, Uint8Array, "terrain materials");
  assertTypedArray(geometry.indices, Uint32Array, "terrain indices");
  assertTypedArray(
    art.vegetationInstances,
    Float32Array,
    "vegetation instances",
  );
  assertFiniteArray(geometry.positions, "terrain positions");
  assertFiniteArray(geometry.normals, "terrain normals");
  assertFiniteArray(geometry.materials, "terrain materials");
  assertFiniteArray(art.vegetationInstances, "vegetation instances");
  const vertexCount = geometry.positions.length / 3;
  const baseVertexCount = (geometry.columns + 1) * (geometry.rows + 1);
  const materialNames = Object.keys(WEBGL_SURFACE_MATERIAL_IDS);
  const countNames = Object.keys(geometry.materialCounts);
  const shorelineByteLength = geometry.waterShorelineVertexCount * (
    Float32Array.BYTES_PER_ELEMENT * 6 + Uint8Array.BYTES_PER_ELEMENT
  ) + geometry.waterShorelineTriangleCount * 3 *
    Uint32Array.BYTES_PER_ELEMENT;
  if (
    !Number.isInteger(vertexCount) ||
    vertexCount < baseVertexCount ||
    geometry.normals.length !== geometry.positions.length ||
    geometry.materials.length !== vertexCount ||
    geometry.indices.length % 3 !== 0 ||
    art.vegetationInstances.length % 6 !== 0 ||
    geometry.gridTriangleCount + geometry.surfaceTriangleCount !==
      geometry.indices.length / 3 ||
    geometry.indices.some((index) => index >= vertexCount) ||
    geometry.indices.subarray(0, geometry.gridTriangleCount * 3)
      .some((index) => index >= geometry.gridVertexCount) ||
    geometry.indices.subarray(geometry.gridTriangleCount * 3)
      .some((index) => index < geometry.gridVertexCount) ||
    geometry.materials.some((material, index) =>
      !MATERIAL_IDS.includes(webglTerrainMaterialId(material)) ||
      (index < geometry.gridVertexCount &&
        webglTerrainMaterialId(material) !==
          WEBGL_SURFACE_MATERIAL_IDS.rough)
    ) ||
    countNames.length !== materialNames.length ||
    materialNames.some((name, index) =>
      countNames[index] !== name ||
      !Number.isInteger(geometry.materialCounts[name]) ||
      geometry.materialCounts[name] < 0
    ) ||
    materialNames.reduce(
      (sum, name) => sum + geometry.materialCounts[name],
      0,
    ) !== vertexCount ||
    geometry.materialCounts.waterShoreline !==
      geometry.waterShorelineVertexCount ||
    geometry.waterShorelineVertexCount > WEBGL_WATER_SHORELINE_MAX_VERTICES ||
    geometry.waterShorelineTriangleCount >
      WEBGL_WATER_SHORELINE_MAX_TRIANGLES ||
    geometry.waterShorelineByteLength !== shorelineByteLength ||
    geometry.waterShorelineByteLength > WEBGL_WATER_SHORELINE_MAX_BYTES ||
    geometry.waterShorelineVertexCount !==
      geometry.waterShorelineTriangleCount
  ) {
    throw new RangeError("Prepared WebGL geometry array lengths are invalid");
  }
  for (let index = 0; index < geometry.normals.length; index += 3) {
    const length = Math.hypot(
      geometry.normals[index],
      geometry.normals[index + 1],
      geometry.normals[index + 2],
    );
    if (Math.abs(length - 1) > 1e-3) {
      throw new RangeError("Prepared WebGL terrain normals are invalid");
    }
  }
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const first = geometry.indices[index] * 3;
    const second = geometry.indices[index + 1] * 3;
    const third = geometry.indices[index + 2] * 3;
    const signedArea =
      (geometry.positions[second] - geometry.positions[first]) *
        (geometry.positions[third + 2] - geometry.positions[first + 2]) -
      (geometry.positions[second + 2] - geometry.positions[first + 2]) *
        (geometry.positions[third] - geometry.positions[first]);
    if (signedArea >= -1e-10) {
      throw new RangeError("Prepared WebGL terrain winding is invalid");
    }
  }
  const bunkerRange = assertBunkerMetadata(
    geometry,
    baseVertexCount,
    vertexCount,
  );
  let nextSurfaceIndex = geometry.gridTriangleCount * 3;
  let priorBatchOrder = -1;
  let bunkerBatch = null;
  for (const batch of geometry.surfaceBatches) {
    const batchOrder = SURFACE_BATCH_ORDER.indexOf(batch?.material);
    if (
      !batch ||
      batchOrder <= priorBatchOrder ||
      !Number.isInteger(batch.firstIndex) ||
      batch.firstIndex !== nextSurfaceIndex ||
      !Number.isInteger(batch.indexCount) ||
      batch.indexCount <= 0 ||
      batch.indexCount % 3 !== 0 ||
      batch.triangleCount !== batch.indexCount / 3
    ) {
      throw new RangeError("Prepared WebGL surface batch metadata is invalid");
    }
    const materialId = WEBGL_SURFACE_MATERIAL_IDS[batch.material];
    const permittedMaterialIds = batch.material === "bunker"
      ? [materialId, WEBGL_SURFACE_MATERIAL_IDS.bunkerRevetted]
      : batch.material === "water"
      ? [materialId, WEBGL_SURFACE_MATERIAL_IDS.waterShoreline]
      : [materialId];
    if (
      geometry.indices
        .subarray(batch.firstIndex, batch.firstIndex + batch.indexCount)
        .some((index) => !permittedMaterialIds.includes(
          webglTerrainMaterialId(geometry.materials[index]),
        ))
    ) {
      throw new RangeError("Prepared WebGL surface batch material is invalid");
    }
    if (batch.material === "bunker") bunkerBatch = batch;
    priorBatchOrder = batchOrder;
    nextSurfaceIndex += batch.indexCount;
  }
  if (nextSurfaceIndex !== geometry.indices.length) {
    throw new RangeError("Prepared WebGL surface batches do not cover indices");
  }
  if (
    geometry.bunkerPatchCount === 0
      ? bunkerBatch !== null
      : !bunkerBatch ||
        bunkerBatch.firstIndex !== bunkerRange.firstBunkerIndex ||
        bunkerBatch.firstIndex + bunkerBatch.indexCount !==
          bunkerRange.nextBunkerIndex ||
        bunkerBatch.triangleCount !== geometry.bunkerReliefTriangleCount
  ) {
    throw new RangeError("Prepared WebGL bunker batch is invalid");
  }
  for (const patch of geometry.bunkerPatches) {
    const materialId = patch.style === "revetted-pot"
      ? WEBGL_SURFACE_MATERIAL_IDS.bunkerRevetted
      : WEBGL_SURFACE_MATERIAL_IDS.bunker;
    if (
      geometry.indices.subarray(
        patch.firstBunkerIndex,
        patch.firstBunkerIndex + patch.bunkerIndexCount,
      ).some((index) =>
        index < patch.firstBunkerVertex ||
        index >= patch.firstBunkerVertex + patch.bunkerVertexCount ||
        webglTerrainMaterialId(geometry.materials[index]) !== materialId
      )
    ) {
      throw new RangeError("Prepared WebGL bunker style material is invalid");
    }
  }
  const prepared = Object.freeze({
    identity: Object.freeze({ ...art.identity }),
    executionContext: art.executionContext,
    terrainGeometry: Object.freeze({
      ...geometry,
      surfaceBatches: Object.freeze(geometry.surfaceBatches.map((batch) =>
        Object.freeze({ ...batch })
      )),
      bunkerPatches: Object.freeze(geometry.bunkerPatches.map((patch) =>
        Object.freeze({
          ...patch,
          cellBounds: Object.freeze({ ...patch.cellBounds }),
          rectangle: Object.freeze({ ...patch.rectangle }),
        })
      )),
      materialCounts: Object.freeze({ ...geometry.materialCounts }),
    }),
    vegetationInstances: art.vegetationInstances,
    workerDurationMs: art.workerDurationMs,
  });
  validatedPreparedArt.add(prepared);
  return prepared;
};

const abortError = () => {
  const error = new Error("WebGL course art preparation was aborted");
  error.name = "AbortError";
  return error;
};

const awaitConsumer = (request, signal) => {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
};

const defaultWorkerFactory = (identity) => {
  const workerUrl = new URL("./webgl-course-art-worker.js", import.meta.url);
  workerUrl.searchParams.set("runtimeId", identity.runtimeId);
  workerUrl.searchParams.set("contentRevision", identity.contentRevision);
  return new Worker(workerUrl, {
    type: "module",
    name: "golf-iq-course-art",
  });
};

export function createWebglCourseArtWorkerClient({
  createWorker = defaultWorkerFactory,
  maximumPendingRequests = WEBGL_MAX_PREPARED_WORLDS,
  workerTimeoutMs = 30_000,
} = {}) {
  if (typeof createWorker !== "function") {
    throw new TypeError("createWorker must be a function");
  }
  if (!Number.isInteger(maximumPendingRequests) || maximumPendingRequests <= 0) {
    throw new RangeError("maximumPendingRequests must be a positive integer");
  }
  if (!Number.isFinite(workerTimeoutMs) || workerTimeoutMs <= 0) {
    throw new RangeError("workerTimeoutMs must be positive and finite");
  }
  let nextRequestId = 1;
  const queue = [];
  let activeJob = null;
  let disposed = false;

  const startNext = () => {
    if (disposed || activeJob || queue.length === 0) return;
    const job = queue.shift();
    if (job.signal?.aborted) {
      job.signal.removeEventListener("abort", job.onAbort);
      job.reject(abortError());
      queueMicrotask(startNext);
      return;
    }
    activeJob = job;
    let candidate;
    let timeoutId;
    const settle = (callback, value) => {
      if (job.settled) return;
      job.settled = true;
      clearTimeout(timeoutId);
      job.signal?.removeEventListener("abort", job.onAbort);
      candidate?.terminate();
      activeJob = null;
      callback(value);
      queueMicrotask(startNext);
    };
    job.cancel = (cause) => settle(job.reject, cause);
    try {
      candidate = createWorker(job.identity);
      if (
        !candidate ||
        typeof candidate.postMessage !== "function" ||
        typeof candidate.terminate !== "function"
      ) {
        throw new TypeError(
          "createWorker must return a Worker-compatible object",
        );
      }
      candidate.addEventListener("message", (event) => {
        const message = event.data;
        if (message?.requestId !== job.requestId) {
          settle(job.reject, new Error(
            "WebGL course art worker returned a mismatched request",
          ));
          return;
        }
        if (message.type === "golf-iq:webgl-art-ready") {
          try {
            settle(
              job.resolve,
              assertPreparedArt(job.identity, message.art),
            );
          } catch (cause) {
            settle(job.reject, cause);
          }
          return;
        }
        const error = new Error(
          message?.message || "WebGL course art worker rejected preparation",
        );
        error.name = "WebglCourseArtWorkerError";
        error.code = message?.code || "WEBGL_ART_WORKER_REJECTED";
        settle(job.reject, error);
      });
      candidate.addEventListener("error", (event) => {
        event?.preventDefault?.();
        settle(job.reject, new Error(
          event?.message || "WebGL course art worker crashed",
        ));
      });
      candidate.addEventListener("messageerror", () => {
        settle(job.reject, new Error(
          "WebGL course art worker returned invalid data",
        ));
      });
      timeoutId = setTimeout(() => {
        const error = new Error("WebGL course art worker timed out");
        error.name = "WebglCourseArtWorkerError";
        error.code = "WEBGL_ART_WORKER_TIMEOUT";
        settle(job.reject, error);
      }, workerTimeoutMs);
      candidate.postMessage(Object.freeze({
        type: "golf-iq:prepare-webgl-art",
        requestId: job.requestId,
        identity: job.identity,
      }));
    } catch (cause) {
      settle(job.reject, cause);
    }
  };

  const prepare = (source, { signal } = {}) => {
    if (disposed) {
      return Promise.reject(new Error("WebGL course art worker client is disposed"));
    }
    const identity = webglCourseArtIdentity(source);
    if (signal?.aborted) return Promise.reject(abortError());
    if (queue.length + (activeJob ? 1 : 0) >= maximumPendingRequests) {
      return Promise.reject(new RangeError(
        "WebGL course art worker queue is full",
      ));
    }
    const requestId = String(nextRequestId);
    nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const job = {
        identity,
        requestId,
        signal,
        resolve,
        reject,
        cancel: null,
        settled: false,
        onAbort: null,
      };
      job.onAbort = () => {
        if (activeJob === job) {
          job.cancel?.(abortError());
          return;
        }
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        if (job.settled) return;
        job.settled = true;
        signal?.removeEventListener("abort", job.onAbort);
        reject(abortError());
      };
      signal?.addEventListener("abort", job.onAbort, { once: true });
      queue.push(job);
      startNext();
    });
  };

  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    const cause = new Error("WebGL course art worker client was disposed");
    activeJob?.cancel?.(cause);
    for (const job of queue.splice(0)) {
      if (job.settled) continue;
      job.settled = true;
      job.signal?.removeEventListener("abort", job.onAbort);
      job.reject(cause);
    }
    return true;
  };

  return Object.freeze({ prepare, dispose });
}

export function createPreparedWebglCourseArtCache({
  maximumWorlds = WEBGL_MAX_PREPARED_WORLDS,
  maximumBytes = WEBGL_MAX_PREPARED_BYTES,
  maximumPendingWorlds = maximumWorlds,
  prepareCourseArt,
} = {}) {
  if (!Number.isInteger(maximumWorlds) || maximumWorlds <= 0) {
    throw new RangeError("maximumWorlds must be a positive integer");
  }
  if (!Number.isInteger(maximumBytes) || maximumBytes <= 0) {
    throw new RangeError("maximumBytes must be a positive integer");
  }
  if (!Number.isInteger(maximumPendingWorlds) || maximumPendingWorlds <= 0) {
    throw new RangeError("maximumPendingWorlds must be a positive integer");
  }
  if (typeof prepareCourseArt !== "function") {
    throw new TypeError("prepareCourseArt must be a function");
  }
  const preparedCourseArt = new Map();
  const pendingCourseArt = new Map();
  let disposed = false;

  const residentBytes = () => [...preparedCourseArt.values()].reduce(
    (total, art) => total + preparedWebglCourseArtBytes(art),
    0,
  );

  const status = () => Object.freeze({
    residentWorlds: preparedCourseArt.size,
    residentBytes: residentBytes(),
    pendingWorlds: pendingCourseArt.size,
    maximumWorlds,
    maximumBytes,
    maximumPendingWorlds,
    disposed,
  });

  const retain = (key, art) => {
    const bytes = preparedWebglCourseArtBytes(art);
    if (bytes > maximumBytes) {
      throw new RangeError("Prepared WebGL course art exceeds the byte ceiling");
    }
    preparedCourseArt.set(key, art);
    while (
      preparedCourseArt.size > maximumWorlds ||
      residentBytes() > maximumBytes
    ) {
      preparedCourseArt.delete(preparedCourseArt.keys().next().value);
    }
  };

  const consume = (pending, signal, transform) => {
    if (signal?.aborted) return Promise.reject(abortError());
    pending.consumers += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pending.consumers -= 1;
      if (pending.consumers === 0 && !pending.settled) {
        if (pendingCourseArt.get(pending.key) === pending) {
          pendingCourseArt.delete(pending.key);
        }
        pending.controller.abort();
      }
    };
    const result = pending.request.then(transform);
    if (!signal) return result.finally(release);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        release();
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      result.then(resolve, reject).finally(() => {
        signal.removeEventListener("abort", onAbort);
        release();
      });
    });
  };

  const prepare = (source, { signal } = {}) => {
    if (disposed) {
      return Promise.reject(new Error("Prepared WebGL course art cache is disposed"));
    }
    const identity = webglCourseArtIdentity(source);
    if (signal?.aborted) return Promise.reject(abortError());
    const key = webglCourseArtKey(identity);
    const retained = preparedCourseArt.get(key);
    if (retained) {
      preparedCourseArt.delete(key);
      preparedCourseArt.set(key, retained);
      return awaitConsumer(Promise.resolve(Object.freeze({
        ...retained,
        cacheHit: true,
        sourceWorkerDurationMs: retained.workerDurationMs,
        workerDurationMs: 0,
      })), signal);
    }
    let pending = pendingCourseArt.get(key);
    if (!pending) {
      if (pendingCourseArt.size >= maximumPendingWorlds) {
        return Promise.reject(new RangeError(
          "Prepared WebGL course art queue is full",
        ));
      }
      const controller = new AbortController();
      pending = {
        key,
        consumers: 0,
        controller,
        request: null,
        settled: false,
      };
      const request = Promise.resolve()
        .then(() => prepareCourseArt(identity, { signal: controller.signal }))
        .then((art) => assertPreparedArt(identity, art))
        .then((art) => {
          if (disposed) {
            throw new Error("Prepared WebGL course art cache is disposed");
          }
          retain(key, art);
          return art;
        })
        .finally(() => {
          pending.settled = true;
          if (pendingCourseArt.get(key) === pending) {
            pendingCourseArt.delete(key);
          }
        });
      pending.request = request;
      pendingCourseArt.set(key, pending);
    }
    return consume(pending, signal, (art) => Object.freeze({
      ...art,
      cacheHit: false,
      sourceWorkerDurationMs: art.workerDurationMs,
    }));
  };

  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    preparedCourseArt.clear();
    for (const pending of pendingCourseArt.values()) {
      pending.controller.abort();
    }
    pendingCourseArt.clear();
    return true;
  };

  return Object.freeze({ prepare, status, dispose });
}

export function createPreparedWebglCourseArtService({
  createWorker,
  maximumWorlds = WEBGL_MAX_PREPARED_WORLDS,
  maximumBytes = WEBGL_MAX_PREPARED_BYTES,
} = {}) {
  const workerClient = createWebglCourseArtWorkerClient({
    createWorker,
    maximumPendingRequests: maximumWorlds,
  });
  const cache = createPreparedWebglCourseArtCache({
    maximumWorlds,
    maximumBytes,
    prepareCourseArt: workerClient.prepare,
  });
  let disposed = false;
  return Object.freeze({
    prepare: cache.prepare,
    status: cache.status,
    dispose() {
      if (disposed) return false;
      disposed = true;
      cache.dispose();
      workerClient.dispose();
      return true;
    },
  });
}
