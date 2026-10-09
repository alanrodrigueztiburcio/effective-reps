import { useState } from "react";
import type { Session, SetRecord } from "./core";
import { estimated1RM, improvement } from "./strength";
import { sessionDay, setTime } from "./training";
export function StrengthHistory({
  sets,
  sessions = [],
  comparisonSets = sets,
}: {
  sets: SetRecord[];
  sessions?: Session[];
  comparisonSets?: SetRecord[];
}) {
  const [exercise, select] = useState("");
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const tracked = sets.filter(
    (s) => (s.strength || s.plan?.trackStrength) && s.completed !== false,
  );
  const exercises = [
    ...new Map(tracked.map((s) => [s.exerciseId, s.exerciseName])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const rows = tracked
    .filter((s) => s.exerciseId === (exercise || exercises[0]?.[0]))
    .sort(
      (a, b) => setTime(b).localeCompare(setTime(a)) || b.sequence - a.sequence,
    );
  return (
    <section className="card">
      <h2>Strength progression</h2>
      <p>
        Enable strength tracking on individual sets. Use consistent equipment,
        range of motion, and load convention (total barbell load or per
        dumbbell).
      </p>
      <label>
        Exercise
        <select
          value={exercise || exercises[0]?.[0] || ""}
          onChange={(e) => select(e.target.value)}
        >
          {exercises.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estimated 1RM unit
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as "lb" | "kg")}
        >
          <option>lb</option>
          <option>kg</option>
        </select>
      </label>
      <p className="muted">
        Approximate RIR-adjusted Epley: load × (1 + (reps + RIR) / 30). A single
        rep at RIR 0 uses the recorded load. Shown only for standard sets with
        reps + RIR ≤ 10 and RIR ≤ 4. Compare within the same exercise; this is
        not a measured maximum. Rest-pause sets remain in load history but do
        not receive estimates or overload flags. Warm-ups are labeled in history
        and excluded from performance estimates and overload flags.
      </p>
      {!rows.length && <p>No strength sets logged yet.</p>}
      <p className="muted">
        Overload flags compare with earlier workouts, including earlier
        mesocycles, within the same exercise and side. L/R records are not
        compared with unsided records.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th scope="col">Performed date</th>
              <th scope="col">Load</th>
              <th scope="col">Side</th>
              <th scope="col">Reps</th>
              <th scope="col">RIR</th>
              <th scope="col">Est. 1RM</th>
              <th scope="col">Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const estimate = estimated1RM(s),
                session = sessions.find((x) => x.id === s.sessionId);
              return (
                <tr key={s.id}>
                  <td>
                    {session
                      ? sessionDay(session)
                      : new Date(setTime(s)).toLocaleDateString()}
                  </td>
                  <td>
                    {s.plan?.loadText || s.strength?.load}{" "}
                    {s.plan?.unit || s.strength?.unit}
                  </td>
                  <td>{s.plan?.side || "—"}</td>
                  <td>
                    {s.bouts?.join(",") || s.reps}
                    {s.type === "rest-pause" && !s.bouts
                      ? ` + ${s.miniReps} mini`
                      : ""}
                  </td>
                  <td>{s.rir === 6 ? "5+" : s.rir}</td>
                  <td>
                    {estimate === null
                      ? "—"
                      : `${(estimate / (unit === "lb" ? 0.45359237 : 1)).toFixed(1)} ${unit}`}
                  </td>
                  <td>
                    {s.plan?.warmup
                      ? "Warm-up"
                      : improvement(s, comparisonSets) || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
