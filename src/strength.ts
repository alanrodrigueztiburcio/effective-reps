import type { SetRecord } from "./core";
import { setTime } from "./training";
export const kg = (s: SetRecord) =>
  s.strength!.load * (s.strength!.unit === "lb" ? 0.45359237 : 1);
// RIR-adjusted Epley is a heuristic, not a tested maximum. Restrict the input range.
export function estimated1RM(s: SetRecord): number | null {
  if (
    s.completed === false ||
    s.plan?.warmup ||
    !s.strength ||
    s.type !== "standard" ||
    s.reps < 1 ||
    s.rir > 4 ||
    s.reps + s.rir > 10
  )
    return null;
  return s.reps + s.rir === 1 ? kg(s) : kg(s) * (1 + (s.reps + s.rir) / 30);
}
export function improvement(
  current: SetRecord,
  history: SetRecord[],
): string | null {
  if (
    current.completed === false ||
    current.plan?.warmup ||
    !current.strength ||
    current.type !== "standard"
  )
    return null;
  const previous = history.filter(
    (s) =>
      s.completed !== false &&
      !s.plan?.warmup &&
      s.id !== current.id &&
      s.exerciseId === current.exerciseId &&
      s.sessionId !== current.sessionId &&
      setTime(s) < setTime(current) &&
      s.strength &&
      s.type === "standard" &&
      s.rir === current.rir,
  );
  // Compare with the most recent comparable set; do not cherry-pick older weak sets.
  const comparable = previous
    .filter(
      (s) => s.reps === current.reps || Math.abs(kg(s) - kg(current)) < 0.005,
    )
    .sort(
      (a, b) => setTime(b).localeCompare(setTime(a)) || b.sequence - a.sequence,
    )[0];
  if (!comparable) return null;
  if (comparable.reps === current.reps && kg(current) > kg(comparable) + 0.005)
    return "More load at matched reps and RIR";
  if (
    Math.abs(kg(comparable) - kg(current)) < 0.005 &&
    current.reps > comparable.reps
  )
    return "More reps at matched load and RIR";
  return null;
}
