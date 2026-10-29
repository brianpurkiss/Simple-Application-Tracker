import path from "node:path";
import type Database from "better-sqlite3";

// user_version 6: drops what's left of the spreadsheet days and earlier reworks, once everything that read them
// has been migrated. Backs up first. Fresh databases never had these, so for them this only bumps the version.
//   jobs.salary          free text, replaced by salary_min / salary_max
//   jobs.job_type        single label, replaced by the job_types list
//   jobs.legacy_status   hand-picked status, replaced by status from the history
//   job_type_matches, company_type_rules   rule tables from before fact_types
export function legacyCleanup(db: Database.Database, backupsDir: string) {
  if ((db.pragma("user_version", { simple: true }) as number) >= 6) return;
  const columns = new Set((db.pragma("table_info(jobs)") as { name: string }[]).map((c) => c.name));
  const dropColumns = ["salary", "job_type", "legacy_status"].filter((c) => columns.has(c));
  const dropTables = ["job_type_matches", "company_type_rules"].filter((t) =>
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));

  if (dropColumns.length || dropTables.length) {
    db.exec(`VACUUM INTO '${path.join(backupsDir, `jobs-pre-cleanup-${Date.now()}.db`)}'`);
    if (columns.has("salary")) {
      const lost = db.prepare("SELECT id, salary FROM jobs WHERE trim(salary) != '' AND salary_min IS NULL AND salary_max IS NULL").all() as
        { id: number; salary: string }[];
      for (const j of lost) console.log(`Cleanup: salary text "${j.salary}" on #${j.id} had no range; it's only in the backup now`);
    }
  }
  db.transaction(() => {
    for (const c of dropColumns) db.exec(`ALTER TABLE jobs DROP COLUMN ${c}`);
    for (const t of dropTables) db.exec(`DROP TABLE ${t}`);
    db.pragma("user_version = 6");
  })();
  if (dropColumns.length || dropTables.length) console.log(`Cleanup: dropped ${[...dropColumns.map((c) => `jobs.${c}`), ...dropTables].join(", ")}`);
}
