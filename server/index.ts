import fs from "node:fs";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { backupsDir, db } from "./db.ts";
import { daysSince, isOnHold } from "../src/lib/format.ts";
import { nowTime, today } from "../src/lib/clock.ts";
import { normalizeUrl } from "../src/lib/boards.ts";
import { APPLIED_VIA, GHOSTED_DAYS, STATUS_FOR_EVENT, TIMED_EVENT_TYPES, UPDATE_EVENT_TYPES, WORK_MODES } from "../src/lib/options.ts";

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
const money = salary;
const pct = z.number().min(0).max(100).nullable();
const count = z.number().int().min(0).max(366).nullable();
// Unknown (null), no (0) or yes (1).
const triState = z.union([z.literal(0), z.literal(1)]).nullable();

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
  comp_source: z.enum(["", "posted", "offer"]),
  bonus_pct: pct,
  bonus_amount: money,
  equity_type: z.enum(["", "none", "rsu", "options", "profit_share", "other"]),
  equity_annual: money,
  equity_vest_years: z.number().min(0).max(20).nullable(),
  signing_bonus: money,
  relocation: money,
  match_rate_pct: z.number().min(0).max(500).nullable(),
  match_cap_pct: pct,
  hsa_employer: money,
  stipends_annual: money,
  benefit_medical: triState,
  benefit_dental: triState,
  benefit_vision: triState,
  benefit_life: triState,
  benefit_disability: triState,
  medical_premium_pct: pct,
  pto_days: count,
  pto_unlimited: z.boolean().transform(Number),
  sick_days: count,
  holidays: count,
  parental_leave_weeks: z.number().int().min(0).max(104).nullable(),
  offer_info: text,
  notes: text,
  job_description: z.string(),
  cover_letter: z.string(),
  // A posting kept for segment analysis, not applied to.
  saved: z.boolean().transform(Number),
});

const eventSchema = z.object({
  date,
  type: text.min(1),
  description: text.default(""),
  notes: text.default(""),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
});

const updateTypes = UPDATE_EVENT_TYPES.map(() => "?").join(",");
// A screen or interview that hasn't happened yet (aliased `e`): a time makes it exact, otherwise it counts until the day arrives.
// "Now" comes from the app clock (src/lib/clock.ts) as @today / @now_time, so a frozen clock reaches SQL too.
const upcomingEventSql = `e.type IN ('Screen', 'Interview') AND (e.date > @today
  OR (e.time IS NOT NULL AND e.date = @today AND e.time > @now_time))`;
const clockParams = () => ({ today: today(), now_time: nowTime() });
// Event types and statuses come from options.ts, so inlining them as literals is safe.
const statusEventTypes = Object.keys(STATUS_FOR_EVENT).map((t) => `'${t}'`).join(",");
const statusCase = Object.entries(STATUS_FOR_EVENT).map(([t, s]) => `WHEN '${t}' THEN '${s}'`).join(" ");
const jobListSql = `
  SELECT j.*,
    coalesce((SELECT CASE
        WHEN ${upcomingEventSql} THEN 'Scheduled'
        ELSE CASE e.type ${statusCase} END END FROM events e
      WHERE e.job_id = j.id AND e.type IN (${statusEventTypes}) ORDER BY date DESC, id DESC LIMIT 1),
      CASE WHEN j.saved THEN 'Saved' ELSE 'Applied' END) AS status,
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

// Job types are stored as JSON text.
const withJobTypes = (job: any) => ({ ...job, job_types: JSON.parse(job.job_types || "[]") as string[], saved: !!job.saved, pto_unlimited: !!job.pto_unlimited });

// Descriptions and cover letters can be long; the list views only need to know whether they're filled in.
const listJobs = (where: string, order: string) =>
  (db.prepare(`${jobListSql} WHERE ${where} ORDER BY ${order}`).all(...UPDATE_EVENT_TYPES, clockParams()) as any[])
    .map(({ job_description, cover_letter, ...job }) =>
      withAutoGhost(withJobTypes({ ...job, has_job_description: !!job_description.trim(), has_cover_letter: !!cover_letter.trim() })));

const getEvent = (id: number | string) => db.prepare("SELECT * FROM events WHERE id = ?").get(id);

const getJob = (id: number) => {
  const job = db.prepare(`${jobListSql} WHERE j.id = ?`).get(...UPDATE_EVENT_TYPES, id, clockParams()) as any;
  return job && withAutoGhost(withJobTypes(job));
};

const getProfile = () => {
  const row = db.prepare("SELECT salary_target, past_base_salary, past_package, past_days_off, your_name, cover_letter, job_list_view, hide_financials, favorite_resume_id, default_work_mode, default_applied_via FROM profile WHERE id = 1").get() as any;
  return { ...row, hide_financials: !!row.hide_financials };
};

app.get("/api/profile", (_req, res) => {
  res.json(getProfile());
});

const profileSchema = z.object({ salary_target: salary, past_base_salary: money, past_package: money, past_days_off: count, your_name: text, cover_letter: z.string(), job_list_view: z.enum(["compact", "expanded", "offers"]), hide_financials: z.boolean().transform(Number), favorite_resume_id: z.number().int().nullable(), default_work_mode: z.enum(WORK_MODES as [string, ...string[]]), default_applied_via: z.enum(APPLIED_VIA as [string, ...string[]]) }).partial();
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
  // Applying is what turns a saved posting into an application.
  if (body.applied_date) body.saved = 0;
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
  if (body.applied_date) body.saved = 0;
  const cols = Object.keys(body);
  const id = Number(req.params.id);
  db.transaction(() => {
    if (cols.length) db.prepare(updateSql("jobs", cols, true)).run({ ...body, id });
    if (body.applied_date !== undefined) syncAppliedEvent(id, body.applied_date);
  })();
  res.json(getJob(id));
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

// A job has at most one Applied event, and its date is the job's applied date: changing either changes the other.
const appliedEventId = (jobId: number | string) =>
  (db.prepare("SELECT id FROM events WHERE job_id = ? AND type = 'Applied' ORDER BY date, id LIMIT 1").get(jobId) as { id: number } | undefined)?.id;
const ONE_APPLIED = "This job already has an Applied event. Change its date instead.";

// Brings the Applied event in line with the job's applied date: moved, added, or removed when the date is cleared.
function syncAppliedEvent(jobId: number, appliedOn: string | null) {
  const eventId = appliedEventId(jobId);
  if (appliedOn === null) {
    db.prepare("DELETE FROM events WHERE job_id = ? AND type = 'Applied'").run(jobId);
  } else if (eventId) {
    db.prepare("UPDATE events SET date = ? WHERE id = ?").run(appliedOn, eventId);
  } else {
    db.prepare("INSERT INTO events (job_id, date, type) VALUES (?, ?, 'Applied')").run(jobId, appliedOn);
  }
}

app.post("/api/jobs/:id/events", (req, res) => {
  const body = eventSchema.parse(req.body);
  const applied = body.type === "Applied";
  if (applied && appliedEventId(req.params.id)) return res.status(409).json({ error: ONE_APPLIED });
  const insert = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO events (job_id, date, type, description, notes, time) VALUES (?, @date, @type, @description, @notes, @time)")
      .run(req.params.id, { ...body, time: TIMED_EVENT_TYPES.has(body.type) ? body.time : null });
    db.prepare(`UPDATE jobs SET updated_at = datetime('now')${applied ? ", saved = 0, applied_date = @date" : ""} WHERE id = @id`)
      .run({ id: req.params.id, ...(applied && { date: body.date }) });
    return lastInsertRowid as number;
  });
  res.status(201).json(getEvent(insert()));
});

// Turns a saved posting into an application: the applied date and its Applied event, like adding a job applied to.
app.post("/api/jobs/:id/apply", (req, res) => {
  const { date: appliedOn } = z.object({ date }).parse(req.body);
  const id = Number(req.params.id);
  db.transaction(() => {
    db.prepare("UPDATE jobs SET saved = 0, applied_date = ?, updated_at = datetime('now') WHERE id = ?").run(appliedOn, id);
    syncAppliedEvent(id, appliedOn);
  })();
  res.json(getJob(id));
});

app.patch("/api/events/:id", (req, res) => {
  const body = eventSchema.partial().parse(req.body);
  const before = getEvent(req.params.id) as { job_id: number; type: string } | undefined;
  if (!before) return res.status(404).json({ error: "Event not found" });
  if (body.type === "Applied" && before.type !== "Applied" && appliedEventId(before.job_id)) return res.status(409).json({ error: ONE_APPLIED });
  if (body.type && !TIMED_EVENT_TYPES.has(body.type)) body.time = null;
  const cols = Object.keys(body);
  db.transaction(() => {
    if (cols.length) db.prepare(updateSql("events", cols, false)).run({ ...body, id: Number(req.params.id) });
    // Keep the job's applied date on the Applied event: it follows the event's date, and clears if the event stops being Applied.
    const after = getEvent(req.params.id) as { type: string; date: string };
    if (after.type === "Applied") {
      db.prepare("UPDATE jobs SET applied_date = ?, saved = 0 WHERE id = ?").run(after.date, before.job_id);
    } else if (before.type === "Applied") {
      db.prepare("UPDATE jobs SET applied_date = NULL WHERE id = ?").run(before.job_id);
    }
  })();
  res.json(getEvent(req.params.id));
});

app.delete("/api/events/:id", (req, res) => {
  const event = getEvent(req.params.id) as { job_id: number; type: string } | undefined;
  db.transaction(() => {
    db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
    // Without its Applied event the job has no applied date either.
    if (event?.type === "Applied") db.prepare("UPDATE jobs SET applied_date = NULL WHERE id = ?").run(event.job_id);
  })();
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

// Starts Job Type and Company Type over: backs up the database, then clears every job's labels. The type lists
// themselves are kept.
app.post("/api/facts/reset", async (_req, res) => {
  const file = `jobs-pre-label-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  await db.backup(path.join(backupsDir, file));
  db.transaction(() => {
    db.exec("UPDATE jobs SET job_types = '[]', company_type = ''");
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

const boardSchema = z.object({
  name: text.min(1, "Give the board a name"),
  url: z.string().transform(normalizeUrl).refine((u): u is string => u !== null, "Enter a valid web address"),
});

const getBoards = () => db.prepare("SELECT id, name, url, last_opened_on FROM job_boards ORDER BY id").all();

app.get("/api/boards", (_req, res) => res.json(getBoards()));

app.post("/api/boards", (req, res) => {
  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare("INSERT INTO job_boards (name, url) VALUES (@name, @url)").run(parsed.data);
  res.status(201).json(getBoards());
});

app.patch("/api/boards/:id", (req, res) => {
  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  // A new address starts over, since the day on record was for the old one.
  db.prepare("UPDATE job_boards SET name = @name, last_opened_on = CASE WHEN url = @url THEN last_opened_on END, url = @url WHERE id = @id").run({ ...parsed.data, id: req.params.id });
  res.json(getBoards());
});

app.post("/api/boards/:id/open", (req, res) => {
  db.prepare("UPDATE job_boards SET last_opened_on = ? WHERE id = ?").run(today(), req.params.id);
  res.json(getBoards());
});

app.delete("/api/boards/:id", (req, res) => {
  db.prepare("DELETE FROM job_boards WHERE id = ?").run(req.params.id);
  res.json(getBoards());
});

const getDismissed = () => (db.prepare("SELECT domain FROM board_dismissed ORDER BY domain").all() as { domain: string }[]).map((r) => r.domain);

app.get("/api/board-suggestions/dismissed", (_req, res) => res.json(getDismissed()));

app.post("/api/board-suggestions/dismissed", (req, res) => {
  const parsed = z.object({ domain: text.min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare("INSERT OR IGNORE INTO board_dismissed (domain) VALUES (?)").run(parsed.data.domain.toLowerCase());
  res.status(201).json(getDismissed());
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
    (SELECT count(*) FROM jobs j WHERE j.resume_version = r.version AND j.deleted_at IS NULL AND NOT j.saved) AS job_count,
    (SELECT count(*) FROM jobs j
      WHERE j.resume_version = r.version AND j.deleted_at IS NULL AND NOT j.saved
        AND EXISTS (SELECT 1 FROM events e WHERE e.job_id = j.id AND e.type IN ('Interview', 'Screen'))) AS interview_job_count,
    (SELECT count(DISTINCT lower(trim(j.company))) FROM jobs j
      WHERE j.resume_version = r.version AND j.deleted_at IS NULL AND NOT j.saved AND trim(j.company) != ''
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

app.get("/api/database/size", (_req, res) => res.json({ size: fs.statSync(db.name).size }));

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

// `npm start` serves the built app from here too, so everything runs on one port. Deep links get index.html.
const distDir = path.resolve(import.meta.dirname, "../dist");
const serveApp = process.argv.includes("--serve");
if (serveApp) {
  app.use(express.static(distDir));
  app.use((req, res, next) => (req.method === "GET" && !req.path.startsWith("/api/") ? res.sendFile(path.join(distDir, "index.html")) : next()));
}

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
app.listen(port, () => console.log(serveApp ? `Job Tracker on http://localhost:${port}` : `API on http://localhost:${port}`));
