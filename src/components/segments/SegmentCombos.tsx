import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChartNoAxesCombined, ChevronRight } from "lucide-react";
import { newestFirst, RateCell, SALARY_COLUMNS, type SalaryCells, SalaryCellsView, SegmentJobList, salaryCells } from "@/components/segments/shared";
import { Button } from "@/components/ui/button";
import { PillToggle } from "@/components/ui/pill-toggle";
import { Segmented } from "@/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type Job, type Resume, type StarredGroup, useProfile } from "@/lib/api";
import type { FactContext } from "@/lib/jobFacts";
import { useParamUpdater } from "@/hooks/useParamUpdater";
import { splitResumes } from "@/lib/options";
import { type ComboDim, MIN_RESUME_SHARE, type SegmentCombo, segmentCombos } from "@/lib/segmentCombos";
import { interviewRateOf, PERF_DIMS } from "@/lib/stats";
import { perfDimValues } from "@/lib/titles/perfDims";
import { cn } from "@/lib/utils";

const DIMS = PERF_DIMS.filter((d): d is (typeof PERF_DIMS)[number] & { key: ComboDim } => d.key !== "resume");
const DEFAULT_DIMS: ComboDim[] = ["seniority", "type"];
const isDim = (s: string): s is ComboDim => DIMS.some((d) => d.key === s);

const SHOW = [
  { key: "all", label: "All" },
  { key: "open", label: "Opportunities", title: "Combos without their own active resume, or with a median at or above your salary target" },
] as const;
type Show = (typeof SHOW)[number]["key"];

type SortKey = "label" | "count" | "applications" | "interviewRate" | (typeof SALARY_COLUMNS)[number]["key"];
type ComboRow = Omit<SegmentCombo, "salary"> & SalaryCells & { label: string };

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; title?: string }[] = [
  { key: "label", label: "Combo" },
  { key: "count", label: "Jobs", numeric: true },
  { key: "applications", label: "Applications", numeric: true },
  { key: "interviewRate", label: "Interview Rate", numeric: true },
  ...SALARY_COLUMNS,
];

// Every combination of the chosen segments, most common first, with whether an active resume covers it.
export function SegmentCombos({ jobs, factCtx, stars, resumes }: { jobs: Job[]; factCtx: FactContext; stars: StarredGroup[]; resumes: Resume[] }) {
  const [params] = useSearchParams();
  const updateParams = useParamUpdater();
  const [sort, setSort] = useState<SortKey>("count");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showTail, setShowTail] = useState(false);

  const picked = (params.get("cdims") ?? "").split(",").filter(isDim);
  const dims = picked.length >= 2 ? DIMS.map((d) => d.key).filter((d) => picked.includes(d)) : DEFAULT_DIMS;
  const show: Show = SHOW.find((s) => s.key === params.get("cshow"))?.key ?? "all";
  // Every group counts by default, since unstarred segments are where new resumes would come from.
  const starredOnly = params.get("cstar") === "1";
  const setParam = (key: string, value: string | null) => updateParams((p) => (value ? p.set(key, value) : p.delete(key)));
  // A combo needs at least two segments; the last two can't be turned off.
  const toggleDim = (d: ComboDim) => {
    const next = dims.includes(d) ? dims.filter((x) => x !== d) : [...dims, d];
    if (next.length < 2) return;
    const ordered = DIMS.map((x) => x.key).filter((x) => next.includes(x));
    setParam("cdims", ordered.join(",") === DEFAULT_DIMS.join(",") ? null : ordered.join(","));
  };

  const values = useMemo(() => perfDimValues(starredOnly ? stars : [], factCtx), [starredOnly, stars, factCtx]);
  const activeVersions = useMemo(() => splitResumes(resumes).active.map((r) => r.version), [resumes]);
  const { rows, excluded } = useMemo(() => {
    const { combos, excluded } = segmentCombos(jobs, dims, values, activeVersions);
    const rows = combos.map(({ salary: _, ...c }): ComboRow => ({ ...c, ...salaryCells(c.jobs), label: c.parts.join(" · ") }));
    return { rows, excluded };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, dims.join(","), values, activeVersions]);

  const averageRate = useMemo(() => interviewRateOf(jobs), [jobs]);
  // An opportunity is a combo with no active resume yet, or one whose median pays at or above the salary target.
  const target = useProfile().data?.salary_target ?? null;
  const onTarget = (r: ComboRow) => target != null && r.salaryMid != null && r.salaryMid >= target;
  const reasons = (r: ComboRow) => [!r.covered && `No active resume used on ${MIN_RESUME_SHARE}% or more of this combo's jobs`, onTarget(r) && "Median pay is at or above your salary target"].filter(Boolean) as string[];
  const opportunities = rows.filter((r) => reasons(r).length).length;
  const uncovered = rows.filter((r) => !r.covered).length;
  const shown = rows.filter((r) => show === "all" || reasons(r).length > 0);
  const sorted = [...shown].sort((a, b) =>
    sort === "label"
      ? a.label.localeCompare(b.label)
      : (b[sort] ?? -1) - (a[sort] ?? -1) || b.count - a.count || a.label.localeCompare(b.label),
  );
  // One-off combos are the long tail.
  const tail = sorted.filter((r) => r.count < 2).length;
  const visible = showTail ? sorted : sorted.filter((r) => r.count >= 2);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {DIMS.map((d) => (
          <PillToggle
            key={d.key}
            pressed={dims.includes(d.key)}
            onClick={() => toggleDim(d.key)}
            title={dims.includes(d.key) && dims.length <= 2 ? "A combo needs at least two segments" : undefined}
            className="text-sm"
          >
            {d.label}
          </PillToggle>
        ))}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={starredOnly} onChange={(e) => setParam("cstar", e.target.checked ? "1" : null)} />
          Starred only
        </label>
        <Link to={`/performance?dims=${dims.join(",")}`} title="View performance" aria-label="View performance" className="rounded p-1.5 text-muted-foreground hover:text-foreground">
          <ChartNoAxesCombined className="size-4" />
        </Link>
        <span className="ml-auto"><Segmented options={SHOW} value={show} onChange={(v) => setParam("cshow", v === "all" ? null : v)} /></span>
      </div>
      <p className="text-sm text-muted-foreground">
        {rows.length} combos, {opportunities} opportunities: {uncovered} without their own active resume, {rows.filter(onTarget).length} at or above your salary target.
        {excluded > 0 && ` ${excluded} job${excluded === 1 ? "" : "s"} left out for missing a segment${starredOnly ? " or sitting outside the starred groups" : ""}.`}
      </p>

      <div className="table-bleed overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className={cn(c.numeric && "text-right")}>
                  <button
                    type="button"
                    title={c.title}
                    onClick={() => setSort(c.key)}
                    className={cn("hover:text-foreground", sort === c.key && "text-foreground underline underline-offset-4")}
                  >
                    {c.label}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const expanded = open.has(r.key);
              return (
                <Fragment key={r.key}>
                  <TableRow className="cursor-pointer" onClick={() => toggle(r.key)} aria-expanded={expanded}>
                    <TableCell className="min-w-48 font-medium whitespace-normal">
                      <span className="flex items-start gap-1.5">
                        <ChevronRight className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                        <span className="space-y-0.5">
                          <span className="block">
                            {r.parts.map((p, i) => (
                              <Fragment key={i}>
                                {i > 0 && <span className="mx-1.5 text-muted-foreground">·</span>}
                                {p}
                              </Fragment>
                            ))}
                            {reasons(r).length > 0 && (
                              <span title={reasons(r).join(". ")} className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 align-middle text-xs font-normal whitespace-nowrap text-amber-600 dark:text-amber-400">
                                Opportunity
                              </span>
                            )}
                          </span>
                          {r.resumes.length > 0 && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              Used resumes:{" "}
                              {r.resumes.map((res, i) => (
                                <Fragment key={res.name}>
                                  {i > 0 && ", "}
                                  <span className={cn(!res.covers && "opacity-60")} title={res.covers ? undefined : `Under ${MIN_RESUME_SHARE}% of this combo's jobs, so it doesn't cover it`}>{res.name} {res.share}%</span>
                                </Fragment>
                              ))}
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{r.applications}</TableCell>
                    <RateCell rate={r.interviewRate} applications={r.applications} average={averageRate} />
                    <SalaryCellsView row={r} />
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={COLUMNS.length} className="py-2 pr-4 pl-11">
                        <SegmentJobList
                          items={newestFirst(r.jobs).map((job) => ({ job }))}
                          extra={(j) => <span className="w-32 truncate text-xs text-muted-foreground">{j.resume_version}</span>}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} className="py-10 text-center text-muted-foreground">
                  {show === "open" ? "No opportunities right now." : "No combos yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {tail > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" aria-expanded={showTail} onClick={() => setShowTail((s) => !s)}>
            {showTail ? "Show Less" : `View More (${tail})`}
          </Button>
        </div>
      )}
    </div>
  );
}
