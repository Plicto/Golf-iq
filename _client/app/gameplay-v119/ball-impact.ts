import type { BallState, ClubId, ShotTrajectory } from "./game-engine.ts";

export type BallImpactHeight = "low" | "neutral" | "high";

export const BALL_IMPACT_HEIGHTS: readonly BallImpactHeight[] = Object.freeze([
  "low",
  "neutral",
  "high",
]);

export type BallLieVisual = Readonly<{
  surface: BallState["lie"];
  teeHeight: "high" | "medium" | "low" | null;
}>;

export function ballLieVisual(
  ball: BallState,
  club: ClubId,
): BallLieVisual {
  const teeHeight = ball.lie !== "tee"
    ? null
    : club === "Driver"
      ? "high"
      : club === "3 wood"
        ? "medium"
        : "low";
  return Object.freeze({ surface: ball.lie, teeHeight });
}

export function ballImpactFromMarkerPercent(
  markerPercent: number,
): BallImpactHeight {
  if (markerPercent < 40) return "low";
  if (markerPercent > 60) return "high";
  return "neutral";
}

export function trajectoryForBallImpact(
  impact: BallImpactHeight,
  ball: BallState,
): ShotTrajectory {
  const shortGame = ball.lie !== "tee" && ball.remainingMeters <= 45;
  if (shortGame) {
    if (impact === "low") return "BumpAndRun";
    if (impact === "high") return "Flop";
    return "High";
  }
  if (impact === "low") return "Low";
  if (impact === "high") return "High";
  return "Standard";
}

export function ballImpactRead(
  impact: BallImpactHeight,
  ball: BallState,
) {
  const trajectory = trajectoryForBallImpact(impact, ball);
  if (trajectory === "BumpAndRun") {
    return Object.freeze({ flight: "Low", spin: "Release", markerPercent: 29 });
  }
  if (trajectory === "Flop") {
    return Object.freeze({ flight: "Flop", spin: "Max spin", markerPercent: 71 });
  }
  if (impact === "low") {
    return Object.freeze({ flight: "Low", spin: "Less spin", markerPercent: 29 });
  }
  if (impact === "high") {
    return Object.freeze({ flight: "High", spin: "More spin", markerPercent: 71 });
  }
  return Object.freeze({ flight: "Stock", spin: "Stock spin", markerPercent: 50 });
}
