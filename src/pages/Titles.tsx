import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Star } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { JobTypeMatches } from "@/components/JobTypeMatches";
import { TitleSynonyms } from "@/components/TitleSynonyms";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useJobs, useStarredGroups, useToggleStar, type Job, type StarredGroup } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { type FactContext, resolveJobType } from "@/lib/jobFacts";
import { useFactContext } from "@/hooks/useFactContext";
import { rowLink } from "@/lib/rowLink";
import { fmtPct, interviewed, MIN_SAMPLE, pct } from "@/lib/stats";
import { titleGroups, type TitleGroup, type TitleVariant } from "@/lib/titles/groups";
import { isStarred, starSet } from "@/lib/titles/starred";
import type { TitleInfo } from "@/lib/titles/types";
import { cn } from "@/lib/utils";

type SortKey = "label" | "jobs" | "applications" | "rejections" | "totalInterviews" | "uniqueInterviews" | "rate";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "label", label: "Title" },
  { key: "jobs", label: "Jobs", numeric: true },
  { key: "applications", label: "Applications", numeric: true },
  { key: "rejections", label: "Rejections", numeric: true },
  { key: "totalInterviews", label: "Total Interviews", numeric: true },
  { key: "uniqueInterviews", label: "Unique Interviews", numeric: true },
  { key: "rate", label: "Interview Rate", numeric: true },
];

type GroupBy = "title" | "seniority" | "type";

const GROUP_BYS: { key: GroupBy; label: string }[] = [
  { key: "title", label: "Job Title" },
  { key: "seniority", label: "Seniority" },
  { key: "type", label: "Type" },
];

// Groups jobs by one attribute; each distinct title becomes a variant so rows still expand to their jobs.
function attributeGroups(jobs: Job[], ctx: FactContext, by: "seniority" | "type"): TitleGroup[] {
  const groups = new Map<string, Job[]>();
  for (const j of jobs) {
    const label = (by === "seniority" ? ctx.titles.get(j.id)?.seniority.label : resolveJobType(j, ctx).value) || "Unspecified";
    groups.set(label, [...(groups.get(label) ?? []), j]);
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
type Row = Omit<TitleGroup, "jobs"> & { jobs: number; applications: number; rejections: number; totalInterviews: number; uniqueInterviews: number; rate: number | null; missing?: boolean };

// A starred group with no jobs keeps its row, named from the label saved with the star.
function emptyRow(s: StarredGroup): Row {
  const label = s.label || s.key.replace(/^(seniority|type):/, "");
  return { key: s.key, label, jobs: 0, variants: [], shared: false, unpaired: false, applications: 0, rejections: 0, totalInterviews: 0, uniqueInterviews: 0, rate: null, missing: true };
}

export default function Titles() {
  const { data: jobs = [], isLoading } = useJobs();
  const factCtx = useFactContext(jobs);
  const [sort, setSort] = useState<SortKey>("jobs");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showTail, setShowTail] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("title");
  const { data: stars = [] } = useStarredGroups();
  const starred = useMemo(() => starSet(stars), [stars]);
  const toggleStar = useToggleStar();

  const jobRows: Row[] = useMemo(
    () =>
      ((): TitleGroup[] => {
        return groupBy === "title" ? titleGroups(jobs, factCtx.titles) : attributeGroups(jobs, factCtx, groupBy);
      })().map((g) => {
        const applied = g.jobs.filter((j) => j.applied_date);
        const interviews = applied.filter(interviewed);
        return {
          ...g,
          jobs: g.jobs.length,
          applications: applied.length,
          rejections: g.jobs.filter((j) => j.status === "Rejected").length,
          // Every screen and interview logged, versus how many different companies gave us one.
          totalInterviews: interviews.reduce((n, j) => n + j.interview_count + j.screen_count, 0),
          uniqueInterviews: new Set(interviews.map((j) => j.company.trim().toLowerCase())).size,
          rate: pct(interviews.length, applied.length),
        };
      }),
    [jobs, factCtx, groupBy],
  );
  const rows = useMemo(() => {
    const have = new Set(jobRows.map((r) => r.key));
    return [...jobRows, ...stars.filter((s) => s.kind === groupBy && !have.has(s.key)).map(emptyRow)];
  }, [jobRows, stars, groupBy]);

  const isStar = (r: Row) => isStarred(starred, groupBy, r.key);
  // Starred groups lead, then the chosen sort applies within each half.
  const sorted = [...rows].sort((a, b) =>
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

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  const table = (list: Row[]) => <TitleTable rows={list} labelHeader={GROUP_BYS.find((g) => g.key === groupBy)!.label} sort={sort} onSort={setSort} open={open} onToggle={toggle} isStar={isStar} onStar={(key, label, on) => toggleStar.mutate({ kind: groupBy, key, label, starred: on }, { onError: (e) => toast.error(e.message) })} />;

  return (
    <div className="space-y-4">
      <title>Job Titles | Application Tracker</title>
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">Job Titles</h1>
          {groupBy === "title" && <TitleSynonyms />}
          {groupBy === "type" && <JobTypeMatches />}
        </div>
        <div className="mt-3">
          <Segmented options={GROUP_BYS} value={groupBy} onChange={setGroupBy} />
        </div>
      </div>

      {table(visible)}

      {tailKeys.size > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" aria-expanded={showTail} onClick={() => setShowTail((s) => !s)}>
            {showTail ? "Show Less" : `View More (${tailKeys.size})`}
          </Button>
        </div>
      )}

    </div>
  );
}

function TitleTable({ rows, labelHeader, sort, onSort, open, onToggle, isStar, onStar }: {
  rows: Row[];
  labelHeader: string;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  open: Set<string>;
  onToggle: (key: string) => void;
  isStar: (row: Row) => boolean;
  onStar: (key: string, label: string, starred: boolean) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn(c.numeric && "text-right")}>
                <button
                  type="button"
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
                <TableRow className={cn(!r.missing && "cursor-pointer")} onClick={() => !r.missing && onToggle(r.key)} aria-expanded={r.missing ? undefined : expanded}>
                  <TableCell className={cn("font-medium", r.missing && "text-orange-500")} title={r.missing ? "No jobs in this group right now" : undefined}>
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90", r.missing && "invisible")} />
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
                  <TableCell className={cn("text-right", r.applications < MIN_SAMPLE && "text-muted-foreground")}>{fmtPct(r.rate)}</TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={COLUMNS.length} className="py-2 pr-4 pl-11">
                      <ul className="text-sm">
                        {r.variants.flatMap((v) =>
                          [...v.jobs]
                            .sort((a, b) => (b.applied_date ?? "").localeCompare(a.applied_date ?? ""))
                            .map((j) => (
                              <li
                                key={j.id}
                                className="-mx-2 flex cursor-pointer items-center gap-3 rounded px-2 py-1 hover:bg-muted/60"
                                {...rowLink(navigate, `/jobs/${j.id}`)}
                              >
                                <span className={cn("min-w-0 flex-1 truncate", v.rolledUp && "text-muted-foreground")}>
                                  {j.title}
                                  {j.normalized_title && <span className="ml-2 text-xs text-muted-foreground">→ {j.normalized_title}</span>}
                                  {v.rolledUp && <span className="ml-2 text-xs text-muted-foreground">rolled up</span>}
                                </span>
                                <span className="w-48 truncate text-muted-foreground">{j.company}</span>
                                <span className="w-24 whitespace-nowrap text-muted-foreground">{formatDate(j.applied_date)}</span>
                                <span className="w-44 text-right"><StatusBadge job={j} /></span>
                              </li>
                            )),
                        )}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-muted-foreground">No jobs yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
