import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChartNoAxesCombined, ChevronRight, Star } from "lucide-react";
import { newestFirst, RateCell, SALARY_COLUMNS, type SalaryCells, SalaryCellsView, SegmentJobList, salaryCells } from "@/components/segments/shared";
import { SegmentCombos } from "@/components/segments/SegmentCombos";
import { FactTypes, LabelPicker } from "@/components/FactTypes";
import { TitleSynonyms } from "@/components/TitleSynonyms";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type Job, type StarKind, type StarredGroup, useJobs, useResumes, useStarredGroups, useToggleStar } from "@/lib/api";
import { type FactContext, type FactKind, type FactSource, resolveCompanyType, resolveJobTypes } from "@/lib/jobFacts";
import { useFactContext } from "@/hooks/useFactContext";
import { useParamUpdater } from "@/hooks/useParamUpdater";
import { splitResumes } from "@/lib/options";
import { interviewed, interviewRateOf, pct } from "@/lib/stats";
import { titleGroups, type TitleGroup, type TitleVariant } from "@/lib/titles/groups";
import { isStarred, starSet } from "@/lib/titles/starred";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/demo";

type SortKey = "label" | "jobs" | "applications" | "rejections" | "totalInterviews" | "uniqueInterviews" | "rate" | "salaryLow" | "salaryMid" | "salaryHigh";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; title?: string }[] = [
  { key: "label", label: "Title" },
  { key: "jobs", label: "Jobs", numeric: true },
  { key: "applications", label: "Applications", numeric: true },
  { key: "rejections", label: "Rejections", numeric: true },
  { key: "totalInterviews", label: "Total Interviews", numeric: true },
  { key: "uniqueInterviews", label: "Unique Interviews", numeric: true },
  { key: "rate", label: "Interview Rate", numeric: true },
  ...SALARY_COLUMNS,
];

// The tabs: Job Titles groups by title or seniority; Job Type and Company Type review the automatic values; Combos crosses them.
type Tab = "title" | "seniority" | "jobType" | "companyType" | "resume" | "combos";
type GroupBy = "title" | "seniority" | "type" | "company" | "resume";

const TABS: { key: Tab; label: string; dim: string }[] = [
  { key: "title", label: "Job Titles", dim: "title" },
  { key: "seniority", label: "Seniority", dim: "seniority" },
  { key: "jobType", label: "Job Type", dim: "type" },
  { key: "companyType", label: "Company Type", dim: "company" },
  { key: "resume", label: "Resumes", dim: "resume" },
  { key: "combos", label: "Combos", dim: "" },
];

const LABEL_HEADERS: Record<GroupBy, string> = { title: "Job Title", seniority: "Seniority", type: "Job Type", company: "Company Type", resume: "Resume" };

const SOURCE_LABEL: Record<FactSource, string> = {
  manual: "Hand-set", family: "Title family", company: "Same company", learned: "Learned", starter: "Title words", none: "Unknown",
};

// Jobs with no Job Type or Company Type, worked out or hand-set. Pinned first so they're labeled first.
const UNKNOWN = "Unknown";

// Groups jobs by one attribute; each distinct title becomes a variant so rows still expand to their jobs.
// A job with several Job Types is in each of their groups.
function attributeGroups(jobs: Job[], ctx: FactContext, by: "seniority" | "type" | "company" | "resume"): TitleGroup[] {
  const labelsOf = (j: Job): string[] =>
    by === "seniority" ? [ctx.titles.get(j.id)?.seniority.label || "Unspecified"]
      : by === "type" ? resolveJobTypes(j, ctx).values
      : by === "resume" ? [j.resume_version.trim() || "No resume"]
      : [resolveCompanyType(j, ctx).value].filter(Boolean);
  const groups = new Map<string, Job[]>();
  for (const j of jobs) {
    const labels = labelsOf(j);
    for (const label of labels.length ? labels : [UNKNOWN]) groups.set(label, [...(groups.get(label) ?? []), j]);
  }
  return [...groups].map(([label, list]) => {
    const byTitle = new Map<string, TitleVariant>();
    for (const j of list) {
      const title = j.title.trim();
      const v = byTitle.get(title) ?? { title, jobs: [], rolledUp: false };
      v.jobs.push(j);
      byTitle.set(title, v);
    }
    const variants = [...byTitle.values()].sort((a, b) => b.jobs.length - a.jobs.length || a.title.localeCompare(b.title));
    return { key: `${by}:${label}`, label, jobs: list, variants, shared: false, unpaired: false };
  });
}

// `missing` marks a starred group that no longer has any jobs.
type Row = Omit<TitleGroup, "jobs"> & SalaryCells & {
  jobs: number; applications: number; rejections: number; totalInterviews: number; uniqueInterviews: number; rate: number | null; missing?: boolean;
};

// A starred group with no jobs keeps its row, named from the label saved with the star.
function emptyRow(s: StarredGroup): Row {
  const label = s.label || s.key.replace(/^(seniority|type):/, "");
  return { key: s.key, label, jobs: 0, variants: [], shared: false, unpaired: false, applications: 0, rejections: 0, totalInterviews: 0, uniqueInterviews: 0, rate: null, ...salaryCells([]), missing: true };
}

export default function Segments() {
  const { data: allJobs = [], isLoading } = useJobs();
  // Saved postings help work out titles and types either way; they only count in the tables when included.
  const factCtx = useFactContext(allJobs);
  const [sort, setSort] = useState<SortKey>("jobs");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showTail, setShowTail] = useState(false);
  const [params] = useSearchParams();
  const updateParams = useParamUpdater();
  const tabParam = params.get("tab");
  const tab: Tab = TABS.find((t) => t.key === tabParam)?.key ?? "title";
  const setTab = (next: Tab) => updateParams((p) => (next === "title" ? p.delete("tab") : p.set("tab", next)));
  const includeSaved = params.get("saved") === "1";
  const jobs = useMemo(() => (includeSaved ? allJobs : allJobs.filter((j) => !j.saved)), [allJobs, includeSaved]);
  const savedCount = allJobs.filter((j) => j.saved).length;
  const averageRate = useMemo(() => interviewRateOf(jobs), [jobs]);
  const groupBy: GroupBy = tab === "jobType" ? "type" : tab === "companyType" ? "company" : tab === "resume" ? "resume" : tab === "combos" ? "title" : tab;
  const factKind: FactKind | null = tab === "jobType" ? "job" : tab === "companyType" ? "company" : null;
  // Company Type and Resumes aren't starred groups, so their rows have no star.
  const starKind: StarKind | null = groupBy === "company" || groupBy === "resume" ? null : groupBy;
  const { data: resumes = [] } = useResumes();
  const { data: stars = [] } = useStarredGroups();
  const starred = useMemo(() => starSet(stars), [stars]);
  const toggleStar = useToggleStar();

  const jobRows: Row[] = useMemo(
    () =>
      (groupBy === "title" ? titleGroups(jobs, factCtx.titles) : attributeGroups(jobs, factCtx, groupBy)).map((g) => {
        // Included saved postings count as jobs and toward pay, but not as applications.
        const applied = g.jobs.filter((j) => j.applied_date && !j.saved);
        const interviews = applied.filter(interviewed);
        return {
          ...g,
          jobs: g.jobs.length,
          applications: applied.length,
          rejections: applied.filter((j) => j.status === "Rejected").length,
          // Every screen and interview logged, versus how many different companies gave us one.
          totalInterviews: interviews.reduce((n, j) => n + j.interview_count + j.screen_count, 0),
          uniqueInterviews: new Set(interviews.map((j) => j.company.trim().toLowerCase())).size,
          rate: pct(interviews.length, applied.length),
          ...salaryCells(g.jobs),
        };
      }),
    [jobs, factCtx, groupBy],
  );
  const rows = useMemo(() => {
    const have = new Set(jobRows.map((r) => r.key));
    return [...jobRows, ...stars.filter((s) => s.kind === starKind && !have.has(s.key)).map(emptyRow)];
  }, [jobRows, stars, starKind]);

  const isStar = (r: Row) => !!starKind && isStarred(starred, starKind, r.key);
  const isUnknown = (r: Row) => factKind !== null && r.label === UNKNOWN;
  // Unknown leads on the review tabs, then starred groups, then the chosen sort applies within each part.
  const sorted = [...rows].sort((a, b) =>
    Number(isUnknown(b)) - Number(isUnknown(a)) ||
    Number(isStar(b)) - Number(isStar(a)) ||
    (sort === "label"
      ? a.label.localeCompare(b.label)
      : (b[sort] ?? -1) - (a[sort] ?? -1) || b.jobs - a.jobs || a.label.localeCompare(b.label)),
  );
  // Groups smaller than the average paired group, and titles with no pairing at all, are the long tail.
  const tailKeys = useMemo(() => {
    if (groupBy !== "title") return new Set<string>();
    const paired = rows.filter((r) => !r.unpaired && !r.missing);
    const mean = paired.reduce((n, r) => n + r.jobs, 0) / (paired.length || 1);
    return new Set(rows.filter((r) => (r.unpaired || r.jobs < mean) && !isStarred(starred, "title", r.key)).map((r) => r.key));
  }, [rows, groupBy, starred]);
  const visible = showTail ? sorted : sorted.filter((r) => !tailKeys.has(r.key));

  // Rows are named by resume version; anything not matching an active resume (inactive, superseded, or none) is inactive.
  const activeResumes = new Set(splitResumes(resumes).active.map((r) => r.version));

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  // On the review tabs, each job shows where its value came from, and can be labeled right there.
  const sourceOf = tab === "jobType" ? (j: Job) => resolveJobTypes(j, factCtx) : tab === "companyType" ? (j: Job) => resolveCompanyType(j, factCtx) : undefined;

  const table = (list: Row[], opts: { title?: string; empty?: string; muted?: boolean } = {}) => (
    <TitleTable
      title={opts.title}
      empty={opts.empty}
      muted={opts.muted}
      rows={list}
      labelHeader={LABEL_HEADERS[groupBy]}
      sort={sort}
      onSort={setSort}
      open={open}
      onToggle={toggle}
      isStar={isStar}
      onStar={starKind ? (key, label, on) => toggleStar.mutate({ kind: starKind, key, label, starred: on }, { onError: (e) => toastError(e) }) : undefined}
      sourceOf={sourceOf}
      factKind={factKind}
      factCtx={factCtx}
      averageRate={averageRate}
    />
  );

  return (
    <div className="space-y-4">
      <title>Segments | Application Tracker</title>
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Segments</h1>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <Segmented options={TABS} value={tab} onChange={setTab} collapse />
            {tab !== "combos" && <Link to={`/performance?dims=${TABS.find((t) => t.key === tab)!.dim}`} title="View performance" aria-label="View performance" className="rounded p-1.5 text-muted-foreground hover:text-foreground">
              <ChartNoAxesCombined className="size-4" />
            </Link>}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground" title="Postings kept for analysis without applying">
            <input type="checkbox" checked={includeSaved} onChange={(e) => updateParams((p) => (e.target.checked ? p.set("saved", "1") : p.delete("saved")))} />
            Include saved{savedCount > 0 && ` (${savedCount})`}
          </label>
          {tab === "title" && <span className="ml-auto"><TitleSynonyms /></span>}
          {factKind && <FactTypes kind={factKind} jobs={allJobs} factCtx={factCtx} />}
        </div>
      </div>

      {tab === "combos" ? (
        <SegmentCombos jobs={jobs} factCtx={factCtx} stars={stars} resumes={resumes} />
      ) : tab === "resume" ? (
        <>
          {table(visible.filter((r) => activeResumes.has(r.label)), { title: "Active", empty: "No active resumes." })}
          {table(visible.filter((r) => !activeResumes.has(r.label)), { title: "Inactive", empty: "No inactive resumes.", muted: true })}
        </>
      ) : (
        table(visible)
      )}

      {tab !== "combos" && tailKeys.size > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" aria-expanded={showTail} onClick={() => setShowTail((s) => !s)}>
            {showTail ? "Show Less" : `View More (${tailKeys.size})`}
          </Button>
        </div>
      )}

    </div>
  );
}

function TitleTable({ title, empty = "No jobs yet.", muted, rows, labelHeader, sort, onSort, open, onToggle, isStar, onStar, sourceOf, factKind, factCtx, averageRate }: {
  /** Heading shown above the table, for tabs that split into sections. */
  title?: string;
  empty?: string;
  muted?: boolean;
  rows: Row[];
  labelHeader: string;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  open: Set<string>;
  onToggle: (key: string) => void;
  isStar: (row: Row) => boolean;
  /** Undefined on tabs whose groups can't be starred. */
  onStar?: (key: string, label: string, starred: boolean) => void;
  /** Set on the review tabs: where each job's value came from, and why. */
  sourceOf?: (job: Job) => { source: FactSource; reason: string };
  factKind: FactKind | null;
  factCtx: FactContext;
  /** The interview rate across every application shown, for flagging rows above it. */
  averageRate: number | null;
}) {
  const card = (
    <div className="table-bleed overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn(c.numeric && "text-right")}>
                <button
                  type="button"
                  title={c.title}
                  onClick={() => onSort(c.key)}
                  className={cn("hover:text-foreground", sort === c.key && "text-foreground underline underline-offset-4")}
                >
                  {c.key === "label" ? labelHeader : c.label}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const expanded = open.has(r.key);
            const starred = isStar(r);
            return (
              <Fragment key={r.key}>
                <TableRow className={cn(!r.missing && "cursor-pointer", muted && "text-muted-foreground")} onClick={() => !r.missing && onToggle(r.key)} aria-expanded={r.missing ? undefined : expanded}>
                  <TableCell className={cn("font-medium", r.missing && "text-orange-500")} title={r.missing ? "No jobs in this group right now" : undefined}>
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90", r.missing && "invisible")} />
                      {onStar && (
                        <button
                          type="button"
                          title={starred ? "Unstar" : "Star"}
                          aria-label={`${starred ? "Unstar" : "Star"} ${r.label}`}
                          aria-pressed={starred}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStar(r.key, r.label, !starred);
                          }}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <Star className={cn("size-4", starred && "fill-amber-400 text-amber-400")} />
                        </button>
                      )}
                      {r.label}
                      {r.shared && (
                        <span title="Created automatically from words these titles share" className="rounded-full border px-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                          Auto
                        </span>
                      )}
                      <span className="text-xs font-normal text-muted-foreground">
                        {r.variants.length > 1 && `${r.variants.length} unique titles`}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{r.jobs}</TableCell>
                  <TableCell className="text-right">{r.applications}</TableCell>
                  <TableCell className="text-right">{r.rejections}</TableCell>
                  <TableCell className="text-right">{r.totalInterviews}</TableCell>
                  <TableCell className="text-right">{r.uniqueInterviews}</TableCell>
                  <RateCell rate={r.rate} applications={r.applications} average={averageRate} />
                  <SalaryCellsView row={r} />
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={COLUMNS.length} className="py-2 pr-4 pl-11">
                      <SegmentJobList
                        items={r.variants.flatMap((v) => newestFirst(v.jobs).map((job) => ({ job, rolledUp: v.rolledUp })))}
                        extra={(j) => (
                          <>
                            {sourceOf && (() => {
                              const { source, reason } = sourceOf(j);
                              return <span title={reason} className={cn("w-24 text-xs", source === "none" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground")}>{SOURCE_LABEL[source]}</span>;
                            })()}
                            {factKind && <LabelPicker job={j} kind={factKind} factCtx={factCtx} />}
                          </>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-muted-foreground">{empty}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
  return title ? (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {card}
    </section>
  ) : card;
}
