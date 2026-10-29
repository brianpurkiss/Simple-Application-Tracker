// Field-agnostic title cleanup. Only spelling and abbreviation variants live here, never
// field-specific synonyms, so it works the same for any job hunter.

export type Token = { raw: string; norm: string };

const ABBREVIATIONS: Record<string, string> = {
  sr: "senior", snr: "senior", jr: "junior", mgr: "manager", mngr: "manager", dir: "director",
  assoc: "associate", asst: "assistant", exec: "executive", vicepresident: "vp",
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Removes the job's own company name ("Sales Lead, Acme", "Nurse Manager for Northwind Health").
// "Contoso / Fabrikam" is also tried part by part.
function stripCompany(title: string, company: string): string {
  const names = [company, ...company.split(/[/|,]/)].map((n) => n.trim()).filter((n) => n.length >= 3);
  let s = title;
  for (const name of names.sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:for|at)\\s+)?${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu"), " ");
  }
  return s;
}

// A user-defined synonym: any of `patterns` (as normalized word sequences) becomes `replacement`.
export type SynonymRule = { patterns: string[][]; replacement: Token[] };

// The first term in each set is the one kept, so it also sets how the term is displayed.
export function compileSynonyms(sets: string[][]): SynonymRule[] {
  return sets
    .map((terms) => terms.map((t) => words(t.replace(/[&+]/g, " and "))).filter((w) => w.length))
    .filter((t) => t.length >= 2)
    .map((t) => ({ patterns: t.map((w) => w.map((x) => x.norm)), replacement: t[0] }));
}

// Swaps every synonym for its set's first term, longest phrases first ("direct to consumer" before "direct").
function applySynonyms(tokens: Token[], rules: SynonymRule[]): Token[] {
  if (!rules.length) return tokens;
  const candidates = rules
    .flatMap((r) => r.patterns.map((pattern) => ({ pattern, replacement: r.replacement })))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; ) {
    const hit = candidates.find(({ pattern }) => pattern.every((w, k) => tokens[i + k]?.norm === w));
    if (hit) {
      out.push(...hit.replacement);
      i += hit.pattern.length;
    } else out.push(tokens[i++]);
  }
  return out;
}

// Splits text into words. Hyphens inside a word survive in raw (for display) and are dropped in
// norm: e-commerce → ecommerce.
function words(text: string): Token[] {
  const raws = text.split(/[^\p{L}\p{N}-]+/u).map((r) => r.replace(/^-+|-+$/g, "")).filter(Boolean);
  const tokens: Token[] = [];
  for (let i = 0; i < raws.length; i++) {
    const lower = raws[i].toLowerCase().replace(/-/g, "");
    if (lower === "vice" && raws[i + 1]?.toLowerCase() === "president") {
      tokens.push({ raw: "VP", norm: "vp" });
      i++;
      continue;
    }
    tokens.push({ raw: raws[i], norm: ABBREVIATIONS[lower] ?? lower });
  }
  return tokens;
}

export function tokenizeTitle(title: string, company = "", synonyms: SynonymRule[] = []): Token[] {
  let s = title.normalize("NFKC").replace(/[‐-―]/g, "-");
  s = s.split("|")[0]; // "Title | Company or location"
  s = stripCompany(s, company)
    .replace(/\([^)]*\)/g, " ") // parentheticals are specialties, not the role
    .replace(/[&+]/g, " and ");
  return applySynonyms(words(s), synonyms);
}
