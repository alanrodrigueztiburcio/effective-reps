import {
  attribution,
  effective,
  type Exercise,
  type Override,
  type Session,
  type SetPlan,
  type SetRecord,
  type Settings,
  type TemplateItem,
} from "./core";
import { onDate, sessionDay } from "./training";
export const blankPlan = (): SetPlan => ({
  loadText: "",
  unit: "lb",
  targetReps: "",
  warmup: false,
  restPause: false,
  trackStrength: false,
  restSeconds: 240,
});
export function plansFor(item: TemplateItem): SetPlan[] {
  return (
    item.setPlans ||
    Array.from({ length: item.sets }, () => ({
      ...blankPlan(),
      targetReps: String(item.reps),
      targetRir: item.rir,
    }))
  );
}
export function validatePlan(p: SetPlan) {
  if (
    !p ||
    typeof p.loadText !== "string" ||
    !/^(?:\d+(?:\.\d+)?|BW(?:\s*[+-]\s*\d+(?:\.\d+)?)?)?$/i.test(
      p.loadText.trim(),
    ) ||
    typeof p.targetReps !== "string" ||
    !/^(?:\d+(?:\s*[-–]\s*\d+)?)?$/.test(p.targetReps.trim()) ||
    !["lb", "kg"].includes(p.unit) ||
    !Number.isInteger(p.restSeconds) ||
    p.restSeconds < 0 ||
    p.restSeconds > 86400 ||
    ![p.warmup, p.restPause, p.trackStrength].every(
      (x) => typeof x === "boolean",
    ) ||
    (p.targetRir !== undefined &&
      (!Number.isFinite(p.targetRir) || p.targetRir < 0))
  )
    throw new Error(
      "Use a numeric load or BW / BW + 20; target reps such as 5 or 2–4; and a nonnegative rest duration.",
    );
  const range = p.targetReps.split(/[-–]/).map(Number);
  if (range.length === 2 && range[0] > range[1])
    throw new Error("Target rep range must increase.");
}
export function plannedSet(
  session: Session,
  ex: Exercise,
  plan: SetPlan,
  sequence: number,
  settings: Settings,
  override?: Override,
  groupId = ex.id,
  templateItemId?: string,
): SetRecord {
  validatePlan(plan);
  const createdAt = new Date().toISOString(),
    performedAt = onDate(sessionDay(session), createdAt);
  return normalizeSet({
    id: crypto.randomUUID(),
    sessionId: session.id,
    exerciseId: ex.id,
    exerciseName: ex.name,
    timestamp: performedAt,
    performedAt,
    createdAt,
    sequence,
    type: plan.restPause ? "rest-pause" : "standard",
    reps: 0,
    miniReps: 0,
    rir: 0,
    effectiveReps: 0,
    weights: attribution(ex, settings, override),
    calculationVersion: "1",
    plan: structuredClone(plan),
    completed: false,
    bouts: [],
    actualRir: null,
    groupId,
    templateItemId,
  });
}
export function planOf(s: SetRecord): SetPlan {
  return (
    s.plan || {
      ...blankPlan(),
      loadText: s.strength ? String(s.strength.load) : "",
      unit: s.strength?.unit || "lb",
      restPause: s.type === "rest-pause",
      trackStrength: !!s.strength,
    }
  );
}
export function normalizeSet(s: SetRecord): SetRecord {
  const p = planOf(s);
  validatePlan(p);
  const bouts =
    s.bouts ?? (s.type === "rest-pause" ? [s.reps, s.miniReps] : [s.reps]);
  const rir = s.actualRir === undefined ? s.rir : s.actualRir;
  if (
    !Array.isArray(bouts) ||
    bouts.some((x) => !Number.isInteger(x) || x < 0) ||
    (!p.restPause && bouts.length > 1) ||
    (rir !== null && (!Number.isFinite(rir) || rir < 0))
  )
    throw new Error(
      "Enter whole repetitions (9,5,3 for rest-pause) and nonnegative RIR.",
    );
  if (s.completed !== false && (!bouts.length || rir === null))
    throw new Error("Enter actual reps and RIR before completing this set.");
  const reps = bouts[0] || 0,
    miniReps = p.restPause ? bouts.slice(1).reduce((n, x) => n + x, 0) : 0;
  const numeric = Number(p.loadText);
  return {
    ...s,
    completed: s.completed !== false,
    plan: p,
    bouts,
    actualRir: rir,
    type: p.restPause ? "rest-pause" : "standard",
    reps,
    miniReps,
    rir: rir ?? 0,
    effectiveReps:
      s.completed === false
        ? 0
        : effective(
            reps,
            rir!,
            miniReps,
            p.restPause ? "rest-pause" : "standard",
          ),
    strength:
      p.trackStrength &&
      p.loadText.trim() !== "" &&
      Number.isFinite(numeric) &&
      numeric > 0
        ? { load: numeric, unit: p.unit }
        : undefined,
  };
}
