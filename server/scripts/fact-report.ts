// Dev-only check for the Job Type / Company Type cascade (src/lib/jobFacts.ts). Runs a few fixed cases, then
// simulates a fresh start on your own jobs: every label cleared, a handful of jobs labeled by hand, and the
// rest worked out. Reads the database read-only and never writes.
//
//   npx tsx server/scripts/fact-report.ts           (cases + your data)
//   npx tsx server/scripts/fact-report.ts --cases   (cases only)

import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";
import type { Job } from "../../src/lib/api.ts";
import { buildFactModel, type FactContext, type FactType, resolveCompanyType, resolveJobTypes } from "../../src/lib/jobFacts.ts";
import { consolidateTitles } from "../../src/lib/titles/consolidate.ts";

const STARTERS: [FactType["kind"], string, string | null][] = [
  ["job", "Product", "product"], ["job", "Engineering", "engineering"], ["job", "Marketing", "marketing"], ["job", "Growth", "growth"],
  ["job", "eCommerce", "ecommerce"], ["job", "General Management", "general"], ["job", "Other", null], ["job", "CRO", null],
  ["company", "eCommerce/DTC", "ecommerce"], ["company", "SaaS", "saas"], ["company", "B2B Services", "b2b"], ["company", "Other", null],
];
const TYPES: FactType[] = STARTERS.map(([kind, name, starter_key], i) => ({ id: i + 1, kind, name, sort: i, starter_key }));

let nextId = 1;
const job = (title: string, extra: Partial<Job> = {}): Job =>
  ({ id: nextId++, title, normalized_title: "", company: "", company_type: "", job_types: [], ...extra }) as Job;

const context = (jobs: Job[]): FactContext => {
  const titles = consolidateTitles(jobs);
  return { titles, model: buildFactModel(jobs, titles, TYPES) };
};

function cases() {
  // Starter words, ordered from the role outward.
  {
    const ctx = context([]);
    const types = (title: string) => resolveJobTypes(job(title), ctx).values;
    assert.deepEqual(types("Growth Product Manager"), ["Product", "Growth"]);
    assert.deepEqual(types("Senior Product Manager, eCommerce"), ["Product", "eCommerce"]);
    assert.deepEqual(types("Director of E-commerce & Digital Marketing"), ["eCommerce", "Marketing"]);
    assert.deepEqual(types("Ecommerce Performance Marketing Manager"), ["Marketing", "eCommerce"]);
    assert.deepEqual(types("Chief of Staff"), ["General Management"]);
    assert.deepEqual(types("General submission"), []);
    // "Other" is never worked out.
    assert.ok(!types("Other Things Manager").includes("Other"));
  }
  // Company Type from the title: explicit words only.
  {
    const ctx = context([]);
    const company = (title: string) => resolveCompanyType(job(title), ctx).value;
    assert.equal(company("Vice President of Growth (DTC)"), "eCommerce/DTC");
    assert.equal(company("Senior Product Manager - Commerce"), "");
    assert.equal(company("Product Manager"), "");
  }
  // A labeled job covers the rest of its title family.
  {
    const labeled = job("Head of Digital", { job_types: ["eCommerce"] });
    const other = job("Head of Digital");
    const r = resolveJobTypes(other, context([labeled, other]));
    assert.deepEqual(r.values, ["eCommerce"]);
    assert.equal(r.source, "family");
  }
  // A custom type is learned from the jobs labeled with it, and beats the starter guess for the same word.
  {
    const jobs = [
      job("Head of CRO", { job_types: ["CRO"] }),
      job("CRO Manager", { job_types: ["CRO"] }),
      job("Director, CRO & Analytics", { job_types: ["CRO"] }),
    ];
    const fresh = job("Senior CRO Specialist");
    const r = resolveJobTypes(fresh, context([...jobs, fresh]));
    assert.deepEqual(r.values, ["CRO"]);
    assert.equal(r.source, "learned");
  }
  // Same company carries over; a blank or "Confidential" company doesn't.
  {
    const a = job("Director of Growth", { company: "Northwind Labs", company_type: "eCommerce/DTC" });
    const b = job("Head of Retention", { company: "Northwind Labs" });
    const c = job("Director of Growth", { company: "Confidential", company_type: "SaaS" });
    const d = job("Head of Retention", { company: "Confidential" });
    const ctx = context([a, b, c, d]);
    assert.equal(resolveCompanyType(b, ctx).source, "company");
    assert.equal(resolveCompanyType(b, ctx).value, "eCommerce/DTC");
    assert.equal(resolveCompanyType(d, ctx).value, "");
  }
  // A description only ever makes a Company Type Likely.
  {
    const j = job("Product Manager", { job_description: "Our DTC brand sells direct-to-consumer on Shopify. DTC growth is key." } as Partial<Job>);
    const r = resolveCompanyType(j, context([]));
    assert.equal(r.value, "");
    assert.equal(r.likely?.value, "eCommerce/DTC");
  }
  console.log("Cases: all passed");
}

// Fresh start on real data: clear every label, then label one job from each of a few big title families.
function simulate() {
  const db = new Database(path.resolve(import.meta.dirname, "../../data/jobs.db"), { readonly: true });
  const rows = db.prepare("SELECT id, title, normalized_title, company, job_description FROM jobs WHERE deleted_at IS NULL").all() as Job[];
  const jobs = rows.map((r) => ({ ...r, job_types: [] as string[], company_type: "" }));
  const seeds: Record<string, string[]> = {
    "Director of eCommerce": ["eCommerce"], "Head of eCommerce": ["eCommerce"], "Senior Product Manager": ["Product"],
    "Head of Growth": ["Growth"], "Director of Growth": ["Growth"], "Head of CRO": ["CRO"], "CRO Manager": ["CRO"],
    "Digital Experience Manager": ["eCommerce"],
  };
  for (const [title, types] of Object.entries(seeds)) {
    const target = jobs.find((j) => j.title === title);
    if (target) target.job_types = types;
  }
  const ctx = context(jobs);
  const tally = new Map<string, number>();
  const unknown: string[] = [];
  for (const j of jobs) {
    const r = resolveJobTypes(j, ctx);
    tally.set(r.source, (tally.get(r.source) ?? 0) + 1);
    if (r.source === "none") unknown.push(j.title);
  }
  const company = new Map<string, number>();
  let likely = 0;
  for (const j of jobs) {
    const r = resolveCompanyType(j, ctx);
    company.set(r.source, (company.get(r.source) ?? 0) + 1);
    if (r.likely) likely++;
  }
  console.log(`\nFresh start, ${Object.keys(seeds).length} jobs labeled, ${jobs.length} jobs:`);
  console.log("  Job Type by source:", Object.fromEntries(tally));
  console.log("  Company Type by source:", Object.fromEntries(company), `· ${likely} with a Likely hint`);
  console.log(`  Job Type still unknown (${unknown.length}):`, [...new Set(unknown)].join(" · "));
  console.log("\n  Sample:");
  for (const j of jobs.filter((_, i) => i % 12 === 0)) {
    const t = resolveJobTypes(j, ctx);
    const c = resolveCompanyType(j, ctx);
    console.log(`  ${j.title.slice(0, 50).padEnd(50)} ${(t.values.join(", ") || "Unknown").padEnd(22)} ${(c.value || (c.likely ? `Likely ${c.likely.value}` : "Unknown")).padEnd(22)} ${t.reason}`);
  }
}

cases();
if (!process.argv.includes("--cases")) simulate();
