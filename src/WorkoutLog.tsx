import { useEffect, useRef, useState } from "react";
import {
  alternatingSets,
  duplicateSets,
  exerciseGroup,
  moveExercise,
  setLabels,
} from "./workoutOrder";
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
  number,
}: {
  set: SetRecord;
  index: number;
  number: string;
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
  const label = `Set ${number}`,
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
      <th scope="row">{number}</th>
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
            start(plan.restSeconds, `${set.exerciseName} · set ${number}`)
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
    [plus, setPlus] = useState<string | null>(null),
    [partner, setPartner] = useState<string | null>(null),
    [partnerQuery, setPartnerQuery] = useState(""),
    [dragging, setDragging] = useState<string | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null),
    [name, setName] = useState(session.templateSnapshot?.name || ""),
    [auto, setAuto] = useState(
      () => localStorage.getItem("effective-reps-auto-rest") === "true",
    );
  const drag = useRef<{
    id: string;
    start: number;
    active: boolean;
    target: string | null;
    after: boolean;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const id = setInterval(() => {
      const state = drag.current;
      if (!state?.active) return;
      if (state.y < 90) window.scrollBy(0, -15);
      else if (state.y > window.innerHeight - 170) window.scrollBy(0, 15);
    }, 60);
    return () => clearInterval(id);
  }, [dragging]);
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
  async function add(ex: Exercise, pairedWith?: string) {
    if (["cardio", "stretching"].includes(ex.category))
      throw new Error(
        "Effective-rep logging is available for resistance exercises.",
      );
    const group = crypto.randomUUID();
    if (pairedWith) {
      await db.transaction("rw", [db.sets, db.sessions], async () => {
        const current = (
          await db.sets.where("sessionId").equals(session.id).toArray()
        ).sort((a, b) => a.sequence - b.sequence);
        const originals = current.filter(
          (s) => exerciseGroup(s) === pairedWith,
        );
        if (!originals.length) throw new Error("Exercise no longer exists.");
        const supersetId = originals[0].supersetId || crypto.randomUUID();
        const next = current.map((s) =>
          exerciseGroup(s) === pairedWith ? { ...s, supersetId } : s,
        );
        const last = Math.max(
          ...next.map((s, i) => (s.supersetId === supersetId ? i : -1)),
        );
        const rounds = new Set(
          [...setLabels(originals).values()].map((label) =>
            label.replace(/[LR]$/, ""),
          ),
        ).size;
        const additions = Array.from({ length: rounds }, () => ({
          ...plannedSet(
            session,
            ex,
            blankPlan(),
            0,
            settings,
            overrides.find((o) => o.exerciseId === ex.id),
            group,
          ),
          supersetId,
        }));
        next.splice(last + 1, 0, ...additions);
        await reorder(next);
      });
      setPartner(null);
      setPartnerQuery("");
      return;
    }
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
    await reorder(duplicateSets(next, s));
  }
  async function moveGroup(id: string, target: string, after = false) {
    await db.transaction("rw", [db.sets, db.sessions], async () => {
      const current = (
        await db.sets.where("sessionId").equals(session.id).toArray()
      ).sort((a, b) => a.sequence - b.sequence);
      await reorder(moveExercise(current, id, target, after));
    });
  }
  function shiftGroup(id: string, direction: number) {
    const target =
      groups[groups.findIndex(([group]) => group === id) + direction]?.[0];
    if (target) run(() => moveGroup(id, target, direction > 0));
  }
  function dragMove(e: React.PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    state.y = e.clientY;
    if (Math.abs(e.clientY - state.start) > 6) {
      state.active = true;
      setDragging(state.id);
    }
    if (!state.active) return;
    if (e.clientY < 90) window.scrollBy(0, -20);
    else if (e.clientY > window.innerHeight - 170) window.scrollBy(0, 20);
    const hit = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-workout-group]");
    // During scrolling the pointer can land in a gap above/between cards.
    // Use the closest vertical card so a valid drag does not lose its destination.
    const distance = (card: HTMLElement) => {
      const rect = card.getBoundingClientRect();
      return e.clientY < rect.top
        ? rect.top - e.clientY
        : e.clientY > rect.bottom
          ? e.clientY - rect.bottom
          : 0;
    };
    const card =
      hit ||
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-workout-group]"),
      ).sort((a, b) => distance(a) - distance(b))[0];
    const target = card?.dataset.workoutGroup;
    state.target = target && target !== state.id ? target : null;
    state.after =
      !!card &&
      e.clientY >
        card.getBoundingClientRect().top +
          card.getBoundingClientRect().height / 2;
    setDropTarget(state.target);
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
        supersetId: rows[0].supersetId,
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
        const labels = setLabels(rows),
          position = groups.findIndex(([group]) => group === id);
        const superset = rows[0].supersetId;
        const linked = superset
          ? groups.filter(([group]) =>
              sets.some(
                (s) => exerciseGroup(s) === group && s.supersetId === superset,
              ),
            )
          : [];
        const supersetIds = [
          ...new Set(sets.map((s) => s.supersetId).filter(Boolean)),
        ];
        return (
          <section
            className={`card exercise-table ${dragging === id ? "exercise-dragging" : ""} ${dropTarget === id ? "exercise-drop-target" : ""}`}
            key={id}
            data-workout-group={id}
          >
            <div className="section-title">
              <button
                className="exercise-drag-handle secondary"
                aria-label={`Drag ${title}`}
                title="Drag to reorder; arrow keys move the exercise"
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    shiftGroup(id, e.key === "ArrowUp" ? -1 : 1);
                  }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    id,
                    start: e.clientY,
                    active: false,
                    target: null,
                    after: false,
                    y: e.clientY,
                  };
                }}
                onPointerMove={dragMove}
                onPointerUp={(e) => {
                  if (drag.current?.active) dragMove(e);
                  const state = drag.current;
                  if (state?.active && state.target)
                    run(() => moveGroup(state.id, state.target!, state.after));
                  drag.current = null;
                  setDragging(null);
                  setDropTarget(null);
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragging(null);
                  setDropTarget(null);
                }}
              >
                ⠿
              </button>
              <h2>{title}</h2>
              <div className="exercise-header-actions">
                <button
                  className="secondary"
                  aria-label={`Move ${title} up`}
                  disabled={position === 0}
                  onClick={() => shiftGroup(id, -1)}
                >
                  ↑
                </button>
                <button
                  className="secondary"
                  aria-label={`Move ${title} down`}
                  disabled={position === groups.length - 1}
                  onClick={() => shiftGroup(id, 1)}
                >
                  ↓
                </button>
                <button
                  className="secondary"
                  aria-label={`Add to ${title}`}
                  aria-expanded={plus === id}
                  onClick={() => setPlus(plus === id ? null : id)}
                >
                  +
                </button>
                <button
                  className="secondary"
                  onClick={() => run(() => copy(rows.at(-1)!))}
                >
                  Add set
                </button>
              </div>
            </div>
            {plus === id && (
              <div
                className="exercise-plus-menu"
                role="group"
                aria-label={`Add options for ${title}`}
              >
                <button
                  className="secondary"
                  onClick={() => {
                    setPartner(id);
                    setPartnerQuery("");
                    setPlus(null);
                  }}
                >
                  Add another exercise
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setPlus(null);
                    run(async () => {
                      const current = (
                        await db.sets
                          .where("sessionId")
                          .equals(session.id)
                          .toArray()
                      ).sort((a, b) => a.sequence - b.sequence);
                      await reorder(alternatingSets(current, id));
                    });
                  }}
                >
                  Add alternating sets
                </button>
              </div>
            )}
            {partner === id && (
              <div className="superset-picker">
                <h3>Add a superset exercise</h3>
                <p>
                  Each exercise keeps its own load and reps. Alternate between
                  exercises each round.
                </p>
                <label>
                  Superset exercise
                  <input
                    aria-label={`Superset exercise for ${title}`}
                    value={partnerQuery}
                    onChange={(e) => setPartnerQuery(e.target.value)}
                  />
                </label>
                {partnerQuery &&
                  exercises
                    .filter(
                      (e) =>
                        !["cardio", "stretching"].includes(e.category) &&
                        e.name
                          .toLowerCase()
                          .includes(partnerQuery.toLowerCase()),
                    )
                    .slice(0, 15)
                    .map((ex) => (
                      <button
                        key={ex.id}
                        className="secondary"
                        onClick={() => run(() => add(ex, id))}
                      >
                        Pair with {ex.name}
                      </button>
                    ))}
                <button
                  className="text-button"
                  onClick={() => setPartner(null)}
                >
                  Cancel pairing
                </button>
              </div>
            )}
            {linked.length > 1 && (
              <p className="superset-badge">
                Superset {supersetIds.indexOf(superset) + 1} ·{" "}
                {String.fromCharCode(
                  65 + linked.findIndex(([group]) => group === id),
                )}{" "}
                · {linked.map(([, name]) => name).join(" + ")}
                <button
                  className="text-button"
                  aria-label={`Unlink ${title} from superset`}
                  onClick={() =>
                    run(async () => {
                      await db.transaction(
                        "rw",
                        [db.sets, db.sessions],
                        async () => {
                          const current = await db.sets
                            .where("sessionId")
                            .equals(session.id)
                            .toArray();
                          await db.sets.bulkPut(
                            current
                              .filter((s) => exerciseGroup(s) === id)
                              .map((s) => ({ ...s, supersetId: undefined })),
                          );
                          await db.sessions.update(session.id, {
                            updatedAt: now(),
                          });
                        },
                      );
                    })
                  }
                >
                  Unlink
                </button>
              </p>
            )}
            {rows.some((s) => planOf(s).side) && (
              <p className="muted">
                Alternating sides · Each side logs its own reps, RIR, timer, and
                stimulus. Copy or Add set creates a new left/right pair.
              </p>
            )}
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
                      number={labels.get(s.id)!}
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
