// Turns your real job search into the made-up demo data (demo/seed.json): the same shape, timing and outcomes,
// retold as a hunt for over-the-top candy jobs. Nothing free-form is copied across. Titles, companies, people
// and text are rebuilt from the word pools below, and a final leak check fails the run if any real name, contact
// or note made it into the output. Reads the database read-only.
//
// Salaries are scaled by a multiplier you choose each run. It's never stored, so the demo's figures can't be divided
// back into the real ones. A range picks a different multiplier for each job.
//
//   npm run demo:seed -- --salary-multiplier=2.5
//   npm run demo:seed -- --salary-multiplier=2-2.4
//
// Rules for changing this script (and why): docs/demo-data.md. A new column on jobs, events, resumes or profile is
// copied through as-is unless it gets an override below.

import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DEMO_NOW } from "../../demo/config.ts";
import type { Job } from "../../src/lib/api.ts";
import { addDays } from "../../src/lib/activity.ts";
import { buildFactModel, resolveCompanyType, resolveJobTypes, type FactType } from "../../src/lib/jobFacts.ts";
import { consolidateTitles } from "../../src/lib/titles/consolidate.ts";
import { isRoleWord } from "../../src/lib/titles/seniority.ts";
import { readPortable, type PortableData, type Row } from "../portable.ts";

const root = path.resolve(import.meta.dirname, "../..");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");
const outFile = path.join(root, "demo/seed.json");

const multiplierArg = process.argv.slice(2).find((a) => a.startsWith("--salary-multiplier="))?.split("=")[1] ?? "";
const [multMin, multMax = multMin] = multiplierArg.split("-").map(Number);
if (!(multMin > 0 && multMax >= multMin)) {
  console.error("Choose how much to scale salaries by, e.g. --salary-multiplier=2.5 or a range like --salary-multiplier=2-2.4.\n" +
    "It's not saved anywhere, so the demo's salaries can't be worked back to your real ones.");
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Deterministic randomness: names, titles and dates come out the same for the same real data. Salary nudges and
// interview times are the exception: they are drawn fresh on every run (crypto randomInt).

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(items: readonly T[], key: string): T => items[hash(key) % items.length];
const pickSome = <T,>(items: readonly T[], n: number, key: string): T[] => shuffle(items, key).slice(0, n);
function shuffle<T>(items: readonly T[], key: string): T[] {
  const r = rng(hash(key));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Hands out pool entries in order, one per distinct key, so two real values never share a fake one.
function assigner(pool: readonly string[], salt: string, overflow: (n: number) => string) {
  const order = shuffle(pool, salt);
  const given = new Map<string, string>();
  return (key: string) => {
    const k = key.trim().toLowerCase();
    if (!given.has(k)) given.set(k, order[given.size] ?? overflow(given.size));
    return given.get(k)!;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Word pools.

const COMPANY_FIRST = [
  "Marshmallow", "Gumdrop", "Lollipop", "Butterscotch", "Jellybean", "Toffee", "Caramel", "Peppermint", "Licorice",
  "Bonbon", "Fudge", "Praline", "Nougat", "Truffle", "Sherbet", "Bubblegum", "Candyfloss", "Gobstopper", "Marzipan",
  "Honeycomb", "Sprinkle", "Taffy", "Meringue", "Brittle", "Rock Candy", "Cocoa", "Gingersnap", "Sugarplum",
];
const COMPANY_SECOND = [
  "Moonworks", "Galaxy", "Mountain", "Factory", "Kingdom", "Laboratories", "Emporium", "Works", "Collective",
  "Orchard", "Castle", "Cloud", "Rocket", "Volcano", "Express", "Lagoon", "Carousel", "Observatory", "Brigade",
  "Harbor", "Meadow", "Academy", "Foundry", "Junction",
];
const COMPANY_SUFFIX = ["", "", "", " Co.", " Inc.", " & Sons", " Ltd.", " Confections", " Treats"];
const companyNames = COMPANY_FIRST.flatMap((a) => COMPANY_SECOND.map((b) => `${a} ${b}`)).map((n) => n + pick(COMPANY_SUFFIX, n));

const AGENCIES = [
  "Sweet Talent Partners", "Sugar Rush Recruiting", "The Candy Headhunters", "Bonbon Search Group", "Gumball Staffing",
  "Lollipop Talent Co.", "Toffee Talent", "Caramel Careers", "Jellybean Placement", "Fudge & Friends Recruiting",
  "Peppermint People", "Sprinkle Search", "Nougat Network", "Truffle Talent Scouts", "Marzipan Match",
  "Taffy Pull Recruiting", "Licorice Link", "Sherbet Staffing", "Praline Partners", "Meringue Matchmakers",
  "Brittle & Bright", "Cocoa Connect", "Gobstopper Group", "Honeycomb Hiring", "Sugarplum Search",
  "Butterscotch Bureau", "Candyfloss Careers", "Rock Candy Recruiters", "Gingersnap Talent", "Bubblegum Bridge",
  "Marshmallow Matching", "Gumdrop Global", "Fizz Talent", "Chewy Careers", "Sour Patch Partners",
  "Wafer Works Recruiting", "Hard Candy Hiring", "Soft Serve Staffing", "Jawbreaker Search", "Rainbow Drop Recruiting",
  "Cherry Pop Partners", "Lemon Drop Search",
];


// Candy words handed out to the words in your titles: each distinct word gets the next unused one, so titles
// still group the same way and your synonym sets still merge. Nothing here is tailored to any field.
const WORD_POOL = [
  "Confectionery", "Flavor", "Fizz", "Frosting", "Gummy", "Lollipop", "Gumdrop", "Sprinkle", "Crunch", "Sparkle",
  "Tasting", "Wrapper", "Bonbon", "Caramel", "Toffee", "Chocolate", "Candy", "Sweetening", "Sampling", "Stickiness",
  "Conveyor", "Recipe", "Factory", "Snacking", "Swirl", "Nougat", "Glazing", "Icing", "Melting", "Licorice",
  "Marzipan", "Praline", "Truffle", "Butterscotch", "Jellybean", "Fudge", "Meringue", "Sherbet", "Brittle",
  "Peppermint", "Floss", "Bubblegum", "Gingerbread", "Marshmallow", "Candycane", "Gelato", "Macaron", "Cocoa",
  "Honeycomb", "Mochi", "Churro", "Wafer", "Jawbreaker", "Gumball", "Sugarplum", "Taffy", "Lemondrop", "Rainbow",
  "Sundae", "Cupcake", "Waffle", "Pudding", "Custard", "Cobbler", "Snowcone", "Popcorn", "Pretzel", "Cinnamon",
  "Vanilla", "Hazelnut", "Pistachio", "Cherry", "Confection", "Gobstopper", "Ganache", "Fondant", "Nonpareil",
  "Shortbread", "Brownie", "Biscotti", "Cannoli", "Eclair", "Strudel", "Tiramisu", "Parfait", "Smoothie",
  "Milkshake", "Soda", "Syrup", "Molasses", "Cottoncandy", "Fruitchew", "Rocksugar", "Sourball", "Mintdrop",
  "Jujube", "Halva", "Turron", "Baklava", "Kulfi", "Mango", "Peach", "Lime", "Raspberry", "Blueberry", "Bubbletea",
  "Snickerdoodle", "Gingersnap", "Pinwheel", "Sugarcube", "Teacake", "Crumble", "Tart", "Galette", "Fritter",
  "Beignet", "Donut",
];

// One-off titles for jobs whose real title has no recognizable work in it.
const ODDBALL_TITLES = [
  "Chief Taste Tester", "Senior Gummy Bear Wrangler", "Director of Giving Candy to Children", "Lollipop Sommelier",
  "Head of Sprinkle Distribution", "Principal Chocolate Fountain Engineer", "VP of Sugar Rush Management",
  "Cotton Candy Cloud Architect", "Staff Jellybean Sorter",
];

// Names handed out to your Job Types and Company Types, in list order. "Other" stays "Other".
const JOB_TYPE_POOL = [
  "Flavor Development", "Candy Engineering", "Wrapper Design", "Taste Science", "Frosting", "Fizz", "Confectionery",
  "Lollipop Sales", "Smile Success", "Factory Floor", "Gold Coin Finance", "Elf Relations", "Candy Kingdom Management",
  "Sprinkle Logistics", "Gumdrop Research", "Chocolate Quality", "Sugar Safety", "Toffee Training", "Bonbon Outreach",
];
const COMPANY_TYPE_POOL = [
  "Candy Shop", "Sweets as a Service", "Bulk Bonbons", "Sugar Consultancy", "Sweet Shoppe", "Chocolate Coin Fintech",
  "Dental (Ironically)", "Candy Bazaar", "Free Candy Foundation", "Gumball Arcade", "Ice Cream Truck Fleet",
];

const JD = {
  intro: [
    "{company} has been making children inexplicably happy since a very specific Tuesday. We are hiring a {title} to make that happiness measurable.",
    "At {company}, every candy is hand-tasted by at least three professionals and one golden retriever. Join us as our next {title}.",
    "{company} is the world's fourth-largest producer of candy shaped like other, larger candy. We need a {title} who thinks big and chews small.",
    "Our mission at {company} is simple: give every child on Earth one perfect gumdrop. The {title} owns the word perfect.",
    "{company} is scaling fast. Our sugar silos are full, our conveyor belts hum, and we need a {title} to keep it all delicious.",
  ],
  doing: [
    "Run weekly blind taste tests with a panel of extremely honest seven-year-olds.",
    "Own the roadmap for every flavor launching next season, including the controversial pickle-lime.",
    "Partner with the Factory Floor to keep the chocolate river at a consistent 31°C.",
    "Set goals for smile rate, sticky-finger incidents and second-helping requests.",
    "Present quarterly results to the Candy Council, which meets inside a giant hollow egg.",
    "Hand out free samples at schools, birthday parties and the occasional dentist convention.",
    "Design experiments to find out whether sprinkles taste better in rainbow or chaos order.",
    "Negotiate with suppliers of premium sugar, ethically sourced cocoa and edible glitter.",
    "Lead a team of taste testers, wrapper artists and one very serious gummy bear wrangler.",
    "Keep the lollipop forest pruned, healthy and photogenic.",
    "Turn kid feedback (mostly drawings) into a prioritized backlog.",
    "Champion candy safety: no choking hazards, no sad flavors, no licorice nobody asked for.",
  ],
  need: [
    "7+ years of professional sweet-tooth experience, or 3 years if they were very intense.",
    "A palate that can tell butterscotch from caramel with your eyes closed.",
    "Comfort with spreadsheets, sugar highs and long walks through the gumdrop orchard.",
    "Experience leading teams through a holiday rush (Halloween counts double).",
    "A deep, unshakable belief that every day is a good day for dessert.",
    "Excellent communication with grown-ups, children and the occasional talking candy cane.",
    "Willingness to wear a hairnet, sometimes a cape.",
    "Bonus: a working knowledge of cotton candy aerodynamics.",
  ],
  perks: [
    "Unlimited candy (within reason, and the reason is the dentist).",
    "Free dental, because we're not monsters.",
    "A desk next to the chocolate fountain, subject to availability.",
    "Two weeks of paid Sugar Leave every year.",
    "Equity paid in rare gobstoppers.",
    "A company tricycle.",
    "Monthly field trips to the gumdrop orchard.",
  ],
};

const EVENT_TEXT: Record<string, string[]> = {
  Applied: ["Applied through the candy portal", "Sent a resume wrapped in edible paper", "Applied with a cover letter in icing", "Applied; attached a portfolio of past lollipops"],
  Contact: ["Recruiter replied with three gummy bear emojis", "Their team asked for my favorite jellybean flavor", "Got a note from the Head of Sprinkles", "Recruiter wants to set up a call after snack time"],
  "Follow-Up": ["Sent a polite follow-up and a single truffle", "Checked in with the recruiter about next steps", "Followed up by carrier pigeon (with treats)", "Nudged the hiring manager about the taste test"],
  Screen: ["Recruiter screen about my sugar tolerance", "Phone screen with the Candy Talent team", "Intro call with the recruiter, lots of questions about lollipops", "Screen with HR; asked about my stance on raisins"],
  Interview: [
    "Round 1 with the hiring manager in the chocolate library", "Blind taste-test panel with the Head Gummy Officer",
    "Case study: launch a flavor for kids who say they hate flavor", "Final round: present a candy roadmap to the Candy Council",
    "Team interview on the factory floor, hairnets provided", "Interview with the Chief Taste Tester and two very honest kids",
  ],
  Offer: ["Offer: generous salary plus a lifetime gumdrop supply"],
  Accepted: ["Accepted! Starting in the gumdrop orchard on Monday"],
  Rejection: ["They went with a candidate holding a PhD in Jellybeans", "Rejected; my licorice opinions were too strong", "Not moving forward, they want more cotton candy experience"],
  Withdrew: ["Withdrew: the role was 90% licorice", "Withdrew after learning the chocolate river is decorative"],
  Ghosted: ["Never heard back, presumably lost in the candy floss", "Closed out: silence from the factory"],
  Scam: ["Scam: they wanted me to buy my own candy"],
  Note: ["Their office smells like caramel, which is a strong sign"],
};

const INTERVIEW_NOTES = [
  "Met with the hiring manager and two taste testers.\n\n- They asked me to rank five mystery gummies and explain my reasoning.\n- Big focus on launching sour flavors without making kids cry.\n- Team seems kind, slightly over-caffeinated, very into sprinkles.\n\nQuestions I should ask next time: how they measure smiles per bag, and who owns the chocolate river.",
  "Panel interview in the lollipop forest.\n\n- Walked through my favorite candy launch and what I'd do differently.\n- They're rebuilding the wrapper line and want someone to run experiments.\n- Concern: they may want more factory experience.\n\nFollow-up: send the gumdrop pricing idea I mentioned.",
  "Case study round.\n\nPrompt: design a candy that lasts exactly the length of a car ride to grandma's house.\nMy answer: a layered jawbreaker with a flavor change at every exit. They laughed (good laughing).\n\nNext: final round with the Candy Council.",
];

const JOB_NOTES = [
  "The recruiter mentioned a free candy wall. Investigate.", "Hybrid means two days a week in the gumdrop orchard.",
  "Team is small but very sticky.", "Ask about their sugar-free line, rumored to be secret.",
  "Salary range came from the recruiter; perks include a tricycle.", "Hiring manager used to run the cotton candy division.",
  "They just raised a big round of chocolate coins.", "Role reports to the Chief Taste Tester.",
  "Lots of travel to candy conventions.", "Job post mentions 'fast-paced candy environment' four times.",
];

const OFFER_TEXT = ["Base salary plus a lifetime supply of gumdrops, free dental, and a company tricycle."];

const RESUME_NOTES = [
  "Leans into flavor launches and taste-test results.", "Shorter version for agencies, heavy on sprinkles.",
  "Highlights factory-floor leadership.", "The one with the gumdrop pricing case study.",
];

const PROFILE = {
  your_name: "Taffy Marlowe",
  cover_letter:
    "Dear Candy Hiring Committee,\n\nI have spent my career making children smile, one gumdrop at a time. I've led taste tests, launched " +
    "flavors kids still talk about, and once kept a chocolate river flowing through a three-day power outage.\n\nI'd love to bring that " +
    "same sticky determination to your team.\n\nSweetly yours,\nTaffy Marlowe",
};

// ---------------------------------------------------------------------------------------------------------------
// Read the real data.

const db = new Database(path.join(dataDir, "jobs.db"), { readonly: true, fileMustExist: true });
const real = readPortable(db, { pdfs: false });
const T = real.tables;
const realJobs = T.jobs as unknown as Job[];
const realEvents = T.events as unknown as (Row & { id: number; job_id: number; date: string; type: string; time: string | null; description: string; notes: string })[];
const synonyms = (T.title_synonyms as { terms: string[] }[]).map((s) => s.terms);

// ---------------------------------------------------------------------------------------------------------------
// Words, titles and labels.

// Matched the way title analysis matches words: lowercase, hyphens dropped (Co-Op is coop).
const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const CONNECTORS = new Set(["to", "of", "and", "the", "for", "in", "on", "a", "an"]);
// Handed out in pool order, most-used words first (see below), so the commonest work gets the most job-like name.
const givenWords = new Map<string, string>();
const candyWord = (k: string) => {
  if (!givenWords.has(k)) {
    const n = givenWords.size;
    givenWords.set(k, WORD_POOL[n] ?? `${WORD_POOL[n % WORD_POOL.length]}${WORD_POOL[(n * 7 + 3) % WORD_POOL.length].toLowerCase()}`);
  }
  return givenWords.get(k)!;
};
const replacedWords = new Set<string>(); // real words, for the leak check
// Role words (Manager, Engineer, Nurse…) and connectors are kept so titles still parse; everything else is replaced.
function word(w: string): string {
  const k = normWord(w);
  if (!k || /^\d+$/.test(k) || CONNECTORS.has(k) || isRoleWord(k)) return w;
  replacedWords.add(k);
  return candyWord(k);
}
const phrase = (p: string) => p.split(/\s+/).filter(Boolean).map(word).join(" ");

function candyTitle(job: Job, info: ReturnType<ReturnType<typeof consolidateTitles>["get"]>): string {
  const key = `title-${job.id}`;
  if (!info || !info.function || info.function === "Chief") return pick(ODDBALL_TITLES, key);
  const tokens = info.function.split(/\s+/);
  const F = phrase(info.function);
  const rung = info.familyKey.split(":")[0];
  const rank = info.seniority.rank ?? 0;
  const v = <T,>(xs: T[]) => pick(xs, key);
  switch (rung) {
    case "director":
      if (rank >= 6) return v([`Senior Director of ${F}`, `Sr. Director, ${F}`]);
      if (rank <= 4) return v([`Associate Director of ${F}`, `Associate Director, ${F}`]);
      return v([`Director of ${F}`, `${F} Director`, `Director, ${F}`]);
    case "head":
      return `Head of ${F}`;
    case "vp":
      return rank >= 8 ? `SVP, ${F}` : v([`VP of ${F}`, `Vice President, ${F}`, `VP, ${F}`]);
    case "chief":
      return `Chief ${F} Officer`;
    case "manager":
      return rank >= 4 ? v([`Senior ${F} Manager`, `Sr. Manager, ${F}`, `Senior Manager, ${F}`]) : v([`${F} Manager`, `Manager, ${F}`]);
    case "lead":
      return v([`${F} Lead`, `Lead, ${F}`]);
    case "ic": {
      const role = tokens.findIndex((t) => isRoleWord(normWord(t)));
      const head = role >= 0 ? phrase(tokens.slice(0, role + 1).join(" ")) : F;
      const rest = role >= 0 ? phrase(tokens.slice(role + 1).join(" ")) : "";
      const base = rest ? `${head}, ${rest}` : head;
      const level = { 1: "Junior ", 3: v(["Senior ", "Sr. "]), 4: "Staff ", 5: "Principal ", 6: "Distinguished " }[rank] ?? "";
      return level + base;
    }
    default:
      return F;
  }
}

const jobTypeName = assigner(JOB_TYPE_POOL, "job-types", (n) => `Candy Department ${n + 1}`);
const companyTypeName = assigner(COMPANY_TYPE_POOL, "company-types", (n) => `Candy Business ${n + 1}`);
const realTypeNames = new Set<string>(); // for the leak check
function typeName(name: string, kind = "job") {
  if (name.trim().toLowerCase() === "other") return "Other";
  realTypeNames.add(name.trim());
  return kind === "company" ? companyTypeName(name) : jobTypeName(name);
}
// Your own list order decides who gets which name, so the main types get the first ones.
for (const t of [...(T.fact_types as { kind: string; name: string; sort: number }[])].sort((a, b) => a.sort - b.sort)) typeName(t.name, t.kind);

function resumeVersion(v: string) {
  const m = v.trim().match(/^(.*?)\s*(\d+(?:\.\d+)*)$/);
  const family = (m ? m[1] : v).trim();
  const fake = family.split(/\s+/).map(word).join(" ");
  return m ? `${fake} ${m[2]}` : fake;
}

// ---------------------------------------------------------------------------------------------------------------
// Dates: shift by whole weeks so the day this runs lands on the demo's frozen day, keeping weekdays intact.

const demoDay = DEMO_NOW.slice(0, 10);
const realToday = new Date().toLocaleDateString("en-CA");
const shiftDays = Math.round((Date.parse(demoDay) - Date.parse(realToday)) / 86_400_000 / 7) * 7;
// Timestamps all get the same time of day, so the demo doesn't show when the real rows were entered.
const FIXED_TIME = "12:00:00";
const shiftDate = (d: unknown, extra = 0) =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)
    ? addDays(d.slice(0, 10), shiftDays + extra) + (d.length > 10 ? ` ${FIXED_TIME}` : "")
    : d;

// A screen or interview time somewhere in the working day (9:00 to 4:30, on the quarter hour), fresh on every run.
const workingTime = () => {
  const minutes = 9 * 60 + randomInt(31) * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

// Each job's dates then move together by a day back, none, or a day forward, so no date in the demo is exactly a
// real one while every job's history keeps its order and gaps. The pick is keyed on real details that never reach
// the seed, and a job is never nudged past the demo's today.
const DAY_NUDGES = [-1, 0, 1];
const jobNudges = new Map<number, number>();
for (const j of T.jobs as unknown as Job[]) {
  const nudge = pick(DAY_NUDGES, `dates|${j.company}|${j.title}|${j.applied_date}|${j.created_at}`);
  const dates = [j.applied_date, ...realEvents.filter((e) => e.job_id === j.id).map((e) => e.date)].filter(Boolean) as string[];
  const latest = dates.reduce((m, d) => (d > m ? d : m), "");
  jobNudges.set(j.id, nudge > 0 && latest && (shiftDate(latest) as string) >= demoDay ? 0 : nudge);
}
const shiftJobDate = (d: unknown, jobId: number) => shiftDate(d, jobNudges.get(jobId) ?? 0);

// ---------------------------------------------------------------------------------------------------------------
// Jobs.

const titles = consolidateTitles(realJobs, { synonyms });
const ctx = { titles, model: buildFactModel(realJobs, titles, T.fact_types as unknown as FactType[], synonyms) };

// Most-used title words claim candy words first.
const wordCounts = new Map<string, number>();
for (const info of titles.values()) for (const w of info.function.split(/\s+/)) wordCounts.set(normWord(w), (wordCounts.get(normWord(w)) ?? 0) + 1);
for (const [w] of [...wordCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) word(w);
const company = assigner(companyNames, "companies", (n) => `Candy Company No. ${n}`);
const agency = assigner(AGENCIES, "agencies", (n) => `Candy Recruiters No. ${n}`);

// Scaled by the multiplier from the command (a range picks one per job, keyed on real details that never reach the
// seed), then each end of the range gets its own random nudge, fresh on every run, so no range keeps its real shape.
// Rounded to $5k.
const SALARY_NUDGES = [-0.2, -0.1, 0, 0.1, 0.2];
const jobMultiplier = (key: string) => multMin + ((hash(key) % 10_000) / 9_999) * (multMax - multMin);
function salaryRange(min: number | null, max: number | null, key: string) {
  const m = jobMultiplier(key);
  const scale = (n: number | null) => (n === null ? null : Math.round((n * (m + SALARY_NUDGES[randomInt(SALARY_NUDGES.length)])) / 5000) * 5000);
  const [lo, hi] = [scale(min), scale(max)];
  return lo !== null && hi !== null && lo > hi ? [hi, lo] : [lo, hi];
}

// The rest of the package. Dollar figures get the job's salary multiplier and their own random nudge, rounded to $1k.
// Percentages and day counts get a small random nudge, fresh every run, so an unusual mix can't point to a real
// employer. Yes/no answers, equity type and source are shape, not content, and are kept. Columns missing from an
// older real database come out as blanks.
const MONEY_KEYS = ["bonus_amount", "equity_annual", "signing_bonus", "relocation", "hsa_employer", "stipends_annual"] as const;
const NUDGED_KEYS = [
  ["bonus_pct", 2], ["match_rate_pct", 10], ["match_cap_pct", 1], ["medical_premium_pct", 5], ["equity_vest_years", 1],
  ["pto_days", 2], ["sick_days", 1], ["holidays", 1], ["parental_leave_weeks", 2],
] as const;
const BENEFIT_KEYS = ["benefit_medical", "benefit_dental", "benefit_vision", "benefit_life", "benefit_disability"] as const;
function compensation(j: Record<string, unknown>, salaryKey: string): Row {
  const m = jobMultiplier(salaryKey);
  const value = (k: string) => (typeof j[k] === "number" ? (j[k] as number) : null);
  const money = (n: number | null) => (n === null ? null : Math.round((n * (m + SALARY_NUDGES[randomInt(SALARY_NUDGES.length)])) / 1000) * 1000);
  const nudge = (n: number | null, by: number, k: string) =>
    n === null ? null : Math.min(k === "medical_premium_pct" || k === "match_cap_pct" ? 100 : Infinity, Math.max(0, n + randomInt(-by, by + 1)));
  return {
    comp_source: j.comp_source === "posted" || j.comp_source === "offer" ? j.comp_source : "",
    equity_type: ["none", "rsu", "options", "profit_share", "other"].includes(String(j.equity_type)) ? j.equity_type : "",
    pto_unlimited: j.pto_unlimited ? 1 : 0,
    ...Object.fromEntries(MONEY_KEYS.map((k) => [k, money(value(k))])),
    ...Object.fromEntries(NUDGED_KEYS.map(([k, by]) => [k, nudge(value(k), by, k)])),
    ...Object.fromEntries(BENEFIT_KEYS.map((k) => [k, value(k) === null ? null : value(k) ? 1 : 0])),
  };
}

function jdFor(title: string, companyName: string, key: string) {
  const fill = (s: string) => s.replaceAll("{company}", companyName).replaceAll("{title}", title);
  return [
    fill(pick(JD.intro, key)),
    "What you'll do",
    ...pickSome(JD.doing, 5, key + "d").map((s) => `- ${s}`),
    "What you'll bring",
    ...pickSome(JD.need, 4, key + "n").map((s) => `- ${s}`),
    "Perks",
    ...pickSome(JD.perks, 3, key + "p").map((s) => `- ${s}`),
  ].join("\n");
}

const jobs: Row[] = realJobs.map((j) => {
  const key = `job-${j.id}`;
  const salaryKey = `salary|${j.company}|${j.title}|${j.applied_date}|${j.created_at}`;
  const salaries = salaryRange(j.salary_min, j.salary_max, salaryKey);
  const title = candyTitle(j, titles.get(j.id));
  const companyName = j.company.trim() ? company(j.company) : "";
  const types = resolveJobTypes(j, ctx);
  const ctype = resolveCompanyType(j, ctx);
  // Labels the candy titles can't re-derive are stored; ones that come from a sibling job are left to be worked out.
  const keepTypes = types.source !== "family" && types.source !== "none";
  const keepCompany = ctype.source !== "company" && ctype.source !== "family" && ctype.source !== "none";
  const r = j as unknown as Row;
  return {
    ...Object.fromEntries(Object.keys(r).map((k) => [k, shiftJobDate(r[k], j.id)])),
    title,
    normalized_title: "",
    company: companyName,
    company_type: keepCompany ? typeName(ctype.value, "company") : "",
    job_types: keepTypes ? types.values.map((v) => typeName(v)) : [],
    salary_min: salaries[0],
    salary_max: salaries[1],
    ...compensation(r, salaryKey),
    resume_version: j.resume_version ? resumeVersion(j.resume_version) : "",
    jd_link: "",
    agency_name: j.agency_name.trim() ? agency(j.agency_name) : "",
    // No contacts at all, made up or otherwise.
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    contact_linkedin: "",
    offer_info: j.offer_info.trim() ? pick(OFFER_TEXT, key) : "",
    notes: j.notes.trim() ? pick(JOB_NOTES, key) : "",
    job_description: (j.job_description ?? "").trim() ? jdFor(title, companyName || "Our candy company", key) : "",
    cover_letter: (j.cover_letter ?? "").trim() ? PROFILE.cover_letter : "",
  };
});
const jobById = new Map(jobs.map((j) => [j.id as number, j]));

// ---------------------------------------------------------------------------------------------------------------
// Events, plus a demo day with something past, something about to start and something later.

let events: Row[] = realEvents.map((e) => ({
  ...e,
  date: shiftJobDate(e.date, e.job_id),
  created_at: shiftJobDate(e.created_at, e.job_id),
  time: e.time ? workingTime() : null,
  description: e.description.trim() ? pick(EVENT_TEXT[e.type] ?? EVENT_TEXT.Note, `ev-${e.id}`) : "",
  notes: e.notes.trim() ? pick(INTERVIEW_NOTES, `evn-${e.id}`) : "",
}));

// Real screens and interviews from the demo day on are replaced by the curated schedule below.
const isUpcoming = (e: Row) => (e.date as string) >= demoDay && (e.type === "Screen" || e.type === "Interview");
const upcoming = events.filter(isUpcoming);
events = events.filter((e) => !isUpcoming(e));

const CLOSING = new Set(["Rejection", "Withdrew", "Ghosted", "Accepted", "Scam"]);
const byJob = new Map<number, Row[]>();
for (const e of events) byJob.set(e.job_id as number, [...(byJob.get(e.job_id as number) ?? []), e]);
const lastDate = (id: number) => (byJob.get(id) ?? []).reduce((m, e) => ((e.date as string) > m ? (e.date as string) : m), "");
const open = jobs.filter((j) => !j.deleted_at && !(byJob.get(j.id as number) ?? []).some((e) => CLOSING.has(e.type as string)));
const interviewing = open.filter((j) => (byJob.get(j.id as number) ?? []).some((e) => e.type === "Screen" || e.type === "Interview"));
const recentApplied = open.filter((j) => !interviewing.includes(j) && lastDate(j.id as number) >= addDays(demoDay, -14));
const byRecent = (a: Row, b: Row) => lastDate(b.id as number).localeCompare(lastDate(a.id as number));
const candidates = [...upcoming.map((e) => jobById.get(e.job_id as number)!).filter(Boolean), ...interviewing.sort(byRecent), ...recentApplied.sort(byRecent)]
  .filter((j, i, all) => all.indexOf(j) === i);

const schedule: { day: number; time: string; type: string; text: string }[] = [
  { day: 0, time: "10:00", type: "Interview", text: "Round 2: blindfolded jellybean identification" },
  { day: 0, time: "14:45", type: "Interview", text: "Final round: present a candy roadmap to the Candy Council" },
  { day: 0, time: "16:00", type: "Screen", text: "Recruiter screen about my sugar tolerance" },
  { day: 1, time: "11:00", type: "Interview", text: "Team interview on the factory floor, hairnets provided" },
  { day: 2, time: "13:30", type: "Screen", text: "Intro call with the Head of Sprinkles" },
];
let nextEventId = Math.max(0, ...events.map((e) => e.id as number)) + 1;
schedule.forEach((s, i) => {
  const job = candidates[i];
  if (!job) return;
  events.push({ id: nextEventId++, job_id: job.id, date: addDays(demoDay, s.day), time: s.time, type: s.type, description: s.text, notes: "", created_at: `${demoDay} ${FIXED_TIME}` });
});
events.sort((a, b) => (a.id as number) - (b.id as number));

// ---------------------------------------------------------------------------------------------------------------
// Everything else.

const factTypes = (T.fact_types as Row[]).map((t) => ({ ...t, name: typeName(String(t.name), String(t.kind)), starter_key: null, created_at: shiftDate(t.created_at) }));

// The built-in starter sets (server/db.ts) are generic and stay as they are; your own sets go through the word map.
const dbSource = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
const isStarter = (terms: string[]) => terms.every((t) => dbSource.includes(JSON.stringify(t)));
const titleSynonyms = (T.title_synonyms as Row[]).map((s) => ({
  ...s,
  terms: isStarter(s.terms as string[]) ? s.terms : [...new Set((s.terms as string[]).map((t) => t.split(/(\s+)/).map((p) => (p.trim() ? word(p) : p)).join("")))],
  created_at: shiftDate(s.created_at),
  updated_at: shiftDate(s.updated_at),
}));

// Starred groups are keyed by their words, so they're rebuilt from the candy titles' own groups.
const candyJobs = jobs as unknown as Job[];
const candyTitles = consolidateTitles(candyJobs, { synonyms: titleSynonyms.map((s) => s.terms as string[]) });
const candyGroups = new Map<string, string>();
for (const info of candyTitles.values()) {
  candyGroups.set(info.familyKey, info.family);
  for (const r of info.rollsUpTo) candyGroups.set(r.key, r.label);
}
const starredGroups = (T.starred_groups as Row[]).flatMap((s) => {
  const key = String(s.key);
  if (s.kind === "seniority") return [{ ...s, created_at: shiftDate(s.created_at) }];
  if (s.kind === "type") {
    const name = typeName(key.replace(/^type:/, ""));
    return [{ ...s, key: `type:${name}`, label: name, created_at: shiftDate(s.created_at) }];
  }
  const [rung, words] = key.split(":");
  const candyKey = `${rung}:${words.split(" ").map((w) => normWord(word(w)).replace(/-/g, "")).sort().join(" ")}`;
  const label = candyGroups.get(candyKey);
  return label ? [{ ...s, key: candyKey, label, created_at: shiftDate(s.created_at) }] : [];
});

const resumes = (T.resumes as Row[]).map((r) => {
  const version = resumeVersion(String(r.version));
  const pdf = makePdf([`${PROFILE.your_name}`, `Resume: ${version}`, "", "Professional candy person.", "Ten years of making children smile, one gumdrop at a time.", "Expert taster. Licensed sprinkle handler.", "", "(Made-up demo data)"]);
  return {
    ...r,
    version,
    notes: pick(RESUME_NOTES, `res-${r.id}`),
    plain_text: `${PROFILE.your_name}\n${version}\n\nProfessional candy person. Ten years of making children smile, one gumdrop at a time.`,
    pdf: pdf.toString("base64"),
    pdf_name: `${version.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    pdf_size: pdf.length,
    created_at: shiftDate(r.created_at),
    updated_at: shiftDate(r.updated_at),
    deleted_at: shiftDate(r.deleted_at),
  };
});

const realProfile = T.profile[0] ?? {};
const profile = [{
  ...realProfile,
  ...PROFILE,
  salary_target: 500_000,
  // Fixed demo figures for the past job, never the real ones.
  past_base_salary: 400_000,
  past_package: 450_000,
  past_days_off: 25,
  hide_financials: 0,
  // New-job defaults: the starred resume's id is already public in the seed; the rest are fixed demo values.
  favorite_resume_id: realProfile.favorite_resume_id ?? null,
  default_work_mode: "Remote",
  default_applied_via: "Direct",
  updated_at: `${demoDay} ${FIXED_TIME}`,
}];

const seed: PortableData = {
  schema_version: real.schema_version,
  exported_at: `${DEMO_NOW}:00`,
  tables: { profile, fact_types: factTypes, title_synonyms: titleSynonyms, starred_groups: starredGroups, resumes, jobs, events },
};

// ---------------------------------------------------------------------------------------------------------------
// Leak check. Every real name, contact and fallback word is searched for; any hit stops the run before writing.

const scanText = JSON.stringify({ ...seed.tables, resumes: resumes.map(({ pdf: _pdf, ...r }) => r) });
const needles = new Set<string>();
const add = (s: unknown, min = 3) => {
  const t = String(s ?? "").trim();
  if (t.length >= min) needles.add(t);
};
for (const j of realJobs) {
  add(j.company);
  add(j.agency_name);
  add(j.contact_name);
  add(j.contact_email);
  add(j.contact_email.split("@")[0], 4);
  add(j.contact_phone.replace(/\D/g, ""), 7);
  add(j.contact_linkedin);
  add(j.jd_link, 10);
}
add(realProfile.your_name);
// Real title words and type names that were replaced. Ones that also appear in this script's own text or the
// starter synonyms are generic and expected.
const ownText = (fs.readFileSync(import.meta.filename, "utf8") + dbSource).toLowerCase();
for (const w of replacedWords) if (!ownText.includes(w)) add(w, 4);
for (const n of realTypeNames) if (!ownText.includes(n.toLowerCase())) add(n);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const leaks = [...needles].filter((n) => new RegExp(`(^|[^A-Za-z0-9])${escape(n)}($|[^A-Za-z0-9])`, "i").test(scanText));
if (leaks.length) {
  console.error(`Leak check failed: ${leaks.length} real values appear in the demo data. Nothing was written.`);
  for (const l of leaks.slice(0, 40)) console.error("  ", l);
  process.exit(1);
}

fs.writeFileSync(outFile, JSON.stringify(seed, null, 2) + "\n");
console.log(
  `Wrote ${path.relative(root, outFile)}: ${jobs.length} jobs, ${events.length} events, ${resumes.length} resumes. ` +
    `Dates shifted ${shiftDays} days, then each job's by a day either way at random; ${needles.size} real values checked, none found.`,
);

// ---------------------------------------------------------------------------------------------------------------
// A one-page PDF with a few lines of text, for the demo's resume vault.

function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 22 : 13} Tf 72 ${720 - i * 26} Td (${esc(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
