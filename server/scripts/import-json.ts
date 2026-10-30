// Loads a JSON export (see export-json.ts) into the database, replacing what's there. Rows keep their ids.
// The schema and migrations run first, so older exports load into the current schema.
//
//   npm run import -- export.json            (refuses if the database already has jobs)
//   npm run import -- export.json --force    (backs up, then replaces everything)
//   DATA_DIR=/tmp/try npm run import -- demo/seed.json

import fs from "node:fs";
import path from "node:path";
import { shown } from "./shown.ts";
import { OPTIONAL_TABLES, PORTABLE_TABLES, type PortableData, type Row } from "../portable.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run import -- <export.json> [--force]");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, "utf8")) as PortableData;

// Imported after the arguments check so a typo doesn't create an empty database.
const { db, backupsDir } = await import("../db.ts");

const existing = (db.prepare("SELECT count(*) AS n FROM jobs").get() as { n: number }).n;
if (existing && !args.includes("--force")) {
  console.error(`The database already has ${existing} jobs. Run again with --force to replace them (a backup is made first).`);
  process.exit(1);
}
if (existing) {
  const backup = path.join(backupsDir, `jobs-pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  await db.backup(backup);
  console.log(`Backed up to ${shown(backup)}`);
}

const prepare = (row: Row, table: string) => {
  const r = { ...row };
  if (table === "jobs") r.job_types = JSON.stringify(r.job_types ?? []);
  if (table === "title_synonyms") r.terms = JSON.stringify(r.terms);
  if (table === "resumes") r.pdf = typeof r.pdf === "string" ? Buffer.from(r.pdf, "base64") : null;
  return r;
};

db.transaction(() => {
  // Children first, so foreign keys don't get in the way.
  // Optional tables are only replaced when the file has them (the demo seed and older exports don't).
  const tables = [...PORTABLE_TABLES, ...OPTIONAL_TABLES.filter((t) => data.tables[t])];
  for (const t of [...tables].reverse()) if (t !== "profile") db.exec(`DELETE FROM ${t}`);
  for (const table of tables) {
    const known = new Set((db.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name));
    for (const row of data.tables[table] ?? []) {
      const r = prepare(row, table);
      const cols = Object.keys(r).filter((c) => known.has(c));
      if (table === "profile") {
        const set = cols.filter((c) => c !== "id");
        db.prepare(`UPDATE profile SET ${set.map((c) => `${c} = @${c}`).join(", ")} WHERE id = 1`).run(r);
      } else {
        db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`).run(r);
      }
    }
  }
})();

console.log(`Imported ${PORTABLE_TABLES.map((t) => `${data.tables[t]?.length ?? 0} ${t}`).join(", ")}`);
