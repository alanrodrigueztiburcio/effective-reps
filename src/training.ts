import { validatePlan } from "./setLog";
import type {
  Mesocycle,
  Session,
  SetRecord,
  WorkoutTemplate,
  TemplateItem,
} from "./core";

// Store entered calendar dates separately from timestamps so travel/time zones do not shift a workout day.
export function localDate(value: string | Date = new Date()): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDay(day: unknown): day is string {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) === day
  );
}
export function onDate(
  day: string,
  timestamp = new Date().toISOString(),
): string {
  if (!validDay(day)) throw new Error("Choose a valid workout date.");
  const d = new Date(timestamp),
    [year, month, date] = day.split("-").map(Number);
  d.setFullYear(year, month - 1, date);
  return d.toISOString();
}
export const sessionDay = (s: Session) =>
  s.performedDate || localDate(s.performedAt || s.startedAt);
export const setTime = (s: SetRecord) => s.performedAt || s.timestamp;
export const dayNumber = (day: string) =>
  Date.parse(day + "T12:00:00Z") / 86400000;
export function weekOf(day: string, start: string): number {
  return Math.floor((dayNumber(day) - dayNumber(start)) / 7) + 1;
}
export function mondayOf(day: string): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function validateItems(items: TemplateItem[]) {
  if (
    !Array.isArray(items) ||
    !items.length ||
    new Set(items.map((x) => x.id)).size !== items.length
  )
    throw new Error("A template needs exercises with unique row identifiers.");
  for (const item of items) {
    if (item.setPlans !== undefined) {
      if (
        !Array.isArray(item.setPlans) ||
        !item.setPlans.length ||
        item.setPlans.length !== item.sets
      )
        throw new Error("Invalid set plans.");
      item.setPlans.forEach(validatePlan);
    }
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      !item.exercise ||
      typeof item.exercise.id !== "string" ||
      !item.exercise.id ||
      typeof item.exercise.name !== "string" ||
      !item.exercise.name.trim() ||
      !["primaryMuscles", "secondaryMuscles", "instructions", "images"].every(
        (k) =>
          Array.isArray((item.exercise as any)[k]) &&
          (item.exercise as any)[k].every(
            (v: unknown) => typeof v === "string",
          ),
      ) ||
      typeof item.exercise.category !== "string" ||
      !Number.isInteger(item.sets) ||
      item.sets < 1 ||
      !Number.isInteger(item.reps) ||
      item.reps < 1 ||
      !Number.isFinite(item.rir) ||
      item.rir < 0
    )
      throw new Error(
        "Invalid exercise plan: sets/reps must be positive integers and RIR nonnegative.",
      );
  }
}
export function validateTemplate(t: WorkoutTemplate) {
  if (typeof t.name !== "string" || !t.name.trim())
    throw new Error("Enter a template name.");
  validateItems(t.items);
}
export function validateMesocycle(m: Mesocycle) {
  if (
    typeof m.name !== "string" ||
    !m.name.trim() ||
    !validDay(m.startDate) ||
    !validDay(m.endDate) ||
    m.startDate > m.endDate ||
    typeof m.goal !== "string" ||
    !Array.isArray(m.templateIds) ||
    m.templateIds.some((id) => typeof id !== "string" || !id) ||
    new Set(m.templateIds).size !== m.templateIds.length
  )
    throw new Error("Enter a block name and valid start/end dates.");
}
