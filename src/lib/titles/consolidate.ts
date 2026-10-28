// Groups job titles into families: same rung word + the same work. Function phrases are matched
// with fuzzball's token_sort_ratio, which ignores word order ("eCommerce Director" = "Director of
// eCommerce") and tolerates small spelling differences ("Manger", plurals).

import { token_sort_ratio } from "fuzzball/ultra_lite";
import { compileSynonyms, tokenizeTitle, type Token } from "./normalize.ts";
import { isRoleWord, parseTitle } from "./seniority.ts";
import type { TitleGroupRef, TitleInfo, TitleInput } from "./types.ts";

// Function phrases scoring at or above this are treated as the same work. Kept high on purpose:
// at 90, "commerce" matched "ecommerce" and "cro web experience" matched "dtc web experience".
export const MATCH_THRESHOLD = 95;

const wordCount = (s: string) => s.split(" ").length;
// Same number of words, so an added qualifier ("dtc ecommerce operations") stays its own family.
const samePhrase = (a: string, b: string) => wordCount(a) === wordCount(b) && token_sort_ratio(a, b) >= MATCH_THRESHOLD;

// Most common value; ties go to the shorter string, then alphabetical.
function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

// Union-find over distinct phrases. Each phrase maps to its cluster's most frequent phrase.
function clusterPhrases(phrases: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const p of phrases) counts.set(p, (counts.get(p) ?? 0) + 1);
  const distinct = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));

  const parent = distinct.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      if (!samePhrase(distinct[i], distinct[j])) continue;
      const [a, b] = [find(i), find(j)];
      parent[Math.max(a, b)] = Math.min(a, b); // lower index = more frequent, so it stays the root
    }
  }
  return new Map(distinct.map((p, i) => [p, distinct[find(i)]]));
}

// Seniority-neutral name for a family, so "Senior Product Manager" doesn't label every PM.
// Rungs without a clear pattern (chief, president) fall back to the most common title.
const LABELS: Record<string, (fn: string) => string> = {
  director: (fn) => `Director of ${fn}`,
  head: (fn) => `Head of ${fn}`,
  vp: (fn) => `VP of ${fn}`,
  manager: (fn) => `${fn} Manager`,
  supervisor: (fn) => `${fn} Supervisor`,
  lead: (fn) => `${fn} Lead`,
  ic: (fn) => roleLast(fn),
};
const familyLabel = (level: string, fn: string) => (fn && LABELS[level] ? LABELS[level](fn) : null);

// Moves the role and the word before it to the end: "Product Manager Growth" → "Growth Product Manager".
function roleLast(fn: string): string {
  const words = fn.split(" ");
  let i = words.length - 1;
  while (i >= 0 && !isRoleWord(words[i].toLowerCase())) i--;
  if (i < 0) return fn;
  const start = Math.max(0, i - 1);
  return [...words.slice(0, start), ...words.slice(i + 1), ...words.slice(start, i + 1)].join(" ");
}

const levelOf = (key: string) => key.slice(0, key.indexOf(":"));
const wordsOf = (key: string) => new Set(key.slice(key.indexOf(":") + 1).split(" ").filter(Boolean));
const isSubset = (small: Set<string>, big: Set<string>) => small.size < big.size && [...small].every((w) => big.has(w));

// True when `words` appear next to each other, in any order, somewhere in `tokens`.
function hasRun(tokens: Token[], words: string[]): boolean {
  const want = new Set(words);
  for (let i = 0; i + words.length <= tokens.length; i++) {
    const run = new Set(tokens.slice(i, i + words.length).map((t) => t.norm));
    if (run.size === want.size && [...want].every((w) => run.has(w))) return true;
  }
  return false;
}

export type ConsolidateOptions = { synonyms?: string[][] };

export function consolidateTitles(jobs: TitleInput[], { synonyms = [] }: ConsolidateOptions = {}): Map<number, TitleInfo> {
  const rules = compileSynonyms(synonyms);
  const parsed = jobs.map((job) => {
    const p = parseTitle(tokenizeTitle(job.normalized_title?.trim() || job.title, job.company, rules));
    const functionKey = [...new Set(p.functionTokens.map((t) => t.norm))].sort().join(" ");
    return { job, ...p, functionKey, functionRaw: p.functionTokens.map((t) => t.raw).join(" ") };
  });
  const clusters = clusterPhrases(parsed.map((p) => p.functionKey).filter(Boolean));

  const families = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const key = p.levelKey === "other" ? "other" : `${p.levelKey}:${clusters.get(p.functionKey) ?? ""}`;
    families.set(key, [...(families.get(key) ?? []), p]);
  }
  const realKeys = [...families.keys()].filter((k) => k !== "other" && wordsOf(k).size > 0);

  // Shared groups no job is titled as exactly: "Director, Digital Experience Experimentation" and
  // "Director, Digital Neighbor Experience" both get "Director of Digital Experience". Built from the
  // words two families on the same rung have in common. A single shared word only counts when it is a
  // whole function somewhere else ("Head of CRO"), so generic words like "digital" don't group on their own.
  const standalone = new Set(realKeys.map(wordsOf).filter((w) => w.size === 1).map((w) => [...w][0]));
  const sharedKeys = new Set<string>();
  for (let i = 0; i < realKeys.length; i++) {
    for (let j = i + 1; j < realKeys.length; j++) {
      const [a, b] = [realKeys[i], realKeys[j]];
      if (levelOf(a) !== levelOf(b)) continue;
      const bWords = wordsOf(b);
      const common = [...wordsOf(a)].filter((w) => bWords.has(w)).sort();
      if (!common.length || (common.length === 1 && !standalone.has(common[0]))) continue;
      // An IC group needs its role ("Product Manager"), not just the topic ("Product").
      if (levelOf(a) === "ic" && !common.some(isRoleWord)) continue;
      // The words must sit together in at least one title, so "Digital Commerce and Customer
      // Experience" and "Digital Transformation & Customer Growth" don't make "Digital Customer".
      if (common.length > 1 && ![a, b].some((k) => families.get(k)!.some((m) => hasRun(m.functionTokens, common)))) continue;
      const key = `${levelOf(a)}:${common.join(" ")}`;
      if (!families.has(key)) sharedKeys.add(key);
    }
  }

  // Display text for a set of words: the most common original wording among titles that contain them.
  const tokensByFamily = new Map<string, Token[][]>();
  for (const [key, members] of families) tokensByFamily.set(key, members.map((m) => m.functionTokens));
  const functionText = (wanted: Set<string>, keys: string[]) =>
    mode(keys.flatMap((k) => tokensByFamily.get(k) ?? []).map((tokens) => {
      const seen = new Set<string>();
      return tokens.filter((t) => wanted.has(t.norm) && !seen.has(t.norm) && seen.add(t.norm)).map((t) => t.raw).join(" ");
    }).filter((s) => s.split(" ").length === wanted.size));

  const labels = new Map<string, string>();
  for (const key of sharedKeys) {
    const words = wordsOf(key);
    const fn = functionText(words, realKeys.filter((k) => levelOf(k) === levelOf(key) && isSubset(words, wordsOf(k)))) || [...words].join(" ");
    labels.set(key, familyLabel(levelOf(key), fn) ?? fn);
  }

  // A family rolls up to every other family (real or shared) on the same rung whose words are a strict subset of its own.
  const allKeys = [...realKeys, ...sharedKeys];
  const rollUps = (key: string): TitleGroupRef[] => {
    const words = wordsOf(key);
    return allKeys
      .filter((k) => k !== key && levelOf(k) === levelOf(key) && isSubset(wordsOf(k), words))
      .map((k) => ({ key: k, label: labels.get(k)! }));
  };

  const result = new Map<number, TitleInfo>();
  for (const [familyKey, members] of families) {
    const isOther = familyKey === "other";
    const fn = isOther ? "" : mode(members.map((m) => m.functionRaw));
    const family = isOther ? "Other" : familyLabel(levelOf(familyKey), fn) ?? mode(members.map((m) => m.job.title.trim()));
    labels.set(familyKey, family);
  }
  for (const [familyKey, members] of families) {
    const isOther = familyKey === "other";
    const rollsUpTo = isOther ? [] : rollUps(familyKey);
    const fn = isOther ? "" : mode(members.map((m) => m.functionRaw));
    for (const m of members) {
      result.set(m.job.id, { family: labels.get(familyKey)!, familyKey, function: fn, seniority: m.seniority, rollsUpTo, source: "rules" });
    }
  }
  return result;
}
