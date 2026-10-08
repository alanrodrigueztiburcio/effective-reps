import {
  aggregate,
  type Mesocycle,
  type Session,
  type SetRecord,
} from "./core";
import { estimated1RM, kg } from "./strength";
import { mondayOf, sessionDay, weekOf } from "./training";
export interface ProgressGroup {
  label: string;
  sessions: Session[];
  sets: SetRecord[];
}
// Completed sessions are the observation units; plans and active workouts never inflate exposure.
export function progressGroups(
  sessions: Session[],
  sets: SetRecord[],
  blocks: Mesocycle[],
  by: "week" | "mesocycle",
  selected = "all",
): ProgressGroup[] {
  const eligible = sessions.filter(
    (s) =>
      s.status === "completed" &&
      (selected === "all" ||
        (selected === "unassigned"
          ? !s.mesocycleId
          : s.mesocycleId === selected)),
  );
  const block = blocks.find((m) => m.id === selected),
    groups = new Map<string, ProgressGroup>();
  for (const s of eligible) {
    const key =
      by === "mesocycle"
        ? s.mesocycleId || "unassigned"
        : block
          ? String(weekOf(sessionDay(s), block.startDate))
          : mondayOf(sessionDay(s));
    const label =
      by === "mesocycle"
        ? blocks.find((m) => m.id === s.mesocycleId)?.name || "No mesocycle"
        : block
          ? `Week ${key}${Number(key) < 1 || sessionDay(s) > block.endDate ? " · outside plan" : ""}`
          : `Week of ${key}`;
    const group = groups.get(key) || { label, sessions: [], sets: [] };
    group.sessions.push(s);
    groups.set(key, group);
  }
  const result = [...groups.entries()].sort((a, b) =>
    by === "week" && block
      ? Number(a[0]) - Number(b[0])
      : a[1].sessions
          .map(sessionDay)
          .sort()[0]
          .localeCompare(b[1].sessions.map(sessionDay).sort()[0]),
  );
  for (const [key, group] of result) {
    const ids = new Set(group.sessions.map((s) => s.id));
    group.sets = sets.filter((s) => ids.has(s.sessionId));
    if (by === "week" && block)
      group.label = `Week ${key}${group.sessions.some((s) => sessionDay(s) < block.startDate || sessionDay(s) > block.endDate) ? " · outside plan" : ""}`;
  }
  return result.map(([, g]) => g);
}
export function muscleSummary(group: ProgressGroup) {
  return aggregate(group.sets).totals;
}
export function exerciseSummary(group: ProgressGroup, exerciseId: string) {
  const sets = group.sets.filter(
    (s) => s.exerciseId === exerciseId && s.strength,
  );
  const estimates = sets
    .map(estimated1RM)
    .filter((n): n is number => n !== null);
  const sessions = group.sessions
    .slice()
    .sort(
      (a, b) =>
        sessionDay(a).localeCompare(sessionDay(b)) ||
        (a.performedAt || a.startedAt).localeCompare(
          b.performedAt || b.startedAt,
        ),
    );
  const estimatesBySession = sessions
    .map((session) => {
      const values = sets
        .filter((s) => s.sessionId === session.id)
        .map(estimated1RM)
        .filter((n): n is number => n !== null);
      return values.length ? Math.max(...values) : null;
    })
    .filter((n): n is number => n !== null);
  const bestLoad = sets.length
    ? sets.reduce((a, b) => (kg(a) > kg(b) ? a : b))
    : null;
  return {
    sets: sets.length,
    bestLoad,
    best1RM: estimates.length ? Math.max(...estimates) : null,
    first1RM: estimatesBySession[0] ?? null,
    last1RM: estimatesBySession.at(-1) ?? null,
  };
}
