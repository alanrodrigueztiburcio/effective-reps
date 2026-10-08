import { useState } from "react";
import type { Mesocycle, Session, SetRecord } from "./core";
import { muscles } from "./core";
import { exerciseSummary, muscleSummary, progressGroups } from "./progress";
import { kg } from "./strength";
import { StrengthHistory } from "./StrengthHistory";
const number = (n: number | null) => (n === null ? "—" : n.toFixed(1));
export function ProgressView({
  sessions,
  sets,
  mesocycles,
}: {
  sessions: Session[];
  sets: SetRecord[];
  mesocycles: Mesocycle[];
}) {
  const [block, setBlock] = useState("all"),
    [by, setBy] = useState<"week" | "mesocycle">("week"),
    [outcome, setOutcome] = useState<"exercise" | "muscle">("exercise"),
    [exercise, setExercise] = useState(""),
    [unit, setUnit] = useState<"lb" | "kg">("lb");
  const groups = progressGroups(sessions, sets, mesocycles, by, block),
    eligibleIds = new Set(groups.flatMap((g) => g.sessions.map((s) => s.id))),
    eligible = sets.filter((s) => eligibleIds.has(s.sessionId));
  const exercises = [
    ...new Map(
      sets.filter((s) => s.strength).map((s) => [s.exerciseId, s.exerciseName]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const selected = exercise || exercises[0]?.[0] || "",
    factor = unit === "lb" ? 0.45359237 : 1;
  const visibleMuscles = muscles.filter((m) =>
    groups.some((g) => (muscleSummary(g)[m] || 0) > 0),
  );
  return (
    <>
      <section className="card">
        <h2>Training progress</h2>
        <div className="entry">
          <label>
            Progress mesocycle
            <select value={block} onChange={(e) => setBlock(e.target.value)}>
              <option value="all">All mesocycles & unassigned</option>
              <option value="unassigned">No mesocycle</option>
              {mesocycles.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Group progress by
            <select
              value={by}
              onChange={(e) => setBy(e.target.value as typeof by)}
            >
              <option value="week">Week</option>
              <option value="mesocycle">Mesocycle</option>
            </select>
          </label>
        </div>
        <div className="segmented">
          <button
            className={outcome === "exercise" ? "chosen" : ""}
            onClick={() => setOutcome("exercise")}
          >
            Exercise strength
          </button>
          <button
            className={outcome === "muscle" ? "chosen" : ""}
            onClick={() => setOutcome("muscle")}
          >
            Muscle exposure
          </button>
        </div>
        <p className="muted">
          Completed workouts only. Calendar weeks begin Monday; a selected
          block’s weeks begin on its start date. Explicit block membership
          includes workouts outside planned dates. No workouts is not the same
          as a measured zero.
        </p>
        {outcome === "exercise" ? (
          <>
            <div className="entry">
              <label>
                Compare exercise
                <select
                  value={selected}
                  onChange={(e) => setExercise(e.target.value)}
                >
                  {exercises.map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Comparison unit
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as "lb" | "kg")}
                >
                  <option>lb</option>
                  <option>kg</option>
                </select>
              </label>
            </div>
            <p className="muted">
              Best load includes its reps and RIR. Estimated 1RM is an
              approximate within-exercise indicator; first/last are each
              workout’s best eligible estimate in this group, not
              matched-condition causal effects.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    <th scope="col">Sets</th>
                    <th scope="col">Best load · reps · RIR</th>
                    <th scope="col">Best est. 1RM</th>
                    <th scope="col">First → last est. 1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => {
                    const x = exerciseSummary(g, selected);
                    return (
                      <tr key={i}>
                        <td>{g.label}</td>
                        <td>{x.sets}</td>
                        <td>
                          {x.bestLoad
                            ? `${number(kg(x.bestLoad) / factor)} ${unit} · ${x.bestLoad.reps} · ${x.bestLoad.rir >= 6 ? "5+" : x.bestLoad.rir}`
                            : "—"}
                        </td>
                        <td>
                          {x.best1RM === null
                            ? "—"
                            : `${number(x.best1RM / factor)} ${unit}`}
                        </td>
                        <td>
                          {x.first1RM === null
                            ? "—"
                            : `${number(x.first1RM / factor)} → ${number(x.last1RM! / factor)} ${unit}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <p>
              Muscle-level effective-rep exposure uses each set’s saved
              attribution, including secondary-muscle credit. This is a
              training-accounting index, not a validated measure of hypertrophy.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    <th scope="col">Sessions</th>
                    {visibleMuscles.map((m) => (
                      <th scope="col" key={m}>
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => {
                    const totals = muscleSummary(g);
                    return (
                      <tr key={i}>
                        <td>{g.label}</td>
                        <td>{g.sessions.length}</td>
                        {visibleMuscles.map((m) => (
                          <td key={m}>{number(totals[m] || 0)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!groups.length && <p>No completed workouts in this selection.</p>}
      </section>
      {outcome === "exercise" && (
        <StrengthHistory
          sets={eligible}
          sessions={sessions}
          comparisonSets={sets}
        />
      )}
    </>
  );
}
