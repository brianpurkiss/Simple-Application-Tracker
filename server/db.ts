import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { STATUS_FOR_EVENT } from "../src/lib/options.ts";

const dataDir = path.resolve(import.meta.dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "jobs.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    job_type TEXT NOT NULL DEFAULT '',
    resume_version TEXT NOT NULL DEFAULT '',
    work_mode TEXT NOT NULL DEFAULT '',
    applied_date TEXT,
    jd_link TEXT NOT NULL DEFAULT '',
    applied_via TEXT NOT NULL DEFAULT 'Direct',
    agency_name TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    offer_info TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    job_description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS events_job_id ON events(job_id);
`);

// Columns added after the first version.
const jobColumns = new Set((db.pragma("table_info(jobs)") as { name: string }[]).map((c) => c.name));
if (!jobColumns.has("job_description")) {
  db.exec("ALTER TABLE jobs ADD COLUMN job_description TEXT NOT NULL DEFAULT ''");
}
// Set when a job is moved to the trash; NULL for live jobs.
if (!jobColumns.has("deleted_at")) {
  db.exec("ALTER TABLE jobs ADD COLUMN deleted_at TEXT");
}
if (!jobColumns.has("company_type")) {
  db.exec("ALTER TABLE jobs ADD COLUMN company_type TEXT NOT NULL DEFAULT ''");
}

if (!jobColumns.has("fit")) {
  db.exec("ALTER TABLE jobs ADD COLUMN fit TEXT NOT NULL DEFAULT ''");
}

// Status used to be picked by hand; now it comes from the history. This converts the old
// hand-picked values once, adding an event wherever the history didn't already say so.
if (jobColumns.has("status")) {
  const LEGACY_STATUS_EVENT: Record<string, string> = {
    "Recruiter Interview": "Recruiter Screen",
    "1st Interview": "Interview",
    "2nd Interview": "Interview",
    "3rd Interview": "Interview",
    "Final Interview": "Interview",
    Offer: "Offer",
    Accepted: "Accepted",
    "Rejected, No Interview": "Rejection",
    "Rejected, Post Interview": "Rejection",
    "I Chose No": "Withdrew",
    "I Declined": "Withdrew",
    Ghosted: "Ghosted",
  };
  const statusTypes = Object.keys(STATUS_FOR_EVENT);
  const closingEvents = new Set(["Accepted", "Rejection", "Withdrew", "Ghosted"]);
  db.transaction(() => {
    db.exec("UPDATE events SET type = 'Recruiter Screen' WHERE type = 'Interview' AND description LIKE '%recruiter%'");
    db.exec("UPDATE events SET type = 'Ghosted' WHERE type = 'Declared Stale'");
    db.exec("ALTER TABLE jobs RENAME COLUMN status TO legacy_status");

    const jobs = db.prepare("SELECT id, title, legacy_status, applied_date FROM jobs").all() as
      { id: number; title: string; legacy_status: string; applied_date: string | null }[];
    const latestStatusEvent = db.prepare(
      `SELECT type FROM events WHERE job_id = ? AND type IN (${statusTypes.map(() => "?").join(",")}) ORDER BY date DESC, id DESC LIMIT 1`,
    );
    const lastDate = db.prepare("SELECT max(date) AS date FROM events WHERE job_id = ?");
    const insert = db.prepare("INSERT INTO events (job_id, date, type, description) VALUES (?, ?, ?, 'Added when status became automatic')");

    for (const job of jobs) {
      const wanted = LEGACY_STATUS_EVENT[job.legacy_status];
      if (!wanted) continue;
      const latest = (latestStatusEvent.get(job.id, ...statusTypes) as { type: string } | undefined)?.type;
      if (latest && STATUS_FOR_EVENT[latest] === STATUS_FOR_EVENT[wanted]) continue;
      // A logged rejection/ghosting is newer information than a status that wasn't updated.
      if (latest && closingEvents.has(latest)) continue;
      const date = (lastDate.get(job.id) as { date: string | null }).date ?? job.applied_date;
      if (!date) continue;
      insert.run(job.id, date, wanted);
      console.log(`Status migration: added ${wanted} to #${job.id} ${job.title} (was "${job.legacy_status}")`);
    }
  })();
}
