import {
  attribution,
  effective,
  muscles,
  type Macrocycle,
  type Microcycle,
  type Mesocycle,
  type ScheduledWorkout,
  type Session,
  type SetRecord,
  type Settings,
  type Override,
  type Exercise,
  type Weights,
} from "./core";
import { dayNumber, validDay, validateItems } from "./training";
import { plansFor, planOf } from "./setLog";
export const addDays = (day: string, n: number) =>
  new Date((dayNumber(day) + n) * 86400000).toISOString().slice(0, 10);
export function periodDays(start: string, end: string) {
  if (!validDay(start) || !validDay(end) || start > end)
    throw new Error("Choose valid period dates.");
  return Array.from(
    { length: Math.min(3660, dayNumber(end) - dayNumber(start) + 1) },
    (_, i) => addDays(start, i),
  );
}
export function validatePeriod(p: Macrocycle | Microcycle) {
  if (
    !p ||
    typeof p.id !== "string" ||
    !p.id ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    !validDay(p.startDate) ||
    !validDay(p.endDate) ||
    p.startDate > p.endDate ||
    typeof p.createdAt !== "string" ||
    typeof p.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    !Number.isFinite(Date.parse(p.updatedAt))
  )
    throw new Error(
      "A named period needs valid start/end dates and timestamps.",
    );
  if (
    "mesocycleId" in p &&
    (typeof p.mesocycleId !== "string" || !p.mesocycleId)
  )
    throw new Error("Select a parent mesocycle.");
  if (!("mesocycleId" in p) && typeof p.goal !== "string")
    throw new Error("Invalid macrocycle goal.");
}
export function validateScheduled(w: ScheduledWorkout) {
  if (
    !w ||
    typeof w.id !== "string" ||
    !w.id ||
    !validDay(w.day) ||
    !w.snapshot ||
    typeof w.snapshot.name !== "string" ||
    !w.snapshot.name.trim() ||
    !Array.isArray(w.snapshot.items) ||
    typeof w.createdAt !== "string" ||
    typeof w.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(w.createdAt)) ||
    !Number.isFinite(Date.parse(w.updatedAt)) ||
    [w.templateId, w.microcycleId, w.mesocycleId].some(
      (id) => id !== null && (typeof id !== "string" || !id),
    )
  )
    throw new Error("Invalid scheduled workout.");
  if (w.snapshot.items.length) validateItems(w.snapshot.items);
  for (const item of w.snapshot.items) {
    if (
      !item.weights ||
      typeof item.weights !== "object" ||
      Array.isArray(item.weights) ||
      Object.entries(item.weights).some(
        ([m, n]) =>
          !muscles.includes(m as any) || !Number.isFinite(n) || n! < 0,
      )
    )
      throw new Error("Invalid scheduled muscle allocation.");
  }
}
export type Scope = {
  level: "workout" | "micro" | "meso" | "macro";
  id: string;
};
export interface PlannerData {
  macros: Macrocycle[];
  mesos: Mesocycle[];
  micros: Microcycle[];
  scheduled: ScheduledWorkout[];
  sessions: Session[];
  sets: SetRecord[];
}
export function selectScope(data: PlannerData, scope: Scope) {
  const mesos = new Set(
    scope.level === "macro"
      ? data.mesos.filter((m) => m.macrocycleId === scope.id).map((m) => m.id)
      : scope.level === "meso"
        ? [scope.id]
        : [],
  );
  const member = (record: {
    id: string;
    mesocycleId?: string | null;
    microcycleId?: string | null;
    scheduledWorkoutId?: string | null;
  }) =>
    scope.level === "workout"
      ? record.id === scope.id || record.scheduledWorkoutId === scope.id
      : scope.level === "micro"
        ? record.microcycleId === scope.id
        : mesos.has(record.mesocycleId || "");
  let scheduled = data.scheduled.filter(member),
    sessions = data.sessions.filter(member);
  if (scope.level === "workout") {
    const chosen = sessions[0];
    if (chosen?.scheduledWorkoutId)
      scheduled = data.scheduled.filter(
        (w) => w.id === chosen.scheduledWorkoutId,
      );
    const ids = new Set(scheduled.map((w) => w.id));
    sessions = data.sessions.filter(
      (s) => s.id === scope.id || ids.has(s.scheduledWorkoutId || ""),
    );
  }
  const ids = new Set(sessions.map((s) => s.id));
  return {
    scheduled,
    sessions,
    sets: data.sets.filter((s) => ids.has(s.sessionId)),
  };
}
export interface Exposure {
  reps: number;
  er: number;
  planReps: [number, number];
  planER: [number, number];
  missingReps: number;
  missingER: number;
}
export function repetitionRange(text: string): [number, number] | null {
  if (!text.trim()) return null;
  const values = text.split(/[-–]/).map((s) => Number(s.trim()));
  if (
    values.length > 2 ||
    values.some((n) => !Number.isInteger(n) || n < 0) ||
    (values.length === 2 && values[0] > values[1])
  )
    return null;
  return [values[0], values[1] ?? values[0]];
}
// Saved attribution is the default. Current allocation is an explicitly selected what-if view only.
export function scopeExposure(
  data: PlannerData,
  scope: Scope,
  settings: Settings,
  overrides: Override[],
  exercises: Exercise[],
  currentAllocation = false,
) {
  const scoped = selectScope(data, scope),
    totals: Record<string, Exposure> = {};
  const entry = (m: string) =>
    (totals[m] ||= {
      reps: 0,
      er: 0,
      planReps: [0, 0],
      planER: [0, 0],
      missingReps: 0,
      missingER: 0,
    });
  const allocate = (id: string, saved: Weights, exercise?: Exercise) => {
    const ex = exercise || exercises.find((e) => e.id === id);
    return currentAllocation && ex
      ? attribution(
          ex,
          settings,
          overrides.find((o) => o.exerciseId === id),
        )
      : saved;
  };
  const planned: {
    exerciseId: string;
    weights: Weights;
    plan: ReturnType<typeof planOf>;
    exercise?: Exercise;
  }[] = [];
  for (const w of scoped.scheduled)
    for (const item of w.snapshot.items)
      for (const plan of plansFor(item))
        planned.push({
          exerciseId: item.exercise.id,
          weights: item.weights,
          exercise: item.exercise,
          plan,
        });
  for (const session of scoped.sessions)
    if (!session.scheduledWorkoutId) {
      const rows = scoped.sets.filter((s) => s.sessionId === session.id);
      // Legacy actuals without a saved target remain unknown, never inferred from actual repetitions.
      for (const s of rows)
        planned.push({
          exerciseId: s.exerciseId,
          weights: s.weights,
          plan: s.plan || {
            ...planOf(s),
            targetReps: "",
            targetRir: undefined,
          },
        });
    }
  for (const row of planned) {
    const range = repetitionRange(row.plan.targetReps),
      rir = row.plan.targetRir;
    for (const [m, weight] of Object.entries(
      allocate(row.exerciseId, row.weights, row.exercise),
    )) {
      if (!weight) continue;
      const n = entry(m);
      if (range) {
        n.planReps[0] += range[0] * weight;
        n.planReps[1] += range[1] * weight;
      } else n.missingReps++;
      if (range && rir !== undefined) {
        n.planER[0] += effective(range[0], rir) * weight;
        n.planER[1] += effective(range[1], rir) * weight;
      } else n.missingER++;
      // No later-bout targets exist in SetPlan; activation-only ER is a partial estimate.
      if (row.plan.restPause) {
        n.missingReps++;
        n.missingER++;
      }
    }
  }
  for (const s of scoped.sets.filter((s) => s.completed !== false))
    for (const [m, weight] of Object.entries(
      allocate(s.exerciseId, s.weights),
    )) {
      if (!weight) continue;
      const n = entry(m);
      n.reps += (s.reps + s.miniReps) * weight;
      n.er += s.effectiveReps * weight;
    }
  return { totals, planned, ...scoped };
}
