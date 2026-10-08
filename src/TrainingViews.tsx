import { useState } from "react";
import type {
  Exercise,
  Mesocycle,
  Session,
  SetRecord,
  TemplateItem,
  WorkoutTemplate,
} from "./core";
import { db, now, startSession, updateSessionDetails } from "./db";
import {
  localDate,
  sessionDay,
  validateMesocycle,
  validateTemplate,
  weekOf,
} from "./training";
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;

export function StartWorkout({
  templates,
  mesocycles,
  run,
}: {
  templates: WorkoutTemplate[];
  mesocycles: Mesocycle[];
  run: Run;
}) {
  const [day, setDay] = useState(localDate()),
    [templateId, setTemplate] = useState(""),
    [mesocycleId, setBlock] = useState("");
  const block = mesocycles.find((m) => m.id === mesocycleId);
  return (
    <section className="card welcome">
      <h2>Log a workout</h2>
      <p>
        Start from a reusable plan or a blank session. Actual sets are logged
        separately.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await startSession({ day, templateId, mesocycleId });
            location.hash = "workout";
          });
        }}
      >
        <label>
          Workout date
          <input
            type="date"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <label>
          Workout template
          <select
            value={templateId}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">Blank workout</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {block?.templateIds.includes(t.id)
                  ? " · used in this block"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mesocycle (optional)
          <select
            value={mesocycleId}
            onChange={(e) => setBlock(e.target.value)}
          >
            <option value="">No mesocycle</option>
            {mesocycles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {block && (day < block.startDate || day > block.endDate) && (
          <p className="muted">
            Outside the planned date range. This workout will still belong to
            the selected block.
          </p>
        )}
        <button>Start workout →</button>
      </form>
      <p className="muted">
        Historical dates are supported. Works offline; optional syncing in
        Settings.
      </p>
    </section>
  );
}
export function SessionDetails({
  session,
  mesocycles,
  run,
}: {
  session: Session;
  mesocycles: Mesocycle[];
  run: Run;
}) {
  const [day, setDay] = useState(sessionDay(session)),
    [block, setBlock] = useState(session.mesocycleId || "");
  const selected = mesocycles.find((m) => m.id === block);
  return (
    <details className="card session-details">
      <summary>Workout date & mesocycle</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => updateSessionDetails(session.id, day, block || null),
            "Workout details saved. Calculations unchanged.",
          );
        }}
      >
        <label>
          Performed date
          <input
            type="date"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <label>
          Assign mesocycle
          <select value={block} onChange={(e) => setBlock(e.target.value)}>
            <option value="">No mesocycle</option>
            {mesocycles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {selected && (day < selected.startDate || day > selected.endDate) && (
          <p>
            This workout is outside the block’s planned dates; explicit
            membership is retained.
          </p>
        )}
        <p className="muted">
          Originally entered {new Date(session.createdAt).toLocaleString()}.
          Changing the performed date retimes sets in the training timeline
          without changing their original entry timestamps.
        </p>
        <button>Save workout details</button>
      </form>
    </details>
  );
}
export function SessionPlan({
  session,
  sets,
  pick,
}: {
  session: Session;
  sets: SetRecord[];
  pick: (item: TemplateItem) => void;
}) {
  if (!session.templateSnapshot) return null;
  return (
    <section className="card session-plan">
      <h2>{session.templateSnapshot.name} · session plan</h2>
      <p className="muted">
        Snapshot taken when this workout started. Targets are not completed
        sets.
      </p>
      {session.templateSnapshot.items.map((item, i) => {
        const count = sets.filter((s) => s.templateItemId === item.id).length;
        return (
          <div className="plan-row" key={item.id}>
            <div>
              <strong>
                {i + 1}. {item.exercise.name}
              </strong>
              <p>
                {count}/{item.sets} sets logged · target {item.reps} reps · RIR{" "}
                {item.rir}
              </p>
            </div>
            <button className="secondary" onClick={() => pick(item)}>
              Log planned exercise
            </button>
          </div>
        );
      })}
    </section>
  );
}
export function TemplateManager({
  templates,
  exercises,
  run,
}: {
  templates: WorkoutTemplate[];
  exercises: Exercise[];
  run: Run;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [items, setItems] = useState<TemplateItem[]>([]),
    [query, setQuery] = useState("");
  function open(t?: WorkoutTemplate) {
    setEditing(t?.id || "new");
    setName(t?.name || "");
    setItems(structuredClone(t?.items || []));
    setQuery("");
  }
  function change(id: string, field: "sets" | "reps" | "rir", value: number) {
    setItems(items.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  }
  function move(index: number, direction: number) {
    const next = [...items];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    setItems(next);
  }
  return (
    <>
      <section className="card">
        <div className="section-title">
          <h2>Reusable workout templates</h2>
          <button onClick={() => open()}>New template</button>
        </div>
        <p>
          Templates are independent of mesocycles. Reuse a plan across blocks;
          edits apply only to future sessions.
        </p>
        {!templates.length && <p>No templates yet.</p>}
        {templates.map((t) => (
          <div className="plan-row" key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <p>
                {t.items.map((x) => x.exercise.name).join(" → ")} ·{" "}
                {t.items.reduce((sum, x) => sum + x.sets, 0)} planned sets
              </p>
            </div>
            <button className="secondary" onClick={() => open(t)}>
              Edit template
            </button>
          </div>
        ))}
      </section>
      {editing && (
        <section className="card">
          <h2>{editing === "new" ? "Create template" : "Edit template"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const previous =
                  editing === "new" ? null : await db.templates.get(editing);
                const t: WorkoutTemplate = {
                  id: previous?.id || crypto.randomUUID(),
                  name: name.trim(),
                  items: structuredClone(items),
                  createdAt: previous?.createdAt || now(),
                  updatedAt: now(),
                };
                validateTemplate(t);
                await db.templates.put(t);
                setEditing(null);
              }, "Template saved. Existing session plans unchanged.");
            }}
          >
            <label>
              Template name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Push"
              />
            </label>
            {items.map((item, i) => (
              <fieldset key={item.id}>
                <legend>
                  {i + 1}. {item.exercise.name}
                </legend>
                <div className="entry three">
                  <label>
                    Target sets
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={item.sets}
                      onChange={(e) =>
                        change(item.id, "sets", e.target.valueAsNumber)
                      }
                    />
                  </label>
                  <label>
                    Target reps
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={item.reps}
                      onChange={(e) =>
                        change(item.id, "reps", e.target.valueAsNumber)
                      }
                    />
                  </label>
                  <label>
                    Target RIR
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={item.rir}
                      onChange={(e) =>
                        change(item.id, "rir", e.target.valueAsNumber)
                      }
                    />
                  </label>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setItems(items.filter((x) => x.id !== item.id))
                    }
                  >
                    Remove from plan
                  </button>
                </div>
              </fieldset>
            ))}
            <label>
              Find exercise for template
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search exercises"
              />
            </label>
            {query.trim() && (
              <div className="template-search">
                {exercises
                  .filter(
                    (e) =>
                      !["cardio", "stretching"].includes(e.category) &&
                      e.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .slice(0, 15)
                  .map((e) => (
                    <button
                      type="button"
                      className="secondary"
                      key={e.id}
                      onClick={() => {
                        setItems([
                          ...items,
                          {
                            id: crypto.randomUUID(),
                            exercise: structuredClone(e),
                            sets: 3,
                            reps: 10,
                            rir: 2,
                          },
                        ]);
                        setQuery("");
                      }}
                    >
                      Add {e.name}
                    </button>
                  ))}
              </div>
            )}
            <div className="actions">
              <button>Save template</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
export function MesocycleManager({
  mesocycles,
  templates,
  sessions,
  run,
}: {
  mesocycles: Mesocycle[];
  templates: WorkoutTemplate[];
  sessions: Session[];
  run: Run;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [start, setStart] = useState(localDate()),
    [end, setEnd] = useState(localDate()),
    [goal, setGoal] = useState(""),
    [ids, setIds] = useState<string[]>([]);
  function open(m?: Mesocycle) {
    setEditing(m?.id || "new");
    setName(m?.name || "");
    setStart(m?.startDate || localDate());
    setEnd(m?.endDate || localDate());
    setGoal(m?.goal || "");
    setIds(m?.templateIds || []);
  }
  const today = localDate();
  return (
    <>
      <section className="card">
        <div className="section-title">
          <h2>Mesocycles</h2>
          <button onClick={() => open()}>New mesocycle</button>
        </div>
        <p>
          Named training blocks reference reusable templates. Workout membership
          is explicit, not inferred from dates.
        </p>
        {!mesocycles.length && (
          <p>No blocks yet. Workouts can be logged without a mesocycle.</p>
        )}
        {mesocycles.map((m) => {
          const week = weekOf(today, m.startDate),
            total = weekOf(m.endDate, m.startDate);
          return (
            <article className="block-row" key={m.id}>
              <h3>{m.name}</h3>
              <p>
                {m.startDate} – {m.endDate} ·{" "}
                {today < m.startDate
                  ? "Upcoming"
                  : today > m.endDate
                    ? "Ended"
                    : `Week ${week} of ${total}`}
              </p>
              <p>{m.goal || "No goal specified"}</p>
              <p>
                {m.templateIds
                  .map((id) => templates.find((t) => t.id === id)?.name)
                  .filter(Boolean)
                  .join(" / ") || "No linked templates"}{" "}
                ·{" "}
                {
                  sessions.filter(
                    (s) => s.mesocycleId === m.id && s.status === "completed",
                  ).length
                }{" "}
                completed sessions
              </p>
              <button className="secondary" onClick={() => open(m)}>
                Edit mesocycle
              </button>
            </article>
          );
        })}
      </section>
      {editing && (
        <section className="card">
          <h2>{editing === "new" ? "Create mesocycle" : "Edit mesocycle"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const previous =
                  editing === "new" ? null : await db.mesocycles.get(editing);
                const m: Mesocycle = {
                  id: previous?.id || crypto.randomUUID(),
                  name: name.trim(),
                  startDate: start,
                  endDate: end,
                  goal,
                  templateIds: ids,
                  createdAt: previous?.createdAt || now(),
                  updatedAt: now(),
                };
                validateMesocycle(m);
                await db.mesocycles.put(m);
                setEditing(null);
              }, "Mesocycle saved. Workout membership unchanged.");
            }}
          >
            <label>
              Mesocycle name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="entry">
              <label>
                Start date
                <input
                  type="date"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <label>
              Training goal
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Associated templates</legend>
              {templates.map((t) => (
                <label className="weight-row" key={t.id}>
                  {t.name}
                  <input
                    type="checkbox"
                    checked={ids.includes(t.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, t.id]
                          : ids.filter((id) => id !== t.id),
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <button>Save mesocycle</button>
              <button
                className="secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
