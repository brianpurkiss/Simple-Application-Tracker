import express from "express";
import { z } from "zod";
import { db } from "./db.ts";
import { daysSince } from "../src/lib/format.ts";
import { GHOSTED_DAYS, STATUS_FOR_EVENT, UPDATE_EVENT_TYPES } from "../src/lib/options.ts";

const app = express();
app.use(express.json());

const text = z.string().trim();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const jobSchema = z.object({
  title: text.min(1),
  company: text,
  company_type: text,
  fit: text,
  salary: text,
  job_type: text,
  resume_version: text,
  work_mode: text,
  applied_date: date.nullable(),
  jd_link: text,
  applied_via: text,
  agency_name: text,
  contact_name: text,
  contact_email: text,
  contact_phone: text,
  offer_info: text,
  notes: text,
  job_description: z.string(),
});

const eventSchema = z.object({
  date,
  type: text.min(1),
  description: text.default(""),
});

const updateTypes = UPDATE_EVENT_TYPES.map(() => "?").join(",");
// Event types and statuses come from options.ts, so inlining them as literals is safe.
const statusEventTypes = Object.keys(STATUS_FOR_EVENT).map((t) => `'${t}'`).join(",");
const statusCase = Object.entries(STATUS_FOR_EVENT).map(([t, s]) => `WHEN '${t}' THEN '${s}'`).join(" ");
const jobListSql = `
  SELECT j.*,
    coalesce((SELECT CASE type ${statusCase} END FROM events e
      WHERE e.job_id = j.id AND e.type IN (${statusEventTypes}) ORDER BY date DESC, id DESC LIMIT 1), 'Applied') AS status,
    (SELECT max(date) FROM events e WHERE e.job_id = j.id AND e.type IN (${updateTypes})) AS latest_update,
    (SELECT max(date) FROM events e WHERE e.job_id = j.id AND e.type = 'Follow-Up') AS last_follow_up,
    (SELECT max(date) FROM events e WHERE e.job_id = j.id) AS last_activity,
    -- Applying starts the clock; my own follow-ups and notes don't reset it.
    (SELECT max(date) FROM events e WHERE e.job_id = j.id
      AND e.type IN ('Applied', 'Contact From Them', 'Recruiter Screen', 'Interview', 'Offer')) AS last_heard,
    -- First time they reached out with interest; a rejection doesn't count as contact.
    (SELECT min(date) FROM events e WHERE e.job_id = j.id
      AND e.type IN ('Contact From Them', 'Recruiter Screen', 'Interview', 'Offer')) AS first_contact,
    (SELECT max(date) FROM events e WHERE e.job_id = j.id AND e.type = 'Rejection') AS rejected_date,
    (SELECT count(*) FROM events e WHERE e.job_id = j.id AND e.type = 'Interview') AS interview_count,
    (SELECT count(*) FROM events e WHERE e.job_id = j.id AND e.type = 'Recruiter Screen') AS screen_count
  FROM jobs j`;

// Jobs still waiting on the company go Ghosted once they've been silent long enough.
function withAutoGhost<T extends { status: string; last_heard: string | null; applied_date: string | null }>(job: T) {
  const since = job.last_heard ?? job.applied_date;
  const silentDays = daysSince(since) ?? 0;
  const ghosted = (job.status === "Applied" || job.status === "Interviewed") && silentDays >= GHOSTED_DAYS;
  return { ...job, status: ghosted ? "Ghosted" : job.status, auto_ghosted: ghosted };
}

// Descriptions can be long; the list views don't need them.
const listJobs = (where: string, order: string) =>
  (db.prepare(`${jobListSql} WHERE ${where} ORDER BY ${order}`).all(...UPDATE_EVENT_TYPES) as any[])
    .map(({ job_description, ...job }) => withAutoGhost(job));

const getEvent = (id: number | string) => db.prepare("SELECT * FROM events WHERE id = ?").get(id);

const getJob = (id: number) => {
  const job = db.prepare(`${jobListSql} WHERE j.id = ?`).get(...UPDATE_EVENT_TYPES, id) as any;
  return job && withAutoGhost(job);
};

app.get("/api/jobs", (_req, res) => {
  res.json(listJobs("j.deleted_at IS NULL", "j.applied_date DESC, j.id DESC"));
});

// Every event across live jobs, for the Activity page.
app.get("/api/events", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT e.id, e.job_id, e.date, e.type, j.title, j.company
         FROM events e JOIN jobs j ON j.id = e.job_id
         WHERE j.deleted_at IS NULL ORDER BY e.date, e.id`,
      )
      .all(),
  );
});

app.get("/api/trash", (_req, res) => {
  res.json(listJobs("j.deleted_at IS NOT NULL", "j.deleted_at DESC"));
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(Number(req.params.id));
  if (!job) return res.status(404).json({ error: "Not found" });
  const events = db
    .prepare("SELECT * FROM events WHERE job_id = ? ORDER BY date DESC, id DESC")
    .all(req.params.id);
  res.json({ ...job, events });
});

app.post("/api/jobs", (req, res) => {
  const body = jobSchema.partial().required({ title: true }).parse(req.body);
  const cols = Object.keys(body);
  const create = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO jobs (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`)
      .run(body);
    if (body.applied_date) {
      db.prepare("INSERT INTO events (job_id, date, type) VALUES (?, ?, 'Applied')").run(lastInsertRowid, body.applied_date);
    }
    return Number(lastInsertRowid);
  });
  res.status(201).json(getJob(create()));
});

app.patch("/api/jobs/:id", (req, res) => {
  const body = jobSchema.partial().parse(req.body);
  const cols = Object.keys(body);
  if (cols.length) {
    db.prepare(`UPDATE jobs SET ${cols.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`)
      .run({ ...body, id: Number(req.params.id) });
  }
  res.json(getJob(Number(req.params.id)));
});

// Deleting moves a job to the trash; it can be restored or deleted for good from there.
app.delete("/api/jobs/:id", (req, res) => {
  db.prepare("UPDATE jobs SET deleted_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

app.post("/api/jobs/:id/restore", (req, res) => {
  db.prepare("UPDATE jobs SET deleted_at = NULL WHERE id = ?").run(req.params.id);
  res.json(getJob(Number(req.params.id)));
});

app.delete("/api/trash/:id", (req, res) => {
  db.prepare("DELETE FROM jobs WHERE id = ? AND deleted_at IS NOT NULL").run(req.params.id);
  res.status(204).end();
});

app.post("/api/jobs/:id/events", (req, res) => {
  const body = eventSchema.parse(req.body);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO events (job_id, date, type, description) VALUES (?, @date, @type, @description)")
    .run(req.params.id, body);
  db.prepare("UPDATE jobs SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.status(201).json(getEvent(lastInsertRowid as number));
});

app.patch("/api/events/:id", (req, res) => {
  const body = eventSchema.partial().parse(req.body);
  const cols = Object.keys(body);
  if (cols.length) {
    db.prepare(`UPDATE events SET ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`)
      .run({ ...body, id: Number(req.params.id) });
  }
  res.json(getEvent(req.params.id));
});

app.delete("/api/events/:id", (req, res) => {
  db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: z.prettifyError(err) });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const port = 3001;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
