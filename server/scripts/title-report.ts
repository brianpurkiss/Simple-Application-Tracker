// Dev-only report for tuning title consolidation. Reads the jobs database read-only and prints each
// title family with its members and seniority, then does the same for a fixture of titles from
// other fields to check the rules aren't tuned to one industry.
//
//   npx tsx server/scripts/title-report.ts            (your data + fixture)
//   npx tsx server/scripts/title-report.ts --fixture  (fixture only)

import path from "node:path";
import Database from "better-sqlite3";
import { consolidateTitles } from "../../src/lib/titles/consolidate.ts";
import type { TitleInput } from "../../src/lib/titles/types.ts";

const FIXTURE = [
  "Software Engineer", "Sr. Software Engineer", "Senior Software Engineer", "Software Engineer II",
  "Staff Software Engineer", "Principal Software Engineer", "Engineering Manager", "Senior Engineering Manager",
  "Director of Engineering", "VP of Engineering", "Vice President, Engineering", "CTO", "Chief Technology Officer",
  "Registered Nurse", "RN, ICU", "ICU Registered Nurse", "Nurse Manager", "Director of Nursing", "Chief Nursing Officer",
  "Account Executive", "Senior Account Executive", "Sales Manager", "Regional Sales Manager", "Director of Sales",
  "Sales Director", "SVP Sales", "Financial Analyst", "Senior Financial Analyst", "Finance Manager",
  "Controller", "CFO", "Elementary School Teacher", "Teacher, Elementary School", "Assistant Principal",
  "Data Scientist", "Junior Data Scientist", "Lead Data Scientist", "Head of Data", "Product Designer",
  "Senior UX Designer", "Design Director", "Associate Director of Marketing", "Executive Director",
  "Physical Therapist", "Senior Physical Therapist", "Staff Pharmacist", "Journeyman Electrician", "Lead Mechanic",
  "Sous Chef", "Senior Paralegal", "Case Manager", "Property Manager", "Senior Case Manager",
];

function report(label: string, jobs: TitleInput[], synonyms: string[][] = []) {
  const titles = consolidateTitles(jobs, { synonyms });
  const families = new Map<string, { family: string; fn: string; members: Map<string, { n: number; rank: number | null; label: string }> }>();
  for (const job of jobs) {
    const info = titles.get(job.id)!;
    const f = families.get(info.familyKey) ?? { family: info.family, fn: info.function, members: new Map() };
    const m = f.members.get(job.title) ?? { n: 0, rank: info.seniority.rank, label: info.seniority.label };
    m.n++;
    f.members.set(job.title, m);
    families.set(info.familyKey, f);
  }

  const size = (f: { members: Map<string, { n: number }> }) => [...f.members.values()].reduce((a, m) => a + m.n, 0);
  const sorted = [...families].sort((a, b) => size(b[1]) - size(a[1]) || a[1].family.localeCompare(b[1].family));
  const distinct = new Set(jobs.map((j) => j.title)).size;
  console.log(`\n=== ${label}: ${jobs.length} jobs, ${distinct} distinct titles → ${families.size} families ===\n`);
  for (const [key, f] of sorted) {
    console.log(`${f.family}  (${size(f)})  [${key}]  function: ${f.fn || "—"}`);
    for (const [title, m] of [...f.members].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`    ${String(m.n).padStart(3)}  ${title}  · ${m.rank ?? "–"} ${m.label}`);
    }
  }
}

if (!process.argv.includes("--fixture")) {
  const db = new Database(path.resolve(import.meta.dirname, "../../data/jobs.db"), { readonly: true });
  const jobs = db.prepare("SELECT id, title, company, normalized_title FROM jobs WHERE deleted_at IS NULL").all() as TitleInput[];
  const synonyms = (db.prepare("SELECT terms FROM title_synonyms").all() as { terms: string }[]).map((r) => JSON.parse(r.terms) as string[]);
  report("Your jobs", jobs, synonyms);
}
report("Fixture (other fields)", FIXTURE.map((title, i) => ({ id: i, title, company: "" })));
