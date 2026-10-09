import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, expect, it } from "vitest";
import {
  Database,
  exportBackup,
  restoreBackup,
  startSession,
  updateSessionDetails,
  validateBackup,
} from "./db";
import {
  defaults,
  type Exercise,
  type Mesocycle,
  type Session,
  type SetRecord,
  type WorkoutTemplate,
} from "./core";
import {
  localDate,
  mondayOf,
  onDate,
  sessionDay,
  validDay,
  weekOf,
} from "./training";
import { exerciseSummary, muscleSummary, progressGroups } from "./progress";
import { mergeSnapshots } from "./syncMerge";
const date = "2026-10-08T10:00:00Z";
const exercise: Exercise = {
  id: "bench",
  name: "Bench",
  category: "strength",
  force: null,
  level: "beginner",
  mechanic: null,
  equipment: "barbell",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps"],
  instructions: [],
  images: [],
};
const template: WorkoutTemplate = {
  id: "push",
  name: "Push",
  items: [{ id: "item", exercise, sets: 3, reps: 5, rir: 2 }],
  createdAt: date,
  updatedAt: date,
};
const block: Mesocycle = {
  id: "block",
  name: "Block A",
  startDate: "2026-09-01",
  endDate: "2026-10-12",
  goal: "Hypertrophy",
  templateIds: ["push"],
  createdAt: date,
  updatedAt: date,
};
const session = (id = "w", day = "2026-09-05"): Session => ({
  id,
  startedAt: date,
  performedAt: onDate(day, date),
  performedDate: day,
  createdAt: date,
  updatedAt: date,
  status: "completed",
  completedAt: date,
  mesocycleId: "block",
});
const set = (id = "s", sid = "w"): SetRecord => ({
  id,
  sessionId: sid,
  exerciseId: "bench",
  exerciseName: "Bench",
  timestamp: date,
  sequence: 1,
  type: "standard",
  reps: 5,
  miniReps: 0,
  rir: 2,
  effectiveReps: 3,
  weights: { chest: 1, triceps: 0.5 },
  calculationVersion: "1",
  strength: { load: 100, unit: "kg" },
});
const databases: Database[] = [];
function make() {
  const d = new Database(crypto.randomUUID());
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases) await d.delete();
  databases.length = 0;
});
async function planned() {
  const d = make();
  await d.templates.put(structuredClone(template));
  await d.mesocycles.put(structuredClone(block));
  return d;
}
it("accepts real dates and rejects impossible calendar dates", () => {
  expect(validDay("2024-02-29")).toBe(true);
  expect(validDay("2026-02-29")).toBe(false);
  expect(validDay("2026-13-01")).toBe(false);
  expect(localDate(onDate("2025-12-15", date))).toBe("2025-12-15");
});
it("calendar/block weeks remain stable across daylight saving boundaries", () => {
  expect(weekOf("2026-03-09", "2026-03-02")).toBe(2);
  expect(weekOf("2026-08-31", "2026-09-01")).toBe(0);
  expect(mondayOf("2026-10-11")).toBe("2026-10-05");
});
it("upgrades an actual version-1 database without changing workouts or calculations", async () => {
  const name = crypto.randomUUID(),
    old = new Dexie(name);
  old
    .version(1)
    .stores({
      sessions: "id,status,startedAt",
      sets: "id,sessionId,[sessionId+sequence]",
      custom: "id,name",
      overrides: "exerciseId",
      settings: "id",
    });
  const s = session();
  delete s.performedAt;
  delete s.performedDate;
  delete s.mesocycleId;
  await old.table("sessions").put(s);
  await old.table("sets").put(set());
  await old.table("settings").put(defaults);
  old.close();
  const d = new Database(name);
  databases.push(d);
  await d.open();
  expect(await d.sessions.get("w")).toEqual(s);
  expect(await d.sets.get("s")).toEqual(set());
  expect(await d.templates.count()).toBe(0);
  expect(await d.mesocycles.count()).toBe(0);
});
it("starts a backdated workout with a separate creation timestamp and independent plan snapshot", async () => {
  const d = await planned();
  const id = await startSession(
    { day: "2025-12-15", templateId: "push", mesocycleId: "block" },
    d,
  );
  const s = (await d.sessions.get(id))!;
  expect(sessionDay(s)).toBe("2025-12-15");
  expect(s.createdAt).not.toBe(s.performedAt);
  expect(s.mesocycleId).toBe("block");
  expect(s.templateSnapshot?.items[0].reps).toBe(5);
  expect(await d.sets.count()).toBe(3);
  expect((await d.sets.toArray()).every(s=>s.completed===false && s.actualRir===null && s.bouts?.length===0 && s.effectiveReps===0)).toBe(true);
  await d.templates.update("push", {
    name: "New Push",
    items: [{ ...template.items[0], reps: 12 }],
  });
  expect((await d.sessions.get(id))?.templateSnapshot?.name).toBe("Push");
  expect((await d.sessions.get(id))?.templateSnapshot?.items[0].reps).toBe(5);
});
it("permits blank workouts and optional block membership", async () => {
  const d = make();
  const id = await startSession({ day: "2026-09-02" }, d);
  const s = (await d.sessions.get(id))!;
  expect(s.mesocycleId).toBeNull();
  expect(s.templateSnapshot).toBeUndefined();
});
it("does not create a second active workout", async () => {
  const d = make();
  const a = await startSession({ day: "2026-09-02" }, d),
    b = await startSession({ day: "2026-09-03" }, d);
  expect(b).toBe(a);
  expect(await d.sessions.count()).toBe(1);
});
it("backdates a session and its sets atomically while preserving audit fields and exposures", async () => {
  const d = await planned();
  await d.sessions.put(session());
  await d.sets.put(set());
  await updateSessionDetails("w", "2026-08-20", "block", d);
  const s = (await d.sessions.get("w"))!,
    r = (await d.sets.get("s"))!;
  expect(sessionDay(s)).toBe("2026-08-20");
  expect(s.createdAt).toBe(date);
  expect(r.createdAt).toBe(date);
  expect(localDate(r.performedAt!)).toBe("2026-08-20");
  expect(r.effectiveReps).toBe(3);
  expect(r.weights).toEqual({ chest: 1, triceps: 0.5 });
  expect(r.strength).toEqual(set().strength);
  expect(s.mesocycleId).toBe("block");
  await updateSessionDetails("w", "2026-08-21", null, d);
  expect((await d.sessions.get("w"))?.mesocycleId).toBeNull();
  expect((await d.sets.get("s"))?.createdAt).toBe(date);
});
it("round-trips templates, blocks, snapshots and optional membership", async () => {
  const d = await planned();
  await startSession(
    { day: "2026-09-05", templateId: "push", mesocycleId: "block" },
    d,
  );
  const b = await exportBackup(d),
    dest = make();
  await restoreBackup(b, "replace", dest);
  const restored = await exportBackup(dest);
  expect(restored.schemaVersion).toBe(3);
  expect(restored.templates).toEqual(b.templates);
  expect(restored.mesocycles).toEqual(b.mesocycles);
  expect(restored.sessions).toEqual(b.sessions);
});
it("imports version-1 backups without inventing plans or membership", async () => {
  const d = make();
  const s = session();
  delete s.performedAt;
  delete s.performedDate;
  delete s.mesocycleId;
  const b = {
    schemaVersion: 1,
    exportedAt: date,
    sessions: [s],
    sets: [set()],
    custom: [],
    overrides: [],
    settings: [defaults],
  };
  await restoreBackup(b, "replace", d);
  expect(await d.sessions.get("w")).toEqual(s);
  expect(await d.sets.get("s")).toEqual(set());
  expect(await d.templates.count()).toBe(0);
});
it("rejects invalid new plans before replacing any data", async () => {
  const d = await planned();
  const b = await exportBackup(d);
  b.templates![0].items[0].sets = 0;
  expect(() => validateBackup(b)).toThrow();
  await expect(restoreBackup(b, "replace", d)).rejects.toThrow();
  expect((await d.templates.get("push"))?.items[0].sets).toBe(3);
});
it("rejects dangling block/template references and missing schema-2 tables", async () => {
  const d = await planned(),
    b = await exportBackup(d);
  b.mesocycles![0].templateIds = ["missing"];
  expect(() => validateBackup(b)).toThrow("reference");
  delete b.templates;
  expect(() => validateBackup(b)).toThrow("Missing");
});
it("syncs new tables and session snapshots with an old remote snapshot", async () => {
  const d = await planned(),
    local = await exportBackup(d);
  const old = {
    ...local,
    schemaVersion: 1 as const,
    templates: undefined,
    mesocycles: undefined,
  };
  const merged = mergeSnapshots(old, local, old);
  expect(merged.schemaVersion).toBe(3);
  expect(merged.templates).toEqual(local.templates);
  expect(merged.mesocycles).toEqual(local.mesocycles);
});
it("preserves explicit out-of-range membership in weekly analytics", () => {
  const s = session("w", "2026-08-25");
  const groups = progressGroups([s], [set()], [block], "week", "block");
  expect(groups.length).toBe(1);
  expect(groups[0].label).toContain("outside");
  expect(groups[0].sets.length).toBe(1);
});
it("excludes planned/active sessions and uses performed rather than creation date", () => {
  const actual = session(),
    active = {
      ...session("active"),
      status: "active" as const,
      completedAt: null,
    };
  const groups = progressGroups(
    [actual, active],
    [set(), set("a", "active")],
    [block],
    "week",
  );
  expect(groups.length).toBe(1);
  expect(groups[0].label).toBe("Week of 2026-08-31");
  expect(groups[0].sets.length).toBe(1);
  expect(muscleSummary(groups[0])).toEqual({ chest: 3, triceps: 1.5 });
});
it("compares completed blocks and reports normalized within-exercise strength", () => {
  const a = session(),
    b = { ...session("b", "2026-10-01"), mesocycleId: null };
  const groups = progressGroups(
    [a, b],
    [set(), { ...set("b", "b"), strength: { load: 110, unit: "kg" } }],
    [block],
    "mesocycle",
  );
  expect(groups.map((g) => g.label)).toEqual(["Block A", "No mesocycle"]);
  expect(exerciseSummary(groups[0], "bench").best1RM).toBeCloseTo(123.333);
  expect(exerciseSummary(groups[1], "bench").bestLoad?.strength?.load).toBe(
    110,
  );
});
