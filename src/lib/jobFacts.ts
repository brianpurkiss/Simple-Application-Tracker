// Job Type and Company Type for every page. A value set on the job always wins; otherwise it's worked out
// here on read from the other jobs, so nothing automatic is stored and labeling one job updates the rest.
//
//   Job Type (a list, main one first):  set on the job → same title family → words in the title → Unknown
//   Company Type:                       set on the job → same company → words in the title → Unknown
//
// "Words in the title" are the starter words for the starter types (factVocab.ts) plus words learned from
// the jobs you've labeled. When Company Type is Unknown it can still carry a "Likely" hint, from the job
// description or from title words that usually go with one type. A hint never counts until you accept it.

import type { Job } from "./api.ts";
import { COMPANY_JD_WORDS, COMPANY_TITLE_WORDS, FACT_STOPWORDS, JOB_TYPE_WORDS } from "./factVocab.ts";
import { compileSynonyms, type SynonymRule, tokenizeTitle } from "./titles/normalize.ts";
import { isRoleWord, parseTitle } from "./titles/seniority.ts";
import type { TitleInfo } from "./titles/types.ts";

export type FactKind = "job" | "company";
export type FactType = { id: number; kind: FactKind; name: string; sort: number; starter_key: string | null };

/** Where a value came from: set on the job, worked out (family, company, learned, starter), or nothing. */
export type FactSource = "manual" | "family" | "company" | "learned" | "starter" | "none";

export type Likely = { value: string; reason: string };
export type ResolvedJobTypes = { values: string[]; source: FactSource; reason: string };
export type ResolvedCompanyType = { value: string; source: FactSource; reason: string; likely?: Likely };

export const isAutomatic = (source: FactSource) => source !== "manual" && source !== "none";

// A learned word needs this share of the labeled jobs that have it to carry the type...
const MIN_PRECISION = 0.8;
// ...and this many of them where nothing else in the title already explained the type.
const MIN_LEARNED_JOBS = 2;
// A description makes a type Likely when it's mentioned this often, and twice as often as any other.
const MIN_JD_HITS = 3;
// At most this many Job Types are worked out for one job.
const MAX_JOB_TYPES = 3;
// Company names that don't name a company, so their jobs say nothing about each other.
const NOT_A_COMPANY = new Set(["", "confidential", "stealth", "stealth startup", "undisclosed", "unknown", "n a", "na"]);
// Words that anchor a title: the rung or the role. Job Types closest to it come first.
const ANCHORS = new Set(["director", "head", "vp", "svp", "evp", "avp", "president", "chief", "lead", "leader", "supervisor"]);

// Plurals read the same as singulars ("Brands" = "brand"), on both the vocabulary and the title side.
const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** Lowercase words with hyphens inside words dropped ("e-commerce" → "ecommerce") and stopwords skipped. */
export function factWords(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(\p{L})[-‐-―](?=\p{L})/gu, "$1")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FACT_STOPWORDS.has(w))
    .map(stem);
}

// --- Phrase matching -------------------------------------------------------------------------------------

type Phrase = { words: string[]; types: string[]; learned?: { jobs: number } };
type Hit = { start: number; phrase: Phrase; text: string };

// Longest phrase first at each position; phrases don't overlap. A learned phrase replaces a starter phrase
// with the same words, so labels you've given override the built-in guess.
function phraseIndex(phrases: Phrase[]): Map<string, Phrase[]> {
  const byWords = new Map<string, Phrase>();
  for (const p of phrases) {
    const key = p.words.join(" ");
    const have = byWords.get(key);
    if (!have || (p.learned && !have.learned)) byWords.set(key, p);
  }
  const index = new Map<string, Phrase[]>();
  for (const p of byWords.values()) index.set(p.words[0], [...(index.get(p.words[0]) ?? []), p]);
  for (const list of index.values()) list.sort((a, b) => b.words.length - a.words.length);
  return index;
}

function findPhrases(words: string[], index: Map<string, Phrase[]>): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < words.length; ) {
    const p = index.get(words[i])?.find((c) => c.words.every((w, k) => words[i + k] === w));
    if (p) {
      hits.push({ start: i, phrase: p, text: p.words.join(" ") });
      i += p.words.length;
    } else i++;
  }
  return hits;
}

const starterPhrases = (vocab: Record<string, string[]>, types: FactType[]): Phrase[] =>
  types.flatMap((t) => (t.starter_key ? (vocab[t.starter_key] ?? []).map((p) => ({ words: factWords(p), types: [t.name] })) : []))
    .filter((p) => p.words.length);

// --- Per-job analysis ------------------------------------------------------------------------------------

type Analysis = {
  /** Title words without the company name or parentheticals, synonyms applied. */
  words: string[];
  /** Positions in `words` that are the work rather than the level ("Product", "Growth"). */
  fn: Set<number>;
  /** Position of the rung or role word, or -1. */
  anchor: number;
  /** Rung + function words, for finding a new title's family by its exact wording. */
  exactKey: string;
  /** Every word of the title, parentheticals included, for Company Type. */
  allWords: string[];
};

function analyze(job: Pick<Job, "title" | "normalized_title" | "company">, synonyms: SynonymRule[]): Analysis {
  const title = job.normalized_title?.trim() || job.title;
  const tokens = tokenizeTitle(title, job.company, synonyms);
  const parsed = parseTitle(tokens);
  const fnTokens = new Set(parsed.functionTokens);
  const kept = tokens.filter((t) => !FACT_STOPWORDS.has(t.norm));
  const words = kept.map((t) => stem(t.norm));
  const fn = new Set(kept.flatMap((t, i) => (fnTokens.has(t) ? [i] : [])));
  const anchor = words.findIndex((w, i) => ANCHORS.has(w) || isRoleWord(kept[i].norm));
  const exactKey = `${parsed.levelKey}:${[...new Set(parsed.functionTokens.map((t) => t.norm))].sort().join(" ")}`;
  return { words, fn, anchor, exactKey, allWords: factWords(`${job.title} ${job.normalized_title ?? ""}`) };
}

// Candidate words to learn from: single function words that aren't the role itself, and adjacent pairs.
function learnablePhrases(a: Analysis): string[] {
  const out = new Set<string>();
  for (const i of a.fn) {
    if (!isRoleWord(a.words[i]) && !ANCHORS.has(a.words[i])) out.add(a.words[i]);
    if (a.fn.has(i + 1)) out.add(`${a.words[i]} ${a.words[i + 1]}`);
  }
  return [...out];
}

// Words that carry a type in the labeled jobs. `labels` gives each labeled job's types; `explained` gives the
// types something else in that job (the starter words) already accounts for, so only new knowledge is learned.
function learnPhrases(samples: { phrases: string[]; labels: string[]; explained: Set<string> }[], minJobs: number): Phrase[] {
  const stats = new Map<string, { total: number; byType: Map<string, { all: number; unexplained: number }> }>();
  for (const s of samples) {
    for (const p of s.phrases) {
      const st = stats.get(p) ?? { total: 0, byType: new Map() };
      st.total++;
      for (const t of s.labels) {
        const c = st.byType.get(t) ?? { all: 0, unexplained: 0 };
        c.all++;
        if (!s.explained.has(t)) c.unexplained++;
        st.byType.set(t, c);
      }
      stats.set(p, st);
    }
  }
  const phrases: Phrase[] = [];
  for (const [p, st] of stats) {
    const types = [...st.byType].filter(([, c]) => c.all / st.total >= MIN_PRECISION && c.unexplained >= minJobs);
    if (types.length) phrases.push({ words: p.split(" "), types: types.map(([t]) => t), learned: { jobs: Math.max(...types.map(([, c]) => c.all)) } });
  }
  return phrases;
}

// --- The model -------------------------------------------------------------------------------------------

/** Everything worked out once from all jobs, then used to resolve any job (saved or still being typed). */
export type FactModel = {
  types: Record<FactKind, FactType[]>;
  synonyms: SynonymRule[];
  cache: Map<string, Analysis>;
  jobPhrases: Map<string, Phrase[]>;
  companyTitlePhrases: Map<string, Phrase[]>;
  companyLearnedPhrases: Map<string, Phrase[]>;
  companyJdPhrases: Map<string, Phrase[]>;
  familyByExact: Map<string, { key: string; label: string }>;
  labeledByFamily: Map<string, { id: number; values: string[] }[]>;
  labeledByCompany: Map<string, { id: number; value: string; company: string }[]>;
};

/** Everything the facts need, built once per page from the jobs, their titles and the type lists. */
export type FactContext = { titles: Map<number, TitleInfo>; model: FactModel };

const companyKey = (company: string) => factWords(company).join(" ");

// Hand-set values, kept to names still in the list (matched ignoring case) and never "Other".
function canonical(types: FactType[]) {
  const byLower = new Map(types.map((t) => [t.name.toLowerCase(), t.name]));
  return (v: string) => {
    const name = byLower.get(v.trim().toLowerCase());
    return name && name.toLowerCase() !== "other" ? name : null;
  };
}

export function buildFactModel(jobs: Job[], titles: Map<number, TitleInfo>, types: FactType[], synonymSets: string[][] = []): FactModel {
  const synonyms = compileSynonyms(synonymSets);
  const byKind = { job: types.filter((t) => t.kind === "job"), company: types.filter((t) => t.kind === "company") };
  const jobName = canonical(byKind.job);
  const companyName = canonical(byKind.company);
  const cache = new Map<string, Analysis>();
  const analysisOf = (j: Job) => cachedAnalysis(cache, j, synonyms);

  const jobStarter = starterPhrases(JOB_TYPE_WORDS, byKind.job);
  const companyStarter = starterPhrases(COMPANY_TITLE_WORDS, byKind.company);
  const jobStarterIndex = phraseIndex(jobStarter);
  const companyStarterIndex = phraseIndex(companyStarter);

  const familyByExact = new Map<string, { key: string; label: string }>();
  const labeledByFamily = new Map<string, { id: number; values: string[] }[]>();
  const labeledByCompany = new Map<string, { id: number; value: string; company: string }[]>();
  const jobSamples: Parameters<typeof learnPhrases>[0] = [];
  const companySamples: Parameters<typeof learnPhrases>[0] = [];

  for (const j of jobs) {
    const a = analysisOf(j);
    const info = titles.get(j.id);
    if (info && info.familyKey !== "other" && !familyByExact.has(a.exactKey)) familyByExact.set(a.exactKey, { key: info.familyKey, label: info.family });

    const jobLabels = (j.job_types ?? []).map(jobName).filter((v): v is string => !!v);
    if (jobLabels.length) {
      if (info && info.familyKey !== "other") labeledByFamily.set(info.familyKey, [...(labeledByFamily.get(info.familyKey) ?? []), { id: j.id, values: jobLabels }]);
      const explained = new Set(findPhrases(a.words, jobStarterIndex).flatMap((h) => h.phrase.types));
      jobSamples.push({ phrases: learnablePhrases(a), labels: jobLabels, explained });
    }

    const companyLabel = companyName(j.company_type ?? "");
    if (companyLabel) {
      const key = companyKey(j.company);
      if (!NOT_A_COMPANY.has(key)) labeledByCompany.set(key, [...(labeledByCompany.get(key) ?? []), { id: j.id, value: companyLabel, company: j.company.trim() }]);
      const explained = new Set(findPhrases(a.allWords, companyStarterIndex).flatMap((h) => h.phrase.types));
      companySamples.push({ phrases: learnablePhrases(a), labels: [companyLabel], explained });
    }
  }

  return {
    types: byKind,
    synonyms,
    cache,
    jobPhrases: phraseIndex([...jobStarter, ...learnPhrases(jobSamples, MIN_LEARNED_JOBS)]),
    companyTitlePhrases: companyStarterIndex,
    // A word that usually goes with a company type is weaker evidence than one that names it, so it takes
    // one more job and only ever makes the type Likely.
    companyLearnedPhrases: phraseIndex(learnPhrases(companySamples, MIN_LEARNED_JOBS + 1)),
    companyJdPhrases: phraseIndex(starterPhrases(COMPANY_JD_WORDS, byKind.company)),
    familyByExact,
    labeledByFamily,
    labeledByCompany,
  };
}

function cachedAnalysis(cache: Map<string, Analysis>, job: Pick<Job, "title" | "normalized_title" | "company">, synonyms: SynonymRule[]) {
  const key = `${job.title}\u0000${job.normalized_title ?? ""}\u0000${job.company}`;
  let a = cache.get(key);
  if (!a) cache.set(key, (a = analyze(job, synonyms)));
  return a;
}

// --- Resolving -------------------------------------------------------------------------------------------

/** The fields the facts read. A job still being typed (Add Job, an unsaved edit) works too. */
export type FactJob = Pick<Job, "id" | "title" | "normalized_title" | "company" | "company_type" | "job_types"> & { job_description?: string };

const quote = (words: string[]) => words.map((w) => `“${w}”`).join(", ");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The most common answer among labeled jobs, when at least MIN_PRECISION of them agree.
function consensus<T>(items: T[], key: (t: T) => string): { item: T; agree: number } | null {
  if (!items.length) return null;
  const counts = new Map<string, { item: T; n: number }>();
  for (const it of items) {
    const k = key(it);
    counts.set(k, { item: counts.get(k)?.item ?? it, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return top.n / items.length >= MIN_PRECISION ? { item: top.item, agree: top.n } : null;
}

export function resolveJobTypes(job: FactJob, { model }: FactContext): ResolvedJobTypes {
  const manual = (job.job_types ?? []).map((t) => t.trim()).filter(Boolean);
  if (manual.length) return { values: manual, source: "manual", reason: "Set on this job" };
  if (!job.title.trim()) return { values: [], source: "none", reason: "Add a title to work it out" };
  const a = cachedAnalysis(model.cache, job, model.synonyms);

  const family = model.familyByExact.get(a.exactKey);
  const labeled = family ? (model.labeledByFamily.get(family.key) ?? []).filter((l) => l.id !== job.id) : [];
  const agreed = consensus(labeled, (l) => l.values.join("\u0000"));
  if (family && agreed) {
    const others = labeled.length === 1 ? "other" : `${labeled.length} other`;
    return { values: agreed.item.values, source: "family", reason: `Like your ${others} ${family.label} ${labeled.length === 1 ? "job" : "jobs"}` };
  }

  // Each type keeps its match closest to the anchor; ties go to the word before it ("Growth Product Manager"
  // is Product first, "Director of eCommerce & Marketing" is eCommerce first).
  const hits = findPhrases(a.words, model.jobPhrases);
  const best = new Map<string, { distance: number; hit: Hit }>();
  for (const h of hits) {
    const distance = a.anchor < 0 ? h.start : h.start < a.anchor ? (a.anchor - (h.start + h.phrase.words.length - 1)) * 2 - 1 : (h.start - a.anchor) * 2;
    for (const t of h.phrase.types) if (!best.has(t) || distance < best.get(t)!.distance) best.set(t, { distance, hit: h });
  }
  const ranked = [...best].sort((x, y) => x[1].distance - y[1].distance).slice(0, MAX_JOB_TYPES);
  if (!ranked.length) return { values: [], source: "none", reason: "Nothing in the title says" };

  const used = [...new Set(ranked.map(([, b]) => b.hit))];
  const learned = used.filter((h) => h.phrase.learned);
  const reason = learned.length
    ? `From ${quote(learned.map((h) => h.text))} in the title, learned from ${plural(Math.max(...learned.map((h) => h.phrase.learned!.jobs)), "labeled job")}`
    : `From ${quote(used.map((h) => h.text))} in the title`;
  return { values: ranked.map(([t]) => t), source: learned.length ? "learned" : "starter", reason };
}

export function resolveCompanyType(job: FactJob, { model }: FactContext): ResolvedCompanyType {
  const manual = job.company_type?.trim() ?? "";
  if (manual) return { value: manual, source: "manual", reason: "Set on this job" };

  const key = companyKey(job.company ?? "");
  const siblings = NOT_A_COMPANY.has(key) ? [] : (model.labeledByCompany.get(key) ?? []).filter((l) => l.id !== job.id);
  const agreed = consensus(siblings, (l) => l.value);
  if (agreed) {
    return { value: agreed.item.value, source: "company", reason: `From your ${siblings.length === 1 ? "other" : `${siblings.length} other`} ${agreed.item.company} ${siblings.length === 1 ? "job" : "jobs"}` };
  }

  const a = job.title.trim() ? cachedAnalysis(model.cache, job, model.synonyms) : null;
  if (a) {
    const top = topType(findPhrases(a.allWords, model.companyTitlePhrases));
    if (top) return { value: top.type, source: "starter", reason: `${quote(top.words)} in the title` };
  }
  return { value: "", source: "none", reason: "Nothing says yet", likely: likelyCompanyType(job, a, model) };
}

// The type with the most hits (first in the text on a tie), and the words that hit it.
function topType(hits: Hit[]): { type: string; n: number; second: number; words: string[] } | null {
  const counts = new Map<string, { n: number; words: Map<string, number> }>();
  for (const h of hits) {
    for (const t of h.phrase.types) {
      const c = counts.get(t) ?? { n: 0, words: new Map() };
      c.n++;
      c.words.set(h.text, (c.words.get(h.text) ?? 0) + 1);
      counts.set(t, c);
    }
  }
  const ranked = [...counts].sort((x, y) => y[1].n - x[1].n);
  if (!ranked.length) return null;
  const [type, c] = ranked[0];
  return { type, n: c.n, second: ranked[1]?.[1].n ?? 0, words: [...c.words].sort((x, y) => y[1] - x[1]).map(([w]) => w) };
}

function likelyCompanyType(job: FactJob, a: Analysis | null, model: FactModel): Likely | undefined {
  const jd = job.job_description?.trim();
  if (jd) {
    const top = topType(findPhrases(factWords(jd), model.companyJdPhrases));
    if (top && top.n >= MIN_JD_HITS && top.n >= top.second * 2) {
      return { value: top.type, reason: `The job description mentions ${quote(top.words.slice(0, 3))} (${top.n}×)` };
    }
  }
  if (a) {
    const hit = findPhrases(a.words, model.companyLearnedPhrases).find((h) => h.phrase.types.length === 1);
    if (hit) return { value: hit.phrase.types[0], reason: `Titles with “${hit.text}” are usually ${hit.phrase.types[0]} (${plural(hit.phrase.learned!.jobs, "job")})` };
  }
  return undefined;
}

/** What the job would get with nothing set by hand, for the job form's hints. */
export function factHints(job: FactJob, ctx: FactContext) {
  const types = resolveJobTypes({ ...job, job_types: [] }, ctx);
  const company = resolveCompanyType({ ...job, company_type: "" }, ctx);
  return {
    jobTypes: { values: types.values, reason: types.reason },
    companyType: { values: company.value ? [company.value] : [], reason: company.reason, likely: company.likely },
  };
}

/** The type names of one kind, in the user's order. */
export const typeNames = (ctx: FactContext, kind: FactKind) => ctx.model.types[kind].map((t) => t.name);
