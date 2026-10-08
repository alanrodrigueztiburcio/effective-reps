import "fake-indexeddb/auto";
import { it, expect, afterEach } from "vitest";
import { Database, exportBackup, restoreBackup, validateBackup } from "./db";
import { defaults } from "./core";
const date = new Date().toISOString();
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
async function fixture() {
  const d = make();
  await d.sessions.add({
    id: "w",
    startedAt: date,
    completedAt: null,
    status: "active",
    createdAt: date,
    updatedAt: date,
  });
  await d.sets.add({
    id: "s",
    sessionId: "w",
    exerciseId: "test",
    exerciseName: "Original",
    timestamp: date,
    sequence: 1,
    type: "standard",
    reps: 10,
    miniReps: 0,
    rir: 0,
    effectiveReps: 5,
    weights: { chest: 1, triceps: 0 },
    calculationVersion: "1",
  });
  await d.settings.add(defaults);
  await d.custom.add({
    id: "custom:one",
    name: "Custom",
    equipment: null,
    category: "strength",
    force: null,
    mechanic: null,
    level: "custom",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    instructions: [],
    images: [],
  });
  await d.overrides.add({
    exerciseId: "test",
    weights: { chest: 0.5 },
    updatedAt: date,
  });
  return d;
}
it("round trips every table and retains attribution snapshot", async () => {
  const d = await fixture(),
    b = await exportBackup(d),
    dest = make();
  await restoreBackup(b, "replace", dest);
  expect((await exportBackup(dest)).sets).toEqual(b.sets);
  expect(await dest.custom.count()).toBe(1);
  expect(await dest.overrides.count()).toBe(1);
  expect((await dest.sessions.get("w"))?.status).toBe("active");
  expect((await dest.sets.get("s"))?.weights.chest).toBe(1);
});
it("merge is idempotent; existing records win", async () => {
  const d = await fixture(),
    b = await exportBackup(d);
  b.sets[0].exerciseName = "Changed";
  await restoreBackup(b, "merge", d);
  await restoreBackup(b, "merge", d);
  expect(await d.sets.count()).toBe(1);
  expect((await d.sets.get("s"))?.exerciseName).toBe("Original");
});
it("replace removes old records", async () => {
  const d = await fixture();
  await restoreBackup(await exportBackup(make()), "replace", d);
  expect(await d.sets.count()).toBe(0);
  expect(await d.custom.count()).toBe(0);
  expect(await d.settings.get("main")).toEqual(defaults);
});
it("rejects malformed backups before mutation", async () => {
  const d = await fixture();
  for (const mutate of [
    (b: any) => (b.schemaVersion = 2),
    (b: any) => (b.sets[0].sessionId = "missing"),
    (b: any) => (b.sets[0].weights.chest = -1),
    (b: any) => (b.sets[0].effectiveReps = 99),
    (b: any) => b.sets.push(b.sets[0]),
    (b: any) => (b.settings[0].lower = 100),
  ]) {
    const b = await exportBackup(d);
    mutate(b);
    expect(() => validateBackup(b)).toThrow();
    expect(await d.sets.count()).toBe(1);
  }
});
it("conflicting active-session merge rolls back", async () => {
  const d = await fixture(),
    b = await exportBackup(d);
  b.sessions[0].id = "other";
  b.sets[0].sessionId = "other";
  await expect(restoreBackup(b, "merge", d)).rejects.toThrow("Complete");
  expect(await d.sessions.count()).toBe(1);
  expect(await d.sets.count()).toBe(1);
});
it("reopens versioned storage without data loss", async () => {
  const d = await fixture(),
    name = d.name;
  d.close();
  const reopened = new Database(name);
  databases.push(reopened);
  await reopened.open();
  expect(await reopened.sets.count()).toBe(1);
  expect(await reopened.custom.count()).toBe(1);
});
