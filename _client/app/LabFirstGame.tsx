"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ImpactStroke from "./gameplay-v119/ImpactStroke";
import {
  BALL_IMPACT_HEIGHTS,
  ballImpactFromMarkerPercent,
  ballImpactRead,
  ballLieVisual,
  trajectoryForBallImpact,
  type BallImpactHeight,
} from "./gameplay-v119/ball-impact";
import {
  faceRailToFullShotDelivery,
  faceRailToPuttDelivery,
  fullShotTargetBackswing,
  puttTargetBackswing,
  type SwingDelivery,
} from "./gameplay-v119/impact-stroke";
import {
  aimPointFor,
  liePerformanceFor,
  plannedPuttStrokeLength,
  projectedCarry,
  readGreen,
  resolveFullShot,
  resolvePutt,
  solveClubWindowSwingLengthForCarry,
  suggestedClubs,
  type BallState,
  type ClubId,
  type FullShotDecision,
  type GameOutcome,
  type PuttStrategy,
  type ShotTrajectory,
} from "./gameplay-v119/game-engine";
import {
  classifyCourseSurface,
  type CourseLayout,
} from "./gameplay-v119/course-layout";
import { GOLF_BALL_RADIUS_METERS } from "./gameplay-v119/ground-contact";
import {
  LAB_FIRST_OPENING_HOLE,
  LAB_FIRST_ROUND_METADATA,
  loadLabFirstRoundHole,
  type LabFirstRoundHole,
} from "./lab-first-course-layout";
import {
  createLabFirstPresentationTape,
  createLabFirstPuttPresentationTape,
} from "./lab-first-presentation";
import {
  labAimOffset,
  nextShotNumberAfterScore,
  scoreAfterOutcome,
  scoreToPar,
} from "./lab-first-round";

type GamePhase =
  | "flyby"
  | "ready"
  | "stroke"
  | "flight"
  | "result"
  | "hole-complete"
  | "error";

type FullShotPlan = Readonly<{
  decision: FullShotDecision;
  plannedSwingLength: number;
  targetCarryMeters: number;
  minimumCarryMeters: number;
  maximumCarryMeters: number;
  attainable: boolean;
}>;

type AimDrag = Readonly<{
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetMeters: number;
  startCarryMeters: number;
}>;

type PendingHoleTransition = Readonly<{
  requestId: string;
  contentRevision: string;
  holeIndex: number;
  hole: LabFirstRoundHole;
  completedStrokes: number;
  completedPar: number;
}>;

const PUTT_STRATEGIES: readonly PuttStrategy[] = Object.freeze([
  "Lag",
  "Balanced",
  "Attack",
]);

const PUTT_PACE_METRES = Object.freeze({
  Lag: 0.16,
  Balanced: 0.48,
  Attack: 1.04,
});

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const roundedAimOffset = (value: number) => Math.round(value * 2) / 2;

const formatAimOffset = (value: number) => {
  if (Math.abs(value) < 0.25) return "Centre line";
  return `${Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1)} m ${value < 0 ? "left" : "right"}`;
};

const titleCase = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());

const clubOptionsFor = (
  ball: BallState,
  layout: CourseLayout,
): readonly ClubId[] => {
  if (ball.lie === "tee" && ball.remainingMeters <= 185) {
    return Object.freeze(["5 iron", "6 iron", "7 iron"]);
  }
  if (ball.lie === "tee") return Object.freeze(["Driver", "3 wood"]);
  return suggestedClubs(ball, "safe-right", layout);
};

const releaseAllowance = (trajectory: ShotTrajectory) =>
  trajectory === "BumpAndRun"
    ? 6
    : trajectory === "Low"
      ? 4
      : trajectory === "Standard"
        ? 2.5
        : trajectory === "High"
          ? 1
          : trajectory === "Flop" ? 0.3 : 2;

const formatPuttLine = (degrees: number) => {
  if (Math.abs(degrees) < 0.05) return "Straight";
  return `${Math.abs(degrees).toFixed(1)}° ${degrees > 0 ? "right" : "left"}`;
};

export default function LabFirstGame() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pendingHoledRef = useRef(false);
  const pendingShotIdRef = useRef<string | null>(null);
  const pendingHoleTransitionRef = useRef<PendingHoleTransition | null>(null);
  const holeTransitionInFlightRef = useRef(false);
  const shotSequenceRef = useRef(0);
  const holeTransitionSequenceRef = useRef(0);
  const aimDragRef = useRef<AimDrag | null>(null);
  const impactDragRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<GamePhase>("flyby");
  const [holeIndex, setHoleIndex] = useState(0);
  const [completedStrokes, setCompletedStrokes] = useState(0);
  const [completedPar, setCompletedPar] = useState(0);
  const [activeHole, setActiveHole] = useState<LabFirstRoundHole>(
    LAB_FIRST_OPENING_HOLE,
  );
  const [ball, setBall] = useState<BallState>(
    () => LAB_FIRST_OPENING_HOLE.initialBallState(),
  );
  const [shotNumber, setShotNumber] = useState(1);
  const [strokes, setStrokes] = useState(0);
  const [penalties, setPenalties] = useState(0);
  const [club, setClub] = useState<ClubId>("Driver");
  const [ballImpact, setBallImpact] = useState<BallImpactHeight>("neutral");
  const [impactDragPercent, setImpactDragPercent] = useState<number | null>(null);
  const [aimOffsetMeters, setAimOffsetMeters] = useState(0);
  const [aimCarryMeters, setAimCarryMeters] = useState<number | null>(null);
  const [puttStrategy, setPuttStrategy] = useState<PuttStrategy>("Balanced");
  const [puttLineAdjustment, setPuttLineAdjustment] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<GameOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const postToLab = useCallback((message: unknown) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow
      ) {
        return;
      }
      const message = event.data;
      if (!message || typeof message.type !== "string") return;
      if (message.type === "golf-iq:flyby-complete") {
        if (holeTransitionInFlightRef.current) return;
        setPhase("ready");
      } else if (message.type === "golf-iq:hole-loaded") {
        const pending = pendingHoleTransitionRef.current;
        if (
          !pending ||
          message.requestId !== pending.requestId ||
          message.runtimeId !== pending.hole.runtimeId ||
          message.contentRevision !== pending.contentRevision
        ) {
          return;
        }
        holeTransitionInFlightRef.current = false;
        pendingHoleTransitionRef.current = null;
        setHoleIndex(pending.holeIndex);
        setActiveHole(pending.hole);
        setCompletedStrokes(pending.completedStrokes);
        setCompletedPar(pending.completedPar);
        setBall(pending.hole.initialBallState());
        setShotNumber(1);
        setStrokes(0);
        setPenalties(0);
        setClub(pending.hole.openingClub);
        setBallImpact("neutral");
        setAimOffsetMeters(0);
        setAimCarryMeters(null);
        setPuttStrategy("Balanced");
        setPuttLineAdjustment(0);
        setLastOutcome(null);
        setError(null);
        pendingHoledRef.current = false;
        pendingShotIdRef.current = null;
      } else if (message.type === "golf-iq:shot-finished") {
        if (message.shotId !== pendingShotIdRef.current) return;
        pendingShotIdRef.current = null;
        setPhase(pendingHoledRef.current ? "hole-complete" : "result");
      } else if (message.type === "golf-iq:shot-error") {
        if (message.shotId !== pendingShotIdRef.current) return;
        pendingShotIdRef.current = null;
        setError(message.message ?? "The shot could not be presented.");
        setPhase("error");
      } else if (message.type === "golf-iq:hole-error") {
        const pending = pendingHoleTransitionRef.current;
        const requestScoped = typeof message.requestId === "string";
        if (!requestScoped) {
          holeTransitionSequenceRef.current += 1;
          holeTransitionInFlightRef.current = false;
          pendingHoleTransitionRef.current = null;
          postToLab({ type: "golf-iq:cancel-hole-load" });
          setError(message.message ?? "The renderer could not continue.");
          setPhase("error");
          return;
        }
        if (
          !pending ||
          message.requestId !== pending.requestId ||
          message.runtimeId !== pending.hole.runtimeId ||
          message.contentRevision !== pending.contentRevision
        ) {
          return;
        }
        holeTransitionSequenceRef.current += 1;
        holeTransitionInFlightRef.current = false;
        pendingHoleTransitionRef.current = null;
        setError(message.message ?? "The next hole could not be loaded.");
        setPhase("error");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [postToLab]);

  const isPutting = ball.lie === "green";
  const isChip = !isPutting && ball.lie !== "tee" && ball.remainingMeters <= 45;
  const clubOptions = useMemo(
    () => clubOptionsFor(ball, activeHole.layout),
    [activeHole.layout, ball],
  );
  const trajectory = trajectoryForBallImpact(ballImpact, ball);
  const impactRead = ballImpactRead(ballImpact, ball);
  const lieRead = liePerformanceFor(ball.lie, activeHole.layout);
  const lieVisual = ballLieVisual(ball, club);

  const fullShotPlan = useMemo<FullShotPlan | null>(() => {
    if (isPutting) return null;
    const baseDecision: FullShotDecision = Object.freeze({
      club,
      route: "safe-right",
      shape: "Straight",
      trajectory,
      intent: "Balanced",
      aimOffsetMeters: labAimOffset(ball, aimOffsetMeters),
    });
    const defaultTargetCarryMeters = ball.lie === "tee"
      ? projectedCarry(ball, baseDecision, activeHole.layout)
      : Math.max(3, ball.remainingMeters - releaseAllowance(trajectory));
    const requestedCarryMeters = aimCarryMeters ?? defaultTargetCarryMeters;
    const solution = solveClubWindowSwingLengthForCarry(
      ball,
      baseDecision,
      activeHole.wind,
      requestedCarryMeters,
      activeHole.layout,
    );
    const targetCarryMeters = clamp(
      requestedCarryMeters,
      solution.minimumCarry,
      solution.maximumCarry,
    );
    return Object.freeze({
      decision: Object.freeze({
        ...baseDecision,
        targetCarryMeters,
        carryModel: "club-window",
        plannedSwingLength: solution.swingLength,
      }),
      plannedSwingLength: solution.swingLength,
      targetCarryMeters,
      minimumCarryMeters: solution.minimumCarry,
      maximumCarryMeters: solution.maximumCarry,
      attainable: solution.attainable,
    });
  }, [activeHole, aimCarryMeters, aimOffsetMeters, ball, club, isPutting, trajectory]);

  const fullShotAimPoint = useMemo(
    () => fullShotPlan
      ? aimPointFor(ball, fullShotPlan.decision, activeHole.layout)
      : null,
    [activeHole.layout, ball, fullShotPlan],
  );
  const fullShotAimSurface = useMemo(
    () => fullShotAimPoint
      ? classifyCourseSurface(activeHole.layout, fullShotAimPoint)
      : null,
    [activeHole.layout, fullShotAimPoint],
  );

  const greenRead = useMemo(
    () => isPutting
      ? readGreen(ball, puttStrategy, activeHole.layout)
      : null,
    [activeHole.layout, ball, isPutting, puttStrategy],
  );
  const committedPuttLine = Math.max(
    -12,
    Math.min(12, (greenRead?.recommendedLineDegrees ?? 0) + puttLineAdjustment),
  );
  const committedPuttPace = PUTT_PACE_METRES[puttStrategy];
  const plannedPuttLength = useMemo(
    () =>
      isPutting
        ? plannedPuttStrokeLength(
            ball,
            committedPuttPace,
            activeHole.layout,
            committedPuttLine,
          )
        : 0,
    [activeHole.layout, ball, committedPuttLine, committedPuttPace, isPutting],
  );

  const strike = useCallback(
    (swing: SwingDelivery) => {
      try {
        const outcome = isPutting
          ? resolvePutt(
              ball,
              {
                lineDegrees: committedPuttLine,
                strategy: puttStrategy,
                paceMetersPastCup: committedPuttPace,
                delivery: faceRailToPuttDelivery(swing),
              },
              activeHole.roundSeed,
              shotNumber,
              activeHole.layout,
            )
          : resolveFullShot(
              ball,
              {
                ...(fullShotPlan?.decision ?? {
                  club,
                  route: "safe-right" as const,
                  shape: "Straight" as const,
                  trajectory,
                  intent: "Balanced" as const,
                }),
                delivery: faceRailToFullShotDelivery(swing),
              },
              activeHole.wind,
              activeHole.roundSeed,
              shotNumber,
              activeHole.layout,
            );
        const presentationContext = {
          scenarioId: activeHole.compatibilityScenarioAlias,
          coordinateSpace:
            `${activeHole.label} presentation metres; shared renderer, physics and cup world`,
        };
        const tape = outcome.kind === "putt"
          ? createLabFirstPuttPresentationTape(outcome, presentationContext)
          : createLabFirstPresentationTape(outcome, presentationContext);
        shotSequenceRef.current += 1;
        const shotId = `${tape.id}:play-${shotSequenceRef.current}`;
        pendingHoledRef.current = outcome.kind === "putt" && outcome.holed;
        pendingShotIdRef.current = shotId;
        setLastOutcome(outcome);
        setBall(outcome.nextBall);
        setStrokes((current) => scoreAfterOutcome(current, outcome));
        setPenalties((current) => current + outcome.penaltyStrokes);
        setError(null);
        setPhase("flight");
        postToLab({
          type: "golf-iq:play-shot",
          shotId,
          tapeId: tape.id,
          presentation: outcome.kind === "putt" ? "putt" : "full",
          tape,
          result: {
            kind: outcome.kind,
            summary: outcome.summary,
            holed: outcome.kind === "putt" ? outcome.holed : false,
          },
        });
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The shot could not be resolved.",
        );
        setPhase("error");
      }
    },
    [
      activeHole,
      ball,
      club,
      committedPuttLine,
      committedPuttPace,
      fullShotPlan,
      isPutting,
      postToLab,
      puttStrategy,
      shotNumber,
      trajectory,
    ],
  );

  useEffect(() => {
    if (phase !== "ready") return;
    const target = isPutting
      ? activeHole.layout.pin
      : fullShotAimPoint ?? activeHole.layout.pin;
    postToLab({
      type: "golf-iq:set-address",
      presentation: isPutting ? "putt" : "full",
      position: {
        x: ball.position.x,
        y: GOLF_BALL_RADIUS_METERS,
        z: ball.position.z,
      },
      target,
      lineDegrees: isPutting ? committedPuttLine : 0,
      aimGuide: !isPutting && fullShotPlan
        ? {
            from: ball.position,
            target,
            carryMeters: fullShotPlan.targetCarryMeters,
            attainable: fullShotPlan.attainable,
          }
        : null,
    });
  }, [activeHole.layout.pin, ball, committedPuttLine, fullShotAimPoint, fullShotPlan, isPutting, phase, postToLab]);

  const advance = useCallback(() => {
    if (!lastOutcome) return;
    const nextBall = lastOutcome.nextBall;
    const nextClubs = clubOptionsFor(nextBall, activeHole.layout);
    setBall(nextBall);
    setShotNumber(nextShotNumberAfterScore(strokes));
    setClub(nextClubs[0] ?? "SW");
    setBallImpact("neutral");
    setAimOffsetMeters(0);
    setAimCarryMeters(null);
    setPuttStrategy("Balanced");
    setPuttLineAdjustment(0);
    setLastOutcome(null);
    pendingHoledRef.current = false;
    setPhase("ready");
  }, [activeHole.layout, lastOutcome, strokes]);

  const restartHole = useCallback(() => {
    holeTransitionSequenceRef.current += 1;
    holeTransitionInFlightRef.current = false;
    pendingHoleTransitionRef.current = null;
    setBall(activeHole.initialBallState());
    setShotNumber(1);
    setStrokes(0);
    setPenalties(0);
    setClub(activeHole.openingClub);
    setBallImpact("neutral");
    setAimOffsetMeters(0);
    setAimCarryMeters(null);
    setPuttStrategy("Balanced");
    setPuttLineAdjustment(0);
    setLastOutcome(null);
    setError(null);
    pendingHoledRef.current = false;
    pendingShotIdRef.current = null;
    setPhase("flyby");
    postToLab({ type: "golf-iq:restart-hole" });
  }, [activeHole, postToLab]);

  const requestRuntimeTransition = useCallback(async (
    runtimeId: string,
    nextIndex: number,
    nextCompletedStrokes: number,
    nextCompletedPar: number,
    contentRevisionOverride?: string,
  ) => {
    holeTransitionSequenceRef.current += 1;
    const transitionSequence = holeTransitionSequenceRef.current;
    const requestId = `hole-load-${transitionSequence}`;
    holeTransitionInFlightRef.current = true;
    pendingHoleTransitionRef.current = null;
    setPhase("flyby");
    try {
      const nextHole = await loadLabFirstRoundHole(runtimeId);
      if (transitionSequence !== holeTransitionSequenceRef.current) return;
      const contentRevision = contentRevisionOverride ?? nextHole.contentRevision;
      pendingHoleTransitionRef.current = Object.freeze({
        requestId,
        contentRevision,
        holeIndex: nextIndex,
        hole: nextHole,
        completedStrokes: nextCompletedStrokes,
        completedPar: nextCompletedPar,
      });
      postToLab({
        type: "golf-iq:load-hole",
        requestId,
        runtimeId: nextHole.runtimeId,
        contentRevision,
        canonicalSource: nextHole.canonicalSource,
      });
    } catch (cause) {
      if (transitionSequence !== holeTransitionSequenceRef.current) return;
      holeTransitionInFlightRef.current = false;
      setError(cause instanceof Error ? cause.message : "The next hole could not be loaded.");
      setPhase("error");
    }
  }, [postToLab]);

  const requestHoleTransition = useCallback(async (
    nextIndex: number,
    nextCompletedStrokes: number,
    nextCompletedPar: number,
    contentRevisionOverride?: string,
  ) => {
    const metadata = LAB_FIRST_ROUND_METADATA[nextIndex];
    if (!metadata) return;
    return requestRuntimeTransition(
      metadata.runtimeId,
      nextIndex,
      nextCompletedStrokes,
      nextCompletedPar,
      contentRevisionOverride,
    );
  }, [requestRuntimeTransition]);

  const startNextHole = useCallback(() => {
    void requestHoleTransition(
      holeIndex + 1,
      completedStrokes + strokes,
      completedPar + activeHole.par,
    );
  }, [activeHole.par, completedPar, completedStrokes, holeIndex, requestHoleTransition, strokes]);

  const restartRound = useCallback(() => {
    holeTransitionSequenceRef.current += 1;
    const requestId = `hole-load-${holeTransitionSequenceRef.current}`;
    holeTransitionInFlightRef.current = true;
    pendingHoleTransitionRef.current = Object.freeze({
      requestId,
      contentRevision: LAB_FIRST_ROUND_METADATA[0].contentRevision,
      holeIndex: 0,
      hole: LAB_FIRST_OPENING_HOLE,
      completedStrokes: 0,
      completedPar: 0,
    });
    setPhase("flyby");
    postToLab({
      type: "golf-iq:load-hole",
      requestId,
      runtimeId: LAB_FIRST_OPENING_HOLE.runtimeId,
      contentRevision: LAB_FIRST_ROUND_METADATA[0].contentRevision,
      canonicalSource: LAB_FIRST_OPENING_HOLE.canonicalSource,
    });
  }, [postToLab]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("labTest") !== "1") {
      return;
    }
    const contract = Object.freeze({
      requestRuntime(runtimeId: string, contentRevisionOverride?: string) {
        const nextIndex = LAB_FIRST_ROUND_METADATA.findIndex(
          (metadata) => metadata.runtimeId === runtimeId,
        );
        return requestRuntimeTransition(
          runtimeId,
          nextIndex >= 0 ? nextIndex : holeIndex,
          completedStrokes,
          completedPar,
          contentRevisionOverride,
        );
      },
      snapshot() {
        return Object.freeze({
          runtimeId: activeHole.runtimeId,
          contentRevision: activeHole.contentRevision,
          holeIndex,
          phase,
          error,
          pendingRuntimeId: pendingHoleTransitionRef.current?.hole.runtimeId ?? null,
        });
      },
    });
    const labWindow = window as Window & {
      __golfIqLabFirstRoundTest?: typeof contract;
    };
    Object.defineProperty(labWindow, "__golfIqLabFirstRoundTest", {
      configurable: true,
      value: contract,
    });
    return () => {
      if (labWindow.__golfIqLabFirstRoundTest === contract) {
        delete labWindow.__golfIqLabFirstRoundTest;
      }
    };
  }, [activeHole, completedPar, completedStrokes, error, holeIndex, phase, requestRuntimeTransition]);

  const recoverFromError = useCallback(() => {
    if (lastOutcome?.kind === "putt" && lastOutcome.holed) {
      setError(null);
      setPhase("hole-complete");
      return;
    }
    if (lastOutcome) {
      advance();
      return;
    }
    restartHole();
  }, [advance, lastOutcome, restartHole]);

  const plannedBackswingPixels = isPutting
    ? puttTargetBackswing(plannedPuttLength)
    : fullShotTargetBackswing(fullShotPlan?.plannedSwingLength ?? 1);
  const targetLabel = isPutting
    ? `${ball.remainingMeters.toFixed(1)} m · ${formatPuttLine(committedPuttLine)}`
    : `${Math.round(fullShotPlan?.targetCarryMeters ?? ball.remainingMeters)} m carry · ${titleCase(trajectory)}`;
  const visibleStrokes = phase === "flight" && lastOutcome
    ? strokes - lastOutcome.penaltyStrokes
    : strokes;
  const roundStrokes = completedStrokes + visibleStrokes;
  const roundPar = completedPar + activeHole.par;
  const isFinalHole = holeIndex === LAB_FIRST_ROUND_METADATA.length - 1;

  const beginAimDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!fullShotPlan) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      aimDragRef.current = Object.freeze({
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetMeters: aimOffsetMeters,
        startCarryMeters: fullShotPlan.targetCarryMeters,
      });
    },
    [aimOffsetMeters, fullShotPlan],
  );

  const moveAimDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = aimDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !fullShotPlan) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const lateralRange = ball.lie === "tee"
        ? activeHole.layout.aim.lateralLimit.tee
        : activeHole.layout.aim.lateralLimit.approach;
      const nextOffset = drag.startOffsetMeters +
        ((event.clientX - drag.startX) / Math.max(240, bounds.width)) * lateralRange * 2;
      const carryRange = fullShotPlan.maximumCarryMeters - fullShotPlan.minimumCarryMeters;
      const nextCarry = drag.startCarryMeters -
        ((event.clientY - drag.startY) / Math.max(220, bounds.height)) * carryRange * 1.5;
      setAimOffsetMeters(roundedAimOffset(clamp(nextOffset, -lateralRange, lateralRange)));
      setAimCarryMeters(Math.round(clamp(
        nextCarry,
        fullShotPlan.minimumCarryMeters,
        fullShotPlan.maximumCarryMeters,
      )));
    },
    [activeHole.layout.aim.lateralLimit, ball.lie, fullShotPlan],
  );

  const endAimDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (aimDragRef.current?.pointerId !== event.pointerId) return;
    aimDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const nudgeAim = useCallback(
    (lateralMeters: number, carryMeters: number) => {
      if (!fullShotPlan) return;
      const lateralRange = ball.lie === "tee"
        ? activeHole.layout.aim.lateralLimit.tee
        : activeHole.layout.aim.lateralLimit.approach;
      setAimOffsetMeters((value) => roundedAimOffset(clamp(
        value + lateralMeters,
        -lateralRange,
        lateralRange,
      )));
      setAimCarryMeters(clamp(
        Math.round(fullShotPlan.targetCarryMeters + carryMeters),
        Math.ceil(fullShotPlan.minimumCarryMeters),
        Math.floor(fullShotPlan.maximumCarryMeters),
      ));
    },
    [activeHole.layout.aim.lateralLimit, ball.lie, fullShotPlan],
  );

  const updateBallImpact = useCallback((markerPercent: number) => {
    setImpactDragPercent(markerPercent);
    setBallImpact(ballImpactFromMarkerPercent(markerPercent));
    setAimCarryMeters(null);
  }, []);

  const moveImpactToPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const markerPercent = clamp(
        ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100,
        20,
        80,
      );
      updateBallImpact(markerPercent);
    },
    [updateBallImpact],
  );

  const beginImpactDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      impactDragRef.current = event.pointerId;
      moveImpactToPointer(event);
    },
    [moveImpactToPointer],
  );

  const moveImpactDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (impactDragRef.current !== event.pointerId) return;
      moveImpactToPointer(event);
    },
    [moveImpactToPointer],
  );

  const endImpactDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (impactDragRef.current !== event.pointerId) return;
      impactDragRef.current = null;
      setImpactDragPercent(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const nudgeBallImpact = useCallback((nextIndex: number) => {
    const nextImpact = BALL_IMPACT_HEIGHTS[clamp(
      nextIndex,
      0,
      BALL_IMPACT_HEIGHTS.length - 1,
    )];
    setBallImpact(nextImpact);
    setImpactDragPercent(null);
    setAimCarryMeters(null);
  }, []);

  const lieEffectRead = lieRead.carryDeltaPercent === 0 && lieRead.spinDeltaPercent === 0
    ? "Full carry · Full spin"
    : `${lieRead.carryDeltaPercent}% carry · ${lieRead.spinDeltaPercent}% spin`;

  return (
    <main className="site-shell">
      <section className="lab-first-game" data-phase={phase}>
        <iframe
          ref={frameRef}
          className="lab-first-frame"
          src="/labs/course-presentation/index.html?game=1"
          title="Golf IQ lab-first playable round"
          onLoad={() => {
            const labTest = new URLSearchParams(window.location.search).get("labTest") === "1";
            if (labTest) {
              void requestRuntimeTransition("north-inlet", 0, 0, 0);
            } else {
              void requestHoleTransition(0, 0, 0);
            }
          }}
        />

        {phase !== "flyby" && phase !== "stroke" ? (
          <div className="lab-first-round-hud" aria-label="Hole status">
            <span>Hole {holeIndex + 1} of {LAB_FIRST_ROUND_METADATA.length} · Par {activeHole.par}</span>
            <strong>{phase === "flight" ? "In play" : lastOutcome?.kind === "putt" && lastOutcome.holed ? "Holed" : `${Math.max(0, Math.round(ball.remainingMeters))} m`}</strong>
            <small>Shot {shotNumber} · {roundStrokes} round</small>
          </div>
        ) : null}

        {phase === "flyby" ? (
          <button
            className="lab-first-skip"
            type="button"
            onClick={() => postToLab({ type: "golf-iq:skip-flyby" })}
          >
            Skip flyby
          </button>
        ) : null}

        {phase === "ready" && !isPutting && fullShotPlan ? (
          <div
            className="lab-first-aim-surface"
            role="slider"
            tabIndex={0}
            aria-label="Aim point"
            aria-valuemin={Math.ceil(fullShotPlan.minimumCarryMeters)}
            aria-valuemax={Math.floor(fullShotPlan.maximumCarryMeters)}
            aria-valuenow={Math.round(fullShotPlan.targetCarryMeters)}
            aria-valuetext={`${Math.round(fullShotPlan.targetCarryMeters)} metres carry, ${formatAimOffset(aimOffsetMeters)}, ${fullShotAimSurface ?? "course"}`}
            onPointerDown={beginAimDrag}
            onPointerMove={moveAimDrag}
            onPointerUp={endAimDrag}
            onPointerCancel={endAimDrag}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") nudgeAim(-0.5, 0);
              if (event.key === "ArrowRight") nudgeAim(0.5, 0);
              if (event.key === "ArrowUp") nudgeAim(0, 2);
              if (event.key === "ArrowDown") nudgeAim(0, -2);
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
              }
            }}
          />
        ) : null}

        {phase === "ready" ? (
          <section className="lab-first-dock lab-first-setup" aria-label="Shot setup">
            <div className="lab-first-setup-heading">
              <div className="lab-first-shot-read">
                <span>
                  {club} · {ball.lie} · {ball.lie === "tee"
                    ? "tee shot"
                    : isPutting
                      ? "putting"
                      : isChip
                        ? "short game"
                        : "approach"}
                </span>
                <strong>
                  {isPutting
                    ? greenRead?.summary
                    : `${Math.round(fullShotPlan?.targetCarryMeters ?? ball.remainingMeters)} m carry · ${formatAimOffset(aimOffsetMeters)}`}
                </strong>
                <small>
                  {isPutting
                    ? `${puttStrategy} pace · ${formatPuttLine(committedPuttLine)}`
                    : `${titleCase(fullShotAimSurface ?? "course")} · ${activeHole.wind.label}`}
                </small>
              </div>

              {!isPutting ? (
                <div className="lab-first-ball-impact" aria-label="Ball impact and lie">
                  <span>Impact · drag</span>
                  <div
                    className="lab-first-impact-scene"
                    data-lie={lieVisual.surface}
                    data-tee-height={lieVisual.teeHeight ?? undefined}
                  >
                    <span className="lab-first-impact-surface" aria-hidden="true">
                      <i /><i /><i /><i /><i />
                    </span>
                    <div
                      className="lab-first-impact-ball"
                      role="slider"
                      tabIndex={0}
                      aria-label={`Impact point on ball from ${lieRead.label.toLowerCase()}`}
                      aria-valuemin={0}
                      aria-valuemax={BALL_IMPACT_HEIGHTS.length - 1}
                      aria-valuenow={BALL_IMPACT_HEIGHTS.indexOf(ballImpact)}
                      aria-valuetext={`${impactRead.flight}, ${impactRead.spin}`}
                      onPointerDown={beginImpactDrag}
                      onPointerMove={moveImpactDrag}
                      onPointerUp={endImpactDrag}
                      onPointerCancel={endImpactDrag}
                      onLostPointerCapture={endImpactDrag}
                      onKeyDown={(event) => {
                        const currentIndex = BALL_IMPACT_HEIGHTS.indexOf(ballImpact);
                        if (event.key === "ArrowUp") nudgeBallImpact(currentIndex - 1);
                        if (event.key === "ArrowDown") nudgeBallImpact(currentIndex + 1);
                        if (event.key === "Home") nudgeBallImpact(0);
                        if (event.key === "End") nudgeBallImpact(BALL_IMPACT_HEIGHTS.length - 1);
                        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <i style={{ top: `${impactDragPercent ?? impactRead.markerPercent}%` }} />
                    </div>
                  </div>
                  <strong>{impactRead.flight}</strong>
                  <small>{impactRead.spin}</small>
                  <div className="lab-first-impact-lie">
                    <strong>{lieRead.label}</strong>
                    <small>{lieEffectRead}</small>
                  </div>
                </div>
              ) : (
                <div
                  className="lab-first-ball-impact"
                  data-static="true"
                  aria-label="Ball lie, green"
                >
                  <span>Ball lie</span>
                  <div className="lab-first-impact-scene" data-lie="green">
                    <span className="lab-first-impact-surface" aria-hidden="true">
                      <i /><i /><i /><i /><i />
                    </span>
                    <div
                      className="lab-first-impact-ball"
                      data-static="true"
                      aria-hidden="true"
                    />
                  </div>
                  <strong>Green</strong>
                  <small>Close-cut</small>
                  <div className="lab-first-impact-lie">
                    <strong>Putt</strong>
                    <small>Ball on surface</small>
                  </div>
                </div>
              )}
            </div>

            {clubOptions.length > 1 ? (
              <div className="lab-first-options" role="group" aria-label="Club">
                {clubOptions.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    data-active={candidate === club}
                    aria-pressed={candidate === club}
                    onClick={() => {
                      setClub(candidate);
                      setAimCarryMeters(null);
                    }}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            ) : null}

            {isPutting ? (
              <>
                <div className="lab-first-options" role="group" aria-label="Putt pace">
                  {PUTT_STRATEGIES.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      data-active={candidate === puttStrategy}
                      aria-pressed={candidate === puttStrategy}
                      onClick={() => setPuttStrategy(candidate)}
                    >
                      {candidate}
                    </button>
                  ))}
                </div>
                <div className="lab-first-stepper" aria-label="Putt line">
                  <button type="button" onClick={() => setPuttLineAdjustment((value) => Math.max(-7, value - 0.5))} aria-label="Move putt line half a degree left">−</button>
                  <span><small>Read + adjustment</small><strong>{formatPuttLine(committedPuttLine)}</strong></span>
                  <button type="button" onClick={() => setPuttLineAdjustment((value) => Math.min(7, value + 0.5))} aria-label="Move putt line half a degree right">+</button>
                </div>
              </>
            ) : null}

            {!isPutting && fullShotPlan ? (
              <small
                className="lab-first-plan-note"
                data-visible={!fullShotPlan.attainable}
                aria-live="polite"
              >
                Selected club cannot fully cover the planned carry.
              </small>
            ) : null}
            <button
              className="lab-first-primary"
              type="button"
              onClick={() => setPhase("stroke")}
            >
              {isPutting ? "Putt stroke" : "Impact Stroke"}
            </button>
          </section>
        ) : null}

        {phase === "flight" ? (
          <div className="lab-first-live" role="status">
            {lastOutcome?.kind === "putt" ? `Live putt · ${puttStrategy}` : `Live physics · ${club}`}
          </div>
        ) : null}

        {phase === "result" && lastOutcome ? (
          <section className="lab-first-dock lab-first-result" aria-label="Shot result">
            {lastOutcome.kind === "full" ? (
              <div className="lab-first-result-grid">
                <span><small>Carry</small><strong>{Math.round(lastOutcome.carryMeters)} m</strong></span>
                <span><small>Total</small><strong>{Math.round(lastOutcome.totalMeters)} m</strong></span>
                <span><small>Lie</small><strong>{lastOutcome.nextBall.lie}</strong></span>
              </div>
            ) : (
              <div className="lab-first-result-grid">
                <span><small>Start pace</small><strong>{lastOutcome.startSpeedMetersPerSecond.toFixed(1)} m/s</strong></span>
                <span><small>Leave</small><strong>{lastOutcome.leaveDistanceMeters.toFixed(2)} m</strong></span>
                <span><small>Result</small><strong>{lastOutcome.lipOut ? "Lip out" : "Miss"}</strong></span>
              </div>
            )}
            <p>{lastOutcome.summary}</p>
            <button className="lab-first-primary" type="button" onClick={advance}>
              {lastOutcome.nextBall.lie === "green" ? "Next putt" : "Next shot"}
            </button>
          </section>
        ) : null}

        {phase === "hole-complete" && lastOutcome?.kind === "putt" ? (
          <section className="lab-first-dock lab-first-hole-complete" aria-label="Hole complete">
            <span>{isFinalHole ? `${LAB_FIRST_ROUND_METADATA.length}-hole round complete` : `${activeHole.label} complete`}</span>
            <strong>
              {isFinalHole
                ? `${completedStrokes + strokes} strokes · ${scoreToPar(completedStrokes + strokes, roundPar)}`
                : `${strokes} strokes · ${scoreToPar(strokes, activeHole.par)}`}
            </strong>
            <p>{lastOutcome.summary}</p>
            {penalties > 0 ? <small>{penalties} penalty {penalties === 1 ? "stroke" : "strokes"}</small> : null}
            <button
              className="lab-first-primary"
              type="button"
              onClick={isFinalHole ? restartRound : startNextHole}
            >
              {isFinalHole
                ? "Play round again"
                : `Next hole · ${LAB_FIRST_ROUND_METADATA[holeIndex + 1]?.label ?? "Continue"}`}
            </button>
          </section>
        ) : null}

        {phase === "error" ? (
          <section className="lab-first-dock lab-first-error" role="alert">
            <strong>Shot interrupted</strong>
            <p>{error}</p>
            <button className="lab-first-primary" type="button" onClick={recoverFromError}>
              {lastOutcome?.kind === "putt" && lastOutcome.holed
                ? "Show completed hole"
                : lastOutcome ? "Continue from ball" : "Restart hole"}
            </button>
          </section>
        ) : null}

        {phase === "stroke" ? (
          <ImpactStroke
            club={club}
            shape="straight"
            plannedBackswingPixels={plannedBackswingPixels}
            targetLabel={targetLabel}
            onImpact={strike}
            onCancel={() => setPhase("ready")}
          />
        ) : null}
      </section>
    </main>
  );
}
