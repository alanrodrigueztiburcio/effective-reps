import type { SetPlan, SetRecord } from "./core";
import { blankPlan, normalizeSet, planOf } from "./setLog";
export const exerciseGroup = (s: SetRecord) =>
  s.groupId || s.templateItemId || s.exerciseId;
export function moveExercise(
  sets: SetRecord[],
  source: string,
  target: string,
  after = false,
) {
  const ids = [...new Set(sets.map(exerciseGroup))];
  if (source === target || !ids.includes(source) || !ids.includes(target))
    return sets;
  const next = ids.filter((id) => id !== source);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
  return next.flatMap((id) => sets.filter((s) => exerciseGroup(s) === id));
}
export function planLabels(plans: SetPlan[]) {
  let number = 0;
  const pairs = new Map<string, number>();
  return plans.map((p) => {
    let n;
    if (p.pairId) {
      if (!pairs.has(p.pairId)) pairs.set(p.pairId, ++number);
      n = pairs.get(p.pairId)!;
    } else n = ++number;
    return `${n}${p.side || ""}`;
  });
}
export function setLabels(rows: SetRecord[]) {
  const labels = planLabels(rows.map(planOf));
  return new Map(rows.map((s, i) => [s.id, labels[i]]));
}
export function resizePlans(plans: SetPlan[], length: number) {
  const next = structuredClone(plans.slice(0, length));
  while (next.length < length) {
    const last = plans.at(-1)!;
    if (last.side) {
      const pairId = crypto.randomUUID();
      for (const side of ["L", "R"] as const) {
        if (next.length >= length) break;
        const source =
          plans.find((p) => p.pairId === last.pairId && p.side === side) ||
          last;
        next.push({ ...structuredClone(source), pairId, side });
      }
    } else next.push(structuredClone(last));
  }
  return next;
}
export function duplicateSets(rows: SetRecord[], source: SetRecord) {
  const pair = planOf(source).pairId;
  const originals = pair
    ? rows.filter(
        (s) =>
          exerciseGroup(s) === exerciseGroup(source) &&
          planOf(s).pairId === pair,
      )
    : [source];
  const pairId = pair ? crypto.randomUUID() : undefined;
  const copies = originals.map((s) =>
    normalizeSet({
      ...s,
      id: crypto.randomUUID(),
      completed: false,
      bouts: [],
      actualRir: null,
      createdAt: new Date().toISOString(),
      plan: { ...planOf(s), pairId },
    }),
  );
  const at = Math.max(
    ...originals.map((s) => rows.findIndex((x) => x.id === s.id)),
  );
  return [...rows.slice(0, at + 1), ...copies, ...rows.slice(at + 1)];
}
export function alternatingSets(rows: SetRecord[], group: string) {
  const current = rows.filter((s) => exerciseGroup(s) === group);
  if (current.some((s) => planOf(s).side))
    throw new Error(
      "This exercise already uses alternating sets. Add set creates the next left/right pair.",
    );
  let converted = false;
  const next = rows.flatMap((s) => {
    if (
      exerciseGroup(s) !== group ||
      s.completed !== false ||
      s.bouts?.length ||
      s.actualRir !== null
    )
      return [s];
    converted = true;
    const pairId = crypto.randomUUID();
    return [
      normalizeSet({ ...s, plan: { ...planOf(s), side: "L", pairId } }),
      normalizeSet({
        ...s,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        plan: { ...planOf(s), side: "R", pairId },
      }),
    ];
  });
  if (!converted) {
    const last = current.at(-1);
    if (!last) throw new Error("Exercise no longer exists.");
    const pairId = crypto.randomUUID(),
      at = next.findIndex((s) => s.id === last.id) + 1;
    next.splice(
      at,
      0,
      ...(["L", "R"] as const).map((side) =>
        normalizeSet({
          ...last,
          id: crypto.randomUUID(),
          completed: false,
          bouts: [],
          actualRir: null,
          createdAt: new Date().toISOString(),
          plan: { ...planOf(last), side, pairId },
        }),
      ),
    );
  }
  return next;
}
