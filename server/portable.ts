// The portable JSON form of the database, used by `npm run export` / `npm run import` and for the demo seed.
// Rows are written as stored, except job_types and synonym terms (real arrays) and resume PDFs (base64, or left out).

import type Database from "better-sqlite3";

export const PORTABLE_TABLES = ["profile", "fact_types", "title_synonyms", "starred_groups", "resumes", "jobs", "events"] as const;
export type PortableTable = (typeof PORTABLE_TABLES)[number];
export type Row = Record<string, unknown>;

export type PortableData = {
  schema_version: number;
  exported_at: string;
  tables: Record<PortableTable, Row[]>;
};

export function readPortable(db: Database.Database, { pdfs = true } = {}): PortableData {
  const data: PortableData = {
    schema_version: db.pragma("user_version", { simple: true }) as number,
    exported_at: new Date().toISOString(),
    tables: Object.fromEntries(PORTABLE_TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()])) as PortableData["tables"],
  };
  for (const job of data.tables.jobs) job.job_types = JSON.parse(String(job.job_types || "[]"));
  for (const s of data.tables.title_synonyms) s.terms = JSON.parse(String(s.terms));
  for (const r of data.tables.resumes) {
    const pdf = r.pdf as Buffer | null;
    r.pdf = pdf && pdfs ? pdf.toString("base64") : null;
    if (!r.pdf) Object.assign(r, { pdf_name: null, pdf_size: null });
  }
  return data;
}
