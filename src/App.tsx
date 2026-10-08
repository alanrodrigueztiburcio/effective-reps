import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import raw from "./data/exercises.json";
import source from "./data/source.json";
import {
  type Exercise,
  type SetRecord,
  type Weights,
  type Muscle,
  defaults,
  muscles,
  effective,
  attribution,
  aggregate,
  target,
  validateSettings,
} from "./core";
import {
  db,
  now,
  startSession,
  saveSet,
  exportBackup,
  restoreBackup,
} from "./db";
import { StrengthHistory } from "./StrengthHistory";
import { SyncPanel } from "./SyncPanel";
const catalog = raw as Exercise[];
const categories = [
  "strength",
  "powerlifting",
  "olympic weightlifting",
  "strongman",
  "plyometrics",
  "cardio",
  "stretching",
];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
function Image({ path, small = false }: { path?: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  return path && !failed ? (
    <img
      className={small ? "thumb" : "exercise-image"}
      src={source.imageBase + path}
      loading="lazy"
      alt="Exercise demonstration"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={small ? "thumb placeholder" : "placeholder"}>↗</div>
  );
}
export default function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "workout");
  useEffect(() => {
    const f = () => setPage(location.hash.slice(1) || "workout");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const f = () => setOnline(navigator.onLine);
    addEventListener("online", f);
    addEventListener("offline", f);
    return () => {
      removeEventListener("online", f);
      removeEventListener("offline", f);
    };
  }, []);
  const {
    needRefresh: [refresh],
    updateServiceWorker,
  } = useRegisterSW();
  const sessions =
    useLiveQuery(() => db.sessions.orderBy("startedAt").reverse().toArray()) ||
    [];
  const allSets = useLiveQuery(() => db.sets.toArray()) || [];
  const custom = useLiveQuery(() => db.custom.toArray()) || [];
  const overrides = useLiveQuery(() => db.overrides.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get("main")) || defaults;
  const exercises = [...catalog, ...custom];
  const active = sessions.find((s) => s.status === "active");
  const [viewSession, setViewSession] = useState<string | null>(null);
  const session =
    page === "history" ? sessions.find((s) => s.id === viewSession) : active;
  const sets = allSets
    .filter((s) => s.sessionId === session?.id)
    .sort((a, b) => a.sequence - b.sequence);
  const summary = aggregate(sets);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [edit, setEdit] = useState<SetRecord | null>(null);
  const [reps, setReps] = useState(10);
  const [rir, setRir] = useState(2);
  const [mini, setMini] = useState(0);
  const [load, setLoad] = useState<number | "">("");
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [strengthEnabled, setStrengthEnabled] = useState(false);
  useEffect(() => {
    setStrengthEnabled(!!selected && (edit ? !!edit.strength : !!(settings.preferences.strengthExercises as Record<string, boolean> | undefined)?.[selected.id]));
  }, [selected?.id, edit, settings.preferences]);
  const [type, setType] = useState<SetRecord["type"]>("standard");
  useEffect(() => {
    setEdit(null);
  }, [page, session?.id]);
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(30);
  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) &&
      (!equipment || e.equipment === equipment) &&
      (!primary || e.primaryMuscles.includes(primary)) &&
      (!secondary || e.secondaryMuscles.includes(secondary)) &&
      (!category || e.category === category),
  );
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customEquipment, setCustomEquipment] = useState("");
  const [customCategory, setCustomCategory] = useState("strength");
  const [customPrimary, setCustomPrimary] = useState<string[]>([]);
  const [customSecondary, setCustomSecondary] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [weightDraft, setWeightDraft] = useState<Weights>({});
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, success = "") {
    setBusy(true);
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function pick(e: Exercise) {
    setSelected(e);
    setLoad("");
    setQuery("");
    setDetail(null);
    if (page !== "history") location.hash = "workout";
  }
  function editSet(s: SetRecord) {
    setEdit(s);
    setSelected(
      exercises.find((e) => e.id === s.exerciseId) || {
        id: s.exerciseId,
        name: s.exerciseName,
        force: null,
        mechanic: null,
        equipment: null,
        level: "unknown",
        primaryMuscles: Object.keys(s.weights),
        secondaryMuscles: [],
        category: "strength",
        instructions: [],
        images: [],
      },
    );
    setReps(s.reps);
    setRir(s.rir);
    setMini(s.miniReps);
    setType(s.type);
    setLoad(s.strength?.load ?? "");
    setUnit(s.strength?.unit ?? "lb");
  }
  async function log() {
    if (!selected || !session)
      throw new Error("Start a workout and select an exercise first.");
    if (["cardio", "stretching"].includes(selected.category))
      throw new Error(
        "Effective repetitions are unavailable for cardio and stretching.",
      );
    if (strengthEnabled && (load === "" || !Number.isFinite(load) || load <= 0)) throw new Error("Enter a positive load.");
    const unchanged = edit?.exerciseId === selected.id;
    await saveSet({
      id: edit?.id || crypto.randomUUID(),
      sessionId: session.id,
      exerciseId: selected.id,
      exerciseName: unchanged ? edit!.exerciseName : selected.name,
      timestamp: edit?.timestamp || now(),
      sequence:
        edit?.sequence ?? Math.max(0, ...sets.map((s) => s.sequence)) + 1,
      type,
      reps,
      miniReps: type === "rest-pause" ? mini : 0,
      rir,
      effectiveReps: effective(reps, rir, mini, type),
      weights: unchanged
        ? edit!.weights
        : attribution(
            selected,
            settings,
            overrides.find((o) => o.exerciseId === selected.id),
          ),
      calculationVersion: "1",
      strength: strengthEnabled ? { load: Number(load), unit } : undefined,
    });
    setEdit(null);
    setMini(0);
  }
  function directory() {
    return (
      <>
        <div className="search">
          <label>
            Find an exercise
            <input
              aria-label="Search exercises"
              placeholder="Bench press, squat, curl…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(30);
              }}
            />
          </label>
          <div className="filters">
            {[
              [
                "Equipment",
                equipment,
                setEquipment,
                [
                  ...new Set(exercises.map((e) => e.equipment).filter(Boolean)),
                ].sort(),
              ],
              ["Primary muscle", primary, setPrimary, muscles],
              ["Secondary muscle", secondary, setSecondary, muscles],
              ["Category", category, setCategory, categories],
            ].map(([label, value, setter, options]) => (
              <label key={label as string}>
                {label as string}
                <select
                  value={value as string}
                  onChange={(e) => {
                    (setter as (v: string) => void)(e.target.value);
                    setLimit(30);
                  }}
                >
                  <option value="">All</option>
                  {(options as string[]).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
        <p className="muted">
          {filtered.length} exercises · searchable offline
        </p>
        <div className="directory">
          {filtered.slice(0, limit).map((e) => (
            <article className="exercise-row" key={e.id}>
              <Image path={e.images[0]} small />
              <div>
                <button
                  className="text-button exercise-name"
                  onClick={() => {
                    setDetail(e);
                    setWeightDraft(
                      attribution(
                        e,
                        settings,
                        overrides.find((o) => o.exerciseId === e.id),
                      ),
                    );
                  }}
                >
                  {e.name}
                </button>
                <p>
                  {e.primaryMuscles.join(", ") ||
                    "No classified primary muscles"}{" "}
                  · {e.equipment || "Unspecified"}
                </p>
              </div>
              <button className="secondary" onClick={() => pick(e)}>
                Select
              </button>
            </article>
          ))}
        </div>
        {filtered.length > limit && (
          <button
            className="secondary wide"
            onClick={() => setLimit(limit + 30)}
          >
            Show more
          </button>
        )}
      </>
    );
  }
  return (
    <>
      <header>
        <a href="#workout" className="brand">
          <span className="mark">ER</span>
          <span>
            Effective Reps<small>TRAINING VOLUME, MADE CLEAR</small>
          </span>
        </a>
        <span className="connection">
          ● {online ? "Local storage" : "Offline"}
        </span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR TRAINING, ON THIS DEVICE</p>
            <h1>
              {page === "workout"
                ? "Make every set count."
                : page === "exercises"
                  ? "Exercise directory"
                  : page === "history"
                    ? "Workout history"
                    : page === "strength"
                      ? "Strength progression"
                      : "Your settings"}
            </h1>
          </div>
        </div>
        <SyncPanel visible={page === "settings"} />
        {message && (
          <div role="status" className="notice">
            {message}
            <button className="text-button" onClick={() => setMessage("")}>
              Dismiss
            </button>
          </div>
        )}
        {refresh && (
          <div className="notice">
            An update is ready. Finish or pause logging before reloading.
            <button onClick={() => updateServiceWorker(true)}>
              Update & reload
            </button>
          </div>
        )}
        {page === "workout" && !active && (
          <section className="card welcome">
            <p className="eyebrow">READY WHEN YOU ARE</p>
            <h2>A fresh session.</h2>
            <p>
              Log your sets. See effective repetitions for each muscle as you
              train.
            </p>
            <button disabled={busy} onClick={() => run(() => startSession())}>
              Start workout →
            </button>
            <p className="muted">Works offline. Optional account syncing in Settings.</p>
          </section>
        )}
        {((page === "workout" && active) ||
          (page === "history" && session)) && (
          <>
            <div className="session-heading">
              <h2>
                {new Date(session!.startedAt).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </h2>
              {page === "workout" ? (
                <button
                  className="secondary"
                  onClick={() =>
                    run(
                      () =>
                        db.sessions.update(session!.id, {
                          status: "completed",
                          completedAt: now(),
                          updatedAt: now(),
                        }),
                      "Workout completed.",
                    )
                  }
                >
                  Complete workout
                </button>
              ) : (
                <button
                  className="secondary"
                  onClick={() => {
                    setViewSession(null);
                    setEdit(null);
                  }}
                >
                  Back to history
                </button>
              )}
            </div>
            <div className="stats">
              <div>
                <strong>{sets.length}</strong>
                <span>Logged sets</span>
              </div>
              <div>
                <strong>
                  {sets.filter((s) => s.effectiveReps > 0).length}
                </strong>
                <span>Working sets</span>
              </div>
              <div>
                <strong>{fmt(summary.performed)}</strong>
                <span>Effective reps performed</span>
              </div>
              <div>
                <strong>{new Set(sets.map((s) => s.exerciseId)).size}</strong>
                <span>Exercises</span>
              </div>
            </div>
            <div className="workout-grid">
              <section className="card">
                <p className="eyebrow">{edit ? "EDIT SET" : "LOG A SET"}</p>
                {selected ? (
                  <>
                    <div className="selected">
                      <div>
                        <h2>{selected.name}</h2>
                        <p>
                          Primary:{" "}
                          {selected.primaryMuscles.join(", ") ||
                            "None classified"}
                        </p>
                        <p className="muted">
                          Secondary:{" "}
                          {selected.secondaryMuscles.join(", ") ||
                            "None classified"}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setSelected(null)}
                      >
                        Change
                      </button>
                    </div>
                    <details>
                      <summary>Exercise instructions</summary>
                      <Image path={selected.images[0]} />
                      <ol>
                        {selected.instructions.map((i, n) => (
                          <li key={n}>{i}</li>
                        ))}
                      </ol>
                    </details>
                    <label className="weight-row">
                      Track strength for this exercise
                      <input type="checkbox" checked={strengthEnabled} onChange={e => {
                        const enabled = e.target.checked;
                        setStrengthEnabled(enabled);
                        if (edit) setEdit({...edit, strength: enabled ? {load: Number(load) || 1, unit} : undefined});
                        run(() => db.settings.put({...settings, preferences: {...settings.preferences, strengthExercises: {...(settings.preferences.strengthExercises as object || {}), [selected.id]: enabled}}}));
                      }} />
                    </label>
                    <div className="segmented">
                      <button
                        className={type === "standard" ? "chosen" : ""}
                        onClick={() => setType("standard")}
                      >
                        Standard
                      </button>
                      <button
                        className={type === "rest-pause" ? "chosen" : ""}
                        onClick={() => setType("rest-pause")}
                      >
                        Rest-pause
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(log, edit ? "Set updated." : "Set logged.");
                      }}
                    >
                      {strengthEnabled && <div className="entry">
                        <label>Load<input type="number" min="0.01" step="any" required value={load} onChange={e => setLoad(e.target.value === "" ? "" : e.target.valueAsNumber)} /></label>
                        <label>Unit<select value={unit} onChange={e => setUnit(e.target.value as "lb" | "kg")}><option>lb</option><option>kg</option></select></label>
                      </div>}
                      <div className="entry">
                        <label>
                          {type === "standard"
                            ? "Repetitions"
                            : "Activation reps"}
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            required
                            value={reps}
                            onChange={(e) => setReps(e.target.valueAsNumber)}
                          />
                        </label>
                        {type === "rest-pause" && (
                          <label>
                            Mini-set reps
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              required
                              value={mini}
                              onChange={(e) => setMini(e.target.valueAsNumber)}
                            />
                          </label>
                        )}
                      </div>
                      <label>Repetitions in reserve</label>
                      <div className="rir">
                        {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                          <button
                            type="button"
                            className={rir === n ? "chosen" : ""}
                            key={n}
                            onClick={() => setRir(n)}
                          >
                            {n === 6 ? "5+" : n}
                          </button>
                        ))}
                      </div>
                      <div className="preview">
                        <span>Effective repetitions</span>
                        <strong>
                          {Number.isFinite(reps) && Number.isFinite(mini)
                            ? fmt(
                                effective(
                                  Math.max(0, Math.floor(reps)),
                                  rir,
                                  Math.max(0, Math.floor(mini)),
                                  type,
                                ),
                              )
                            : "—"}
                        </strong>
                      </div>
                      <button
                        className="wide"
                        disabled={
                          busy ||
                          ["cardio", "stretching"].includes(selected.category)
                        }
                      >
                        {edit ? "Save changes" : "Log set + "}
                      </button>
                      {["cardio", "stretching"].includes(selected.category) && (
                        <p>
                          Effective-rep logging is disabled for this category.
                        </p>
                      )}
                      {edit && (
                        <button
                          type="button"
                          className="text-button wide"
                          onClick={() => setEdit(null)}
                        >
                          Cancel edit
                        </button>
                      )}
                    </form>
                  </>
                ) : (
                  directory()
                )}
              </section>
              <section className="card">
                <div className="section-title">
                  <h2>Muscle volume</h2>
                  <span>
                    {settings.lower}–{settings.upper} target
                  </span>
                </div>
                <p className="muted">
                  Full credit to every primary muscle by default. Attributed
                  totals can exceed reps performed.
                </p>
                {muscles.map((m) => {
                  const n = summary.totals[m] || 0;
                  return (
                    <details className="muscle" key={m}>
                      <summary>
                        <span className="muscle-label">
                          <span>{m}</span>
                          <strong>{fmt(n)}</strong>
                        </span>
                        <progress
                          max={settings.upper || 1}
                          value={Math.min(n, settings.upper || 1)}
                        />
                        <small>
                          {target(n, settings.lower, settings.upper)}
                        </small>
                      </summary>
                      {sets
                        .filter((s) => (s.weights[m] || 0) > 0)
                        .map((s) => (
                          <p key={s.id}>
                            {s.exerciseName} · set {s.sequence}:{" "}
                            {fmt(s.effectiveReps)} × {s.weights[m]} ={" "}
                            {fmt(s.effectiveReps * s.weights[m]!)}
                          </p>
                        ))}
                    </details>
                  );
                })}
              </section>
            </div>
            <section className="card set-log">
              <h2>Session sets</h2>
              {!sets.length && (
                <p className="muted">The first set starts here.</p>
              )}
              {sets.map((s) => (
                <article key={s.id}>
                  <span className="set-number">{s.sequence}</span>
                  <div>
                    <strong>{s.exerciseName}</strong>
                    <p>
                      {s.strength ? `${s.strength.load} ${s.strength.unit} · ` : ""}{s.reps} reps · RIR {s.rir >= 6 ? "5+" : s.rir}
                      {s.type === "rest-pause"
                        ? ` · ${s.miniReps} mini-set reps`
                        : ""}
                    </p>
                  </div>
                  <strong>
                    {fmt(s.effectiveReps)}
                    <small>eff. reps</small>
                  </strong>
                  <button className="text-button" onClick={() => editSet(s)}>
                    Edit
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      if (confirm("Delete this set?"))
                        run(() =>
                          db.transaction(
                            "rw",
                            [db.sets, db.sessions],
                            async () => {
                              await db.sets.delete(s.id);
                              await db.sessions.update(s.sessionId, {
                                updatedAt: now(),
                              });
                            },
                          ),
                        );
                    }}
                  >
                    Delete
                  </button>
                </article>
              ))}
            </section>
          </>
        )}
        {page === "exercises" && (
          <>
            <div className="session-heading">
              <p>{exercises.length} exercises available</p>
              <button onClick={() => setShowCustom(true)}>
                + Custom exercise
              </button>
            </div>
            <section className="card">{directory()}</section>
          </>
        )}
        {page === "history" && !session && (
          <section className="card">
            {!sessions.length && <p>No workouts yet.</p>}
            {sessions.map((s) => {
              const logged = allSets.filter((r) => r.sessionId === s.id);
              return (
                <button
                  className="history-row"
                  key={s.id}
                  onClick={() => {
                    setViewSession(s.id);
                    setEdit(null);
                    setSelected(null);
                  }}
                >
                  <div>
                    <strong>
                      {new Date(s.startedAt).toLocaleDateString([], {
                        dateStyle: "long",
                      })}
                    </strong>
                    <small>
                      {s.status === "active" ? "In progress" : "Completed"} ·{" "}
                      {logged.length} sets
                    </small>
                  </div>
                  <strong>
                    {fmt(aggregate(logged).performed)}
                    <small>eff. reps →</small>
                  </strong>
                </button>
              );
            })}
          </section>
        )}
        {page === "strength" && <StrengthHistory sets={allSets} />}
        {page === "settings" && (
          <div className="settings-grid">

            <section className="card">
              <h2>Training targets</h2>
              <form
                key={JSON.stringify(settings)}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(async () => {
                    const s = {
                      ...settings,
                      lower: Number(f.get("lower")),
                      upper: Number(f.get("upper")),
                      primary: Number(f.get("primary")),
                      secondary: Number(f.get("secondary")),
                    };
                    validateSettings(s);
                    await db.settings.put(s);
                  }, "Settings saved. Historical attribution remains unchanged.");
                }}
              >
                <div className="entry">
                  <label>
                    Lower threshold
                    <input
                      name="lower"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={settings.lower}
                      required
                    />
                  </label>
                  <label>
                    Upper threshold
                    <input
                      name="upper"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={settings.upper}
                      required
                    />
                  </label>
                </div>
                <h3>Default attribution</h3>
                <div className="entry">
                  <label>
                    Primary weight
                    <input
                      name="primary"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={settings.primary}
                      required
                    />
                  </label>
                  <label>
                    Secondary weight
                    <input
                      name="secondary"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={settings.secondary}
                      required
                    />
                  </label>
                </div>
                <p className="muted">
                  Weights are accounting assumptions, not validated estimates of
                  muscle stimulus. Changes apply to future sets. Exercise
                  overrides take precedence.
                </p>
                <button>Save settings</button>
              </form>
            </section>
            <section className="card">
              <h2>Backup & restore</h2>
              <p>
                Records stay in this browser. Clearing site data can erase them.
                Sign in above to synchronize devices; export backups for recovery or
                migration. Installation does not guarantee permanent storage.
              </p>
              <button
                onClick={() =>
                  run(async () => {
                    const blob = new Blob(
                      [JSON.stringify(await exportBackup(), null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `effective-reps-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }, "Backup exported.")
                }
              >
                Export JSON backup
              </button>
              <label>
                Import behavior
                <select
                  value={restoreMode}
                  onChange={(e) => setRestoreMode(e.target.value as any)}
                >
                  <option value="merge">Merge · existing records win</option>
                  <option value="replace">Replace all local records</option>
                </select>
              </label>
              <label className="file-label">
                Restore JSON backup
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (
                      file &&
                      (restoreMode !== "replace" ||
                        confirm(
                          "Replace all local workouts, custom exercises, and settings? Export a backup first.",
                        ))
                    )
                      run(async () => {
                        await restoreBackup(
                          JSON.parse(await file.text()),
                          restoreMode,
                        );
                        setEdit(null);
                        setViewSession(null);
                      }, "Backup restored.");
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="secondary"
                onClick={() =>
                  run(async () => {
                    const granted = await navigator.storage?.persist?.();
                    setMessage(
                      granted
                        ? "Persistent storage granted. Keep exporting backups."
                        : "Persistent storage was not granted. Keep exporting backups.",
                    );
                  })
                }
              >
                Request persistent storage
              </button>
            </section>
            <section className="card">
              <h2>Install & use offline</h2>
              <p>
                iPhone: open in Safari, tap Share, then Add to Home Screen.
                Android: use the browser’s Install app option. Open once online
                and let assets cache before offline use.
              </p>
              <h3>Model version 1</h3>
              <p>
                Standard: max(0, min(reps, 5 − RIR)). Rest-pause adds all
                mini-set reps. The model and target range are
                training-accounting assumptions.
              </p>
              <p>
                Exercise data:{" "}
                <a
                  href="https://github.com/yuhonas/free-exercise-db"
                  target="_blank"
                  rel="noreferrer"
                >
                  Free Exercise DB
                </a>{" "}
                · Unlicense · {source.count} records · revision{" "}
                {source.sha.slice(0, 12)}.
              </p>
              <p>
                Method:{" "}
                <a
                  href="https://www.brusovcoach.org/effective-reps.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Brusov Coach estimator
                </a>
                .
              </p>
            </section>
          </div>
        )}
      </main>
      <nav>
        {[
          ["workout", "◈", "Workout"],
          ["exercises", "⌕", "Exercises"],
          ["history", "◷", "History"],
          ["strength", "↗", "Strength"],
          ["settings", "⚙", "Settings"],
        ].map(([id, icon, label]) => (
          <a className={page === id ? "active" : ""} key={id} href={"#" + id}>
            <span>{icon}</span>
            {label}
          </a>
        ))}
      </nav>
      {detail && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
          >
            <button className="close secondary" onClick={() => setDetail(null)}>
              Close
            </button>
            <h2>{detail.name}</h2>
            <p>
              {detail.equipment || "Unspecified equipment"} ·{" "}
              {detail.mechanic || "Unspecified mechanic"} ·{" "}
              {detail.force || "Unspecified force"} · {detail.level} ·{" "}
              {detail.category}
            </p>
            <p>Primary: {detail.primaryMuscles.join(", ") || "None"}</p>
            <p>Secondary: {detail.secondaryMuscles.join(", ") || "None"}</p>
            <div className="images">
              {detail.images.map((p) => (
                <Image key={p} path={p} />
              ))}
            </div>
            <details>
              <summary>Instructions</summary>
              <ol>
                {detail.instructions.map((i, n) => (
                  <li key={n}>{i}</li>
                ))}
              </ol>
            </details>
            <h3>Attribution for future sets</h3>
            {[
              ...new Set([
                ...detail.primaryMuscles,
                ...detail.secondaryMuscles,
              ]),
            ].map((m) => (
              <label className="weight-row" key={m}>
                {m}
                <input
                  aria-label={`${m} weight`}
                  type="number"
                  min="0"
                  step="any"
                  value={weightDraft[m as Muscle] ?? 0}
                  onChange={(e) =>
                    setWeightDraft({
                      ...weightDraft,
                      [m]: e.target.valueAsNumber,
                    })
                  }
                />
              </label>
            ))}
            <button
              onClick={() =>
                run(async () => {
                  if (
                    Object.values(weightDraft).some(
                      (w) => !Number.isFinite(w) || w! < 0,
                    )
                  )
                    throw new Error("Weights must be nonnegative numbers.");
                  await db.overrides.put({
                    exerciseId: detail.id,
                    weights: weightDraft,
                    updatedAt: now(),
                  });
                }, "Exercise override saved.")
              }
            >
              Save override
            </button>
            <button
              className="secondary"
              onClick={() =>
                run(async () => {
                  await db.overrides.delete(detail.id);
                  setWeightDraft(attribution(detail, settings));
                }, "Override reset.")
              }
            >
              Reset
            </button>
            <button className="wide" onClick={() => pick(detail)}>
              Select exercise
            </button>
          </section>
        </div>
      )}
      {showCustom && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label="Custom exercise"
          >
            <button
              className="close secondary"
              onClick={() => setShowCustom(false)}
            >
              Close
            </button>
            <h2>Create exercise</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (!customName.trim() || !customPrimary.length)
                    throw new Error(
                      "Enter a name and at least one primary muscle.",
                    );
                  await db.custom.add({
                    id: "custom:" + crypto.randomUUID(),
                    name: customName.trim(),
                    equipment: customEquipment || null,
                    category: customCategory,
                    primaryMuscles: customPrimary,
                    secondaryMuscles: customSecondary,
                    force: null,
                    mechanic: null,
                    level: "custom",
                    instructions: instructions.split("\n").filter(Boolean),
                    images: [],
                  });
                  setShowCustom(false);
                  setCustomName("");
                  setCustomPrimary([]);
                  setCustomSecondary([]);
                  setInstructions("");
                }, "Custom exercise saved.");
              }}
            >
              <label>
                Name
                <input
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </label>
              <label>
                Equipment
                <input
                  value={customEquipment}
                  onChange={(e) => setCustomEquipment(e.target.value)}
                />
              </label>
              <label>
                Category
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {[
                ["Primary muscles", customPrimary, setCustomPrimary],
                ["Secondary muscles", customSecondary, setCustomSecondary],
              ].map(([title, values, setter]) => (
                <fieldset key={title as string}>
                  <legend>{title as string}</legend>
                  <div className="checkboxes">
                    {muscles.map((m) => (
                      <label key={m}>
                        <input
                          type="checkbox"
                          checked={(values as string[]).includes(m)}
                          onChange={(e) =>
                            (setter as (v: string[]) => void)(
                              e.target.checked
                                ? [...(values as string[]), m]
                                : (values as string[]).filter((v) => v !== m),
                            )
                          }
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <label>
                Instructions (one step per line)
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </label>
              <button>Create exercise</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
