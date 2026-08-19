import {
  renderCourseFrame,
  renderCoursePresentationLayer,
} from "./course-renderer.js";
import { createCourseRendererSession } from "./course-renderer-session.js";
import { createWebglCourseRenderer } from "./webgl-course-renderer.js";
import { webglCourseArtIdentity } from "./webgl-course-art.js";

const assertCanvas = (canvas, label) => {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError(`${label} must be a canvas element`);
  }
  return canvas;
};

const assertViewport = (viewport) => {
  const dimensions = [
    "cssWidth",
    "cssHeight",
    "backingWidth",
    "backingHeight",
    "devicePixelRatio",
    "renderScale",
  ];
  if (
    !viewport ||
    dimensions.some((name) => !Number.isFinite(viewport[name]) || viewport[name] <= 0)
  ) {
    throw new RangeError("Renderer viewport must contain positive dimensions");
  }
  return viewport;
};

const configurePresentationCanvas = (canvas, context, viewport) => {
  const scale = viewport.devicePixelRatio * viewport.renderScale;
  if (canvas.width !== viewport.backingWidth) {
    canvas.width = viewport.backingWidth;
  }
  if (canvas.height !== viewport.backingHeight) {
    canvas.height = viewport.backingHeight;
  }
  if (canvas.style.width !== `${viewport.cssWidth}px`) {
    canvas.style.width = `${viewport.cssWidth}px`;
  }
  if (canvas.style.height !== `${viewport.cssHeight}px`) {
    canvas.style.height = `${viewport.cssHeight}px`;
  }
  context.setTransform(scale, 0, 0, scale, 0, 0);
};

const canvasStats = Object.freeze({
  drawCalls: null,
  terrainTriangles: null,
  vegetationInstances: 72,
  residentGeometryBytes: 0,
  frameUploadBytes: 0,
  contextLosses: 0,
});

const captureCanvasLayers = (presentationCanvas, worldCanvas = null) => {
  if (
    worldCanvas &&
    (worldCanvas.width !== presentationCanvas.width ||
      worldCanvas.height !== presentationCanvas.height)
  ) {
    throw new Error("Renderer layers must share backing dimensions before capture");
  }
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = presentationCanvas.width;
  captureCanvas.height = presentationCanvas.height;
  const captureContext = captureCanvas.getContext("2d", { alpha: false });
  if (!captureContext) {
    throw new Error("Canvas capture layer is unavailable");
  }
  if (worldCanvas && !worldCanvas.hidden) {
    captureContext.drawImage(worldCanvas, 0, 0);
  }
  captureContext.drawImage(presentationCanvas, 0, 0);
  return Object.freeze({
    canvas: captureCanvas,
    width: captureCanvas.width,
    height: captureCanvas.height,
    pngDataUrl: captureCanvas.toDataURL("image/png"),
  });
};

const webglPresentationFrame = (frame) => Object.freeze({
  ...frame,
  world: Object.freeze({
    ...frame.world,
    waterSurfacePoints: Object.freeze([]),
    waterSurfaceGroups: Object.freeze([]),
  }),
});

export function createPlayableRendererSession({
  worldCanvas,
  presentationCanvas,
  requestedBackend,
  strictBackend = false,
  onContextLost = () => {},
}) {
  assertCanvas(worldCanvas, "worldCanvas");
  assertCanvas(presentationCanvas, "presentationCanvas");
  const presentationContext = presentationCanvas.getContext("2d", {
    alpha: true,
  });
  if (!presentationContext) {
    throw new Error("Canvas 2D presentation layer is unavailable");
  }
  if (typeof onContextLost !== "function") {
    throw new TypeError("onContextLost must be a function");
  }

  let viewport = null;

  const prepareSource = (source) => {
    const identity = webglCourseArtIdentity(source);
    if (!source?.world || source.world.id !== identity.runtimeId) {
      throw new RangeError("Renderer source world identity is not authoritative");
    }
    return Object.freeze({ ...identity, world: source.world });
  };

  const prepareFrame = (frame) => {
    if (!viewport) {
      throw new Error("Renderer must be resized before its first frame");
    }
    if (!frame?.world || typeof frame.world !== "object") {
      throw new TypeError("Renderer frame requires an explicit course world");
    }
    prepareSource(frame);
    return Object.freeze({
      ...frame,
      width: viewport.cssWidth,
      height: viewport.cssHeight,
    });
  };

  const createCanvasBackend = () => {
    const prepare = (source) => Object.freeze({
      schemaVersion: 1,
      executionContext: "not-required",
      sourceKind: source.sourceKind,
      packageId: source.packageId,
      packageVersion: source.packageVersion,
      runtimeId: source.runtimeId,
      contentRevision: source.contentRevision,
      cpuCacheHit: null,
      gpuCacheHit: null,
      workerDurationMs: 0,
      workerObservedDurationMs: 0,
      gpuUploadDurationMs: 0,
      maximumUploadStepDurationMs: 0,
      totalDurationMs: 0,
      preparedBytes: 0,
    });
    const resize = (nextViewport) => {
      viewport = assertViewport(nextViewport);
      configurePresentationCanvas(
        presentationCanvas,
        presentationContext,
        viewport,
      );
      worldCanvas.hidden = true;
      return viewport;
    };
    const render = (frame) => {
      worldCanvas.hidden = true;
      renderCourseFrame(presentationContext, prepareFrame(frame));
      return canvasStats;
    };
    return Object.freeze({
      backend: "canvas2d",
      prepare,
      resize,
      render,
      capture: (frame) => {
        const rendererStats = frame ? render(frame) : canvasStats;
        return Object.freeze({
          ...captureCanvasLayers(presentationCanvas),
          rendererStats,
        });
      },
      getContextLosses: () => 0,
      dispose: () => {
        presentationContext.clearRect(
          0,
          0,
          viewport?.cssWidth ?? presentationCanvas.width,
          viewport?.cssHeight ?? presentationCanvas.height,
        );
      },
    });
  };

  const createWebglBackend = () => {
    worldCanvas.hidden = false;
    const renderer = createWebglCourseRenderer(worldCanvas, {
      presentationLayer: "external",
      preserveDrawingBuffer: false,
      onContextLost,
    });
    const resize = (nextViewport) => {
      viewport = assertViewport(nextViewport);
      configurePresentationCanvas(
        presentationCanvas,
        presentationContext,
        viewport,
      );
      worldCanvas.hidden = false;
      return renderer.resize(viewport);
    };
    const render = (frame) => {
      const prepared = prepareFrame(frame);
      worldCanvas.hidden = false;
      const stats = renderer.render({
        sourceKind: prepared.sourceKind,
        packageId: prepared.packageId,
        packageVersion: prepared.packageVersion,
        runtimeId: prepared.runtimeId,
        contentRevision: prepared.contentRevision,
        world: prepared.world,
        camera: prepared.camera,
        environmentTimeMs: prepared.environmentTimeMs,
        reducedMotion: prepared.reducedMotion,
        wind: prepared.wind,
      });
      renderCoursePresentationLayer(
        presentationContext,
        webglPresentationFrame(prepared),
        { includeBunkers: false },
      );
      return stats;
    };
    return Object.freeze({
      backend: "webgl2-hybrid",
      prepare: (source, options) => renderer.prepare(source, options),
      resize,
      render,
      capture: (frame) => {
        if (!frame) {
          throw new TypeError("WebGL capture requires a renderer frame");
        }
        const rendererStats = render(frame);
        return Object.freeze({
          ...captureCanvasLayers(presentationCanvas, worldCanvas),
          rendererStats,
        });
      },
      getContextLosses: renderer.getContextLosses,
      dispose: () => {
        renderer.dispose();
        worldCanvas.hidden = true;
      },
    });
  };

  const session = createCourseRendererSession({
    requestedBackend,
    strictBackend,
    backendFactories: {
      canvas2d: createCanvasBackend,
      "webgl2-hybrid": createWebglBackend,
    },
  });
  return Object.freeze({
    ready: session.ready,
    prepare: (source, options) =>
      session.prepare(prepareSource(source), options),
    resize: session.resize,
    render: (frame) => session.render(prepareFrame(frame)),
    capture: (frame) => session.capture(prepareFrame(frame)),
    getStatus: session.getStatus,
    dispose: session.dispose,
  });
}
