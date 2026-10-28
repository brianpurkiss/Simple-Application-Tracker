import fs from "node:fs";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { backupsDir, db } from "./db.ts";
import { daysSince, isOnHold } from "../src/lib/format.ts";
import { GHOSTED_DAYS, STATUS_FOR_EVENT, TIMED_EVENT_TYPES, UPDATE_EVENT_TYPES } from "../src/lib/options.ts";

// Builds INSERT / UPDATE statements from the keys of a validated body, using named parameters.
const insertSql = (table: string, cols: string[]) =>
  `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`;
const updateSql = (table: string, cols: string[], touch: boolean, where = "id = @id") =>
  `UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(", ")}${touch ? ", updated_at = datetime('now')" : ""} WHERE ${where}`;

const app = express();
app.use(express.json());

const text = z.string().trim();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const salary = z.number().int().min(0).nullable();

const rangeError = (min: number | null | undefined, max: number | null | undefined) =>
  min != null && max != null && min > max ? "Salary minimum can't be above the maximum" : null;

const jobSchema = z.object({
  title: text.min(1),
  normalized_title: text,
  company: text,
  company_type: text,
  fit: text,
  salary_min: salary,
  salary_max: salary,
  // Stored as a JSON array; the first is the main one.
  job_types: z.array(text).transform((t) => JSON.stringify([...new Set(t.filter(Boolean))])),
  resume_version: text,
  work_mode: text,
  applied_date: date.nullable(),
  follow_up_on: date.nullable(),
  jd_link: text,
  applied_via: text,
  agency_name: text,
  contact_name: text,
  contact_email: text,
  contact_phone: text,
  contact_linkedin: text,
  offer_info: text,
  notes: text,
  job_description: z.string(),
  cover_letter: z.string(),
});

const eventSchema = z.object({
  date,
  type: text.min(1),
  description: text.default(""),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
});

const updateTypes = UPDATE_EVENT_TYPES.map(() => "?").join(",");
// A screen or interview that hasn't happened yet (aliased `e`): a time makes it exact, otherwise it counts until the day arrives.
const upcomingEventSql = `e.type IN ('Screen', 'Interview') AND (e.date > date('now', 'localtime')
  OR (e.time IS NOT NULL AND e.date = date('now', 'localtime') AND e.time > strftime('%H:%M', 'now', 'localtime')))`;
// Event types and statuses come from options.ts, so inlining them as literals is safe.
const statusEventTypes = Object.keys(STATUS_FOR_EVENT).map((t) => `'${t}'`).join(",");
const statusCase = Object.entries(STATUS_FOR_EVENT).map(([t, s]) => `WHEN '${t}' THEN '${s}'`).join(" ");
const jobListSql = `
  SELECT j.*,
    coalesce((SELECT CASE
        WHEN ${upcomingEventSql} THEN 'Scheduled'
        ELSE CASE e.type ${statusCase} END END FROM events e
      WHERE e.job_id = j.id AND e.type IN (${statusEventTypes}) ORDER BY date DESC, id DESC LIMIT 1), 'Applied') AS status,
    (SELECT max(date) FROM events e WHERE e.job_id = j.id AND e.type IN (${updateTypes})) AS latest_update,
    (SELECT max(date) FROM events e WHERE e.job_id = j.id AND e.type = 'Follow-Up') AS last_follow_up,
    -- Upcoming screens and interviews aren't activity yet; counting them would make "days since" go negative.
    (SELECT max(date) FROM events e WHERE e.job_id = j.id AND NOT (${upcomingEventSql})) AS last_activity,
    -- Applying starts the clock; my own follow-ups and notes don't reset it.
    (SELECT max(date) FROM events e WHERE e.job_id = j.id
      AND e.type IN ('Applied', 'Contact', 'Screen', 'Interview', 'Offer')) AS last_heard,
    -- First time they reached out with interest; a rejection doesn't count as contact.
    (SELECT min(date) FROM events e WHERE e.job_id = j.id
      AND e.type IN ('Contact', 'Screen', 'Interview', 'Offer')) AS first_contact,
    (SELECT min(date) FROM events e WHERE e.job_id = j.id AND e.type IN ('Screen', 'Interview')) AS first_interview,
    (SELECT max(date) FROM events e WHERE e.job_id = j.id AND e.type = 'Rejection') AS rejected_date,
    (SELECT count(*) FROM events e WHERE e.job_id = j.id AND e.type = 'Interview') AS interview_count,
    (SELECT count(*) FROM events e WHERE e.job_id = j.id AND e.type = 'Screen') AS screen_count
  FROM jobs j`;

// Jobs still waiting on the company go Ghosted once they've been silent long enough.
// A scheduled follow-up date in the future holds that off.
function withAutoGhost<T extends { status: string; last_heard: string | null; applied_date: string | null; follow_up_on: string | null }>(job: T) {
  const since = job.last_heard ?? job.applied_date;
  const silentDays = daysSince(since) ?? 0;
  const ghosted = (job.status === "Applied" || job.status === "Interviewed") && silentDays >= GHOSTED_DAYS && !isOnHold(job);
  return { ...job, status: ghosted ? "Ghosted" : job.status, auto_ghosted: ghosted };
}

// Job types are stored as JSON text. The old single `job_type` column isn't part of the app anymore.
const withJobTypes = ({ job_type: _legacy, ...job }: any) => ({ ...job, job_types: JSON.parse(job.job_types || "[]") as string[] });

// Descriptions and cover letters can be long; the list views only need to know whether they're filled in.
const listJobs = (where: string, order: string) =>
  (db.prepare(`${jobListSql} WHERE ${where} ORDER BY ${order}`).all(...UPDATE_EVENT_TYPES) as any[])
    .map(({ job_description, cover_letter, ...job }) =>
      withAutoGhost(withJobTypes({ ...job, has_job_description: !!job_description.trim(), has_cover_letter: !!cover_letter.trim() })));

const getEvent = (id: number | string) => db.prepare("SELECT * FROM events WHERE id = ?").get(id);

const getJob = (id: number) => {
  const job = db.prepare(`${jobListSql} WHERE j.id = ?`).get(...UPDATE_EVENT_TYPES, id) as any;
  return job && withAutoGhost(withJobTypes(job));
};

const getProfile = () => db.prepare("SELECT salary_target, your_name, cover_letter, job_list_view FROM profile WHERE id = 1").get();

app.get("/api/profile", (_req, res) => {
  res.json(getProfile());
});

const profileSchema = z.object({ salary_target: salary, your_name: text, cover_letter: z.string(), job_list_view: z.enum(["compact", "expanded"]) }).partial();
app.patch("/api/profile", (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid profile" });
  const cols = Object.keys(parsed.data);
  if (cols.length) {
    db.prepare(updateSql("profile", cols, true, "id = 1")).run(parsed.data);
  }
  res.json(getProfile());
});

app.get("/api/jobs", (_req, res) => {
  res.json(listJobs("j.deleted_at IS NULL", "j.applied_date DESC, j.id DESC"));
});

// Every event across live jobs, for the Activity page.
app.get("/api/events", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT e.id, e.job_id, e.date, e.time, e.type, j.title, j.company
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
  const badRange = rangeError(body.salary_min, body.salary_max);
  if (badRange) return res.status(400).json({ error: badRange });
  const cols = Object.keys(body);
  const create = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(insertSql("jobs", cols))
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
  const current = getJob(Number(req.params.id)) as { salary_min: number | null; salary_max: number | null } | undefined;
  const badRange = rangeError(
    body.salary_min !== undefined ? body.salary_min : current?.salary_min,
    body.salary_max !== undefined ? body.salary_max : current?.salary_max,
  );
  if (badRange) return res.status(400).json({ error: badRange });
  const cols = Object.keys(body);
  if (cols.length) {
    db.prepare(updateSql("jobs", cols, true)).run({ ...body, id: Number(req.params.id) });
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
    .prepare("INSERT INTO events (job_id, date, type, description, time) VALUES (?, @date, @type, @description, @time)")
    .run(req.params.id, { ...body, time: TIMED_EVENT_TYPES.has(body.type) ? body.time : null });
  db.prepare("UPDATE jobs SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.status(201).json(getEvent(lastInsertRowid as number));
});

app.patch("/api/events/:id", (req, res) => {
  const body = eventSchema.partial().parse(req.body);
  if (body.type && !TIMED_EVENT_TYPES.has(body.type)) body.time = null;
  const cols = Object.keys(body);
  if (cols.length) {
    db.prepare(updateSql("events", cols, false)).run({ ...body, id: Number(req.params.id) });
  }
  res.json(getEvent(req.params.id));
});

app.delete("/api/events/:id", (req, res) => {
  db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Each set needs at least two distinct terms to mean anything.
const synonymSchema = z.object({
  terms: z.array(text).transform((t) => [...new Set(t.filter(Boolean))]).refine((t) => t.length >= 2, "Enter at least two terms"),
});
const getSynonyms = () =>
  (db.prepare("SELECT id, terms FROM title_synonyms ORDER BY id").all() as { id: number; terms: string }[])
    .map((r) => ({ id: r.id, terms: JSON.parse(r.terms) as string[] }));

app.get("/api/title-synonyms", (_req, res) => res.json(getSynonyms()));

app.post("/api/title-synonyms", (req, res) => {
  const parsed = synonymSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare("INSERT INTO title_synonyms (terms) VALUES (?)").run(JSON.stringify(parsed.data.terms));
  res.status(201).json(getSynonyms());
});

app.patch("/api/title-synonyms/:id", (req, res) => {
  const parsed = synonymSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare("UPDATE title_synonyms SET terms = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(parsed.data.terms), req.params.id);
  res.json(getSynonyms());
});

app.delete("/api/title-synonyms/:id", (req, res) => {
  db.prepare("DELETE FROM title_synonyms WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// The user's Job Types and Company Types. Renaming or deleting one carries through to the jobs labeled with it.
const factKind = z.enum(["job", "company"]);
const factTypeSchema = z.object({ kind: factKind, name: text.min(1, "Enter a name") });
const getFactTypes = () => db.prepare("SELECT id, kind, name, sort, starter_key FROM fact_types ORDER BY kind, sort, id").all();
type FactTypeRow = { id: number; kind: "job" | "company"; name: string };
const getFactType = (id: string) => db.prepare("SELECT id, kind, name FROM fact_types WHERE id = ?").get(id) as FactTypeRow | undefined;

const nameTaken = (kind: string, name: string, exceptId?: number) =>
  !!db.prepare("SELECT 1 FROM fact_types WHERE kind = ? AND name = ? COLLATE NOCASE AND id != ?").get(kind, name, exceptId ?? -1);

// Swaps (or, with `to` null, removes) a type name on every job that carries it.
function relabelJobs(kind: "job" | "company", from: string, to: string | null) {
  if (kind === "company") {
    db.prepare("UPDATE jobs SET company_type = ? WHERE company_type = ? COLLATE NOCASE").run(to ?? "", from);
    return;
  }
  const rows = db.prepare("SELECT id, job_types FROM jobs WHERE job_types != '[]'").all() as { id: number; job_types: string }[];
  const update = db.prepare("UPDATE jobs SET job_types = ? WHERE id = ?");
  for (const r of rows) {
    const types = JSON.parse(r.job_types) as string[];
    if (!types.some((t) => t.toLowerCase() === from.toLowerCase())) continue;
    const next = types.flatMap((t) => (t.toLowerCase() === from.toLowerCase() ? (to ? [to] : []) : [t]));
    update.run(JSON.stringify([...new Set(next)]), r.id);
  }
}

app.get("/api/fact-types", (_req, res) => res.json(getFactTypes()));

app.post("/api/fact-types", (req, res) => {
  const parsed = factTypeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { kind, name } = parsed.data;
  if (nameTaken(kind, name)) return res.status(409).json({ error: `${name} is already in the list` });
  const { sort } = db.prepare("SELECT coalesce(max(sort), -1) + 1 AS sort FROM fact_types WHERE kind = ?").get(kind) as { sort: number };
  db.prepare("INSERT INTO fact_types (kind, name, sort) VALUES (?, ?, ?)").run(kind, name, sort);
  res.status(201).json(getFactTypes());
});

app.patch("/api/fact-types/:id", (req, res) => {
  const parsed = z.object({ name: text.min(1, "Enter a name") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const current = getFactType(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });
  if (nameTaken(current.kind, parsed.data.name, current.id)) return res.status(409).json({ error: `${parsed.data.name} is already in the list` });
  db.transaction(() => {
    db.prepare("UPDATE fact_types SET name = ? WHERE id = ?").run(parsed.data.name, current.id);
    relabelJobs(current.kind, current.name, parsed.data.name);
  })();
  res.json(getFactTypes());
});

// The full order for one kind, as ids.
app.put("/api/fact-types/order", (req, res) => {
  const parsed = z.object({ kind: factKind, ids: z.array(z.number().int()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const update = db.prepare("UPDATE fact_types SET sort = ? WHERE id = ? AND kind = ?");
  db.transaction(() => parsed.data.ids.forEach((id, i) => update.run(i, id, parsed.data.kind)))();
  res.json(getFactTypes());
});

app.delete("/api/fact-types/:id", (req, res) => {
  const current = getFactType(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });
  db.transaction(() => {
    db.prepare("DELETE FROM fact_types WHERE id = ?").run(current.id);
    relabelJobs(current.kind, current.name, null);
  })();
  res.json(getFactTypes());
});

// Starts Job Type and Company Type over: backs up the database, then clears every job's labels and drops the
// old rule tables. The type lists themselves are kept.
app.post("/api/facts/reset", async (_req, res) => {
  const file = `jobs-pre-label-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  await db.backup(path.join(backupsDir, file));
  db.transaction(() => {
    db.exec("UPDATE jobs SET job_types = '[]', job_type = '', company_type = ''");
    db.exec("DROP TABLE IF EXISTS job_type_matches");
    db.exec("DROP TABLE IF EXISTS company_type_rules");
  })();
  res.json({ backup: file });
});

const starSchema = z.object({
  kind: z.enum(["title", "seniority", "type"]),
  key: text.min(1),
  label: text.default(""),
  starred: z.boolean(),
});
const getStars = () => db.prepare("SELECT kind, key, label FROM starred_groups ORDER BY created_at, kind, key").all();

app.get("/api/starred-groups", (_req, res) => res.json(getStars()));

app.put("/api/starred-groups", (req, res) => {
  const parsed = starSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { kind, key, label, starred } = parsed.data;
  if (starred) db.prepare("INSERT INTO starred_groups (kind, key, label) VALUES (?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET label = excluded.label").run(kind, key, label);
  else db.prepare("DELETE FROM starred_groups WHERE kind = ? AND key = ?").run(kind, key);
  res.json(getStars());
});

const resumeSchema = z.object({
  version: text.min(1),
  notes: z.string(),
  plain_text: z.string(),
  active: z.boolean().transform(Number),
});

// Everything but the PDF itself, which is only sent from its own route.
const resumeSql = `
  SELECT r.id, r.version, r.notes, r.plain_text, r.pdf_name, r.pdf_size, r.pdf IS NOT NULL AS has_pdf, r.active,
    r.created_at, r.updated_at,
    (SELECT count(*) FROM jobs j WHERE j.resume_version = r.version AND j.deleted_at IS NULL) AS job_count,
    (SELECT count(*) FROM jobs j
      WHERE j.resume_version = r.version AND j.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM events e WHERE e.job_id = j.id AND e.type IN ('Interview', 'Screen'))) AS interview_job_count,
    (SELECT count(DISTINCT lower(trim(j.company))) FROM jobs j
      WHERE j.resume_version = r.version AND j.deleted_at IS NULL AND trim(j.company) != ''
        AND EXISTS (SELECT 1 FROM events e WHERE e.job_id = j.id AND e.type IN ('Interview', 'Screen'))) AS interview_company_count
  FROM resumes r`;

type ResumeRow = { has_pdf: number; active: number } & Record<string, unknown>;
const toResume = (r: ResumeRow) => ({ ...r, has_pdf: !!r.has_pdf, active: !!r.active });

const getResume = (id: number) => {
  const r = db.prepare(`${resumeSql} WHERE r.id = ? AND r.deleted_at IS NULL`).get(id) as ResumeRow | undefined;
  return r && toResume(r);
};

app.get("/api/resumes", (_req, res) => {
  const rows = db.prepare(`${resumeSql} WHERE r.deleted_at IS NULL ORDER BY r.created_at DESC, r.id DESC`).all() as ResumeRow[];
  res.json(rows.map(toResume));
});

app.get("/api/resumes/:id", (req, res) => {
  const resume = getResume(Number(req.params.id));
  if (!resume) return res.status(404).json({ error: "Not found" });
  res.json(resume);
});

app.post("/api/resumes", (req, res) => {
  const body = resumeSchema.partial().required({ version: true }).parse(req.body);
  const cols = Object.keys(body);
  const { lastInsertRowid } = db
    .prepare(insertSql("resumes", cols))
    .run(body);
  res.status(201).json(getResume(Number(lastInsertRowid)));
});

app.patch("/api/resumes/:id", (req, res) => {
  const body = resumeSchema.partial().parse(req.body);
  const cols = Object.keys(body);
  if (cols.length) {
    db.prepare(updateSql("resumes", cols, true)).run({ ...body, id: Number(req.params.id) });
  }
  res.json(getResume(Number(req.params.id)));
});

app.delete("/api/resumes/:id", (req, res) => {
  db.prepare("UPDATE resumes SET deleted_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// The PDF goes up as the raw request body, so no multipart handler is needed.
app.put("/api/resumes/:id/pdf", express.raw({ type: "application/pdf", limit: "10mb" }), (req, res) => {
  const file = req.body;
  if (!Buffer.isBuffer(file) || file.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return res.status(400).json({ error: "That isn't a PDF file" });
  }
  const name = String(req.query.name ?? "resume.pdf").slice(0, 200);
  const { changes } = db
    .prepare("UPDATE resumes SET pdf = ?, pdf_name = ?, pdf_size = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(file, name, file.length, req.params.id);
  if (!changes) return res.status(404).json({ error: "Not found" });
  res.json(getResume(Number(req.params.id)));
});

app.get("/api/resumes/:id/pdf", (req, res) => {
  const row = db.prepare("SELECT pdf, pdf_name FROM resumes WHERE id = ? AND deleted_at IS NULL").get(req.params.id) as
    { pdf: Buffer | null; pdf_name: string | null } | undefined;
  if (!row?.pdf) return res.status(404).json({ error: "No PDF" });
  res.type("application/pdf");
  res.set("Content-Disposition", `inline; filename="${encodeURIComponent(row.pdf_name ?? "resume.pdf")}"`);
  res.send(row.pdf);
});

app.delete("/api/resumes/:id/pdf", (req, res) => {
  db.prepare("UPDATE resumes SET pdf = NULL, pdf_name = NULL, pdf_size = NULL, updated_at = datetime('now') WHERE id = ?")
    .run(req.params.id);
  res.json(getResume(Number(req.params.id)));
});

// Backups live in data/backups. Names are only ever matched against what's on disk, never joined into a path.
const backupFiles = () =>
  fs.readdirSync(backupsDir)
    .filter((name) => name.endsWith(".db"))
    .map((name) => {
      const stat = fs.statSync(path.join(backupsDir, name));
      return { name, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

app.get("/api/backups", (_req, res) => res.json(backupFiles()));

app.post("/api/backups", async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1, "Name is required") }).parse(req.body);
  const base = name.replace(/\.db$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "");
  if (!base) return res.status(400).json({ error: "Name needs at least one letter or number" });
  const file = `${base}.db`;
  if (fs.existsSync(path.join(backupsDir, file))) return res.status(409).json({ error: `A backup named ${file} already exists` });
  await db.backup(path.join(backupsDir, file));
  res.status(201).json(backupFiles().find((b) => b.name === file));
});

app.get("/api/backups/:name/download", (req, res) => {
  const file = backupFiles().find((b) => b.name === req.params.name);
  if (!file) return res.status(404).json({ error: "Backup not found" });
  res.download(path.join(backupsDir, file.name), file.name);
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: z.prettifyError(err) });
  if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
    return res.status(409).json({ error: "A resume with that version already exists" });
  }
  if ((err as { type?: string }).type === "entity.too.large") {
    return res.status(413).json({ error: "PDF is over the 10 MB limit" });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

// API_PORT runs a second copy next to the usual one (with DATA_DIR pointing at other data).
const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
