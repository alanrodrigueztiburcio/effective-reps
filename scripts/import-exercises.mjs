import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Ajv from "ajv-draft-04";
// Pin the complete source tree so data, schema, license and image URLs agree.
const ref = process.argv[2] || "main";
const response = await fetch(
  `https://api.github.com/repos/yuhonas/free-exercise-db/commits/${ref}`,
);
if (!response.ok)
  throw new Error(`Cannot resolve source revision: ${response.status}`);
const { sha } = await response.json();
const root = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${sha}/`;
async function read(path) {
  const r = await fetch(root + path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.text();
}
const [raw, schemaRaw, license] = await Promise.all([
  read("dist/exercises.json"),
  read("schema.json"),
  read("LICENSE.md"),
]);
const records = JSON.parse(raw);
const schema = JSON.parse(schemaRaw);
const validate = new Ajv({ strict: false }).compile(schema);
const ids = new Set();
for (const record of records) {
  if (!validate(record)) throw new Error(JSON.stringify(validate.errors));
  if (ids.has(record.id)) throw new Error(`Duplicate: ${record.id}`);
  ids.add(record.id);
}
await writeFile("src/data/exercises.json", JSON.stringify(records));
await writeFile(
  "src/data/source.json",
  JSON.stringify({
    sha,
    count: records.length,
    sha256: createHash("sha256").update(raw).digest("hex"),
    importedAt: new Date().toISOString(),
    imageBase: root + "exercises/",
  }),
);
await writeFile("src/data/schema.json", schemaRaw);
await writeFile("EXERCISE-LICENSE.md", license);
console.log(`Imported ${records.length} validated exercises at ${sha}`);
