import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { STATUS_FOR_EVENT } from "../src/lib/options.ts";
import { parseSalary } from "./salary.ts";

const dataDir = path.resolve(import.meta.dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });
export const backupsDir = path.join(dataDir, "backups");
fs.mkdirSync(backupsDir, { recursive: true });

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

  -- The resume vault. "version" matches jobs.resume_version by text, not a foreign key.
  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    plain_text TEXT NOT NULL DEFAULT '',
    pdf BLOB,
    pdf_name TEXT,
    pdf_size INTEGER,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- Trashed resumes don't hold on to their version name.
  CREATE UNIQUE INDEX IF NOT EXISTS resumes_version ON resumes(version) WHERE deleted_at IS NULL;

  -- The user's own details and targets. Always exactly one row (id = 1); add columns as the profile grows.
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    salary_target INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO profile (id) VALUES (1);
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

if (!jobColumns.has("contact_linkedin")) {
  db.exec("ALTER TABLE jobs ADD COLUMN contact_linkedin TEXT NOT NULL DEFAULT ''");
}

if (!jobColumns.has("cover_letter")) {
  db.exec("ALTER TABLE jobs ADD COLUMN cover_letter TEXT NOT NULL DEFAULT ''");
}

if (!jobColumns.has("fit")) {
  db.exec("ALTER TABLE jobs ADD COLUMN fit TEXT NOT NULL DEFAULT ''");
}

// Until this date the job stays out of Follow Up and can't auto-ghost; NULL when there's no hold.
if (!jobColumns.has("follow_up_on")) {
  db.exec("ALTER TABLE jobs ADD COLUMN follow_up_on TEXT");
}

// Optional start time (HH:MM) for scheduled interviews.
if (!db.prepare("PRAGMA table_info(events)").all().some((c) => (c as { name: string }).name === "time")) {
  db.exec("ALTER TABLE events ADD COLUMN time TEXT");
}

// Salary used to be free text. It's now a numeric range; the old text column is kept as a backup.
if (!jobColumns.has("salary_min")) {
  const backups = path.join(dataDir, "backups");
  fs.mkdirSync(backups, { recursive: true });
  fs.copyFileSync(path.join(dataDir, "jobs.db"), path.join(backups, `jobs-pre-salary-range-${Date.now()}.db`));
  db.exec("ALTER TABLE jobs ADD COLUMN salary_min INTEGER");
  db.exec("ALTER TABLE jobs ADD COLUMN salary_max INTEGER");
  const unparsed: string[] = [];
  const setRange = db.prepare("UPDATE jobs SET salary_min = ?, salary_max = ? WHERE id = ?");
  db.transaction(() => {
    for (const j of db.prepare("SELECT id, salary FROM jobs WHERE salary != ''").all() as { id: number; salary: string }[]) {
      const { min, max } = parseSalary(j.salary);
      if (min === null) unparsed.push(`#${j.id} "${j.salary}"`);
      setRange.run(min, max, j.id);
    }
  })();
  console.log(`Salary migrated to numeric range. Unparsed: ${unparsed.length ? unparsed.join(", ") : "none"}`);
}

// A hand-written title used only for title analysis; the real title stays as posted. Empty when unused.
if (!jobColumns.has("normalized_title")) {
  db.exec("ALTER TABLE jobs ADD COLUMN normalized_title TEXT NOT NULL DEFAULT ''");
}

// User-defined sets of terms that mean the same thing in a job title ("eCommerce, eCom, eComm").
// `terms` is a JSON array; the first term is the one shown.
db.exec(`
  CREATE TABLE IF NOT EXISTS title_synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    terms TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Job Titles, seniorities and job types the user starred so other pages can filter by them.
// `key` is the group key from the Job Titles page; `kind` is "title", "seniority" or "type".
db.exec(`
  CREATE TABLE IF NOT EXISTS starred_groups (
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (kind, key)
  );
`);
// `label` lets a starred group still be named after its jobs are gone.
if (!(db.pragma("table_info(starred_groups)") as { name: string }[]).some((c) => c.name === "label")) {
  db.exec("ALTER TABLE starred_groups ADD COLUMN label TEXT NOT NULL DEFAULT ''");
}

// A small starter set that fits any field: spelled-out term first, abbreviation after. Added once
// (tracked by user_version), so deleting one never brings it back and existing sets are untouched.
if ((db.pragma("user_version", { simple: true }) as number) < 1) {
  const starters = [
    ["Junior", "Entry Level", "Entry-Level"],
    ["Representative", "Rep"],
    ["Operations", "Ops"],
    ["Human Resources", "HR"],
    ["Information Technology", "IT"],
    ["Customer Service", "Customer Support"],
  ];
  const insert = db.prepare("INSERT INTO title_synonyms (terms) VALUES (?)");
  db.transaction(() => {
    const have = new Set((db.prepare("SELECT terms FROM title_synonyms").all() as { terms: string }[]).map((r) => r.terms.toLowerCase()));
    for (const terms of starters) if (!have.has(JSON.stringify(terms).toLowerCase())) insert.run(JSON.stringify(terms));
    db.pragma("user_version = 1");
  })();
}

// Job Type is worked out from the title's function: a word or phrase in the function maps to a Job Type.
// Longest term wins. Seeded once (user_version 2), so deleting a rule never brings it back.
db.exec(`
  CREATE TABLE IF NOT EXISTS job_type_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL,
    job_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
if ((db.pragma("user_version", { simple: true }) as number) < 2) {
  const seeds: [string, string][] = [
    ["ecommerce", "eCom Lead"],
    ["e commerce", "eCom Lead"],
    ["product", "Product Management"],
    ["growth", "Marketing/Growth"],
    ["marketing", "Marketing/Growth"],
    ["seo", "Marketing/Growth"],
    ["acquisition", "Marketing/Growth"],
    ["cro", "CRO Lead"],
    ["web", "Website Management"],
    ["website", "Website Management"],
    ["shopify", "Website Management"],
    ["engineering", "Dev/Engineering"],
    ["engineer", "Dev/Engineering"],
    ["developer", "Dev/Engineering"],
    ["software", "Dev/Engineering"],
  ];
  const insert = db.prepare("INSERT INTO job_type_matches (term, job_type) VALUES (?, ?)");
  db.transaction(() => {
    for (const [term, jobType] of seeds) insert.run(term, jobType);
    db.pragma("user_version = 2");
  })();
}
// Terms found by checking the rules against hand-set Job Types (the shadow report). Added once (user_version 3).
if ((db.pragma("user_version", { simple: true }) as number) < 3) {
  const seeds: [string, string][] = [
    ["dtc", "eCom Lead"],
    ["d2c", "eCom Lead"],
    ["direct to consumer", "eCom Lead"],
    ["commerce", "eCom Lead"],
    ["conversion", "CRO Lead"],
    ["lifecycle", "Marketing/Growth"],
  ];
  const insert = db.prepare("INSERT INTO job_type_matches (term, job_type) VALUES (?, ?)");
  db.transaction(() => {
    for (const [term, jobType] of seeds) insert.run(term, jobType);
    db.pragma("user_version = 3");
  })();
}

// Profile fields and the resume active flag were added after the first version.
const profileColumns = new Set((db.pragma("table_info(profile)") as { name: string }[]).map((c) => c.name));
if (!profileColumns.has("your_name")) {
  db.exec("ALTER TABLE profile ADD COLUMN your_name TEXT NOT NULL DEFAULT ''");
}
if (!profileColumns.has("cover_letter")) {
  db.exec("ALTER TABLE profile ADD COLUMN cover_letter TEXT NOT NULL DEFAULT ''");
}
// How the job list is laid out: 'compact' or 'expanded'.
if (!profileColumns.has("job_list_view")) {
  db.exec("ALTER TABLE profile ADD COLUMN job_list_view TEXT NOT NULL DEFAULT 'compact'");
}
const resumeColumns = new Set((db.pragma("table_info(resumes)") as { name: string }[]).map((c) => c.name));
if (!resumeColumns.has("active")) {
  db.exec("ALTER TABLE resumes ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}

// Status used to be picked by hand; now it comes from the history. This converts the old
// hand-picked values once, adding an event wherever the history didn't already say so.
if (jobColumns.has("status")) {
  const LEGACY_STATUS_EVENT: Record<string, string> = {
    "Recruiter Interview": "Screen",
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
  const closingEvents = new Set(["Accepted", "Rejection", "Withdrew", "Ghosted", "Scam"]);
  db.transaction(() => {
    db.exec("UPDATE events SET type = 'Screen' WHERE type = 'Interview' AND description LIKE '%recruiter%'");
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

// Event types were renamed: "Contact From Them" is now "Contact", "Recruiter Screen" is now "Screen".
// Runs at the end so the legacy conversion above is renamed too. Backs up the database before changing rows.
const renamedEvents = (db.prepare(
  "SELECT count(*) AS n FROM events WHERE type IN ('Contact From Them', 'Recruiter Screen')",
).get() as { n: number }).n;
if (renamedEvents) {
  const backups = path.join(dataDir, "backups");
  fs.mkdirSync(backups, { recursive: true });
  db.exec(`VACUUM INTO '${path.join(backups, `jobs-pre-event-rename-${Date.now()}.db`)}'`);
  db.transaction(() => {
    db.exec("UPDATE events SET type = 'Contact' WHERE type = 'Contact From Them'");
    db.exec("UPDATE events SET type = 'Screen' WHERE type = 'Recruiter Screen'");
  })();
  console.log(`Event rename: ${renamedEvents} events updated`);
}
