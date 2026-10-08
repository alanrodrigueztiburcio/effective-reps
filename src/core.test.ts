import { describe, it, expect } from "vitest";
import {
  effective,
  attribution,
  aggregate,
  defaults,
  target,
  type Exercise,
  type SetRecord,
} from "./core";
const ex: Exercise = {
  id: "test",
  name: "Test",
  force: null,
  mechanic: null,
  equipment: null,
  level: "beginner",
  category: "strength",
  primaryMuscles: ["chest", "shoulders", "chest"],
  secondaryMuscles: ["triceps", "chest"],
  instructions: [],
  images: [],
};
const set = (weights: any, eff = 5) =>
  ({
    id: "s",
    sessionId: "w",
    exerciseId: "test",
    exerciseName: "Test",
    timestamp: new Date().toISOString(),
    sequence: 1,
    type: "standard",
    reps: 10,
    miniReps: 0,
    rir: 0,
    effectiveReps: eff,
    weights,
    calculationVersion: "1",
  }) as SetRecord;
describe("calculations", () => {
  it.each([
    [10, 0, 5],
    [10, 1, 4],
    [10, 2, 3],
    [10, 3, 2],
    [10, 4, 1],
    [10, 5, 0],
    [10, 6, 0],
    [3, 0, 3],
    [0, 0, 0],
  ])("%i reps at RIR %i = %i", (r, rir, result) =>
    expect(effective(r, rir)).toBe(result),
  );
  it("adds mini reps only for rest-pause", () => {
    expect(effective(12, 1, 7, "rest-pause")).toBe(11);
    expect(effective(12, 6, 7, "rest-pause")).toBe(7);
    expect(effective(12, 1, 7)).toBe(4);
  });
  it.each([
    [-1, 0],
    [1.5, 0],
    [10, -1],
    [10, NaN],
  ])("rejects invalid inputs", (r, rir) =>
    expect(() => effective(r, rir)).toThrow(),
  );
  it("rejects fractional mini reps", () =>
    expect(() => effective(10, 0, 1.5)).toThrow());
});
describe("attribution", () => {
  it("deduplicates with primary precedence", () =>
    expect(attribution(ex, defaults)).toEqual({
      chest: 1,
      shoulders: 1,
      triceps: 0,
    }));
  it("applies override without changing anatomy", () => {
    expect(
      attribution(ex, defaults, {
        exerciseId: "test",
        weights: { triceps: 0.5 },
        updatedAt: "",
      }).triceps,
    ).toBe(0.5);
    expect(ex.secondaryMuscles).toEqual(["triceps", "chest"]);
  });
  it("reconciles overlapping exercises and multiple primaries", () => {
    const a = aggregate([set(attribution(ex, defaults)), set({ chest: 1 }, 3)]);
    expect(a.performed).toBe(8);
    expect(a.totals).toEqual({ chest: 8, shoulders: 5, triceps: 0 });
  });
  it.each([
    [19, "Below target"],
    [20, "Within target"],
    [40, "Within target"],
    [40.5, "Above target"],
    [41, "Above target"],
  ])("target %s", (n, result) =>
    expect(target(n as number, 20, 40)).toBe(result),
  );
});
