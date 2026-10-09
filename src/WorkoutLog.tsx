import { useEffect, useState } from "react";
import {
  aggregate,
  type Exercise,
  type Override,
  type Session,
  type SetPlan,
  type SetRecord,
  type Settings,
  type TemplateItem,
} from "./core";
import { db, now, saveSet } from "./db";
import { blankPlan, normalizeSet, plannedSet, planOf } from "./setLog";
import { sessionDay } from "./training";

type Run = (f: () => Promise<unknown>, message?: string) => void;
export function PlanCells({
  plan,
  change,
  label,
}: {
  plan: SetPlan;
  change: (p: SetPlan) => void;
  label: string;
}) {
  const put = (patch: Partial<SetPlan>) => change({ ...plan, ...patch });
  return (
    <>
      <td>
        <input
          aria-label={`${label} load`}
          placeholder="135 / BW"
          value={plan.loadText}
          onChange={(e) => put({ loadText: e.target.value })}
        />
      </td>
      <td>
        <select
          aria-label={`${label} unit`}
          value={plan.unit}
          onChange={(e) => put({ unit: e.target.value as "lb" | "kg" })}
        >
          <option>lb</option>
          <option>kg</option>
        </select>
      </td>
      <td>
        <input
          aria-label={`${label} target reps`}
          placeholder="2–4"
          value={plan.targetReps}
          onChange={(e) => put({ targetReps: e.target.value })}
        />
      </td>
    </>
  );
}
export function PlanFlags({
  plan,
  change,
  label,
}: {
  plan: SetPlan;
  change: (p: SetPlan) => void;
  label: string;
}) {
  return (
    <>
      <td>
        {(["warmup", "restPause", "trackStrength"] as const).map((key, i) => (
          <label
            className="set-flag"
            key={key}
            title={["Warm-up", "Rest-pause", "Strength tracking"][i]}
          >
            <input
              type="checkbox"
              aria-label={`${label} ${["warm-up", "rest-pause", "strength tracking"][i]}`}
              checked={plan[key]}
              onChange={(e) => change({ ...plan, [key]: e.target.checked })}
            />
            {["W", "RP", "S"][i]}
          </label>
        ))}
      </td>
      <td>
        <input
          type="number"
          aria-label={`${label} rest seconds`}
          min="0"
          max="86400"
          step="1"
          value={plan.restSeconds}
          onChange={(e) =>
            change({ ...plan, restSeconds: e.target.valueAsNumber })
          }
        />
      </td>
    </>
  );
}
function SetRow({
  set,
  index,
  save,
  duplicate,
  remove,
  move,
  start,
  onError,
}: {
  set: SetRecord;
  index: number;
  save: (s: SetRecord, startRest?: boolean) => void;
  duplicate: (s: SetRecord) => void;
  remove: () => void;
  move: (n: number, s: SetRecord) => void;
  start: (seconds: number, name: string) => void;
  onError: (error: unknown) => void;
}) {
  const [draft, setDraft] = useState(set),
    [actual, setActual] = useState(
      set.bouts?.join(",") ??
        (set.type === "rest-pause"
          ? `${set.reps},${set.miniReps}`
          : String(set.reps)),
    );
  useEffect(() => {
    setDraft(set);
    setActual(
      set.bouts?.join(",") ??
        (set.type === "rest-pause"
          ? `${set.reps},${set.miniReps}`
          : String(set.reps)),
    );
  }, [JSON.stringify(set)]);
  const label = `Set ${index + 1}`,
    plan = planOf(draft);
  function current(): SetRecord {
    if (actual.trim() && !/^\d+(?:\s*,\s*\d+)*$/.test(actual.trim()))
      throw new Error(
        "Use whole reps, or comma-separated bouts such as 9,5,3.",
      );
    return {
      ...draft,
      bouts: actual.trim() ? actual.split(",").map(Number) : [],
    };
  }
  // Blur commits a whole row, so typing decimal loads or comma-separated bouts stays uninterrupted.
  const commit = () => {
    try {
      save(current());
    } catch (error) {
      onError(error);
    }
  };
  return (
    <tr
      className={set.completed === false ? "planned-set" : "finished-set"}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commit();
      }}
    >
      <th scope="row">{index + 1}</th>
      <PlanCells
        plan={plan}
        change={(p) => setDraft({ ...draft, plan: p })}
        label={label}
      />
      <td>
        <input
          aria-label={`${label} actual reps`}
          placeholder={plan.restPause ? "9,5,3" : "—"}
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
      </td>
      <td>
        <input
          aria-label={`${label} RIR`}
          type="number"
          min="0"
          step="any"
          placeholder={
            plan.targetRir === undefined ? "—" : `Target ${plan.targetRir}`
          }
          value={
            draft.actualRir === undefined ? draft.rir : (draft.actualRir ?? "")
          }
          onChange={(e) =>
            setDraft({
              ...draft,
              actualRir: e.target.value === "" ? null : e.target.valueAsNumber,
            })
          }
        />
      </td>
      <PlanFlags
        plan={plan}
        change={(p) => setDraft({ ...draft, plan: p })}
        label={label}
      />
      <td>{set.completed === false ? "—" : set.effectiveReps}</td>
      <td>
        <input
          aria-label={`${label} completed`}
          type="checkbox"
          checked={draft.completed !== false}
          onChange={(e) => {
            try {
              const s = { ...current(), completed: e.target.checked };
              normalizeSet(s);
              setDraft(s);
              save(s, e.target.checked);
            } catch (error) {
              onError(error);
            }
          }}
        />
      </td>
      <td className="row-actions">
        <button
          className="secondary"
          onClick={() =>
            start(plan.restSeconds, `${set.exerciseName} · set ${index + 1}`)
          }
        >
          Rest
        </button>
        <button
          className="secondary"
          aria-label={`${label} duplicate`}
          onClick={() => {
            try {
              duplicate(normalizeSet(current()));
            } catch (error) {
              onError(error);
            }
          }}
        >
          Copy
        </button>
        <button
          className="secondary"
          aria-label={`${label} move up`}
          onClick={() => {
            try {
              move(-1, normalizeSet(current()));
            } catch (error) {
              onError(error);
            }
          }}
        >
          ↑
        </button>
        <button
          className="secondary"
          aria-label={`${label} move down`}
          onClick={() => {
            try {
              move(1, normalizeSet(current()));
            } catch (error) {
              onError(error);
            }
          }}
        >
          ↓
        </button>
        <button
          className="text-button danger"
          aria-label={`${label} delete`}
          onClick={remove}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
export function WorkoutLog({
  session,
  sets,
  exercises,
  settings,
  overrides,
  run,
  selected,
  clearSelected,
}: {
  session: Session;
  sets: SetRecord[];
  exercises: Exercise[];
  settings: Settings;
  overrides: Override[];
  run: Run;
  selected: Exercise | null;
  clearSelected: () => void;
}) {
  const [query, setQuery] = useState(""),
    [name, setName] = useState(session.templateSnapshot?.name || ""),
    [auto, setAuto] = useState(
      () => localStorage.getItem("effective-reps-auto-rest") === "true",
    );
  const [timer, setTimer] = useState<{
    end: number;
    remaining: number;
    label: string;
    running: boolean;
  } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("effective-reps-rest") || "null");
    } catch {
      return null;
    }
  });
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    localStorage.setItem("effective-reps-rest", JSON.stringify(timer));
  }, [timer]);
  const start = (seconds: number, label: string) =>
    setTimer({
      end: Date.now() + seconds * 1000,
      remaining: seconds,
      label,
      running: true,
    });
  const remaining = timer
    ? Math.max(
        0,
        timer.running ? Math.ceil((timer.end - clock) / 1000) : timer.remaining,
      )
    : 240;
  const groups = [
    ...new Map(
      sets.map((s) => [
        s.groupId || s.templateItemId || s.exerciseId,
        s.exerciseName,
      ]),
    ).entries(),
  ];
  async function add(ex: Exercise) {
    if (["cardio", "stretching"].includes(ex.category))
      throw new Error(
        "Effective-rep logging is available for resistance exercises.",
      );
    const group = crypto.randomUUID();
    await saveSet(
      normalizeSet(
        plannedSet(
          session,
          ex,
          blankPlan(),
          Math.max(0, ...sets.map((s) => s.sequence)) + 1,
          settings,
          overrides.find((o) => o.exerciseId === ex.id),
          group,
        ),
      ),
    );
    setQuery("");
  }
  useEffect(() => {
    if (selected) {
      run(() => add(selected));
      clearSelected();
    }
  }, [selected]);
  function save(s: SetRecord, startRest = false) {
    run(async () => {
      const normalized = normalizeSet(s);
      await saveSet(normalized);
      if (
        auto &&
        startRest &&
        s.completed !== false &&
        sets.find((x) => x.id === s.id)?.completed === false
      )
        start(planOf(s).restSeconds, `${s.exerciseName} · completed set`);
    });
  }
  async function reorder(next: SetRecord[]) {
    await db.transaction("rw", [db.sets, db.sessions], async () => {
      await db.sets.bulkPut(next.map((s, i) => ({ ...s, sequence: i + 1 })));
      await db.sessions.update(session.id, { updatedAt: now() });
    });
  }
  async function copy(s: SetRecord) {
    const next = (
      await db.sets.where("sessionId").equals(session.id).toArray()
    ).sort((a, b) => a.sequence - b.sequence);
    s = next.find((x) => x.id === s.id) || s;
    const at = next.findIndex((x) => x.id === s.id);
    next.splice(
      at + 1,
      0,
      normalizeSet({
        ...s,
        id: crypto.randomUUID(),
        completed: false,
        bouts: [],
        actualRir: null,
        createdAt: now(),
      }),
    );
    await reorder(next);
  }
  async function saveTemplate() {
    if (!name.trim() || !sets.length)
      throw new Error("Enter a template name and add at least one set.");
    const savedRows = (
      await db.sets.where("sessionId").equals(session.id).toArray()
    ).sort((a, b) => a.sequence - b.sequence);
    const items: TemplateItem[] = groups.map(([id]) => {
      const rows = savedRows.filter(
        (s) => (s.groupId || s.templateItemId || s.exerciseId) === id,
      );
      const ex =
        exercises.find((e) => e.id === rows[0].exerciseId) ||
        session.templateSnapshot?.items.find(
          (i) => i.exercise.id === rows[0].exerciseId,
        )?.exercise;
      if (!ex)
        throw new Error(
          "Exercise definition is unavailable for this template.",
        );
      return {
        id: crypto.randomUUID(),
        exercise: structuredClone(ex),
        sets: rows.length,
        reps: Number(planOf(rows[0]).targetReps.split(/[-–]/)[0]) || 1,
        rir: planOf(rows[0]).targetRir ?? 0,
        setPlans: rows.map((s) => structuredClone(planOf(s))),
      };
    });
    const date = now();
    await db.templates.add({
      id: crypto.randomUUID(),
      name: name.trim(),
      items,
      createdAt: date,
      updatedAt: date,
    });
  }
  const summary = aggregate(sets);
  return (
    <div className="workout-log">
      <div className="stats">
        <div>
          <strong>{groups.length}</strong>
          <span>Exercises</span>
        </div>
        <div>
          <strong>
            {sets.filter((s) => s.completed !== false).length}/{sets.length}
          </strong>
          <span>Completed sets</span>
        </div>
        <div>
          <strong>{summary.performed}</strong>
          <span>Effective reps performed</span>
        </div>
        <div>
          <strong>
            {session.status === "active" ? "In progress" : "Completed"}
          </strong>
          <span>{sessionDay(session)}</span>
        </div>
      </div>
      <p className="muted">
        W = warm-up · RP = rest-pause · S = strength tracking. Flags are
        independent. Edits save when you leave a row. Warm-ups contribute
        stimulus according to RIR. Enter BW, BW + 20, or a numeric load;
        bodyweight notation is retained without a 1RM estimate. Rest-pause
        actual reps accept ordered bouts such as 9,5,3; later bouts use the
        existing mini-rep calculation.
      </p>
      {groups.map(([id, title]) => {
        const rows = sets.filter(
          (s) => (s.groupId || s.templateItemId || s.exerciseId) === id,
        );
        return (
          <section className="card exercise-table" key={id}>
            <div className="section-title">
              <h2>{title}</h2>
              <button
                className="secondary"
                onClick={() => run(() => copy(rows.at(-1)!))}
              >
                Add set
              </button>
            </div>
            <p className="muted">
              Scroll the table horizontally to edit flags, rest, and completion.
            </p>
            <div className="set-table-scroll">
              <table className="set-table">
                <thead>
                  <tr>
                    {[
                      "#",
                      "Load",
                      "Unit",
                      "Target",
                      "Actual",
                      "RIR",
                      "Flags",
                      "Rest (sec)",
                      "Stimulus",
                      "Done",
                      "Actions",
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <SetRow
                      key={s.id}
                      set={s}
                      index={i}
                      save={save}
                      start={start}
                      onError={(error) =>
                        run(async () => {
                          throw error;
                        })
                      }
                      duplicate={(draft) =>
                        run(async () => {
                          await saveSet(draft);
                          await copy(draft);
                        })
                      }
                      remove={() =>
                        run(async () => {
                          await db.sets.delete(s.id);
                          await db.sessions.update(session.id, {
                            updatedAt: now(),
                          });
                        })
                      }
                      move={(direction, draft) =>
                        run(async () => {
                          await saveSet(draft);
                          const at = rows.findIndex((x) => x.id === s.id),
                            other = rows[at + direction];
                          if (!other) return;
                          const next = (
                              await db.sets
                                .where("sessionId")
                                .equals(session.id)
                                .toArray()
                            ).sort((a, b) => a.sequence - b.sequence),
                            a = next.findIndex((x) => x.id === s.id),
                            b = next.findIndex((x) => x.id === other.id);
                          [next[a], next[b]] = [next[b], next[a]];
                          await reorder(next);
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <section className="card">
        <h2>Add an exercise</h2>
        <label>
          Search exercises
          <input
            aria-label="Search exercises"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bench press, squat, curl…"
          />
        </label>
        {query &&
          exercises
            .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 15)
            .map((e) => (
              <div className="exercise-row" key={e.id}>
                <strong>{e.name}</strong>
                <button onClick={() => run(() => add(e))}>Select</button>
              </div>
            ))}
      </section>
      <section className="card">
        <h2>Save this workout as a template</h2>
        <label>
          Workout template name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          onClick={() =>
            run(
              saveTemplate,
              "Workout template saved. Actual reps and RIR are cleared in new sessions.",
            )
          }
        >
          Save workout as template
        </button>
      </section>
      <details className="card">
        <summary>Muscle stimulus totals</summary>
        {Object.entries(summary.totals).map(([m, n]) => (
          <p key={m}>
            {m}: {n?.toFixed(1)}
          </p>
        ))}
      </details>
      <aside className="rest-panel" aria-label="Rest timer">
        <div>
          <small>{timer?.label || "Next set · 4:00 target"}</small>
          <strong role="timer">
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:
            {String(remaining % 60).padStart(2, "0")}
          </strong>
          {timer?.running && remaining === 0 && (
            <span role="status">Rest complete</span>
          )}
        </div>
        <button
          onClick={() => {
            if (timer?.running)
              setTimer({ ...timer, remaining, running: false });
            else start(timer?.remaining ?? 240, timer?.label || "Next set");
          }}
        >
          {timer?.running ? "Pause" : "Start"}
        </button>
        <button className="secondary" onClick={() => setTimer(null)}>
          Reset
        </button>
        <label>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              localStorage.setItem(
                "effective-reps-auto-rest",
                String(e.target.checked),
              );
            }}
          />
          Auto start on completion
        </label>
      </aside>
    </div>
  );
}
