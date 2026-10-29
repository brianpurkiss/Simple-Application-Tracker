import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ComboHeatmap from "@/components/stats/ComboHeatmap";
import ComboRow from "@/components/stats/ComboRow";
import { FilterAccordion, FilterBox, FilterPanel, FilterToggle } from "@/components/stats/FilterMenu";
import Highlights from "@/components/stats/Highlights";
import SalaryCurve from "@/components/stats/SalaryCurve";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillToggle } from "@/components/ui/pill-toggle";
import { Segmented } from "@/components/ui/segmented";
import { useJobs, useProfile, useStarredGroups } from "@/lib/api";
import { isApplication } from "@/lib/jobs";
import { useFactContext } from "@/hooks/useFactContext";
import { applicationsNeeded, type Combo, comboBy, type Metric, PERF_DIMS, type PerfDim, VERSION_MODES } from "@/lib/stats";
import { perfDimValues } from "@/lib/titles/perfDims";
import { GHOSTED_DAYS } from "@/lib/options";
import { useParamUpdater } from "@/hooks/useParamUpdater";
import { useSettled } from "@/hooks/useSettled";
import { cn } from "@/lib/utils";

// This page's own defaults; Activity keeps using the shared constants in stats.ts.
const DEFAULT_MIN_AGE = 8;
const DEFAULT_MIN_SAMPLE = 10;

const METRICS = [
  { key: "interview", label: "Interviews" },
  { key: "rejected", label: "Rejected, No Interview" },
] as const;
// z-scores for the confidence a combo must clear to be called a standout / below average.
const CONFIDENCE = [
  { key: "strict", label: "Strict (95%)", z: 1.96 },
  { key: "balanced", label: "Balanced (90%)", z: 1.645 },
  { key: "loose", label: "Loose (80%)", z: 1.28 },
] as const;
type SortKey = "confidence" | "rate" | "volume";
const SORTS = [
  { key: "confidence", label: "Best Bet" },
  { key: "rate", label: "Raw Rate" },
  { key: "volume", label: "Volume" },
] as const;

const MAX_DIMS = 3;
const isDim = (k: string): k is PerfDim => PERF_DIMS.some((d) => d.key === k);
const dimLabel = (k: PerfDim) => PERF_DIMS.find((d) => d.key === k)!.label;
const SALARY_LINES = 5;
const TOO_FEW_PREVIEW = 5;

const rateOf = (c: Combo, metric: Metric) => (metric === "interview" ? c.interviewRate : c.rejectedRate) ?? 0;

export default function ResumePerformance() {
  const { data: allJobs = [], isLoading, error } = useJobs();
  // Saved postings weren't applied to; they still help work out titles and types.
  const jobs = useMemo(() => allJobs.filter(isApplication), [allJobs]);
  const { data: profile } = useProfile();
  const [params] = useSearchParams();
  const updateParams = useParamUpdater();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAllTooFew, setShowAllTooFew] = useState(false);

  const metric: Metric = params.get("metric") === "rejected" ? "rejected" : "interview";
  const sort = (SORTS.find((s) => s.key === params.get("sort"))?.key ?? "confidence") as SortKey;
  const groupVersions = params.get("versions") !== "separate";
  const confidence = CONFIDENCE.find((c) => c.key === params.get("conf")) ?? CONFIDENCE[1];
  const minAge = Math.max(0, Number(params.get("recency") ?? DEFAULT_MIN_AGE) || 0);
  const ghostDays = Math.max(1, Number(params.get("ghost") ?? GHOSTED_DAYS) || GHOSTED_DAYS);
  const minSample = Math.max(1, Number(params.get("min") ?? DEFAULT_MIN_SAMPLE) || 1);
  const picked = (params.get("dims") ?? "").split(",").filter(isDim).slice(0, MAX_DIMS);
  const selected: PerfDim[] = picked.length ? picked : ["resume"];
  const heatRow: PerfDim = isDim(params.get("heatRow") ?? "") ? (params.get("heatRow") as PerfDim) : "resume";
  const heatCol: PerfDim = isDim(params.get("heatCol") ?? "") && params.get("heatCol") !== heatRow ? (params.get("heatCol") as PerfDim) : heatRow === "type" ? "resume" : "type";

  const setParam = (key: string, value: string | null) =>
    updateParams((p) => {
      if (value === null) p.delete(key);
      else p.set(key, value);
    });

  const toggleDim = (key: PerfDim) => {
    if (selected.includes(key) && selected.length === 1) return;
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key].slice(-MAX_DIMS);
    setParam("dims", next.join(",") === "resume" ? null : next.join(","));
  };
  const setHeat = (axis: "heatRow" | "heatCol", key: PerfDim) =>
    updateParams((p) => {
      const other = axis === "heatRow" ? heatCol : heatRow;
      // Picking the other axis's dimension swaps the two.
      const swapped = key === other ? (axis === "heatRow" ? heatRow : heatCol) : other;
      p.set(axis, key);
      p.set(axis === "heatRow" ? "heatCol" : "heatRow", swapped);
    });

  // Everything the results render comes from `view`, which lags the live params so the old results can
  // animate out (bars drop to zero) before the new ones swap in and refill.
  const live = { metric, sort, groupVersions, conf: confidence.key, minAge, ghostDays, minSample, dims: selected, heatRow, heatCol };
  const { shown: view, phase } = useSettled(live, JSON.stringify(live));
  const vConfidence = CONFIDENCE.find((c) => c.key === view.conf) ?? CONFIDENCE[1];
  const { data: stars = [] } = useStarredGroups();
  const factCtx = useFactContext(allJobs);
  const values = useMemo(() => perfDimValues(stars, factCtx), [stars, factCtx]);
  const { combos, baseline, total, excluded } = useMemo(
    () => comboBy(jobs, view.dims, { values, metric: view.metric, minSample: view.minSample, minAge: view.minAge, groupVersions: view.groupVersions, z: vConfidence.z, ghostDays: view.ghostDays }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, values, view.dims.join(","), view.metric, view.minSample, view.minAge, view.groupVersions, vConfidence.z, view.ghostDays],
  );

  const resumeCount = useMemo(
    () => comboBy(jobs, ["resume"], { values, metric: view.metric, minSample: view.minSample, minAge: view.minAge, groupVersions: view.groupVersions, z: vConfidence.z, ghostDays: view.ghostDays }).combos.length,
    [jobs, values, view.metric, view.minSample, view.minAge, view.groupVersions, vConfidence.z, view.ghostDays],
  );

  const sorted = useMemo(() => {
    const by = {
      // For rejections a lower rate is better, so the "best" end flips.
      confidence: (a: Combo, b: Combo) => (view.metric === "interview" ? b.lo - a.lo : a.hi - b.hi) || b.n - a.n,
      rate: (a: Combo, b: Combo) => (view.metric === "interview" ? rateOf(b, view.metric) - rateOf(a, view.metric) : rateOf(a, view.metric) - rateOf(b, view.metric)) || b.n - a.n,
      volume: (a: Combo, b: Combo) => b.n - a.n,
    }[view.sort];
    return [...combos].sort(by);
  }, [combos, view.sort, view.metric]);
  const fade = cn("transition-opacity duration-200 motion-reduce:transition-none", phase === "out" && "opacity-0");
  const shown = sorted.filter((c) => (view.metric === "interview" ? c.interviews : c.rejected) > 0);
  const enough = shown.filter((c) => c.tier !== "low");
  const tooFew = shown.filter((c) => c.tier === "low");
  const visibleTooFew = showAllTooFew ? tooFew : tooFew.slice(0, TOO_FEW_PREVIEW);
  // The best few combos (in the chosen sort order) that have any salary data to plot.
  const salarySeries = enough
    .filter((c) => c.jobs.some((j) => j.salary_min != null || j.salary_max != null))
    .slice(0, SALARY_LINES)
    .map((c) => ({ key: c.key, label: c.parts.join(" + "), jobs: c.jobs }));

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-destructive">Couldn't load applications.</p>;

  const filtersActive = metric !== "interview" || !groupVersions || minAge !== DEFAULT_MIN_AGE || ghostDays !== GHOSTED_DAYS || confidence.key !== "balanced" || minSample !== DEFAULT_MIN_SAMPLE;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
    <div className="min-w-0 flex-1 space-y-6">
      <title>Performance | Application Tracker</title>
      <div className="flex items-start justify-between gap-4 sm:items-end">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Performance</h1>
          <p className={cn("text-sm text-muted-foreground", fade)}>
            {total} Applications Counted
            {excluded > 0 && `, ${excluded} Too Recent`} · {view.metric === "interview" ? "Avg Interview Rate" : "Avg Rejected, No Interview Rate"} {Math.round(baseline * 100)}% · {resumeCount} {resumeCount === 1 ? "Resume" : "Resumes"}
          </p>
        </div>
        <div className="shrink-0">
          <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} active={filtersActive} />
        </div>
      </div>

      <Highlights combos={combos} metric={view.metric} baseline={baseline} fade={fade} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="mr-1 font-medium max-sm:w-full">Group By</h2>
            {PERF_DIMS.map((d) => (
              <PillToggle key={d.key} pressed={selected.includes(d.key)} onClick={() => toggleDim(d.key)} className="max-sm:px-2.5 max-sm:text-sm">
                {d.label}
              </PillToggle>
            ))}
          </div>
          <Segmented options={SORTS} value={sort} onChange={(s) => setParam("sort", s)} />
        </div>
        <ul className="space-y-3">
          {enough.map((c, i) => <ComboRow key={c.key} combo={c} metric={view.metric} baseline={baseline} index={i} phase={phase} />)}
          {!enough.length && <li className={cn("text-sm text-muted-foreground", fade)}>No results with {view.minSample}+ applications.</li>}
        </ul>
        <div className={cn("border-t pt-3 text-xs uppercase tracking-wide text-muted-foreground", fade)}>Fewer Than {view.minSample} Applications</div>
        <ul className="space-y-3">
          {visibleTooFew.map((c, i) => <ComboRow key={c.key} combo={c} metric={view.metric} baseline={baseline} index={enough.length + i} phase={phase} />)}
          {!tooFew.length && <li className={cn("text-sm text-muted-foreground", fade)}>No results with fewer than {view.minSample} applications.</li>}
        </ul>
        {tooFew.length > TOO_FEW_PREVIEW && (
          <div className={cn("flex justify-center", fade)}>
            <Button variant="ghost" size="sm" className="text-muted-foreground" aria-expanded={showAllTooFew} onClick={() => setShowAllTooFew((s) => !s)}>
              {showAllTooFew ? "Show Less" : `View More (${tooFew.length - TOO_FEW_PREVIEW})`}
            </Button>
          </div>
        )}
      </section>

      <div className={fade}>
        <SalaryCurve series={salarySeries} target={profile?.salary_target ?? null} />
      </div>
      </div>

      <div className="mx-auto h-px w-16 bg-border" aria-hidden />

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={fade}>
            <h2 className="font-medium">{dimLabel(view.heatRow)} × {dimLabel(view.heatCol)}</h2>
            <p className="text-sm text-muted-foreground">Rate · Applications</p>
          </div>
          <div className="flex items-center gap-2 max-sm:w-full max-sm:[&>button]:flex-1">
            <Segmented options={PERF_DIMS} value={heatRow} onChange={(d) => setHeat("heatRow", d)} collapse />
            <span className="text-muted-foreground">×</span>
            <Segmented options={PERF_DIMS} value={heatCol} onChange={(d) => setHeat("heatCol", d)} collapse />
          </div>
        </div>
        <div className={fade}>
          <ComboHeatmap jobs={jobs} rowDim={view.heatRow} colDim={view.heatCol} values={values} metric={view.metric} minSample={view.minSample} minAge={view.minAge} groupVersions={view.groupVersions} ghostDays={view.ghostDays} />
        </div>
      </section>
    </div>
      <FilterPanel open={filtersOpen}>
            <FilterBox>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Metric</Label>
                <div><Segmented options={METRICS} value={metric} onChange={(m) => setParam("metric", m)} /></div>
              </div>
              <div className="space-y-1">
                <Label>Resume Versions</Label>
                <div>
                  <Segmented
                    options={VERSION_MODES}
                    value={groupVersions ? "grouped" : "separate"}
                    onChange={(v) => setParam("versions", v === "grouped" ? null : "separate")}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="recency">Skip Applications from the Last</Label>
                <div className="flex items-center gap-2">
                  <Input id="recency" type="number" min={0} value={minAge} onChange={(e) => setParam("recency", e.target.value)} className="w-20 bg-card" />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
              {metric === "rejected" && (
                <div className="space-y-1">
                  <Label htmlFor="ghost">Count as Ghosted After</Label>
                  <div className="flex items-center gap-2">
                    <Input id="ghost" type="number" min={1} value={ghostDays} onChange={(e) => setParam("ghost", e.target.value === String(GHOSTED_DAYS) ? null : e.target.value)} className="w-20 bg-card" />
                    <span className="text-sm text-muted-foreground">days of silence</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Only applications at least this old are counted, so pending ones don't flatter a resume. Lower it if you usually hear back sooner; it overrides the skip above when larger.</p>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="min">Minimum Applications</Label>
                <Input id="min" type="number" min={1} value={minSample} onChange={(e) => setParam("min", e.target.value)} className="w-20 bg-card" />
              </div>
              <div className="space-y-1">
                <Label>Standout Confidence</Label>
                <div>
                  <Segmented
                    options={CONFIDENCE}
                    value={confidence.key}
                    onChange={(c) => setParam("conf", c === "balanced" ? null : c)}
                  />
                </div>
              </div>
            </div>
            </FilterBox>

            <FilterAccordion title="How to Read This" className="space-y-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                <div className="font-medium text-foreground">Bars</div>
                <p>
                  <span className="text-blue-400">Blue</span> = interview rate (higher is better), <span className="text-slate-400">slate</span> = rate of rejected or ghosted with no interview (lower is better), the vertical line = the overall average of {Math.round(baseline * 100)}%. The multiple (e.g. 1.6×) is the combo's rate divided by that average.
                </p>
                <p>{metric === "interview" ? "Bars run from 0% to 50%, so 25% fills half the bar and anything at 50% or more fills it. The faint ticks mark every 10%." : "Bars run the full 0% to 100%. The faint ticks mark every 20%."}</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">Badges</div>
                <p><span className="text-emerald-400">Standout</span>: at least {minSample} applications and {metric === "interview" ? "above" : "below"} average even at the pessimistic end of its range (at the confidence set above), so it's unlikely to be luck.</p>
                <p><span className="text-blue-400">Promising</span>: at least {minSample} applications and better than average, but the sample is still too small to rule out luck.</p>
                <p><span className="text-slate-400">Room to Grow</span>: at least {minSample} applications and {metric === "interview" ? "below" : "above"} average even at the optimistic end of its range.</p>
                <p>Low Volume: under {minSample} applications.</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">Sorting</div>
                <p><span className="text-foreground">Best Bet</span>: ranks by the pessimistic end of each combo's confidence range, so 1 of 1 doesn't beat 12 of 20.</p>
                <p><span className="text-foreground">Raw Rate</span>: {metric === "interview" ? "highest" : "lowest"} percentage first, regardless of sample size.</p>
                <p><span className="text-foreground">Volume</span>: most applications first.</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">How Much Data Is Enough for a Standout?</div>
                <p>
                  It depends on how far above the {Math.round(baseline * 100)}% average a combo is. Applications needed at today's average:
                </p>
                <ul className="grid grid-cols-2 gap-x-4 tabular-nums">
                  {[0.2, 0.25, 0.3, 0.4].map((r) => {
                    const needed = applicationsNeeded(r, baseline, confidence.z);
                    return (
                      <li key={r}>
                        {Math.round(r * 100)}% rate: {needed === null ? "–" : `~${Math.max(needed, minSample)}`}
                      </li>
                    );
                  })}
                </ul>
                <p>A modest edge needs lots of applications; a big one shows up quickly.</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">Heatmap</div>
                <p>Each cell is rate · applications. Darker = higher rate, green outline = standout, muted = low volume.</p>
              </div>
            </FilterAccordion>
      </FilterPanel>
    </div>
  );
}
