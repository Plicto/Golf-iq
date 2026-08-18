import { RENDERER_BACKENDS } from "./renderer-probe-contract.js";

export const RENDERER_RELEASE_POLICY_SCHEMA_VERSION = 1;

export const RENDERER_RELEASE_POLICY = Object.freeze({
  schemaVersion: RENDERER_RELEASE_POLICY_SCHEMA_VERSION,
  defaultBackend: "canvas2d",
  candidateBackend: "webgl2-hybrid",
  candidateStatus: "physical-device-evidence-required",
});

export function resolveRequestedRendererBackend(candidate) {
  return RENDERER_BACKENDS.includes(candidate)
    ? candidate
    : RENDERER_RELEASE_POLICY.defaultBackend;
}
