import Dexie, { type Table } from "dexie";
import {
  type Session,
  type SetRecord,
  type Exercise,
  type Override,
  type Settings,
  defaults,
  effective,
  muscles,
  validateSettings,
} from "./core";
export class Database extends Dexie {
  sessions!: Table<Session, string>;
  sets!: Table<SetRecord, string>;
  custom!: Table<Exercise, string>;
  overrides!: Table<Override, string>;
  settings!: Table<Settings, string>;
  constructor(name = "effective-reps") {
    super(name);
    this.version(1).stores({
      sessions: "id,status,startedAt",
      sets: "id,sessionId,[sessionId+sequence]",
      custom: "id,name",
      overrides: "exerciseId",
      settings: "id",
    });
  }
}
export const db = new Database();
export const now = () => new Date().toISOString();
export async function startSession() {
  return db.transaction("rw", db.sessions, async () => {
    const active = await db.sessions.where("status").equals("active").first();
    if (active) return active.id;
    const date = now(),
      id = crypto.randomUUID();
    await db.sessions.add({
      id,
      startedAt: date,
      completedAt: null,
      status: "active",
      createdAt: date,
      updatedAt: date,
    });
    return id;
  });
}
export async function saveSet(record: SetRecord) {
  await db.transaction("rw", [db.sets, db.sessions], async () => {
    if (!(await db.sessions.get(record.sessionId)))
      throw new Error("Workout no longer exists.");
    await db.sets.put(record);
    await db.sessions.update(record.sessionId, { updatedAt: now() });
  });
}
export interface Backup {
  schemaVersion: 1;
  exportedAt: string;
  sessions: Session[];
  sets: SetRecord[];
  custom: Exercise[];
  overrides: Override[];
  settings: Settings[];
}
export async function exportBackup(database = db): Promise<Backup> {
  return database.transaction(
    "r",
    [
      database.sessions,
      database.sets,
      database.custom,
      database.overrides,
      database.settings,
    ],
    async () => ({
      schemaVersion: 1,
      exportedAt: now(),
      sessions: await database.sessions.toArray(),
      sets: await database.sets.toArray(),
      custom: await database.custom.toArray(),
      overrides: await database.overrides.toArray(),
      settings: await database.settings.toArray(),
    }),
  );
}
function weights(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid attribution.");
  for (const [k, v] of Object.entries(value))
    if (
      !muscles.includes(k as any) ||
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < 0
    )
      throw new Error("Invalid muscle weight.");
}
function date(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
export function validateBackup(value: unknown): Backup {
  const b = value as Backup;
  if (!b || b.schemaVersion !== 1 || !date(b.exportedAt))
    throw new Error("Unsupported or malformed backup.");
  for (const key of [
    "sessions",
    "sets",
    "custom",
    "overrides",
    "settings",
  ] as const) {
    if (!Array.isArray(b[key])) throw new Error(`Missing ${key}.`);
    const ids = b[key].map((r: any) =>
      key === "overrides" ? r.exerciseId : r.id,
    );
    if (
      ids.some((id) => typeof id !== "string" || !id) ||
      new Set(ids).size !== ids.length
    )
      throw new Error(`Invalid or duplicate ${key} identifiers.`);
  }
  let active = 0;
  for (const s of b.sessions) {
    if (
      !["active", "completed"].includes(s.status) ||
      ![s.startedAt, s.createdAt, s.updatedAt].every(date) ||
      (s.status === "completed" ? !date(s.completedAt) : s.completedAt !== null)
    )
      throw new Error("Invalid session.");
    if (s.status === "active") active++;
  }
  if (active > 1) throw new Error("Multiple active workouts.");
  const sessions = new Set(b.sessions.map((s) => s.id));
  for (const s of b.sets) {
    weights(s.weights);
    if (s.strength && (!Number.isFinite(s.strength.load) || s.strength.load <= 0 || !["lb", "kg"].includes(s.strength.unit)))
      throw new Error("Invalid strength load or unit.");
    if (
      !sessions.has(s.sessionId) ||
      typeof s.exerciseId !== "string" ||
      !s.exerciseId ||
      typeof s.exerciseName !== "string" ||
      !date(s.timestamp) ||
      !Number.isInteger(s.sequence) ||
      s.sequence < 0 ||
      !["standard", "rest-pause"].includes(s.type) ||
      s.calculationVersion !== "1" ||
      s.effectiveReps !== effective(s.reps, s.rir, s.miniReps, s.type) ||
      (s.type === "standard" && s.miniReps !== 0)
    )
      throw new Error("Invalid set or session reference.");
  }
  for (const e of b.custom) {
    if (
      !e.id.startsWith("custom:") ||
      typeof e.name !== "string" ||
      !e.name.trim() ||
      typeof e.category !== "string" ||
      ![e.equipment, e.force, e.mechanic].every(
        (v) => v === null || typeof v === "string",
      ) ||
      typeof e.level !== "string" ||
      !["primaryMuscles", "secondaryMuscles", "instructions", "images"].every(
        (k) =>
          Array.isArray((e as any)[k]) &&
          (e as any)[k].every((v: unknown) => typeof v === "string"),
      ) ||
      [...e.primaryMuscles, ...e.secondaryMuscles].some(
        (m) => !muscles.includes(m as any),
      )
    )
      throw new Error("Invalid custom exercise.");
  }
  for (const o of b.overrides) {
    weights(o.weights);
    if (!date(o.updatedAt)) throw new Error("Invalid override.");
  }
  for (const s of b.settings) validateSettings(s);
  return b;
}
export async function restoreBackup(
  value: unknown,
  mode: "merge" | "replace",
  database = db,
) {
  const b = validateBackup(value);
  await database.transaction(
    "rw",
    [
      database.sessions,
      database.sets,
      database.custom,
      database.overrides,
      database.settings,
    ],
    async () => {
      if (mode === "replace") {
        for (const table of database.tables) await table.clear();
      } else {
        const existing = await database.sessions
          .where("status")
          .equals("active")
          .first();
        const incoming = b.sessions.find((s) => s.status === "active");
        if (existing && incoming && existing.id !== incoming.id)
          throw new Error(
            "Complete the current workout before merging another active workout.",
          );
      }
      // Stable identifiers make merge idempotent; existing records win conflicts.
      for (const [table, records] of [
        [database.sessions, b.sessions],
        [database.sets, b.sets],
        [database.custom, b.custom],
        [database.overrides, b.overrides],
        [database.settings, b.settings],
      ] as const)
        for (const record of records) {
          const key =
            "exerciseId" in record && !("sessionId" in record)
              ? record.exerciseId
              : record.id;
          if (mode === "replace" || !(await table.get(key)))
            await (table as Table<any, string>).put(record);
        }
      if (!(await database.settings.get("main")))
        await database.settings.put(defaults);
    },
  );
}
