import { useEffect, useState } from "react";
import { db, now } from "./db";
import {
  type Exercise,
  type Macrocycle,
  type Microcycle,
  type Override,
  type ScheduledWorkout,
  type Session,
  type SetPlan,
  type Settings,
  type WorkoutTemplate,
} from "./core";
import {
  addDays,
  periodDays,
  scopeExposure,
  validatePeriod,
  type PlannerData,
  type Scope,
} from "./planning";
import {
  beginScheduled,
  copySessionPlan,
  editScheduledSet,
  moveScheduled,
  placeSession,
  scheduleWorkout,
} from "./plannerDb";
import { localDate, sessionDay } from "./training";
import { plansFor, planOf } from "./setLog";
import { planLabels } from "./workoutOrder";
import { PlanCells, PlanFlags } from "./WorkoutLog";
import { MesocycleManager, StartWorkout } from "./TrainingViews";
import { estimated1RM, kg } from "./strength";
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
const format = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const range = (r: [number, number], unknown = 0) =>
  `${format(r[0])}${r[0] !== r[1] ? `–${format(r[1])}` : ""}${unknown ? " + ?" : ""}`;
export function PlannedRow({
  plan,
  label,
  save,
  locked,
  compact = false,
}: {
  plan: SetPlan;
  label: string;
  save: (p: SetPlan) => void;
  locked: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(plan);
  // A keyed row is reset only when its saved plan changes, not while typing within it.
  return (
    <tr
      onBlur={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget) &&
          JSON.stringify(draft) !== JSON.stringify(plan)
        )
          save(draft);
      }}
    >
      <th scope="row">{label}</th>
      {compact ? (
        <>
          <td>
            <input
              aria-label={`Planned ${label} load`}
              value={draft.loadText}
              disabled={locked}
              onChange={(e) => setDraft({ ...draft, loadText: e.target.value })}
            />
            <small>{draft.unit}</small>
          </td>
          <td>
            <input
              aria-label={`Planned ${label} reps`}
              value={draft.targetReps}
              disabled={locked}
              onChange={(e) =>
                setDraft({ ...draft, targetReps: e.target.value })
              }
            />
          </td>
        </>
      ) : (
        <PlanCells
          plan={draft}
          label={`Planned ${label}`}
          change={(p) => !locked && setDraft(p)}
        />
      )}
      <td>
        <input
          aria-label={`Planned ${label} RIR`}
          type="number"
          min="0"
          step="any"
          value={draft.targetRir ?? ""}
          disabled={locked}
          onChange={(e) =>
            setDraft({
              ...draft,
              targetRir:
                e.target.value === "" ? undefined : e.target.valueAsNumber,
            })
          }
        />
      </td>
      {!compact && (
        <PlanFlags
          plan={draft}
          label={`Planned ${label}`}
          change={(p) => !locked && setDraft(p)}
        />
      )}
    </tr>
  );
}
export function ScheduledSheet({
  workout,
  linked,
  run,
  open,
}: {
  workout: ScheduledWorkout;
  linked?: Session;
  run: Run;
  open: (id: string) => void;
}) {
  return (
    <>
      <section className="card">
        <p className="eyebrow">SCHEDULED WORKOUT · PLANNED TARGETS</p>
        <h2>
          {workout.snapshot.name} · {workout.day}
        </h2>
        <p>
          Actual reps and RIR remain blank until logging begins. Editing these
          targets never changes the reusable template.
        </p>
        <button
          onClick={() =>
            run(async () => open(await beginScheduled(workout.id)))
          }
        >
          {linked ? "Open logged workout" : "Begin logging"}
        </button>
        <a className="button-link secondary" href="#training">
          Back to planner
        </a>
      </section>
      {workout.snapshot.items.map((item) => (
        <section className="card" key={item.id}>
          <h2>{item.exercise.name}</h2>
          <div className="set-table-scroll">
            <table className="set-table">
              <thead>
                <tr>
                  {[
                    "Set",
                    "Load",
                    "Unit",
                    "Target reps",
                    "Target RIR",
                    "Flags",
                    "Rest (sec)",
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plansFor(item).map((p, i) => (
                  <PlannedRow
                    key={item.id + i + JSON.stringify(p)}
                    plan={p}
                    label={planLabels(plansFor(item))[i]}
                    locked={!!linked}
                    save={(plan) =>
                      run(() => editScheduledSet(workout.id, item.id, i, plan))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {linked && (
        <p className="muted">
          Plan snapshot locked because logging began. Actuals are edited
          independently in the workout log.
        </p>
      )}
    </>
  );
}
function CycleEditor({
  kind,
  record,
  mesoId,
  run,
  close,
}: {
  kind: "macro" | "micro";
  record?: Macrocycle | Microcycle;
  mesoId: string;
  run: Run;
  close: () => void;
}) {
  const [name, setName] = useState(record?.name || ""),
    [start, setStart] = useState(record?.startDate || localDate()),
    [end, setEnd] = useState(
      record?.endDate || addDays(localDate(), kind === "micro" ? 6 : 180),
    ),
    [goal, setGoal] = useState(record && "goal" in record ? record.goal : "");
  return (
    <section className="card cycle-editor">
      <h2>
        {record ? "Edit" : "Create"}{" "}
        {kind === "macro" ? "macrocycle" : "microcycle"}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const base = {
              id: record?.id || crypto.randomUUID(),
              name: name.trim(),
              startDate: start,
              endDate: end,
              createdAt: record?.createdAt || now(),
              updatedAt: now(),
            };
            const period =
              kind === "macro"
                ? { ...base, goal }
                : {
                    ...base,
                    mesocycleId:
                      record && "mesocycleId" in record
                        ? record.mesocycleId
                        : mesoId,
                  };
            validatePeriod(period);
            if (
              kind === "micro" &&
              !(await db.mesocycles.get((period as Microcycle).mesocycleId))
            )
              throw new Error("Select a mesocycle first.");
            await (kind === "macro" ? db.macrocycles : db.microcycles).put(
              period as any,
            );
            close();
          }, "Training period saved. Membership remains explicit.");
        }}
      >
        <label>
          {kind === "macro" ? "Macrocycle name" : "Microcycle name"}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="entry">
          <label>
            Period start
            <input
              required
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Period end
            <input
              required
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {kind === "macro" && (
          <label>
            Macrocycle goal
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} />
          </label>
        )}
        <button>Save {kind === "macro" ? "macrocycle" : "microcycle"}</button>
        <button type="button" className="secondary" onClick={close}>
          Cancel period edit
        </button>
      </form>
    </section>
  );
}
export function Planner({
  data,
  templates,
  settings,
  overrides,
  exercises,
  run,
  openLog,
}: {
  data: PlannerData;
  templates: WorkoutTemplate[];
  settings: Settings;
  overrides: Override[];
  exercises: Exercise[];
  run: Run;
  openLog: (id: string) => void;
}) {
  const [initial] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("effective-reps-planner-view") || "{}",
        ) || {}
      );
    } catch {
      return {};
    }
  });
  const [macroId, setMacro] = useState<string>(initial.macroId || ""),
    [mesoId, setMeso] = useState<string>(initial.mesoId || ""),
    [microId, setMicro] = useState<string>(initial.microId || ""),
    [scopeLevel, setScope] = useState<Scope["level"]>(
      ["workout", "micro", "meso", "macro"].includes(initial.scopeLevel)
        ? initial.scopeLevel
        : "micro",
    ),
    [workoutId, setWorkout] = useState<string>(initial.workoutId || ""),
    [mode, setMode] = useState<"compare" | "planned" | "completed">(
      ["compare", "planned", "completed"].includes(initial.mode)
        ? initial.mode
        : "compare",
    ),
    [current, setCurrent] = useState(initial.current === true),
    [day, setDay] = useState(localDate()),
    [template, setTemplate] = useState(""),
    [transfer, setTransfer] = useState<{
      kind: "plan" | "log";
      id: string;
    } | null>(null),
    [copy, setCopy] = useState(false),
    [destinationMicro, setDestinationMicro] = useState(""),
    [editor, setEditor] = useState<{
      kind: "macro" | "micro";
      record?: Macrocycle | Microcycle;
    } | null>(null);
  const mesos = data.mesos.filter(
      (m) => !macroId || m.macrocycleId === macroId,
    ),
    meso = mesos.find((m) => m.id === mesoId) || mesos[0],
    micros = data.micros
      .filter((m) => m.mesocycleId === meso?.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    micro = micros.find((m) => m.id === microId) || micros[0],
    macro = data.macros.find((m) => m.id === (macroId || meso?.macrocycleId));
  const selectedWorkout =
    workoutId ||
    data.scheduled.find((w) => w.microcycleId === micro?.id)?.id ||
    data.sessions.find((s) => s.microcycleId === micro?.id)?.id ||
    "";
  useEffect(() => {
    localStorage.setItem(
      "effective-reps-planner-view",
      JSON.stringify({
        macroId,
        mesoId: meso?.id || mesoId,
        microId: micro?.id || microId,
        scopeLevel,
        workoutId,
        mode,
        current,
      }),
    );
  }, [macroId, meso?.id, micro?.id, scopeLevel, workoutId, mode, current]);
  useEffect(() => {
    if (micro) setDay(micro.startDate);
  }, [micro?.id]);
  const scope: Scope = {
    level: scopeLevel,
    id:
      scopeLevel === "macro"
        ? macro?.id || ""
        : scopeLevel === "meso"
          ? meso?.id || ""
          : scopeLevel === "micro"
            ? micro?.id || ""
            : selectedWorkout,
  };
  const analytics = scopeExposure(
    data,
    scope,
    settings,
    overrides,
    exercises,
    current,
  );
  const planned = data.scheduled.filter(
      (w) => w.microcycleId === micro?.id && !!micro,
    ),
    actual = data.sessions.filter(
      (s) => s.microcycleId === micro?.id && !!micro,
    );
  const days = micro
    ? [
        ...new Set([
          ...periodDays(micro.startDate, micro.endDate),
          ...planned.map((w) => w.day),
          ...actual.map(sessionDay),
        ]),
      ].sort()
    : [];
  async function transferTo(
    kind: "plan" | "log",
    id: string,
    date: string,
    targetMicro: string | null,
    copyPlan: boolean,
  ) {
    const parent =
      data.micros.find((m) => m.id === targetMicro)?.mesocycleId ||
      meso?.id ||
      null;
    if (kind === "plan")
      await moveScheduled(id, date, targetMicro, parent, copyPlan);
    else if (copyPlan) await copySessionPlan(id, date, targetMicro, parent);
    else await placeSession(id, date, targetMicro, parent);
    setTransfer(null);
  }
  function dragStart(e: React.DragEvent, kind: "plan" | "log", id: string) {
    e.dataTransfer.setData(
      "application/x-training-workout",
      JSON.stringify({ kind, id }),
    );
    e.dataTransfer.effectAllowed = "copyMove";
  }
  const startTransfer = (kind: "plan" | "log", id: string, date: string) => {
    setTransfer({ kind, id });
    setDay(date);
    setDestinationMicro(micro?.id || "");
  };
  const openScheduled = (w: ScheduledWorkout) => {
    const logged = data.sessions.find((s) => s.scheduledWorkoutId === w.id);
    if (logged) openLog(logged.id);
    else location.hash = `workout?scheduled=${w.id}`;
  };
  const knownRows = Object.entries(analytics.totals);
  return (
    <div className="planner">
      <section className="card planner-toolbar">
        <div className="section-title">
          <div>
            <p className="eyebrow">TRAINING-CYCLE PLANNER</p>
            <h2>
              {macro?.name || "Training program"} ·{" "}
              {meso?.name || "No mesocycle"}
            </h2>
            <p>
              {micro
                ? `${micro.name} · Microcycle ${micros.indexOf(micro) + 1} of ${micros.length} · ${micro.startDate} – ${micro.endDate}`
                : "Define a microcycle to start planning. Periods are named explicitly, not inferred from calendar weeks."}
            </p>
          </div>
          <a className="button-link" href="#workout">
            Workout log
          </a>
        </div>
        <div className="planner-selectors">
          <label>
            Macrocycle
            <select
              aria-label="Planner macrocycle"
              value={macroId}
              onChange={(e) => {
                setMacro(e.target.value);
                setMeso("");
                setMicro("");
              }}
            >
              <option value="">All / unassigned blocks</option>
              {data.macros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mesocycle
            <select
              aria-label="Planner mesocycle"
              value={meso?.id || ""}
              onChange={(e) => {
                setMeso(e.target.value);
                setMicro("");
              }}
            >
              {mesos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Microcycle
            <select
              aria-label="Planner microcycle"
              value={micro?.id || ""}
              onChange={(e) => {
                setMicro(e.target.value);
                const m = micros.find((m) => m.id === e.target.value);
                if (m) setDay(m.startDate);
              }}
            >
              {micros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.startDate}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="card planner-analytics">
        <div className="section-title">
          <h2>Muscle exposure</h2>
          <span className="eyebrow">
            {scopeLevel.toUpperCase()} · {mode.toUpperCase()}
          </span>
        </div>
        <div className="planner-controls">
          <div className="segmented" aria-label="Analytics aggregation">
            {(["workout", "micro", "meso", "macro"] as const).map((level) => (
              <button
                key={level}
                className={level === scopeLevel ? "chosen" : ""}
                onClick={() => setScope(level)}
              >
                {
                  {
                    workout: "Workout",
                    micro: "Micro",
                    meso: "Meso",
                    macro: "Macro",
                  }[level]
                }
              </button>
            ))}
          </div>
          <label>
            Training exposure
            <select
              aria-label="Planned or completed"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="compare">Compare planned / completed</option>
              <option value="planned">Planned</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            Muscle allocation
            <select
              aria-label="Muscle allocation"
              value={current ? "current" : "saved"}
              onChange={(e) => setCurrent(e.target.value === "current")}
            >
              <option value="saved">Saved allocation snapshots</option>
              <option value="current">Current settings (what-if only)</option>
            </select>
          </label>
        </div>
        {scopeLevel === "workout" && (
          <label>
            Selected workout
            <select
              aria-label="Analytics workout"
              value={selectedWorkout}
              onChange={(e) => setWorkout(e.target.value)}
            >
              <option value="">Select a workout</option>
              {data.scheduled.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.day} · {w.snapshot.name}
                </option>
              ))}
              {data.sessions
                .filter((s) => !s.scheduledWorkoutId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {sessionDay(s)} ·{" "}
                    {s.templateSnapshot?.name || "Unplanned workout"}
                  </option>
                ))}
            </select>
          </label>
        )}
        {knownRows.length ? (
          <div className="exposure-grid">
            {knownRows.map(([muscle, n]) => (
              <article
                className="exposure-tile"
                key={muscle}
                aria-label={`${muscle} exposure`}
              >
                <h3>{muscle}</h3>
                <strong>
                  {mode === "planned"
                    ? range(n.planER, n.missingER)
                    : mode === "completed"
                      ? format(n.er)
                      : `${format(n.er)} / ${range(n.planER, n.missingER)}`}{" "}
                  ER
                </strong>
                <div
                  className="exposure-track"
                  title="Completed ER compared with the planned upper estimate, not a scientific optimum"
                >
                  <span
                    style={{
                      width: `${Math.min(100, (n.er / Math.max(n.planER[1], n.er, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {mode === "planned"
                    ? `${range(n.planReps, n.missingReps)} planned reps`
                    : mode === "completed"
                      ? `${format(n.reps)} completed reps`
                      : `${format(n.reps)} completed / ${range(n.planReps, n.missingReps)} planned reps`}
                </small>
                {n.missingER + n.missingReps > 0 && (
                  <small className="partial-target">
                    Partial plan · missing targets or rest-pause bouts
                  </small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p>No exposure records in this explicitly selected period.</p>
        )}
        <p className="muted">
          ER is model-derived training exposure, not measured hypertrophy.
          Accumulated ER is not a linear prediction of growth. Repetitions and
          ER use muscle-allocation weights; completed sets in active workouts
          are included. “+ ?” means unknown targets, not zero. No shared optimal
          ER threshold is assumed. Gradient stimulus: not configured.
        </p>
      </section>
      {micro && (
        <>
          <section className="card planner-schedule">
            <h2>{transfer ? "Move or copy workout" : "Quick-add template"}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  async () => {
                    if (transfer)
                      await transferTo(
                        transfer.kind,
                        transfer.id,
                        day,
                        destinationMicro || null,
                        copy,
                      );
                    else {
                      const id = await scheduleWorkout(
                        day,
                        template || null,
                        micro.id,
                        meso?.id || null,
                      );
                      setWorkout(id);
                    }
                  },
                  transfer ? "Workout placement saved." : "Workout scheduled.",
                );
              }}
            >
              <div className="planner-selectors">
                <label>
                  Selected day
                  <input
                    aria-label="Planner day"
                    required
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                </label>
                {transfer ? (
                  <label>
                    Destination microcycle
                    <select
                      aria-label="Destination microcycle"
                      value={destinationMicro}
                      onChange={(e) => setDestinationMicro(e.target.value)}
                    >
                      <option value="">Outside a microcycle</option>
                      {data.micros.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Quick-add template
                    <select
                      aria-label="Quick-add template"
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                    >
                      <option value="">Blank workout</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button>
                  {transfer
                    ? copy
                      ? "Copy plan to day"
                      : "Move to day"
                    : "Schedule workout"}
                </button>
                {transfer && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setTransfer(null)}
                  >
                    Cancel move
                  </button>
                )}
              </div>
            </form>
            <label className="planner-copy">
              <input
                type="checkbox"
                checked={copy}
                onChange={(e) => setCopy(e.target.checked)}
              />
              Copy plan when dragging (or hold Alt/Option)
            </label>
            <p className="muted">
              Drop on another microcycle tab or day. Dragging a scheduled plan
              never changes logged dates or cycle membership. Moving an unlinked
              logged workout explicitly changes its performed date and
              membership; copying creates a plan with no actuals.
            </p>
          </section>
          <div className="micro-tabs" aria-label="Microcycle drop targets">
            {data.micros
              .filter(
                (m) =>
                  !macro ||
                  data.mesos.find((parent) => parent.id === m.mesocycleId)
                    ?.macrocycleId === macro.id,
              )
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .map((m) => (
                <button
                  className={m.id === micro.id ? "chosen" : ""}
                  key={m.id}
                  onClick={() => {
                    setMeso(m.mesocycleId);
                    setMicro(m.id);
                    setDay(m.startDate);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      const source = JSON.parse(
                        e.dataTransfer.getData(
                          "application/x-training-workout",
                        ),
                      );
                      run(() =>
                        transferTo(
                          source.kind,
                          source.id,
                          m.startDate,
                          m.id,
                          copy || e.altKey,
                        ),
                      );
                    } catch {}
                  }}
                >
                  {m.name}
                </button>
              ))}
          </div>
          <div
            className="cycle-board"
            style={
              { "--day-count": Math.min(days.length, 7) } as React.CSSProperties
            }
          >
            {days.map((date) => {
              const dayPlans = planned.filter((w) => w.day === date),
                dayLogs = actual.filter(
                  (s) =>
                    sessionDay(s) === date &&
                    !dayPlans.some((w) => w.id === s.scheduledWorkoutId),
                );
              return (
                <section
                  className={`planner-day ${date === day ? "selected-day" : ""}`}
                  key={date}
                  data-planner-day={date}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      const source = JSON.parse(
                        e.dataTransfer.getData(
                          "application/x-training-workout",
                        ),
                      );
                      run(() =>
                        transferTo(
                          source.kind,
                          source.id,
                          date,
                          micro.id,
                          copy || e.altKey,
                        ),
                      );
                    } catch {}
                  }}
                >
                  <button
                    className="day-heading"
                    onClick={() => {
                      setDay(date);
                      const w = dayPlans[0],
                        s = dayLogs[0];
                      if (w) openScheduled(w);
                      else if (s) openLog(s.id);
                    }}
                  >
                    <strong>
                      {new Date(date + "T12:00:00").toLocaleDateString([], {
                        weekday: "short",
                      })}
                    </strong>
                    <small>{date}</small>
                  </button>
                  {(date < micro.startDate || date > micro.endDate) && (
                    <small>Outside period dates · explicit member</small>
                  )}
                  {!dayPlans.length && !dayLogs.length && (
                    <p className="rest-day">Rest / unscheduled</p>
                  )}
                  {dayPlans.map((w) => {
                    const linked = data.sessions.find(
                      (s) => s.scheduledWorkoutId === w.id,
                    );
                    return (
                      <article
                        className="scheduled-card"
                        key={w.id}
                        draggable
                        onDragStart={(e) => dragStart(e, "plan", w.id)}
                      >
                        <div className="scheduled-heading">
                          <button
                            className="text-button"
                            onClick={() => {
                              setWorkout(w.id);
                              openScheduled(w);
                            }}
                          >
                            {w.snapshot.name}
                          </button>
                          <small>
                            {linked?.status === "completed"
                              ? "Logged"
                              : linked
                                ? "In progress"
                                : "Planned"}
                          </small>
                        </div>
                        {linked &&
                          (sessionDay(linked) !== w.day ||
                            linked.microcycleId !== w.microcycleId) && (
                            <small>
                              Actual: {sessionDay(linked)} · logged cycle
                              membership unchanged
                            </small>
                          )}
                        <button
                          className="text-button"
                          onClick={() => {
                            setScope("workout");
                            setWorkout(w.id);
                          }}
                        >
                          Inspect exposure
                        </button>
                        {w.snapshot.items.map((item) => (
                          <details className="planner-exercise" key={item.id}>
                            <summary>
                              {item.exercise.name}
                              <small>
                                {item.sets} set rows ·{" "}
                                {item.setPlans
                                  ?.map((p) => p.targetReps || "?")
                                  .join(" / ") || item.reps}{" "}
                                reps
                              </small>
                            </summary>
                            <div className="compact-set-scroll">
                              <table className="compact-sets">
                                <thead>
                                  <tr>
                                    {["#", "Load", "Target", "RIR"].map((h) => (
                                      <th scope="col" key={h}>
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {plansFor(item).map((p, i) => (
                                    <PlannedRow
                                      compact
                                      key={item.id + i + JSON.stringify(p)}
                                      plan={p}
                                      label={planLabels(plansFor(item))[i]}
                                      locked={!!linked}
                                      save={(plan) =>
                                        run(() =>
                                          editScheduledSet(
                                            w.id,
                                            item.id,
                                            i,
                                            plan,
                                          ),
                                        )
                                      }
                                    />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {linked && (
                              <ActualPreview
                                sets={data.sets.filter(
                                  (s) =>
                                    s.sessionId === linked.id &&
                                    (s.templateItemId === item.id ||
                                      (!s.templateItemId &&
                                        s.exerciseId === item.exercise.id)),
                                )}
                              />
                            )}
                          </details>
                        ))}
                        <div className="planner-card-actions">
                          <button
                            className="secondary"
                            onClick={() => {
                              setCopy(false);
                              startTransfer("plan", w.id, date);
                            }}
                          >
                            Move
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              setCopy(true);
                              startTransfer("plan", w.id, date);
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {dayLogs.map((s) => (
                    <article
                      className="scheduled-card logged-card"
                      key={s.id}
                      draggable
                      onDragStart={(e) => dragStart(e, "log", s.id)}
                    >
                      <button
                        className="text-button"
                        onClick={() => openLog(s.id)}
                      >
                        {s.templateSnapshot?.name || "Logged workout"}
                      </button>
                      <small>
                        {s.status === "active" ? "In progress" : "Completed"} ·
                        actual date
                      </small>
                      <details>
                        <summary>Exercises & actual sets</summary>
                        {[
                          ...new Set(
                            data.sets
                              .filter((r) => r.sessionId === s.id)
                              .map((r) => r.exerciseId),
                          ),
                        ].map((id) => (
                          <div key={id}>
                            <strong>
                              {
                                data.sets.find((r) => r.exerciseId === id)
                                  ?.exerciseName
                              }
                            </strong>
                            <ActualPreview
                              sets={data.sets.filter(
                                (r) =>
                                  r.sessionId === s.id && r.exerciseId === id,
                              )}
                            />
                          </div>
                        ))}
                      </details>
                      <button
                        className="secondary"
                        onClick={() => {
                          setCopy(false);
                          startTransfer("log", s.id, date);
                        }}
                      >
                        Move
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          setCopy(true);
                          startTransfer("log", s.id, date);
                        }}
                      >
                        Copy plan
                      </button>
                    </article>
                  ))}
                  <button
                    className="add-day-workout"
                    onClick={() => {
                      setDay(date);
                      setTransfer(null);
                    }}
                  >
                    + Workout on {date}
                  </button>
                </section>
              );
            })}
          </div>
        </>
      )}
      <details className="card">
        <summary>
          Strength targets and observed performance · selected scope
        </summary>
        <p className="muted">
          Compare only within each exercise, with consistent technique and load
          conventions. Estimates are heuristic; warm-ups and rest-pause have no
          e1RM estimate.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Exercise",
                  "Planned S targets",
                  "Best observed load",
                  "Best estimated 1RM (kg)",
                ].map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ...new Set([
                  ...analytics.planned
                    .filter((r) => r.plan.trackStrength)
                    .map((r) => r.exerciseId),
                  ...analytics.sets
                    .filter((r) => r.completed !== false && r.strength)
                    .map((r) => r.exerciseId),
                ]),
              ].map((id) => {
                const rows = analytics.sets.filter(
                    (s) =>
                      s.exerciseId === id &&
                      s.completed !== false &&
                      s.strength &&
                      !s.plan?.warmup,
                  ),
                  best = rows.length
                    ? rows.reduce((a, b) => (kg(a) > kg(b) ? a : b))
                    : null,
                  estimates = rows
                    .map(estimated1RM)
                    .filter((n): n is number => n !== null);
                return (
                  <tr key={id}>
                    <td>
                      {exercises.find((e) => e.id === id)?.name ||
                        analytics.sets.find((s) => s.exerciseId === id)
                          ?.exerciseName ||
                        id}
                    </td>
                    <td>
                      {[
                        ...new Set(
                          analytics.planned
                            .filter(
                              (r) =>
                                r.exerciseId === id && r.plan.trackStrength,
                            )
                            .map(
                              (r) =>
                                `${r.plan.loadText || "?"} ${r.plan.unit} × ${r.plan.targetReps || "?"} · RIR ${r.plan.targetRir ?? "?"}`,
                            ),
                        ),
                      ].join("; ") || "No saved load target"}
                    </td>
                    <td>
                      {best
                        ? `${best.strength!.load} ${best.strength!.unit} × ${best.reps} · RIR ${best.rir}`
                        : "—"}
                    </td>
                    <td>
                      {estimates.length ? format(Math.max(...estimates)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <details className="card cycle-management" open={!data.micros.length}>
        <summary>Manage training cycles</summary>
        <div className="actions">
          <button onClick={() => setEditor({ kind: "macro" })}>
            New macrocycle
          </button>
          <button disabled={!meso} onClick={() => setEditor({ kind: "micro" })}>
            New microcycle
          </button>
          {macro && (
            <button
              className="secondary"
              onClick={() => setEditor({ kind: "macro", record: macro })}
            >
              Edit macrocycle
            </button>
          )}
          {micro && (
            <button
              className="secondary"
              onClick={() => setEditor({ kind: "micro", record: micro })}
            >
              Edit microcycle
            </button>
          )}
        </div>
        {editor && (
          <CycleEditor
            key={editor.kind + (editor.record?.id || "new")}
            kind={editor.kind}
            record={editor.record}
            mesoId={meso?.id || ""}
            run={run}
            close={() => setEditor(null)}
          />
        )}
        <MesocycleManager
          mesocycles={data.mesos}
          templates={templates}
          sessions={data.sessions}
          macros={data.macros}
          run={run}
        />
      </details>
      <details className="card">
        <summary>Assign existing workout to a microcycle</summary>
        <AssignWorkout
          sessions={data.sessions}
          micros={data.micros}
          run={run}
        />
      </details>
      <section className="planner-adhoc">
        {data.sessions.some((s) => s.status === "active") ? (
          <a className="button-link" href="#workout">
            Resume workout
          </a>
        ) : (
          <StartWorkout
            templates={templates}
            mesocycles={data.mesos}
            run={run}
          />
        )}
      </section>
    </div>
  );
}
function ActualPreview({ sets }: { sets: PlannerData["sets"] }) {
  return (
    <div className="compact-set-scroll">
      <table className="compact-sets">
        <caption>Actual sets</caption>
        <thead>
          <tr>
            {["Reps", "RIR", "ER"].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id}>
              <td>
                {s.completed === false ? "—" : s.bouts?.join(",") || s.reps}
              </td>
              <td>{s.actualRir === null ? "—" : (s.actualRir ?? s.rir)}</td>
              <td>{s.completed === false ? "—" : format(s.effectiveReps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AssignWorkout({
  sessions,
  micros,
  run,
}: {
  sessions: Session[];
  micros: Microcycle[];
  run: Run;
}) {
  const [id, setId] = useState(""),
    [micro, setMicro] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const session = sessions.find((s) => s.id === id),
            period = micros.find((m) => m.id === micro);
          if (!session || !period)
            throw new Error("Select a workout and microcycle.");
          await placeSession(
            id,
            sessionDay(session),
            micro,
            period.mesocycleId,
          );
        }, "Explicit workout membership saved.");
      }}
    >
      <label>
        Existing workout
        <select
          aria-label="Existing workout"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">Select workout</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {sessionDay(s)} · {s.templateSnapshot?.name || "Blank workout"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assign microcycle
        <select
          aria-label="Assign microcycle"
          value={micro}
          onChange={(e) => setMicro(e.target.value)}
        >
          <option value="">Select microcycle</option>
          {micros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <button>Save cycle membership</button>
    </form>
  );
}
