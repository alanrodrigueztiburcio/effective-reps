import { plansFor, plannedSet, validatePlan, normalizeSet } from "./setLog";
import Dexie, { type Table } from "dexie";
import {
  type Session,
  type SetRecord,
  type Exercise,
  type Override,
  type Settings,
  type WorkoutTemplate,
  type Mesocycle,
  defaults,
  attribution,
  effective,
  muscles,
  validateSettings,
} from "./core";
import {
  localDate,
  onDate,
  validDay,
  validateItems,
  validateTemplate,
  validateMesocycle,
} from "./training";
export class Database extends Dexie {
  sessions!: Table<Session, string>;
  sets!: Table<SetRecord, string>;
  custom!: Table<Exercise, string>;
  overrides!: Table<Override, string>;
  settings!: Table<Settings, string>;
  templates!: Table<WorkoutTemplate, string>;
  mesocycles!: Table<Mesocycle, string>;
  constructor(name = "effective-reps") {
    super(name);
    this.version(1).stores({
      sessions: "id,status,startedAt",
      sets: "id,sessionId,[sessionId+sequence]",
      custom: "id,name",
      overrides: "exerciseId",
      settings: "id",
    });
    // Additive upgrade: existing sets, attribution snapshots and sessions remain untouched.
    this.version(2).stores({
      sessions: "id,status,startedAt,performedDate,mesocycleId,templateId",
      sets: "id,sessionId,[sessionId+sequence]",
      custom: "id,name",
      overrides: "exerciseId",
      settings: "id",
      templates: "id,name",
      mesocycles: "id,startDate,endDate",
    });
  }
}
export const db = new Database();
export const now = () => new Date().toISOString();
export async function startSession(
  options: {
    day?: string;
    templateId?: string | null;
    mesocycleId?: string | null;
  } = {},
  database = db,
) {
  return database.transaction(
    "rw",
    [
      database.sessions,
      database.templates,
      database.mesocycles,
      database.sets,
      database.settings,
      database.overrides,
    ],
    async () => {
      const active = await database.sessions
        .where("status")
        .equals("active")
        .first();
      if (active) return active.id;
      const date = now(),
        id = crypto.randomUUID();
      const day = options.day || localDate(date),
        performedAt = onDate(day, date);
      const template = options.templateId
        ? await database.templates.get(options.templateId)
        : null;
      if (options.templateId && !template)
        throw new Error("Template no longer exists.");
      if (
        options.mesocycleId &&
        !(await database.mesocycles.get(options.mesocycleId))
      )
        throw new Error("Mesocycle no longer exists.");
      await database.sessions.add({
        id,
        startedAt: performedAt,
        performedAt,
        performedDate: day,
        mesocycleId: options.mesocycleId || null,
        templateId: template?.id || null,
        templateSnapshot: template
          ? { name: template.name, items: structuredClone(template.items) }
          : undefined,
        completedAt: null,
        status: "active",
        createdAt: date,
        updatedAt: date,
      });
      if (template) {
        const session = (await database.sessions.get(id))!;
        const settings = (await database.settings.get("main")) || defaults;
        let sequence = 0;
        for (const item of template.items) {
          const override = await database.overrides.get(item.exercise.id);
          for (const plan of plansFor(item))
            await database.sets.add(
              plannedSet(
                session,
                item.exercise,
                plan,
                ++sequence,
                settings,
                override,
                item.id,
                item.id,
              ),
            );
        }
      }
      return id;
    },
  );
}
export async function updateSessionDetails(
  id: string,
  day: string,
  mesocycleId: string | null,
  database = db,
) {
  if (!validDay(day)) throw new Error("Choose a valid workout date.");
  await database.transaction(
    "rw",
    [database.sessions, database.sets, database.mesocycles],
    async () => {
      const s = await database.sessions.get(id);
      if (!s) throw new Error("Workout no longer exists.");
      if (mesocycleId && !(await database.mesocycles.get(mesocycleId)))
        throw new Error("Mesocycle no longer exists.");
      const performedAt = onDate(day, s.performedAt || s.startedAt);
      await database.sessions.update(id, {
        performedDate: day,
        performedAt,
        startedAt: performedAt,
        mesocycleId,
        updatedAt: now(),
      });
      // Retiming is intentional; preserve original input timestamps and every calculation snapshot.
      const sets = await database.sets.where("sessionId").equals(id).toArray();
      for (const set of sets) {
        const time = onDate(day, set.performedAt || set.timestamp);
        await database.sets.update(set.id, {
          createdAt: set.createdAt || set.timestamp,
          performedAt: time,
          timestamp: time,
        });
      }
    },
  );
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
  schemaVersion: 1 | 2 | 3;
  exportedAt: string;
  sessions: Session[];
  sets: SetRecord[];
  custom: Exercise[];
  overrides: Override[];
  settings: Settings[];
  templates?: WorkoutTemplate[];
  mesocycles?: Mesocycle[];
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
      database.templates,
      database.mesocycles,
    ],
    async () => ({
      schemaVersion: 3,
      exportedAt: now(),
      sessions: await database.sessions.toArray(),
      sets: await database.sets.toArray(),
      custom: await database.custom.toArray(),
      overrides: await database.overrides.toArray(),
      settings: await database.settings.toArray(),
      templates: await database.templates.toArray(),
      mesocycles: await database.mesocycles.toArray(),
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
  if (!b || ![1, 2, 3].includes(b.schemaVersion) || !date(b.exportedAt))
    throw new Error("Unsupported or malformed backup.");
  if (
    b.schemaVersion >= 2 &&
    (!Array.isArray(b.templates) || !Array.isArray(b.mesocycles))
  )
    throw new Error("Missing training plans.");
  for (const key of [
    "sessions",
    "sets",
    "custom",
    "overrides",
    "settings",
    ...(b.schemaVersion >= 2 ? (["templates", "mesocycles"] as const) : []),
  ] as const) {
    if (!Array.isArray(b[key])) throw new Error(`Missing ${key}.`);
    const ids = b[key]!.map((r: any) =>
      key === "overrides" ? r.exerciseId : r.id,
    );
    if (
      ids.some((id) => typeof id !== "string" || !id) ||
      new Set(ids).size !== ids.length
    )
      throw new Error(`Invalid or duplicate ${key} identifiers.`);
  }
  let active = 0;
  for (const t of b.templates || []) {
    validateTemplate(t);
    if (![t.createdAt, t.updatedAt].every(date))
      throw new Error("Invalid template dates.");
  }
  const templateIds = new Set((b.templates || []).map((t) => t.id));
  for (const m of b.mesocycles || []) {
    validateMesocycle(m);
    if (
      ![m.createdAt, m.updatedAt].every(date) ||
      m.templateIds.some((id) => !templateIds.has(id))
    )
      throw new Error("Invalid block template reference.");
  }
  const mesocycleIds = new Set((b.mesocycles || []).map((m) => m.id));
  for (const s of b.sessions) {
    if (
      !["active", "completed"].includes(s.status) ||
      ![s.startedAt, s.createdAt, s.updatedAt].every(date) ||
      (s.status === "completed" ? !date(s.completedAt) : s.completedAt !== null)
    )
      throw new Error("Invalid session.");
    if (s.status === "active") active++;
    if (
      (s.performedAt !== undefined && !date(s.performedAt)) ||
      (s.performedDate !== undefined && !validDay(s.performedDate)) ||
      (s.mesocycleId && !mesocycleIds.has(s.mesocycleId)) ||
      (s.templateId && !templateIds.has(s.templateId))
    )
      throw new Error("Invalid workout date or training reference.");
    if (s.templateSnapshot) {
      if (typeof s.templateSnapshot.name !== "string")
        throw new Error("Invalid template snapshot.");
      validateItems(s.templateSnapshot.items);
    }
  }
  if (active > 1) throw new Error("Multiple active workouts.");
  const sessions = new Set(b.sessions.map((s) => s.id));
  for (const s of b.sets) {
    weights(s.weights);
    if (s.plan) {
      validatePlan(s.plan);
      if (typeof s.completed !== "boolean")
        throw new Error("Invalid completion state.");
      const expected = normalizeSet(s);
      if (
        expected.effectiveReps !== s.effectiveReps ||
        expected.reps !== s.reps ||
        expected.miniReps !== s.miniReps ||
        expected.rir !== s.rir ||
        JSON.stringify(expected.strength) !== JSON.stringify(s.strength)
      )
        throw new Error("Set fields disagree with recorded bouts or flags.");
    }

    if (
      (s.performedAt !== undefined && !date(s.performedAt)) ||
      (s.createdAt !== undefined && !date(s.createdAt)) ||
      (s.templateItemId !== undefined &&
        s.templateItemId !== null &&
        typeof s.templateItemId !== "string")
    )
      throw new Error("Invalid set metadata.");
    if (
      s.strength &&
      (!Number.isFinite(s.strength.load) ||
        s.strength.load <= 0 ||
        !["lb", "kg"].includes(s.strength.unit))
    )
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
      s.effectiveReps !==
        (s.completed === false
          ? 0
          : effective(s.reps, s.rir, s.miniReps, s.type)) ||
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
      database.templates,
      database.mesocycles,
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
        [database.templates, b.templates || []],
        [database.mesocycles, b.mesocycles || []],
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
