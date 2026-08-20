"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ClubId } from "./game-engine.ts";
import {
  createImpactStrokeGeometry,
  createImpactStrokeSession,
  createPuttStrokeGeometry,
  continuePuttFollowThrough,
  impactStrokeClubLabel,
  impactStrokeModeForClub,
  impactStrokeRail,
  impactStrokeStrikeLabel,
  impactStrokeTargetPoint,
  moveImpactStroke,
  pauseImpactStroke,
  puttFollowThroughComplete,
  type ImpactStrokeGeometry,
  type ImpactStrokeSession,
  type ImpactStrokeShape,
  type SwingDelivery,
} from "./impact-stroke.ts";

type ImpactStrokeProps = Readonly<{
  club: ClubId;
  shape: ImpactStrokeShape;
  plannedBackswingPixels: number;
  targetLabel: string;
  disabled?: boolean;
  onImpact: (delivery: SwingDelivery) => void;
  onCancel: () => void;
}>;

type ActivePointer = Readonly<{
  id: number;
  pointerStart: Readonly<{ x: number; y: number }>;
  gripStart: Readonly<{ x: number; y: number }>;
}>;

const addressAsset = (club: ClubId) => {
  if (club === "Putter") return "/assets/impact-stroke/putter-address.svg";
  if (club === "Driver") return "/assets/impact-stroke/driver-head.png";
  if (club === "3 wood") return "/assets/impact-stroke/fairway-head.png";
  return "/assets/impact-stroke/iron-head.png";
};

const clubFamily = (club: ClubId) =>
  club === "Putter"
    ? "putter"
    : club === "Driver"
      ? "driver"
      : club === "3 wood"
        ? "fairway"
        : "iron";

const faceAsset = (club: ClubId) => {
  if (club === "Putter") return "/assets/impact-stroke/putter-face.svg";
  if (club === "Driver") return "/assets/impact-stroke/wood-face.svg";
  if (club === "3 wood") return "/assets/impact-stroke/fairway-wood-face.svg";
  return "/assets/impact-stroke/iron-face.svg";
};

const releaseCapturedPointer = (
  element: HTMLButtonElement | null,
  pointerId: number,
) => {
  try {
    if (element?.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    return;
  }
};

const vibrateAtImpact = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    return;
  }
};

export default function ImpactStroke({
  club,
  shape,
  plannedBackswingPixels,
  targetLabel,
  disabled = false,
  onImpact,
  onCancel,
}: ImpactStrokeProps) {
  const mode = impactStrokeModeForClub(club);
  const [geometry, setGeometry] = useState<ImpactStrokeGeometry | null>(null);
  const [status, setStatus] = useState("GRIP THE CLUB · PULL BACK");
  const [delivery, setDelivery] = useState<SwingDelivery | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const clubRef = useRef<HTMLDivElement | null>(null);
  const gripRef = useRef<HTMLButtonElement | null>(null);
  const sessionRef = useRef<ImpactStrokeSession | null>(null);
  const pointerRef = useRef<ActivePointer | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingPaintRef = useRef<ImpactStrokeSession | null>(null);
  const impactSentRef = useRef(false);
  const geometryReadyRef = useRef(false);

  const paintSession = useCallback((session: ImpactStrokeSession) => {
    const grip = session.grip;
    if (clubRef.current) {
      clubRef.current.style.transform =
        `translate3d(${grip.x - 10}px, ${grip.y - 100}px, 0)`;
    }
    if (gripRef.current) {
      gripRef.current.style.transform =
        `translate3d(${grip.x}px, ${grip.y}px, 0) translate(-50%, -50%)`;
      gripRef.current.dataset.held = String(pointerRef.current !== null);
      gripRef.current.dataset.phase = session.phase;
    }
  }, []);

  const queuePaint = useCallback((session: ImpactStrokeSession) => {
    pendingPaintRef.current = session;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingPaintRef.current;
      pendingPaintRef.current = null;
      if (pending) paintSession(pending);
    });
  }, [paintSession]);

  const commitPuttDelivery = useCallback((nextDelivery: SwingDelivery) => {
    if (impactSentRef.current) return;
    impactSentRef.current = true;
    setDelivery(nextDelivery);
    setStatus("IMPACT FROZEN · CALCULATING");
    onImpact(nextDelivery);
  }, [onImpact]);

  const pauseActivePointer = useCallback(() => {
    const active = pointerRef.current;
    if (!active) return;
    pointerRef.current = null;
    releaseCapturedPointer(gripRef.current, active.id);
    const session = sessionRef.current;
    if (!session) return;
    if (session.delivery) {
      if (mode === "putter" && puttFollowThroughComplete(session)) {
        commitPuttDelivery(session.delivery);
      } else if (mode === "putter") {
        setStatus("IMPACT HELD · REGRIP AND CONTINUE THROUGH");
      }
      return;
    }
    const paused = pauseImpactStroke(session);
    sessionRef.current = paused;
    queuePaint(paused);
    setStatus("CLUB HELD · REGRIP TO CONTINUE");
  }, [commitPuttDelivery, mode, queuePaint]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      if (geometryReadyRef.current) return;
      const bounds = stage.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      geometryReadyRef.current = true;
      setGeometry(
        mode === "putter"
          ? createPuttStrokeGeometry(
              bounds.width,
              bounds.height,
              Object.freeze({ x: bounds.width * 0.5, y: bounds.height * 0.52 }),
            )
          : createImpactStrokeGeometry(mode, bounds.width, bounds.height),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!geometry) return;
    const session = createImpactStrokeSession(mode, shape, geometry);
    sessionRef.current = session;
    queuePaint(session);
  }, [geometry, mode, queuePaint, shape]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "visible") pauseActivePointer();
    };
    window.addEventListener("blur", pauseActivePointer);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", pauseActivePointer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [pauseActivePointer]);

  const acceptMove = useCallback((clientX: number, clientY: number) => {
    const active = pointerRef.current;
    const current = sessionRef.current;
    if (!active || !current || disabled) return;
    const requestedGrip = Object.freeze({
      x: active.gripStart.x + (clientX - active.pointerStart.x),
      y: active.gripStart.y + (clientY - active.pointerStart.y),
    });
    if (current.delivery) {
      if (mode !== "putter") return;
      const followed = continuePuttFollowThrough(current, requestedGrip);
      sessionRef.current = followed;
      queuePaint(followed);
      if (puttFollowThroughComplete(followed) && followed.delivery) {
        pointerRef.current = null;
        releaseCapturedPointer(gripRef.current, active.id);
        commitPuttDelivery(followed.delivery);
      } else {
        setStatus("IMPACT · COMPLETE THE FOLLOW-THROUGH");
      }
      return;
    }
    const update = moveImpactStroke(current, requestedGrip);
    sessionRef.current = update.session;
    queuePaint(update.session);
    if (!update.impact || impactSentRef.current) return;
    vibrateAtImpact();
    if (mode === "putter") {
      if (puttFollowThroughComplete(update.session)) {
        pointerRef.current = null;
        releaseCapturedPointer(gripRef.current, active.id);
        commitPuttDelivery(update.impact);
        return;
      }
      setDelivery(update.impact);
      setStatus("IMPACT · KEEP MOVING THROUGH");
      return;
    }
    setDelivery(update.impact);
    impactSentRef.current = true;
    const activePointer = pointerRef.current;
    pointerRef.current = null;
    if (activePointer) {
      releaseCapturedPointer(gripRef.current, activePointer.id);
    }
    setStatus("IMPACT FROZEN · CALCULATING");
    onImpact(update.impact);
  }, [commitPuttDelivery, disabled, mode, onImpact, queuePaint]);

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (
      disabled ||
      pointerRef.current ||
      !session ||
      (session.delivery && mode !== "putter")
    ) return;
    event.preventDefault();
    pointerRef.current = Object.freeze({
      id: event.pointerId,
      pointerStart: Object.freeze({ x: event.clientX, y: event.clientY }),
      gripStart: session.grip,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.held = "true";
    setStatus("1:1 GRIP · POSITION, NOT SPEED");
  };

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.id !== event.pointerId || disabled) return;
    event.preventDefault();
    const nativeEvent = event.nativeEvent as PointerEvent;
    const coalesced = typeof nativeEvent.getCoalescedEvents === "function"
      ? nativeEvent.getCoalescedEvents()
      : [];
    for (const sample of coalesced) {
      acceptMove(sample.clientX, sample.clientY);
      if (sessionRef.current?.delivery && mode !== "putter") break;
    }
    const lastSample = coalesced.at(-1);
    if (
      (!sessionRef.current?.delivery || mode === "putter") &&
      (
        !lastSample ||
        lastSample.clientX !== nativeEvent.clientX ||
        lastSample.clientY !== nativeEvent.clientY
      )
    ) {
      acceptMove(nativeEvent.clientX, nativeEvent.clientY);
    }
  };

  const pausePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    pointerRef.current = null;
    releaseCapturedPointer(event.currentTarget, event.pointerId);
    const session = sessionRef.current;
    if (!session) return;
    if (session.delivery) {
      if (mode === "putter" && puttFollowThroughComplete(session)) {
        commitPuttDelivery(session.delivery);
      } else if (mode === "putter") {
        setStatus("IMPACT HELD · REGRIP AND CONTINUE THROUGH");
      }
      return;
    }
    const paused = pauseImpactStroke(session);
    sessionRef.current = paused;
    queuePaint(paused);
    setStatus("CLUB HELD · REGRIP TO CONTINUE");
  };

  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    event.preventDefault();
    acceptMove(event.clientX, event.clientY);
    const session = sessionRef.current;
    if (session?.delivery) {
      pointerRef.current = null;
      releaseCapturedPointer(event.currentTarget, event.pointerId);
      if (mode === "putter" && puttFollowThroughComplete(session)) {
        commitPuttDelivery(session.delivery);
      } else if (mode === "putter") {
        setStatus("IMPACT HELD · REGRIP AND CONTINUE THROUGH");
      }
      return;
    }
    pausePointer(event);
  };

  const keyboardMove = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || disabled) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    const step = event.shiftKey ? 12 : 4;
    const delta = event.key === "ArrowUp"
      ? { x: 0, y: -step }
      : event.key === "ArrowDown"
        ? { x: 0, y: step }
        : event.key === "ArrowLeft"
          ? { x: -step, y: 0 }
          : event.key === "ArrowRight"
            ? { x: step, y: 0 }
            : null;
    if (!delta) return;
    event.preventDefault();
    if (session.delivery) {
      if (mode !== "putter") return;
      const followed = continuePuttFollowThrough(session, Object.freeze({
        x: session.grip.x + delta.x,
        y: session.grip.y + delta.y,
      }));
      sessionRef.current = followed;
      queuePaint(followed);
      if (puttFollowThroughComplete(followed) && followed.delivery) {
        commitPuttDelivery(followed.delivery);
      } else {
        setStatus("IMPACT · COMPLETE THE FOLLOW-THROUGH");
      }
      return;
    }
    const update = moveImpactStroke(session, Object.freeze({
      x: session.grip.x + delta.x,
      y: session.grip.y + delta.y,
    }));
    sessionRef.current = update.session;
    queuePaint(update.session);
    if (!update.impact || impactSentRef.current) return;
    if (mode === "putter") {
      if (puttFollowThroughComplete(update.session)) {
        commitPuttDelivery(update.impact);
        return;
      }
      setDelivery(update.impact);
      setStatus("IMPACT · KEEP MOVING THROUGH");
      return;
    }
    setDelivery(update.impact);
    impactSentRef.current = true;
    setStatus("IMPACT FROZEN · CALCULATING");
    onImpact(update.impact);
  };

  const rail = geometry ? impactStrokeRail(geometry, mode, shape) : null;
  const target = geometry
    ? impactStrokeTargetPoint(
        geometry,
        mode,
        shape,
        plannedBackswingPixels,
      )
    : null;
  const strikeRatio = (delivery?.strikeHeelToeBasisPoints ?? 0) / 10_000;
  const roundedFace = club === "Driver" || club === "3 wood" || club === "Putter";
  const markerLeft = roundedFace
    ? 50 - strikeRatio * 32
    : 42 + strikeRatio * 22;

  return (
    <section
      className="impact-stroke"
      data-mode={mode}
      data-club={club}
      data-shape={shape}
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-stroke-heading"
      aria-describedby="impact-stroke-instruction"
      aria-busy={disabled}
    >
      <header className="impact-stroke-header">
        <button
          type="button"
          className="impact-stroke-back"
          onClick={onCancel}
          disabled={disabled || Boolean(delivery)}
        >
          BACK
        </button>
        <div>
          <span>IMPACT STROKE</span>
          <h2 id="impact-stroke-heading" ref={headingRef} tabIndex={-1}>
            {impactStrokeClubLabel(club)}
          </h2>
        </div>
        <strong>RH · {mode === "putter" ? "STRAIGHT" : "SWING PATH"}</strong>
      </header>

      <div
        ref={stageRef}
        className="impact-stroke-stage"
        data-struck={Boolean(delivery)}
      >
        {geometry && rail && target ? (
          <>
            <svg
              className="impact-stroke-guide"
              width={geometry.width}
              height={geometry.height}
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              aria-hidden="true"
            >
              <path
                className="impact-stroke-rail-shadow"
                d={`M ${rail.start.x} ${rail.start.y} L ${rail.end.x} ${rail.end.y}`}
              />
              <path
                className="impact-stroke-rail-core"
                d={`M ${rail.start.x} ${rail.start.y} L ${rail.end.x} ${rail.end.y}`}
              />
              <line
                className="impact-stroke-target-notch"
                x1={target.x - 19}
                x2={target.x + 19}
                y1={target.y}
                y2={target.y}
              />
              <line
                className="impact-stroke-impact-gate"
                x1={geometry.addressGripX - 34}
                x2={geometry.addressGripX + 34}
                y1={geometry.impactGripY}
                y2={geometry.impactGripY}
              />
            </svg>
            <div
              className="impact-stroke-target"
              style={{ left: target.x, top: target.y }}
            >
              <span>{targetLabel}</span>
            </div>
            <div
              className="impact-stroke-ball"
              style={{ left: geometry.ball.x, top: geometry.ball.y }}
              aria-hidden="true"
            ><i /></div>
            <div
              ref={clubRef}
              className="impact-stroke-club"
              data-family={clubFamily(club)}
              aria-hidden="true"
            >
              {club === "Putter" ? (
                <img
                  className="impact-stroke-club-full"
                  src={addressAsset(club)}
                  alt=""
                  draggable={false}
                />
              ) : (
                <>
                  <i className="impact-stroke-club-shaft" />
                  <img
                    className="impact-stroke-club-head"
                    src={addressAsset(club)}
                    alt=""
                    draggable={false}
                  />
                </>
              )}
            </div>
            <button
              ref={gripRef}
              type="button"
              className="impact-stroke-grip"
              disabled={disabled || Boolean(delivery && mode !== "putter")}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pausePointer}
              onLostPointerCapture={pausePointer}
              onKeyDown={keyboardMove}
              aria-label="Grip the club. Pull down for backswing and move up through the ball. Arrow keys use the same spatial rail."
            >
              <i />
            </button>
          </>
        ) : null}

        {delivery ? (
          <aside className="impact-stroke-inspector" aria-label="Frozen impact">
            <div>
              <img src={faceAsset(club)} alt="" draggable={false} />
              <i style={{ left: `${markerLeft}%` }} />
            </div>
            <span>{impactStrokeStrikeLabel(delivery.strikeHeelToeBasisPoints)}</span>
            <strong>{Math.round(delivery.energyBasisPoints / 100)}% ENERGY</strong>
          </aside>
        ) : null}
      </div>

      <footer className="impact-stroke-footer">
        <p id="impact-stroke-instruction">
          Pull back to the gold mark, then move through the ball. Lift early and the club stays exactly where you left it.
        </p>
        <strong aria-live="polite" aria-atomic="true">{status}</strong>
      </footer>
    </section>
  );
}
