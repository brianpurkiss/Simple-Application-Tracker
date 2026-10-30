// The job boards a new database starts with. Generic on purpose; the Boards page is where they get customized.
export const STARTER_BOARDS = [
  { name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs/" },
  { name: "Indeed", url: "https://www.indeed.com/" },
  { name: "Glassdoor", url: "https://www.glassdoor.com/Job/" },
  { name: "ZipRecruiter", url: "https://www.ziprecruiter.com/" },
  { name: "Wellfound", url: "https://wellfound.com/jobs" },
  { name: "Dice", url: "https://www.dice.com/" },
  { name: "Built In", url: "https://builtin.com/jobs" },
  { name: "We Work Remotely", url: "https://weworkremotely.com/" },
] as const;

// "indeed.com/jobs" becomes "https://indeed.com/jobs". Null when it isn't a web address.
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

// "www.indeed.com" for display under a board's name.
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Same as hostOf, but null when the text isn't a web address (jobs may have a blank or odd link).
const siteOf = (url: string) => (normalizeUrl(url) ? hostOf(normalizeUrl(url)!) : null);

// Second-level names that sit under a country code, so "jobs.example.co.uk" groups as "example.co.uk".
const COUNTRY_SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

// "boards.greenhouse.io" is "greenhouse.io": what a suggestion is grouped and named by.
export function registrableDomain(host: string): string {
  const labels = host.split(".");
  const keep = labels.length > 2 && labels[labels.length - 1].length === 2 && COUNTRY_SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

type Linked = { jd_link: string };
type Named = { id: number; url: string };

// How many jobs link into each board's site (its address or anything under it). A job counts for the first
// board that matches, never two.
export function boardCounts(boards: Named[], jobs: Linked[]): Map<number, number> {
  const counts = new Map(boards.map((b) => [b.id, 0]));
  const hosts = boards.map((b) => ({ id: b.id, host: hostOf(b.url) }));
  for (const job of jobs) {
    const site = siteOf(job.jd_link);
    const board = site && hosts.find((b) => site === b.host || site.endsWith(`.${b.host}`));
    if (board) counts.set(board.id, counts.get(board.id)! + 1);
  }
  return counts;
}

export const SUGGEST_MIN = 3;

export type BoardSuggestion = { domain: string; name: string; count: number };

// Sites that at least `min` jobs link to but no board covers yet, most-used first.
export function suggestBoards(boards: Named[], jobs: Linked[], dismissed: readonly string[], min = SUGGEST_MIN): BoardSuggestion[] {
  const hosts = boards.map((b) => hostOf(b.url));
  const skip = new Set(dismissed);
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const site = siteOf(job.jd_link);
    if (!site || hosts.some((h) => site === h || site.endsWith(`.${h}`))) continue;
    const domain = registrableDomain(site);
    if (!skip.has(domain)) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([domain, count]) => ({ domain, count, name: domain.split(".")[0].replace(/^./, (c) => c.toUpperCase()) }));
}
