import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { TitleSynonyms } from "@/components/TitleSynonyms";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useJobs, useTitleSynonyms, type Job } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { rowLink } from "@/lib/rowLink";
import { fmtPct, interviewed, MIN_SAMPLE, pct } from "@/lib/stats";
import { consolidateTitles } from "@/lib/titles/consolidate";
import { titleGroups, type TitleGroup, type TitleVariant } from "@/lib/titles/groups";
import type { TitleInfo } from "@/lib/titles/types";
import { cn } from "@/lib/utils";

type SortKey = "label" | "jobs" | "applications" | "rejections" | "interviews" | "rate";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "label", label: "Title" },
  { key: "jobs", label: "Jobs", numeric: true },
  { key: "applications", label: "Applications", numeric: true },
  { key: "rejections", label: "Rejections", numeric: true },
  { key: "interviews", label: "Interviews", numeric: true },
  { key: "rate", label: "Interview Rate", numeric: true },
];

type GroupBy = "title" | "seniority" | "type";

const GROUP_BYS: { key: GroupBy; label: string }[] = [
  { key: "title", label: "Job Title" },
  { key: "seniority", label: "Seniority" },
  { key: "type", label: "Type" },
];

// Groups jobs by one attribute; each distinct title becomes a variant so rows still expand to their jobs.
function attributeGroups(jobs: Job[], titles: Map<number, TitleInfo>, by: "seniority" | "type"): TitleGroup[] {
  const groups = new Map<string, Job[]>();
  for (const j of jobs) {
    const label = (by === "seniority" ? titles.get(j.id)?.seniority.label : j.job_type?.trim()) || "Unspecified";
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

type Row =Omit<TitleGroup, "jobs"> & { jobs: number; applications: number; rejections: number; interviews: number; rate: number | null };

export default function Titles() {
  const { data: jobs = [], isLoading } = useJobs();
  const { data: synonyms = [] } = useTitleSynonyms();
  const [sort, setSort] = useState<SortKey>("jobs");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showTail, setShowTail] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("title");

  const rows: Row[] = useMemo(
    () =>
      ((): TitleGroup[] => {
        const titles = consolidateTitles(jobs, { synonyms: synonyms.map((s) => s.terms) });
        return groupBy === "title" ? titleGroups(jobs, titles) : attributeGroups(jobs, titles, groupBy);
      })().map((g) => {
        const applied = g.jobs.filter((j) => j.applied_date);
        const interviews = applied.filter(interviewed).length;
        return {
          ...g,
          jobs: g.jobs.length,
          applications: applied.length,
          rejections: g.jobs.filter((j) => j.status === "Rejected").length,
          interviews,
          rate: pct(interviews, applied.length),
        };
      }),
    [jobs, synonyms, groupBy],
  );

  const sorted = [...rows].sort((a, b) =>
    sort === "label"
      ? a.label.localeCompare(b.label)
      : (b[sort] ?? -1) - (a[sort] ?? -1) || b.jobs - a.jobs || a.label.localeCompare(b.label),
  );
  // Groups smaller than the average paired group, and titles with no pairing at all, are the long tail.
  const tailKeys = useMemo(() => {
    if (groupBy !== "title") return new Set<string>();
    const paired = rows.filter((r) => !r.unpaired);
    const mean = paired.reduce((n, r) => n + r.jobs, 0) / (paired.length || 1);
    return new Set(rows.filter((r) => r.unpaired || r.jobs < mean).map((r) => r.key));
  }, [rows, groupBy]);
  const visible = showTail ? sorted : sorted.filter((r) => !tailKeys.has(r.key));

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  const table = (list: Row[]) => <TitleTable rows={list} labelHeader={GROUP_BYS.find((g) => g.key === groupBy)!.label} sort={sort} onSort={setSort} open={open} onToggle={toggle} />;

  return (
    <div className="space-y-4">
      <title>Job Titles | Application Tracker</title>
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">Job Titles</h1>
          {groupBy === "title" && <TitleSynonyms />}
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

function TitleTable({ rows, labelHeader, sort, onSort, open, onToggle }: {
  rows: Row[];
  labelHeader: string;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  open: Set<string>;
  onToggle: (key: string) => void;
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
            return (
              <Fragment key={r.key}>
                <TableRow className="cursor-pointer" onClick={() => onToggle(r.key)} aria-expanded={expanded}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                      {r.label}
                      {r.shared && (
                        <span title="Created automatically from words these titles share" className="rounded-full border px-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                          Auto
                        </span>
                      )}
                      <span className="text-xs font-normal text-muted-foreground">
                        {r.variants.length > 1 && `${r.variants.length} titles`}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{r.jobs}</TableCell>
                  <TableCell className="text-right">{r.applications}</TableCell>
                  <TableCell className="text-right">{r.rejections}</TableCell>
                  <TableCell className="text-right">{r.interviews}</TableCell>
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
