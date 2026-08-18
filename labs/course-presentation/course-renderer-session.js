import { RENDERER_BACKENDS } from "./renderer-probe-contract.js";

const CANVAS_BACKEND = "canvas2d";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const failureMessage = (cause) => {
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim();
  const message = String(cause ?? "").trim();
  return message || "unknown renderer failure";
};

const fallbackReasonFor = (backend, cause) =>
  `${backend} failed: ${failureMessage(cause)}`;

const neutralPreparationFailure = (cause, signal) =>
  cause?.name === "AbortError" ||
  cause?.name === "RendererPreparationCapacityError" ||
  signal?.aborted;

const assertContextLosses = (value, backend) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(
      `${backend} contextLosses must be a non-negative integer`,
    );
  }
  return value;
};

const assertBackend = (candidate, backend) => {
  if (!isObject(candidate)) {
    throw new TypeError(`${backend} factory must return a renderer object`);
  }
  if (candidate.backend !== backend) {
    throw new TypeError(
      `${backend} factory returned backend ${String(candidate.backend)}`,
    );
  }
  if (typeof candidate.render !== "function") {
    throw new TypeError(`${backend} renderer must implement render(frame)`);
  }
  for (const method of [
    "prepare",
    "resize",
    "capture",
    "getContextLosses",
    "dispose",
  ]) {
    if (candidate[method] !== undefined && typeof candidate[method] !== "function") {
      throw new TypeError(`${backend} renderer ${method} must be a function`);
    }
  }
  return candidate;
};

export function createCourseRendererSession({
  requestedBackend,
  strictBackend = false,
  backendFactories,
}) {
  if (!RENDERER_BACKENDS.includes(requestedBackend)) {
    throw new RangeError(`Unsupported renderer backend: ${requestedBackend}`);
  }
  if (typeof strictBackend !== "boolean") {
    throw new TypeError("strictBackend must be a boolean");
  }
  if (!isObject(backendFactories)) {
    throw new TypeError("backendFactories must be an object");
  }

  let activeRenderer = null;
  let actualBackend = null;
  let fallbackReason = null;
  let contextLosses = 0;
  let lifecycle = "pending";
  let terminalFailure = null;
  let backendEpoch = 0;

  const getStatus = () => Object.freeze({
    requestedBackend,
    actualBackend,
    fallbackReason,
    contextLosses,
    disposed: lifecycle === "disposed",
  });

  const assertUsable = () => {
    if (lifecycle === "disposed") {
      throw new Error("Renderer session is disposed");
    }
    if (lifecycle === "pending") {
      throw new Error("Renderer session is not ready");
    }
    if (lifecycle === "failed") {
      throw terminalFailure ?? new Error("Renderer session failed");
    }
  };

  const activate = (backend) => {
    const factory = backendFactories[backend];
    if (typeof factory !== "function") {
      throw new RangeError(`Missing renderer factory: ${backend}`);
    }
    const candidate = assertBackend(factory(), backend);
    activeRenderer = candidate;
    actualBackend = backend;
    backendEpoch += 1;
    return candidate;
  };

  const disposeActiveRenderer = () => {
    const renderer = activeRenderer;
    activeRenderer = null;
    if (renderer && typeof renderer.dispose === "function") {
      renderer.dispose();
    }
  };

  const reportedContextLosses = (rendererStats) => {
    const fromStats = rendererStats?.contextLosses;
    const fromRenderer = activeRenderer?.getContextLosses?.();
    if (fromStats === undefined && fromRenderer === undefined) {
      return contextLosses;
    }
    const values = [contextLosses];
    if (fromStats !== undefined) {
      values.push(assertContextLosses(fromStats, actualBackend));
    }
    if (fromRenderer !== undefined) {
      values.push(assertContextLosses(fromRenderer, actualBackend));
    }
    return Math.max(...values);
  };

  const fail = (cause) => {
    terminalFailure = cause instanceof Error
      ? cause
      : new Error(failureMessage(cause));
    lifecycle = "failed";
    throw terminalFailure;
  };

  const retainReportedContextLosses = () => {
    try {
      contextLosses = reportedContextLosses(null);
    } catch {
      // Preserve the original renderer failure if its diagnostics are invalid.
    }
  };

  const preparationContextFailure = (renderer, epoch) => {
    if (
      lifecycle !== "ready" ||
      epoch !== backendEpoch ||
      renderer !== activeRenderer ||
      actualBackend === CANVAS_BACKEND
    ) {
      return null;
    }
    try {
      const reported = renderer.getContextLosses?.();
      if (reported === undefined) return null;
      const nextContextLosses = assertContextLosses(reported, actualBackend);
      contextLosses = Math.max(contextLosses, nextContextLosses);
      if (nextContextLosses === 0) return null;
      return new Error(
        `${actualBackend} reported ${nextContextLosses} context loss` +
          (nextContextLosses === 1 ? "" : "es"),
      );
    } catch (cause) {
      return cause instanceof Error
        ? cause
        : new Error(failureMessage(cause));
    }
  };

  const activateFallback = (cause) => {
    retainReportedContextLosses();
    const failedBackend = actualBackend ?? requestedBackend;
    const reason = fallbackReasonFor(failedBackend, cause);
    try {
      disposeActiveRenderer();
    } catch {
      // Disposal must not prevent the compatibility backend from recovering.
    }
    actualBackend = null;
    try {
      const fallback = activate(CANVAS_BACKEND);
      fallbackReason = reason;
      lifecycle = "ready";
      return fallback;
    } catch (fallbackCause) {
      fallbackReason = reason;
      const failure = new AggregateError(
        [cause, fallbackCause],
        `${reason}; ${CANVAS_BACKEND} fallback failed: ${failureMessage(fallbackCause)}`,
      );
      return fail(failure);
    }
  };

  const canFallback = () =>
    !strictBackend && actualBackend !== CANVAS_BACKEND;

  const handleFailure = (cause) => {
    retainReportedContextLosses();
    if (!canFallback()) return fail(cause);
    return activateFallback(cause);
  };

  const assertHealthyContext = (rendererStats) => {
    const nextContextLosses = reportedContextLosses(rendererStats);
    contextLosses = nextContextLosses;
    if (nextContextLosses > 0 && actualBackend !== CANVAS_BACKEND) {
      throw new Error(
        `${actualBackend} reported ${nextContextLosses} context loss` +
          (nextContextLosses === 1 ? "" : "es"),
      );
    }
  };

  const initialize = () => {
    if (lifecycle === "disposed") {
      throw new Error("Renderer session was disposed before it became ready");
    }
    try {
      activate(requestedBackend);
      assertHealthyContext(null);
      lifecycle = "ready";
      return getStatus();
    } catch (cause) {
      if (strictBackend || requestedBackend === CANVAS_BACKEND) {
        return fail(cause);
      }
      activateFallback(cause);
      return getStatus();
    }
  };

  const ready = Promise.resolve().then(initialize);

  const resize = (viewport) => {
    assertUsable();
    if (!isObject(viewport)) {
      throw new TypeError("Renderer viewport must be an object");
    }
    if (typeof activeRenderer.resize !== "function") return undefined;
    try {
      const result = activeRenderer.resize(viewport);
      assertHealthyContext(null);
      return result;
    } catch (cause) {
      const fallback = handleFailure(cause);
      try {
        const result = fallback.resize?.(viewport);
        assertHealthyContext(null);
        return result;
      } catch (fallbackCause) {
        return fail(fallbackCause);
      }
    }
  };

  const prepare = async (source, { signal } = {}) => {
    assertUsable();
    if (!isObject(source)) {
      throw new TypeError("Renderer preparation source must be an object");
    }
    if (signal?.aborted) {
      const error = new Error("Renderer preparation was aborted");
      error.name = "AbortError";
      throw error;
    }
    while (true) {
      const renderer = activeRenderer;
      const epoch = backendEpoch;
      try {
        const result = typeof renderer.prepare === "function"
          ? await renderer.prepare(source, { signal })
          : Object.freeze({
            schemaVersion: 1,
            executionContext: "not-required",
            runtimeId: source.runtimeId ?? null,
            contentRevision: source.contentRevision ?? null,
          });
        if (signal?.aborted) {
          const error = new Error("Renderer preparation was aborted");
          error.name = "AbortError";
          throw error;
        }
        assertUsable();
        if (epoch !== backendEpoch || renderer !== activeRenderer) {
          continue;
        }
        assertHealthyContext(null);
        return result;
      } catch (cause) {
        if (lifecycle === "disposed") assertUsable();
        if (
          lifecycle === "ready" &&
          (epoch !== backendEpoch || renderer !== activeRenderer)
        ) {
          if (signal?.aborted) throw cause;
          continue;
        }
        const contextFailure = preparationContextFailure(renderer, epoch);
        if (!contextFailure && neutralPreparationFailure(cause, signal)) {
          throw cause;
        }
        assertUsable();
        const fallback = handleFailure(contextFailure ?? cause);
        const fallbackEpoch = backendEpoch;
        try {
          const result = typeof fallback.prepare === "function"
            ? await fallback.prepare(source, { signal })
            : Object.freeze({
              schemaVersion: 1,
              executionContext: "not-required",
              runtimeId: source.runtimeId ?? null,
              contentRevision: source.contentRevision ?? null,
            });
          if (signal?.aborted) {
            const error = new Error("Renderer preparation was aborted");
            error.name = "AbortError";
            throw error;
          }
          assertUsable();
          if (
            fallbackEpoch !== backendEpoch ||
            fallback !== activeRenderer
          ) {
            continue;
          }
          assertHealthyContext(null);
          return result;
        } catch (fallbackCause) {
          if (neutralPreparationFailure(fallbackCause, signal)) {
            throw fallbackCause;
          }
          if (lifecycle === "disposed") throw fallbackCause;
          if (
            lifecycle === "ready" &&
            (fallbackEpoch !== backendEpoch || fallback !== activeRenderer)
          ) {
            continue;
          }
          return fail(fallbackCause);
        }
      }
    }
  };

  const render = (frame) => {
    assertUsable();
    if (!isObject(frame)) {
      throw new TypeError("Renderer frame must be an object");
    }
    try {
      const rendererStats = activeRenderer.render(frame);
      assertHealthyContext(rendererStats);
      return rendererStats;
    } catch (cause) {
      const fallback = handleFailure(cause);
      try {
        const rendererStats = fallback.render(frame);
        assertHealthyContext(rendererStats);
        return rendererStats;
      } catch (fallbackCause) {
        return fail(fallbackCause);
      }
    }
  };

  const capture = (...args) => {
    assertUsable();
    if (typeof activeRenderer.capture !== "function") {
      throw new TypeError(`${actualBackend} renderer does not implement capture()`);
    }
    try {
      const result = activeRenderer.capture(...args);
      assertHealthyContext(null);
      return result;
    } catch (cause) {
      const fallback = handleFailure(cause);
      if (typeof fallback.capture !== "function") {
        return fail(new TypeError(
          `${CANVAS_BACKEND} renderer does not implement capture()`,
        ));
      }
      try {
        const result = fallback.capture(...args);
        assertHealthyContext(null);
        return result;
      } catch (fallbackCause) {
        return fail(fallbackCause);
      }
    }
  };

  const dispose = () => {
    if (lifecycle === "disposed") return;
    lifecycle = "disposed";
    backendEpoch += 1;
    terminalFailure = null;
    disposeActiveRenderer();
  };

  return Object.freeze({
    ready,
    prepare,
    resize,
    render,
    capture,
    getStatus,
    dispose,
  });
}
