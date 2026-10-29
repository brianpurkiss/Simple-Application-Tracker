// Splits a tokenized title into its seniority and its function phrase (what's left once the
// level words are removed). One ladder covers both tracks so any two jobs can be compared:
//
//   IC:          Entry 1 · Mid 2 · Senior 3 · Staff / Lead 4 · Principal 5 · Distinguished 6
//   Management:  Supervisor 2 · Manager 3 · Senior Manager 4 · Director 5 (Head is the same rank, labeled separately) · Senior Director 6
//   Executive:   VP 7 · SVP / President 8 · C-level 9

import type { Token } from "./normalize.ts";
import type { Seniority } from "./types.ts";

// People-management rungs. The highest one present wins ("Head/Director").
const MANAGEMENT: Record<string, { rank: number; key: string }> = {
  supervisor: { rank: 2, key: "supervisor" },
  manager: { rank: 3, key: "manager" },
  director: { rank: 5, key: "director" },
  head: { rank: 5, key: "head" },
  avp: { rank: 6, key: "vp" },
  vp: { rank: 7, key: "vp" },
  svp: { rank: 8, key: "vp" },
  evp: { rank: 8, key: "vp" },
  president: { rank: 8, key: "president" },
};

// "cro" is left out: it means conversion rate optimization as often as chief revenue officer.
const C_SUITE = new Set(["ceo", "cto", "cfo", "coo", "cmo", "cio", "cpo", "cdo", "chro", "cso", "cco"]);

// Moves a management rung: Senior Director 6, Associate Director 4, Executive VP 8.
const MANAGEMENT_SHIFTS: Record<string, number> = { senior: 1, executive: 1, associate: -1, assistant: -1 };

// "Manager" after one of these is an individual-contributor role, not a people manager.
const IC_MANAGER_ROLES = new Set(["product", "program", "project", "account", "case", "property"]);

// Generic occupation nouns. Marks a title as IC when no management word is present.
const IC_ROLES = new Set([
  "engineer", "developer", "designer", "analyst", "scientist", "specialist", "consultant",
  "representative", "executive", "nurse", "teacher", "accountant", "architect", "writer", "marketer",
  "strategist", "administrator", "technician", "coordinator", "owner", "recruiter", "attorney",
  "advisor", "assistant", "researcher", "editor", "producer", "officer",
  "physician", "therapist", "pharmacist", "electrician", "mechanic", "chef", "paralegal",
]);

// Words that name the role itself in an IC title ("Product Manager", "Software Engineer").
export const isRoleWord = (norm: string) => norm === "manager" || IC_ROLES.has(norm);

// IC rank from a modifier. The highest one present wins ("Senior / Principal").
const IC_MODIFIERS: Record<string, number> = {
  intern: 1, junior: 1, entry: 1, associate: 1, apprentice: 1,
  senior: 3, staff: 4, lead: 4, leader: 4, principal: 5, distinguished: 6, fellow: 6,
  i: 2, ii: 2, iii: 3, iv: 4,
};

// Don't change rank, and aren't part of the function.
const IGNORED = new Set(["global", "fractional", "interim", "acting"]);
const STOPWORDS = new Set(["of", "the", "for", "and", "to", "at", "in", "a", "an", "with", "on"]);

const IC_LABELS = ["", "Entry", "Mid", "Senior", "Staff / Lead", "Principal", "Distinguished"];
const MANAGEMENT_LABELS = ["", "", "Supervisor", "Manager", "Senior Manager", "Director", "Senior Director", "VP", "SVP / President", "C-level"];

export type ParsedTitle = {
  /** The rung word that anchors the family: "director", "head", "vp", "chief", "lead", "ic" or "other". */
  levelKey: string;
  seniority: Seniority;
  functionTokens: Token[];
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function parseTitle(tokens: Token[]): ParsedTitle {
  const used = new Set<number>();
  const hasOfficer = tokens.some((t) => t.norm === "officer");
  let mgmt: { rank: number; key: string } | null = null;
  let cSuite = -1;
  let icRole = false;

  tokens.forEach((t, i) => {
    const n = t.norm;
    if (n === "manager" && IC_MANAGER_ROLES.has(tokens[i - 1]?.norm)) icRole = true;
    else if (MANAGEMENT[n]) {
      if (!mgmt || MANAGEMENT[n].rank > mgmt.rank) mgmt = MANAGEMENT[n];
      used.add(i);
    } else if (n === "chief" && hasOfficer) {
      mgmt = { rank: 9, key: "chief" };
      used.add(i);
      tokens.forEach((o, j) => o.norm === "officer" && used.add(j));
    } else if (C_SUITE.has(n) && cSuite < 0) cSuite = i;
    else if (IC_ROLES.has(n)) icRole = true;
  });
  // An acronym only counts as C-level when nothing else names the rung. It stays in the function
  // so CTO and CFO don't collapse into one family.
  if (!mgmt && cSuite >= 0) mgmt = { rank: 9, key: "chief" };

  const words = tokens.map((t) => t.norm);
  let seniority: Seniority;
  let levelKey: string;
  if (mgmt) {
    const m: { rank: number; key: string } = mgmt;
    const shifts = words.map((w) => MANAGEMENT_SHIFTS[w] ?? 0);
    const shift = clamp(shifts.reduce((a, b) => a + b, 0), -1, 1);
    const rank = m.rank === 9 ? 9 : clamp(m.rank + shift, 1, 8);
    // Head shares Director's rank but is its own seniority label.
    const label = rank === 5 && m.key === "head" ? "Head" : MANAGEMENT_LABELS[rank];
    seniority = { rank, label, track: rank >= 7 ? "Executive" : "Management" };
    levelKey = m.key;
  } else {
    const modifierRanks = words.map((w) => IC_MODIFIERS[w] ?? 0);
    const top = Math.max(0, ...modifierRanks);
    if (icRole || top > 0) {
      const rank = top || 2;
      seniority = { rank, label: IC_LABELS[rank], track: "IC" };
      // "Growth Lead" names no role, so keep it apart from "Growth Product Manager".
      levelKey = !icRole && (words.includes("lead") || words.includes("leader")) ? "lead" : "ic";
    } else {
      seniority = { rank: null, label: "Unspecified", track: null };
      levelKey = "other";
    }
  }

  const functionTokens = tokens.filter((t, i) => {
    if (used.has(i) || STOPWORDS.has(t.norm) || IGNORED.has(t.norm)) return false;
    if (IC_MODIFIERS[t.norm] !== undefined) return false;
    // "Executive" and "Assistant" are roles on their own, but modifiers next to a management rung.
    if (mgmt && MANAGEMENT_SHIFTS[t.norm] !== undefined) return false;
    return true;
  });

  return { levelKey, seniority, functionTokens };
}
