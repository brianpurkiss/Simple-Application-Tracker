// Read-only health check of the jobs database. Lists rows that look inconsistent so they can be fixed by hand in
// the app; it never changes anything.
//
//   npm run doctor

import path from "node:path";
import Database from "better-sqlite3";
import { today } from "../../src/lib/clock.ts";

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(import.meta.dirname, "../../data");
const db = new Database(path.join(dataDir, "jobs.db"), { readonly: true, fileMustExist: true });

type Check = { title: string; sql: string; params?: unknown[] };
const live = "j.deleted_at IS NULL";

const checks: Check[] = [
  { title: "Events whose job no longer exists", sql: "SELECT e.id, e.job_id, e.date, e.type FROM events e LEFT JOIN jobs j ON j.id = e.job_id WHERE j.id IS NULL" },
  {
    title: "Applied date doesn't match the Applied event",
    sql: `SELECT j.id, j.title, j.company, j.applied_date, group_concat(e.date) AS applied_events FROM jobs j
      LEFT JOIN events e ON e.job_id = j.id AND e.type = 'Applied' WHERE ${live}
      GROUP BY j.id HAVING (j.applied_date IS NOT NULL AND (count(e.id) = 0 OR sum(e.date = j.applied_date) = 0))
        OR (j.applied_date IS NULL AND count(e.id) > 0)`,
  },
  {
    title: "More than one Applied event",
    sql: `SELECT j.id, j.title, j.company, count(*) AS applied FROM jobs j JOIN events e ON e.job_id = j.id AND e.type = 'Applied'
      WHERE ${live} GROUP BY j.id HAVING count(*) > 1`,
  },
  {
    title: "Resume version not in the Resumes vault",
    sql: `SELECT j.resume_version, count(*) AS jobs FROM jobs j WHERE ${live} AND j.resume_version != ''
      AND j.resume_version NOT IN (SELECT version FROM resumes WHERE deleted_at IS NULL) GROUP BY j.resume_version`,
  },
  {
    title: "Company names that differ only in case or spacing",
    sql: `SELECT lower(replace(trim(company), ' ', '')) AS key, group_concat(DISTINCT company) AS spellings, count(*) AS jobs
      FROM jobs j WHERE ${live} AND trim(company) != '' GROUP BY key HAVING count(DISTINCT company) > 1`,
  },
  {
    title: "Activity logged after the job was closed (Rejection, Withdrew, Accepted, Scam)",
    sql: `SELECT j.id, j.title, j.company, c.date AS closed, c.type AS closed_by, e.date, e.type FROM jobs j
      JOIN events c ON c.job_id = j.id AND c.type IN ('Rejection', 'Withdrew', 'Accepted', 'Scam')
      JOIN events e ON e.job_id = j.id AND e.date > c.date AND e.type IN ('Applied', 'Screen', 'Interview', 'Offer')
      WHERE ${live} ORDER BY j.id`,
  },
  {
    title: "Upcoming screens or interviews without a time",
    sql: `SELECT j.id, j.title, j.company, e.date, e.type FROM events e JOIN jobs j ON j.id = e.job_id
      WHERE ${live} AND e.type IN ('Screen', 'Interview') AND e.date >= ? AND e.time IS NULL`,
    params: [today()],
  },
  { title: "Salary minimum above maximum", sql: `SELECT id, title, company, salary_min, salary_max FROM jobs j WHERE ${live} AND salary_min > salary_max` },
  {
    title: "Bonus given both as a percentage and a flat amount (the flat amount is used)",
    sql: `SELECT id, title, company, bonus_pct, bonus_amount FROM jobs j WHERE ${live} AND bonus_pct IS NOT NULL AND bonus_amount IS NOT NULL`,
  },
];

let problems = 0;
for (const c of checks) {
  const rows = db.prepare(c.sql).all(...(c.params ?? [])) as Record<string, unknown>[];
  problems += rows.length;
  console.log(`\n${rows.length ? "✗" : "✓"} ${c.title}${rows.length ? ` (${rows.length})` : ""}`);
  for (const r of rows.slice(0, 25)) console.log("   ", Object.values(r).join(" · "));
  if (rows.length > 25) console.log(`    …and ${rows.length - 25} more`);
}
console.log(`\n${problems ? `${problems} rows to look at.` : "Nothing to fix."}`);
