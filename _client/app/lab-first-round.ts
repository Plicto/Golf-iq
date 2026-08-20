import type { BallState, GameOutcome } from "./gameplay-v119/game-engine";

export function labAimOffset(
  ball: Pick<BallState, "lie">,
  interfaceOffsetMeters: number,
) {
  return ball.lie === "tee" ? -interfaceOffsetMeters : interfaceOffsetMeters;
}

export function scoreAfterOutcome(
  currentStrokes: number,
  outcome: Pick<GameOutcome, "penaltyStrokes">,
) {
  return currentStrokes + 1 + outcome.penaltyStrokes;
}

export function nextShotNumberAfterScore(completedStrokes: number) {
  return completedStrokes + 1;
}

export function scoreToPar(strokes: number, par: number) {
  const difference = strokes - par;
  return difference === 0 ? "E" : difference > 0 ? `+${difference}` : `${difference}`;
}
