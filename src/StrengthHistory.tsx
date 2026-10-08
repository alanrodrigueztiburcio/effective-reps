import { useState } from 'react';
import type { SetRecord } from './core';
import { estimated1RM, improvement } from './strength';
export function StrengthHistory({sets}: {sets: SetRecord[]}) {
  const [exercise, select] = useState('');
  const [unit, setUnit] = useState<'lb'|'kg'>('lb');
  const tracked = sets.filter(s => s.strength);
  const exercises = [...new Map(tracked.map(s => [s.exerciseId, s.exerciseName])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const rows = tracked.filter(s => s.exerciseId === (exercise || exercises[0]?.[0])).sort((a,b)=> b.timestamp.localeCompare(a.timestamp) || b.sequence-a.sequence);
  return <section className="card"><h2>Strength progression</h2>
    <p>Enable strength tracking when logging an exercise. Use consistent equipment, range of motion, and load convention (total barbell load or per dumbbell).</p>
    <label>Exercise<select value={exercise || exercises[0]?.[0] || ''} onChange={e=>select(e.target.value)}>{exercises.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    <label>Estimated 1RM unit<select value={unit} onChange={e=>setUnit(e.target.value as 'lb'|'kg')}><option>lb</option><option>kg</option></select></label>
    <p className="muted">Approximate RIR-adjusted Epley: load × (1 + (reps + RIR) / 30). A single rep at RIR 0 uses the recorded load. Shown only for standard sets with reps + RIR ≤ 10 and RIR ≤ 4. Compare within the same exercise; this is not a measured maximum. Rest-pause sets remain in load history but do not receive estimates or overload flags.</p>
    {!rows.length && <p>No strength sets logged yet.</p>}
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Date</th><th>Load</th><th>Reps</th><th>RIR</th><th>Est. 1RM</th><th>Progress</th></tr></thead><tbody>{rows.map(s=>{const estimate=estimated1RM(s);return <tr key={s.id}><td>{new Date(s.timestamp).toLocaleString()}</td><td>{s.strength!.load} {s.strength!.unit}</td><td>{s.reps}{s.type==='rest-pause' ? ` + ${s.miniReps} mini` : ''}</td><td>{s.rir === 6 ? '5+' : s.rir}</td><td>{estimate === null ? '—' : `${(estimate / (unit==='lb' ? 0.45359237 : 1)).toFixed(1)} ${unit}`}</td><td>{improvement(s,sets) || '—'}</td></tr>})}</tbody></table></div>
  </section>;
}
