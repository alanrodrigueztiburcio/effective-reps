export const muscles = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;
export type Muscle = (typeof muscles)[number];
export type Weights = Partial<Record<Muscle, number>>;
export interface Exercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}
export interface Session {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "active" | "completed";
  createdAt: string;
  updatedAt: string;
  performedAt?: string;
  performedDate?: string;
  mesocycleId?: string | null;
  templateId?: string | null;
  templateSnapshot?: { name: string; items: TemplateItem[] };
}
export interface TemplateItem {
  id: string;
  exercise: Exercise;
  sets: number;
  reps: number;
  rir: number;
  setPlans?: SetPlan[];
}
export interface SetPlan {
  loadText: string;
  unit: "lb" | "kg";
  targetReps: string;
  targetRir?: number;
  warmup: boolean;
  restPause: boolean;
  trackStrength: boolean;
  restSeconds: number;
}
export interface WorkoutTemplate {
  id: string;
  name: string;
  items: TemplateItem[];
  createdAt: string;
  updatedAt: string;
}
export interface Mesocycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
  templateIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface SetRecord {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  timestamp: string;
  sequence: number;
  type: "standard" | "rest-pause";
  reps: number;
  miniReps: number;
  rir: number;
  effectiveReps: number;
  weights: Weights;
  calculationVersion: "1";
  strength?: { load: number; unit: "lb" | "kg" };
  performedAt?: string;
  createdAt?: string;
  templateItemId?: string | null;
  plan?: SetPlan;
  completed?: boolean;
  bouts?: number[];
  actualRir?: number | null;
  groupId?: string;
}
export interface Override {
  exerciseId: string;
  weights: Weights;
  updatedAt: string;
}
export interface Settings {
  id: "main";
  lower: number;
  upper: number;
  primary: number;
  secondary: number;
  preferences: Record<string, unknown>;
}
export const defaults: Settings = {
  id: "main",
  lower: 20,
  upper: 40,
  primary: 1,
  secondary: 0.5,
  preferences: {},
};
export function effective(
  reps: number,
  rir: number,
  mini = 0,
  type: SetRecord["type"] = "standard",
) {
  if (
    !Number.isInteger(reps) ||
    reps < 0 ||
    !Number.isInteger(mini) ||
    mini < 0 ||
    !Number.isFinite(rir) ||
    rir < 0
  )
    throw new Error(
      "Repetitions must be nonnegative integers and RIR must be nonnegative.",
    );
  return (
    Math.max(0, Math.min(reps, 5 - rir)) + (type === "rest-pause" ? mini : 0)
  );
}
export function attribution(
  ex: Exercise,
  settings: Settings,
  override?: Override,
): Weights {
  const w: Weights = {};
  for (const m of ex.secondaryMuscles)
    if (muscles.includes(m as Muscle)) w[m as Muscle] = settings.secondary;
  for (const m of ex.primaryMuscles)
    if (muscles.includes(m as Muscle)) w[m as Muscle] = settings.primary;
  return { ...w, ...override?.weights };
}
export function aggregate(sets: SetRecord[]) {
  sets = sets.filter((s) => s.completed !== false);
  const totals: Weights = {};
  for (const s of sets)
    for (const [m, w] of Object.entries(s.weights))
      totals[m as Muscle] = (totals[m as Muscle] || 0) + s.effectiveReps * w!;
  return { performed: sets.reduce((n, s) => n + s.effectiveReps, 0), totals };
}
export function target(n: number, lower: number, upper: number) {
  return n < lower
    ? "Below target"
    : n > upper
      ? "Above target"
      : "Within target";
}
export function validateSettings(s: Settings) {
  if (
    s.id !== "main" ||
    ![s.lower, s.upper, s.primary, s.secondary].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    s.lower > s.upper ||
    !s.preferences ||
    typeof s.preferences !== "object"
  )
    throw new Error("Invalid settings or target range.");
}
