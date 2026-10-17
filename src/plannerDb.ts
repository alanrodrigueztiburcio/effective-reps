import { db, now, updateSessionDetails, type Database } from "./db";
import {
  attribution,
  defaults,
  type ScheduledWorkout,
  type SetPlan,
  type TemplateItem,
} from "./core";
import { plansFor, plannedSet } from "./setLog";
import { planOf } from "./setLog";
import { exerciseGroup } from "./workoutOrder";
import catalog from "./data/exercises.json";
import type { Exercise } from "./core";
import { onDate, validDay } from "./training";
import { validateScheduled } from "./planning";
async function membership(
  microcycleId: string | null,
  mesocycleId: string | null,
  database: Database,
) {
  const micro = microcycleId
    ? await database.microcycles.get(microcycleId)
    : null;
  if (microcycleId && !micro) throw new Error("Microcycle no longer exists.");
  const meso = micro?.mesocycleId || mesocycleId;
  if (meso && !(await database.mesocycles.get(meso)))
    throw new Error("Mesocycle no longer exists.");
  return { microcycleId, mesocycleId: meso };
}
export async function scheduleWorkout(
  day: string,
  templateId: string | null,
  microcycleId: string | null,
  mesocycleId: string | null,
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const template = templateId
      ? await database.templates.get(templateId)
      : null;
    if (templateId && !template) throw new Error("Template no longer exists.");
    const settings = (await database.settings.get("main")) || defaults,
      overrides = await database.overrides.toArray(),
      date = now();
    const w: ScheduledWorkout = {
      id: crypto.randomUUID(),
      day,
      templateId,
      ...(await membership(microcycleId, mesocycleId, database)),
      snapshot: {
        name: template?.name || "Blank workout",
        items: (template?.items || []).map((item) => ({
          ...structuredClone(item),
          setPlans: plansFor(item),
          weights: attribution(
            item.exercise,
            settings,
            overrides.find((o) => o.exerciseId === item.exercise.id),
          ),
        })),
      },
      createdAt: date,
      updatedAt: date,
    };
    validateScheduled(w);
    await database.scheduled.add(w);
    return w.id;
  });
}
export async function beginScheduled(id: string, database = db) {
  return database.transaction("rw", database.tables, async () => {
    const w = await database.scheduled.get(id);
    if (!w) throw new Error("Scheduled workout no longer exists.");
    const linked = await database.sessions
      .where("scheduledWorkoutId")
      .equals(id)
      .first();
    if (linked) return linked.id;
    if (await database.sessions.where("status").equals("active").first())
      throw new Error(
        "Complete the active workout before starting another. Scheduled workouts can still be edited in the planner.",
      );
    const date = now(),
      performedAt = onDate(w.day, date),
      settings = (await database.settings.get("main")) || defaults;
    const s = {
      id: crypto.randomUUID(),
      startedAt: performedAt,
      performedAt,
      performedDate: w.day,
      status: "active" as const,
      completedAt: null,
      createdAt: date,
      updatedAt: date,
      mesocycleId: w.mesocycleId,
      microcycleId: w.microcycleId,
      scheduledWorkoutId: w.id,
      templateId: w.templateId,
      templateSnapshot: {
        name: w.snapshot.name,
        items: structuredClone(w.snapshot.items),
      },
    };
    await database.sessions.add(s);
    let sequence = 0;
    for (const item of w.snapshot.items)
      for (const plan of plansFor(item))
        await database.sets.add({
          ...plannedSet(
            s,
            item.exercise,
            plan,
            ++sequence,
            settings,
            undefined,
            item.id,
            item.id,
          ),
          weights: structuredClone(item.weights),
          supersetId: item.supersetId,
        });
    return s.id;
  });
}
export async function moveScheduled(
  id: string,
  day: string,
  microcycleId: string | null,
  mesocycleId: string | null,
  copy = false,
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const source = await database.scheduled.get(id);
    if (!source) throw new Error("Workout no longer exists.");
    const w = {
      ...structuredClone(source),
      id: copy ? crypto.randomUUID() : id,
      day,
      ...(await membership(microcycleId, mesocycleId, database)),
      createdAt: copy ? now() : source.createdAt,
      updatedAt: now(),
    };
    validateScheduled(w);
    await database.scheduled.put(w);
    return w.id;
  });
}
export async function editScheduledSet(
  id: string,
  itemId: string,
  index: number,
  plan: SetPlan,
  database = db,
) {
  await database.transaction("rw", database.tables, async () => {
    const w = await database.scheduled.get(id);
    if (!w) throw new Error("Workout no longer exists.");
    if (await database.sessions.where("scheduledWorkoutId").equals(id).first())
      throw new Error(
        "This plan is locked after logging begins. Edit actuals in the workout log or copy the plan.",
      );
    const items = w.snapshot.items.map((item) =>
      item.id !== itemId
        ? item
        : {
            ...item,
            setPlans: plansFor(item).map((p, i) => (i === index ? plan : p)),
          },
    );
    const next = { ...w, snapshot: { ...w.snapshot, items }, updatedAt: now() };
    validateScheduled(next);
    await database.scheduled.put(next);
  });
}
export async function placeSession(
  id: string,
  day: string,
  microcycleId: string | null,
  mesocycleId: string | null,
  database = db,
) {
  await database.transaction("rw", database.tables, async () => {
    if (!validDay(day)) throw new Error("Choose a valid day.");
    const parents = await membership(microcycleId, mesocycleId, database);
    await updateSessionDetails(id, day, parents.mesocycleId, database);
    await database.sessions.update(id, {
      microcycleId: parents.microcycleId,
      updatedAt: now(),
    });
  });
}
export async function copySessionPlan(
  id: string,
  day: string,
  microcycleId: string | null,
  mesocycleId: string | null,
  database = db,
) {
  return database.transaction("rw", database.tables, async () => {
    const s = await database.sessions.get(id);
    if (!s) throw new Error("Workout no longer exists.");
    if (s.scheduledWorkoutId)
      return moveScheduled(
        s.scheduledWorkoutId,
        day,
        microcycleId,
        mesocycleId,
        true,
        database,
      );
    const date = now(),
      settings = (await database.settings.get("main")) || defaults,
      rows = await database.sets
        .where("sessionId")
        .equals(id)
        .sortBy("sequence");
    let items = (s.templateSnapshot?.items || []).map((item) => ({
      ...structuredClone(item),
      setPlans: plansFor(item),
      weights:
        rows.find((r) => r.templateItemId === item.id)?.weights ||
        attribution(item.exercise, settings),
    }));
    if (rows.length) {
      const definitions = [
        ...(catalog as Exercise[]),
        ...(await database.custom.toArray()),
      ];
      items = [...new Set(rows.map(exerciseGroup))].map((group) => {
        const sets = rows.filter((r) => exerciseGroup(r) === group),
          first = sets[0];
        const ex =
          s.templateSnapshot?.items.find(
            (i) => i.exercise.id === first.exerciseId,
          )?.exercise || definitions.find((e) => e.id === first.exerciseId);
        if (!ex)
          throw new Error(
            "Exercise definition is missing; restore it before copying this workout plan.",
          );
        return {
          id: crypto.randomUUID(),
          exercise: { ...structuredClone(ex), name: first.exerciseName },
          sets: sets.length,
          reps: 1,
          rir: 0,
          setPlans: sets.map((r) => structuredClone(planOf(r))),
          supersetId: first.supersetId,
          weights: structuredClone(first.weights),
        };
      });
    }
    const w: ScheduledWorkout = {
      id: crypto.randomUUID(),
      day,
      templateId: s.templateId || null,
      ...(await membership(microcycleId, mesocycleId, database)),
      snapshot: {
        name: s.templateSnapshot?.name || "Copied workout plan",
        items,
      },
      createdAt: date,
      updatedAt: date,
    };
    validateScheduled(w);
    await database.scheduled.add(w);
    return w.id;
  });
}
