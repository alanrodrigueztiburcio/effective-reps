import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import {
  alternatingSets,
  duplicateSets,
  moveExercise,
  resizePlans,
  setLabels,
} from "./workoutOrder";
import { blankPlan, normalizeSet, plannedSet } from "./setLog";
import { defaults, type Exercise, type Session } from "./core";
import {
  Database,
  exportBackup,
  restoreBackup,
  startSession,
  validateBackup,
} from "./db";
import { improvement } from "./strength";
const date = "2026-10-08T12:00:00Z";
const session: Session = {
  id: "s",
  startedAt: date,
  createdAt: date,
  updatedAt: date,
  status: "active",
  completedAt: null,
};
const ex: Exercise = {
  id: "curl",
  name: "Curl",
  primaryMuscles: ["biceps"],
  secondaryMuscles: [],
  category: "strength",
  force: null,
  mechanic: null,
  equipment: null,
  level: "custom",
  instructions: [],
  images: [],
};
const row = (group: string, n: number) =>
  plannedSet(session, ex, blankPlan(), n, defaults, undefined, group);
it("moves whole exercises without modifying actual inputs, history or attribution", () => {
  const a = row("a", 1),
    b = row("b", 3),
    c = row("c", 4),
    a2 = normalizeSet({
      ...row("a", 2),
      completed: true,
      bouts: [5],
      actualRir: 0,
    });
  const original = [a, a2, b, c],
    moved = moveExercise(original, "c", "a");
  expect(moved.map((s) => s.id)).toEqual([c, a, a2, b].map((s) => s.id));
  expect(moved.find((s) => s.id === a2.id)).toEqual(a2);
  expect(original[0]).toBe(a);
});
it("converts only blank plans to L/R, copies pairs and preserves completed unsided sets", () => {
  const done = normalizeSet({
      ...row("a", 1),
      completed: true,
      bouts: [5],
      actualRir: 0,
    }),
    blank = row("a", 2);
  const alternating = alternatingSets([done, blank], "a");
  expect(alternating[0]).toEqual(done);
  expect([...setLabels(alternating).values()]).toEqual(["1", "2L", "2R"]);
  const copied = duplicateSets(alternating, alternating[2]);
  expect([...setLabels(copied).values()]).toEqual([
    "1",
    "2L",
    "2R",
    "3L",
    "3R",
  ]);
  expect(copied[3].plan?.pairId).not.toBe(copied[1].plan?.pairId);
  expect(copied[3].actualRir).toBeNull();
  const plans = resizePlans(
    alternating.slice(1).map((s) => s.plan!),
    4,
  );
  expect(plans.map((p) => p.side)).toEqual(["L", "R", "L", "R"]);
  expect(plans[2].pairId).not.toBe(plans[0].pairId);
});
it("never compares strength across sides or with an unsided record", () => {
  const left = normalizeSet({
    ...row("a", 1),
    completed: true,
    bouts: [5],
    actualRir: 1,
    plan: {
      ...blankPlan(),
      loadText: "20",
      trackStrength: true,
      side: "L",
      pairId: "p",
    },
  });
  const later = {
    ...left,
    id: "new",
    sessionId: "new",
    timestamp: "2026-10-09T12:00:00Z",
    performedAt: "2026-10-09T12:00:00Z",
    strength: { load: 25, unit: "lb" as const },
  };
  expect(improvement(later, [left])).toBe("More load at matched reps and RIR");
  expect(
    improvement({ ...later, plan: { ...later.plan!, side: "R" } }, [left]),
  ).toBeNull();
  expect(
    improvement(
      {
        ...later,
        plan: { ...later.plan!, side: undefined, pairId: undefined },
      },
      [left],
    ),
  ).toBeNull();
});
it("retains supersets and L/R plans through template starts, backup restore and snapshot isolation", async () => {
  const db = new Database(crypto.randomUUID()),
    copy = new Database(crypto.randomUUID());
  try {
    const pair = alternatingSets([row("a", 1)], "a");
    await db.templates.add({
      id: "t",
      name: "Paired",
      createdAt: date,
      updatedAt: date,
      items: [
        {
          id: "a",
          exercise: ex,
          sets: 2,
          reps: 5,
          rir: 1,
          setPlans: pair.map((s) => s.plan!),
          supersetId: "superset",
        },
        {
          id: "b",
          exercise: { ...ex, id: "press", name: "Press" },
          sets: 1,
          reps: 5,
          rir: 1,
          supersetId: "superset",
        },
      ],
    });
    const id = await startSession({ templateId: "t" }, db);
    const sets = await db.sets.where("sessionId").equals(id).sortBy("sequence");
    expect(
      sets.every((s) => s.supersetId === "superset" && s.completed === false),
    ).toBe(true);
    expect([...setLabels(sets.slice(0, 2)).values()]).toEqual(["1L", "1R"]);
    await db.templates.update("t", { name: "Changed" });
    expect((await db.sessions.get(id))?.templateSnapshot?.name).toBe("Paired");
    const backup = await exportBackup(db);
    validateBackup(backup);
    await restoreBackup(backup, "replace", copy);
    expect((await exportBackup(copy)).sets).toEqual(backup.sets);
    const bad = structuredClone(backup);
    bad.sets[0].plan!.side = "X" as "L";
    expect(() => validateBackup(bad)).toThrow();
  } finally {
    await db.delete();
    await copy.delete();
  }
});
