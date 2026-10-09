import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { aggregate, defaults, type Exercise, type Session } from "./core";
import { blankPlan, normalizeSet, plannedSet } from "./setLog";
import { estimated1RM, improvement } from "./strength";
import { Database, exportBackup, restoreBackup, validateBackup } from "./db";
const date = "2026-10-08T12:00:00Z";
const session: Session = {
  id: "w",
  startedAt: date,
  performedDate: "2026-10-08",
  status: "active",
  completedAt: null,
  createdAt: date,
  updatedAt: date,
};
const ex: Exercise = {
  id: "bench",
  name: "Bench",
  force: null,
  mechanic: null,
  equipment: null,
  level: "custom",
  primaryMuscles: ["chest"],
  secondaryMuscles: [],
  instructions: [],
  images: [],
  category: "strength",
};
it("keeps plans out of totals and requires actual RIR including zero", () => {
  const row = plannedSet(
    session,
    ex,
    { ...blankPlan(), targetReps: "2–4", loadText: "100", trackStrength: true },
    1,
    defaults,
  );
  expect(aggregate([row]).performed).toBe(0);
  expect(estimated1RM(row)).toBe(null);
  expect(() => normalizeSet({ ...row, completed: true, bouts: [4] })).toThrow(
    "actual",
  );
  const done = normalizeSet({
    ...row,
    completed: true,
    bouts: [4],
    actualRir: 0,
  });
  expect(done.effectiveReps).toBe(4);
  expect(estimated1RM(done)).toBeGreaterThan(0);
});
it("preserves ordered rest-pause bouts and counts warm-up exposure by RIR", () => {
  const row = plannedSet(
    session,
    ex,
    {
      ...blankPlan(),
      restPause: true,
      warmup: true,
      trackStrength: true,
      loadText: "100",
    },
    1,
    defaults,
  );
  const done = normalizeSet({
    ...row,
    completed: true,
    bouts: [9, 5, 3],
    actualRir: 1,
  });
  expect(done.bouts).toEqual([9, 5, 3]);
  expect(done.miniReps).toBe(8);
  expect(aggregate([done]).totals.chest).toBe(12);
  expect(estimated1RM(done)).toBe(null);
  expect(improvement(done, [])).toBe(null);
});
it("retains bodyweight notation without interpreting added weight as total load", () => {
  const done = normalizeSet({
    ...plannedSet(
      session,
      ex,
      { ...blankPlan(), loadText: "BW + 20", trackStrength: true },
      1,
      defaults,
    ),
    completed: true,
    bouts: [5],
    actualRir: 0,
  });
  expect(done.plan?.loadText).toBe("BW + 20");
  expect(done.strength).toBeUndefined();
  expect(estimated1RM(done)).toBe(null);
});
it("upgrades edited legacy sets with a completed state and preserves historical attribution", () => {
  const legacy = {
    ...plannedSet(session, ex, blankPlan(), 1, defaults),
    reps: 5,
    rir: 0,
    effectiveReps: 5,
    weights: { chest: 0.75 },
  };
  delete legacy.plan;
  delete legacy.bouts;
  delete legacy.actualRir;
  delete legacy.completed;
  const edited = normalizeSet(legacy);
  expect(edited.completed).toBe(true);
  expect(edited.bouts).toEqual([5]);
  expect(edited.weights.chest).toBe(0.75);
  const backup = {
    schemaVersion: 3,
    exportedAt: date,
    sessions: [session],
    sets: [edited],
    settings: [],
    overrides: [],
    custom: [],
    templates: [],
    mesocycles: [],
  };
  expect(() => validateBackup(backup)).not.toThrow();
});
it("round-trips blank and multi-bout rows and rejects inconsistent backups", async () => {
  const d = new Database(crypto.randomUUID()),
    other = new Database(crypto.randomUUID());
  try {
    await d.sessions.add(session);
    const row = plannedSet(
      session,
      ex,
      { ...blankPlan(), restPause: true, loadText: "100", trackStrength: true },
      1,
      defaults,
    );
    await d.sets.bulkAdd([
      row,
      normalizeSet({
        ...row,
        id: "done",
        completed: true,
        bouts: [9, 5, 3],
        actualRir: 0,
      }),
    ]);
    const backup = await exportBackup(d);
    expect(backup.schemaVersion).toBe(3);
    validateBackup(backup);
    await restoreBackup(backup, "replace", other);
    expect((await exportBackup(other)).sets).toEqual(backup.sets);
    const corrupted = structuredClone(backup);
    corrupted.sets.find((s) => s.id === "done")!.bouts = [9, 1];
    expect(() => validateBackup(corrupted)).toThrow();
  } finally {
    await d.delete();
    await other.delete();
  }
});
