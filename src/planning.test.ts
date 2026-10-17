import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, expect, it } from "vitest";
import {
  attribution,
  defaults,
  type Exercise,
  type Macrocycle,
  type Mesocycle,
  type Microcycle,
  type SetRecord,
} from "./core";
import { Database, exportBackup, restoreBackup, validateBackup } from "./db";
import {
  beginScheduled,
  editScheduledSet,
  moveScheduled,
  placeSession,
  scheduleWorkout,
  copySessionPlan,
} from "./plannerDb";
import {
  addDays,
  periodDays,
  scopeExposure,
  selectScope,
  type PlannerData,
} from "./planning";
import { blankPlan, normalizeSet } from "./setLog";
import { mergeSnapshots } from "./syncMerge";
const date = "2026-10-01T12:00:00Z",
  ex: Exercise = {
    id: "bench",
    name: "Bench",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps"],
    category: "strength",
    level: "custom",
    mechanic: null,
    force: null,
    equipment: null,
    instructions: [],
    images: [],
  };
const macro: Macrocycle = {
  id: "macro",
  name: "Annual",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  goal: "Strength",
  createdAt: date,
  updatedAt: date,
};
const meso: Mesocycle = {
  id: "meso",
  macrocycleId: "macro",
  name: "Strength",
  startDate: "2026-10-01",
  endDate: "2026-11-01",
  goal: "",
  templateIds: ["t"],
  createdAt: date,
  updatedAt: date,
};
const micro: Microcycle = {
  id: "micro",
  mesocycleId: "meso",
  name: "Nine days",
  startDate: "2026-10-01",
  endDate: "2026-10-09",
  createdAt: date,
  updatedAt: date,
};
const databases: Database[] = [];
afterEach(async () => {
  for (const d of databases) await d.delete();
  databases.length = 0;
});
async function fixture() {
  const d = new Database(crypto.randomUUID());
  databases.push(d);
  await d.macrocycles.add(macro);
  await d.mesocycles.add(meso);
  await d.microcycles.add(micro);
  await d.microcycles.add({
    ...micro,
    id: "micro2",
    name: "Next",
    startDate: "2026-10-10",
    endDate: "2026-10-16",
  });
  await d.templates.add({
    id: "t",
    name: "Upper",
    createdAt: date,
    updatedAt: date,
    items: [
      {
        id: "item",
        exercise: ex,
        sets: 1,
        reps: 2,
        rir: 1,
        setPlans: [
          {
            ...blankPlan(),
            loadText: "100",
            targetReps: "2–4",
            targetRir: 1,
            trackStrength: true,
          },
        ],
      },
    ],
  });
  return d;
}
async function data(d: Database): Promise<PlannerData> {
  const b = await exportBackup(d);
  return {
    macros: b.macrocycles!,
    mesos: b.mesocycles!,
    micros: b.microcycles!,
    scheduled: b.scheduled!,
    sessions: b.sessions,
    sets: b.sets,
  };
}
it("uses explicit nine-day microcycles and real calendar dates across DST", () => {
  expect(periodDays(micro.startDate, micro.endDate)).toHaveLength(9);
  expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
});
it("upgrades a real version-2 database without rewriting existing sessions, flags or attribution", async () => {
  const name = crypto.randomUUID(),
    old = new Dexie(name);
  old
    .version(2)
    .stores({
      sessions: "id,status,startedAt,performedDate,mesocycleId,templateId",
      sets: "id,sessionId,[sessionId+sequence]",
      custom: "id,name",
      overrides: "exerciseId",
      settings: "id",
      templates: "id,name",
      mesocycles: "id,startDate,endDate",
    });
  const session = {
    id: "old",
    startedAt: date,
    createdAt: date,
    updatedAt: date,
    status: "completed",
    completedAt: date,
  };
  const set: SetRecord = {
    id: "set",
    sessionId: "old",
    exerciseId: ex.id,
    exerciseName: ex.name,
    sequence: 1,
    timestamp: date,
    type: "standard",
    reps: 3,
    miniReps: 0,
    rir: 0,
    effectiveReps: 3,
    weights: { chest: 1, triceps: 0.5 },
    calculationVersion: "1",
  };
  await old.table("sessions").add(session);
  await old.table("sets").add(set);
  old.close();
  const current = new Database(name);
  databases.push(current);
  await current.open();
  expect(await current.sessions.get("old")).toEqual(session);
  expect(await current.sets.get("set")).toEqual(set);
  expect(await current.scheduled.count()).toBe(0);
  expect(await current.microcycles.count()).toBe(0);
});
it("copies an unscheduled workout from its stored targets, never actual reps or RIR", async () => {
  const d = await fixture();
  await d.custom.add({ ...ex, id: "custom:bench" });
  const session = {
    id: "adhoc",
    startedAt: date,
    performedDate: "2026-10-02",
    createdAt: date,
    updatedAt: date,
    status: "completed" as const,
    completedAt: date,
  };
  await d.sessions.add(session);
  await d.sets.add(
    normalizeSet({
      id: "raw",
      sessionId: session.id,
      exerciseId: "custom:bench",
      exerciseName: ex.name,
      sequence: 1,
      timestamp: date,
      type: "standard",
      reps: 3,
      miniReps: 0,
      rir: 0,
      effectiveReps: 3,
      weights: { chest: 1 },
      calculationVersion: "1",
      completed: true,
      bouts: [3],
      actualRir: 0,
      plan: { ...blankPlan(), targetReps: "8–10", targetRir: 2 },
    }),
  );
  const id = await copySessionPlan(
      session.id,
      "2026-10-12",
      "micro2",
      "meso",
      d,
    ),
    w = (await d.scheduled.get(id))!;
  expect(w.snapshot.items[0].setPlans![0].targetReps).toBe("8–10");
  expect(w.snapshot.items[0].setPlans![0].targetRir).toBe(2);
  expect((await d.sets.get("raw"))!.reps).toBe(3);
  expect(await d.sessions.count()).toBe(1);
});
it("keeps range targets, weighted total reps and ER distinct from actual performance", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d);
  let out = scopeExposure(
    await data(d),
    { level: "micro", id: "micro" },
    defaults,
    [],
    [ex],
  );
  expect(out.totals.chest.planReps).toEqual([2, 4]);
  expect(out.totals.chest.planER).toEqual([2, 4]);
  expect(out.totals.chest.er).toBe(0);
  expect(out.totals.triceps.planER).toEqual([1, 2]);
  const logged = await beginScheduled(id, d),
    row = (await d.sets.toArray())[0];
  await d.sets.put(
    normalizeSet({ ...row, completed: true, bouts: [3], actualRir: 0 }),
  );
  out = scopeExposure(
    await data(d),
    { level: "workout", id },
    defaults,
    [],
    [ex],
  );
  expect(out.totals.chest.er).toBe(3);
  expect(out.totals.chest.reps).toBe(3);
  expect(out.sessions[0].status).toBe("active");
  expect(out.totals.chest.planReps).toEqual([2, 4]);
  expect((await d.sessions.get(logged))?.createdAt).not.toBe(
    (await d.sessions.get(logged))?.performedAt,
  );
});
it("snapshots plans and attribution independently from templates and locks begun plans", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d);
  await d.templates.update("t", { name: "Changed" });
  await editScheduledSet(
    id,
    "item",
    0,
    { ...blankPlan(), targetReps: "5", targetRir: 0 },
    d,
  );
  const session = await beginScheduled(id, d);
  expect((await d.scheduled.get(id))!.snapshot.name).toBe("Upper");
  expect((await d.sessions.get(session))!.templateSnapshot!.name).toBe("Upper");
  expect((await d.sets.toArray())[0].bouts).toEqual([]);
  expect((await d.sets.toArray())[0].actualRir).toBeNull();
  await expect(editScheduledSet(id, "item", 0, blankPlan(), d)).rejects.toThrow(
    "locked",
  );
  expect(await beginScheduled(id, d)).toBe(session);
});
it("moves a plan without retiming or reassigning linked actuals; copies have no actuals", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d),
    session = await beginScheduled(id, d),
    before = await d.sessions.get(session);
  await moveScheduled(id, "2026-10-12", "micro2", "meso", false, d);
  expect(await d.sessions.get(session)).toEqual(before);
  const copy = await moveScheduled(id, "2026-10-13", "micro2", "meso", true, d);
  expect(copy).not.toBe(id);
  expect(
    await d.sessions.where("scheduledWorkoutId").equals(copy).count(),
  ).toBe(0);
  expect(
    selectScope(await data(d), { level: "micro", id: "micro" }).sessions,
  ).toHaveLength(1);
  expect(
    selectScope(await data(d), { level: "micro", id: "micro2" }).sessions,
  ).toHaveLength(0);
});
it("does not silently return another active workout when starting a scheduled workout", async () => {
  const d = await fixture(),
    a = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d),
    b = await scheduleWorkout("2026-10-03", "t", "micro", "meso", d);
  await beginScheduled(a, d);
  await expect(beginScheduled(b, d)).rejects.toThrow("active workout");
  expect(await d.sessions.count()).toBe(1);
});
it("retains explicit out-of-range members and excludes unassigned sessions from periods", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-09-15", "t", "micro", "meso", d),
    session = await beginScheduled(id, d);
  expect(
    selectScope(await data(d), { level: "macro", id: "macro" }).sessions,
  ).toHaveLength(1);
  await placeSession(session, "2026-09-16", null, null, d);
  expect(
    selectScope(await data(d), { level: "micro", id: "micro" }).sessions,
  ).toHaveLength(0);
  expect((await d.sessions.get(session))!.performedDate).toBe("2026-09-16");
});
it("labels absent RIR and unplanned rest-pause bouts unknown rather than treating them as zero", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d);
  await editScheduledSet(
    id,
    "item",
    0,
    { ...blankPlan(), targetReps: "9", restPause: true },
    d,
  );
  const n = scopeExposure(
    await data(d),
    { level: "workout", id },
    defaults,
    [],
    [ex],
  ).totals.chest;
  expect(n.missingER).toBeGreaterThan(0);
  expect(n.missingReps).toBe(1);
  expect(n.planReps).toEqual([9, 9]);
});
it("previews current attribution without changing saved snapshots", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d),
    settings = { ...defaults, secondary: 0.25 };
  const saved = scopeExposure(
      await data(d),
      { level: "workout", id },
      settings,
      [],
      [ex],
    ),
    preview = scopeExposure(
      await data(d),
      { level: "workout", id },
      settings,
      [],
      [ex],
      true,
    );
  expect(saved.totals.triceps.planER).toEqual([1, 2]);
  expect(preview.totals.triceps.planER).toEqual([0.5, 1]);
  expect((await d.scheduled.get(id))!.snapshot.items[0].weights.triceps).toBe(
    0.5,
  );
});
it("round-trips all planner tables and rejects orphan and duplicate links before writes", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d);
  await beginScheduled(id, d);
  const b = await exportBackup(d),
    dest = new Database(crypto.randomUUID());
  databases.push(dest);
  await restoreBackup(b, "replace", dest);
  expect(await exportBackup(dest)).toEqual({
    ...b,
    exportedAt: expect.any(String),
    settings: [defaults],
  });
  for (const mutate of [
    (v: any) => (v.microcycles[0].mesocycleId = "missing"),
    (v: any) => (v.mesocycles[0].macrocycleId = "missing"),
    (v: any) =>
      v.sessions.push({
        ...v.sessions[0],
        id: "dupe",
        status: "completed",
        completedAt: date,
      }),
    (v: any) => delete v.scheduled,
  ]) {
    const bad = structuredClone(b);
    mutate(bad);
    expect(() => validateBackup(bad)).toThrow();
  }
});
it("sync merges independent schedule changes, detects plan conflicts, and imports older snapshots", async () => {
  const d = await fixture(),
    id = await scheduleWorkout("2026-10-02", "t", "micro", "meso", d),
    base = await exportBackup(d),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.scheduled![0].day = "2026-10-03";
  remote.microcycles![0].name = "Other device";
  const merged = mergeSnapshots(base, local, remote);
  expect(merged.scheduled![0].day).toBe("2026-10-03");
  expect(merged.microcycles![0].name).toBe("Other device");
  remote.scheduled![0].day = "2026-10-04";
  expect(() => mergeSnapshots(base, local, remote)).toThrow("conflict");
  const old = {
    ...base,
    schemaVersion: 4 as const,
    macrocycles: undefined,
    microcycles: undefined,
    scheduled: undefined,
    mesocycles: base.mesocycles!.map((m) => ({
      ...m,
      macrocycleId: undefined,
    })),
  };
  const fresh = new Database(crypto.randomUUID());
  databases.push(fresh);
  await restoreBackup(old, "replace", fresh);
  expect(await fresh.macrocycles.count()).toBe(0);
  expect((await exportBackup(fresh)).schemaVersion).toBe(5);
});
