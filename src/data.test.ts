import { it, expect } from "vitest";
import Ajv from "ajv-draft-04";
import data from "./data/exercises.json";
import schema from "./data/schema.json";
import source from "./data/source.json";
it("imports the complete schema-valid pinned dataset", () => {
  const validate = new Ajv({ strict: false }).compile(schema);
  expect(data.length).toBe(source.count);
  expect(data.length).toBeGreaterThan(800);
  expect(new Set(data.map((e) => e.id)).size).toBe(data.length);
  for (const e of data) expect(validate(e), e.id).toBe(true);
  expect(source.sha).toMatch(/^[a-f0-9]{40}$/);
});
it("resolves images and retains nullable fields", () => {
  const e = data.find((e) => e.images.length)!;
  expect(new URL(e.images[0], source.imageBase).href).toContain(
    `/free-exercise-db/${source.sha}/exercises/`,
  );
  expect(data.some((e) => e.equipment === null)).toBe(true);
});
