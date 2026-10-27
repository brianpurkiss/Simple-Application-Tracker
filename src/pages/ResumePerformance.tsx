import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ComboHeatmap from "@/components/stats/ComboHeatmap";
import ComboRow from "@/components/stats/ComboRow";
import { FilterPanel, FilterToggle } from "@/components/stats/FilterMenu";
import Highlights from "@/components/stats/Highlights";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillToggle } from "@/components/ui/pill-toggle";
import { Segmented } from "@/components/ui/segmented";
import { useJobs } from "@/lib/api";
import { applicationsNeeded, type Combo, comboBy, DIMENSIONS, type DimensionKey, type Metric, VERSION_MODES } from "@/lib/stats";
import { useParamUpdater } from "@/lib/useParamUpdater";
import { useSettled } from "@/lib/useSettled";
import { cn } from "@/lib/utils";

// This page's own defaults; Activity keeps using the shared constants in stats.ts.
const DEFAULT_MIN_AGE = 8;
const DEFAULT_MIN_SAMPLE = 10;

const METRICS = [
  { key: "interview", label: "Interview rate" },
  { key: "reply", label: "Reply rate" },
] as const;
// z-scores for the confidence a combo must clear to be called a standout / below average.
const CONFIDENCE = [
  { key: "strict", label: "Strict (95%)", z: 1.96 },
  { key: "balanced", label: "Balanced (90%)", z: 1.645 },
  { key: "loose", label: "Loose (80%)", z: 1.28 },
] as const;
type SortKey = "confidence" | "rate" | "volume";
const SORTS = [
  { key: "confidence", label: "Best bet" },
  { key: "rate", label: "Raw rate" },
  { key: "volume", label: "Volume" },
] as const;

// Resume is always the first dimension; these are the ones that can be combined with it.
const EXTRA_DIMS = DIMENSIONS.filter((d) => d.key !== "resume_version" && d.key !== "work_mode");
const MAX_EXTRA = 2;

const rateOf = (c: Combo, metric: Metric) => (metric === "interview" ? c.interviewRate : c.responseRate) ?? 0;

export default function ResumePerformance() {
  const { data: jobs = [], isLoading, error } = useJobs();
  const [params] = useSearchParams();
  const updateParams = useParamUpdater();
  const [filtersOpen, setFiltersOpen] = useState(true);

  const metric: Metric = params.get("metric") === "reply" ? "reply" : "interview";
  const sort = (SORTS.find((s) => s.key === params.get("sort"))?.key ?? "confidence") as SortKey;
  const groupVersions = params.get("versions") === "grouped";
  const confidence = CONFIDENCE.find((c) => c.key === params.get("conf")) ?? CONFIDENCE[1];
  const minAge = Math.max(0, Number(params.get("recency") ?? DEFAULT_MIN_AGE) || 0);
  const minSample = Math.max(1, Number(params.get("min") ?? DEFAULT_MIN_SAMPLE) || 1);
  const extras = (params.get("with") ?? "")
    .split(",")
    .filter((k): k is DimensionKey => EXTRA_DIMS.some((d) => d.key === k))
    .slice(0, MAX_EXTRA);
  const heatDim = (EXTRA_DIMS.find((d) => d.key === params.get("heat"))?.key ?? "job_type") as DimensionKey;

  const setParam = (key: string, value: string | null) =>
    updateParams((p) => {
      if (value === null) p.delete(key);
      else p.set(key, value);
    });

  const toggleExtra = (key: DimensionKey) => {
    const next = extras.includes(key) ? extras.filter((k) => k !== key) : [...extras, key].slice(-MAX_EXTRA);
    setParam("with", next.length ? next.join(",") : null);
  };

  // Everything the results render comes from `view`, which lags the live params so the old results can
  // animate out (bars drop to zero) before the new ones swap in and refill.
  const live = { metric, sort, groupVersions, conf: confidence.key, minAge, minSample, extras, heatDim };
  const { shown: view, phase } = useSettled(live, JSON.stringify(live));
  const vConfidence = CONFIDENCE.find((c) => c.key === view.conf) ?? CONFIDENCE[1];
  const dims: DimensionKey[] = ["resume_version", ...view.extras];
  const { combos, baseline, total, excluded } = useMemo(
    () => comboBy(jobs, dims, { metric: view.metric, minSample: view.minSample, minAge: view.minAge, groupVersions: view.groupVersions, z: vConfidence.z }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, view.extras.join(","), view.metric, view.minSample, view.minAge, view.groupVersions, vConfidence.z],
  );

  const resumeCount = useMemo(
    () => comboBy(jobs, ["resume_version"], { metric: view.metric, minSample: view.minSample, minAge: view.minAge, groupVersions: view.groupVersions, z: vConfidence.z }).combos.length,
    [jobs, view.metric, view.minSample, view.minAge, view.groupVersions, vConfidence.z],
  );

  const sorted = useMemo(() => {
    const by = {
      confidence: (a: Combo, b: Combo) => b.lo - a.lo || b.n - a.n,
      rate: (a: Combo, b: Combo) => rateOf(b, view.metric) - rateOf(a, view.metric) || b.n - a.n,
      volume: (a: Combo, b: Combo) => b.n - a.n,
    }[view.sort];
    return [...combos].sort(by);
  }, [combos, view.sort, view.metric]);
  const fade = cn("transition-opacity duration-200 motion-reduce:transition-none", phase === "out" && "opacity-0");
  const enough = sorted.filter((c) => c.tier !== "low");
  const tooFew = sorted.filter((c) => c.tier === "low");

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-destructive">Couldn't load applications.</p>;

  const filtersActive = metric !== "interview" || groupVersions || minAge !== DEFAULT_MIN_AGE || confidence.key !== "balanced" || minSample !== DEFAULT_MIN_SAMPLE;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
    <div className="min-w-0 flex-1 space-y-6">
      <title>Performance | Application Tracker</title>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <h1 className="text-xl font-semibold">Performance</h1>
          <p className={cn("text-sm text-muted-foreground", fade)}>
            {total} applications counted
            {excluded > 0 && `, ${excluded} too recent`} · avg response {Math.round(baseline * 100)}% · {resumeCount} {resumeCount === 1 ? "resume" : "resumes"}.
          </p>
        </div>
        <div className="ml-auto">
          <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} active={filtersActive} />
        </div>
      </div>

      <Highlights combos={combos} metric={view.metric} baseline={baseline} fade={fade} />

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">Combos</h2>
            <p className="text-sm text-muted-foreground">Resume plus up to {MAX_EXTRA} more.</p>
          </div>
          <Segmented options={SORTS} value={sort} onChange={(s) => setParam("sort", s)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-muted-foreground">Resume +</span>
          {EXTRA_DIMS.map((d) => (
            <PillToggle key={d.key} pressed={extras.includes(d.key)} onClick={() => toggleExtra(d.key)}>
              {d.label}
            </PillToggle>
          ))}
        </div>
        <ul className="space-y-3">
          {enough.map((c, i) => <ComboRow key={c.key} combo={c} metric={view.metric} baseline={baseline} index={i} phase={phase} />)}
          {!enough.length && <li className={cn("text-sm text-muted-foreground", fade)}>Nothing with {view.minSample}+ applications yet.</li>}
        </ul>
        {tooFew.length > 0 && (
          <>
            <div className={cn("border-t pt-3 text-xs uppercase tracking-wide text-muted-foreground", fade)}>Fewer than {view.minSample} applications</div>
            <ul className="space-y-3">
              {tooFew.map((c, i) => <ComboRow key={c.key} combo={c} metric={view.metric} baseline={baseline} index={enough.length + i} phase={phase} />)}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={fade}>
            <h2 className="font-medium">Resume × {EXTRA_DIMS.find((d) => d.key === view.heatDim)?.label.toLowerCase()}</h2>
            <p className="text-sm text-muted-foreground">Rate · applications.</p>
          </div>
          <Segmented options={EXTRA_DIMS} value={heatDim} onChange={(d) => setParam("heat", d)} />
        </div>
        <div className={fade}>
          <ComboHeatmap jobs={jobs} dim={view.heatDim} metric={view.metric} minSample={view.minSample} minAge={view.minAge} groupVersions={view.groupVersions} />
        </div>
      </section>
    </div>
      <FilterPanel open={filtersOpen}>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Metric</Label>
                <div><Segmented options={METRICS} value={metric} onChange={(m) => setParam("metric", m)} /></div>
                <p className="text-xs text-muted-foreground">
                  Interview = at least one recruiter screen or interview, or an offer. Reply = any contact from them or an interview; a rejection on its own doesn't count.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Resume versions</Label>
                <div>
                  <Segmented
                    options={VERSION_MODES}
                    value={groupVersions ? "grouped" : "separate"}
                    onChange={(v) => setParam("versions", v === "grouped" ? "grouped" : null)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Grouped merges minor revisions (eCom 2.0, 2.1, 2.2 become eCom 2.x). Expanding a combo still shows each job's exact version.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="recency">Skip applications from the last</Label>
                <div className="flex items-center gap-2">
                  <Input id="recency" type="number" min={0} value={minAge} onChange={(e) => setParam("recency", e.target.value)} className="w-20 bg-card" />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground">Very recent applications haven't had time to hear back, so they'd drag rates down unfairly.</p>
              </div>
              <div className="space-y-1">
                <Label>Standout confidence</Label>
                <div>
                  <Segmented
                    options={CONFIDENCE}
                    value={confidence.key}
                    onChange={(c) => setParam("conf", c === "balanced" ? null : c)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">How sure the numbers must be before a combo is called a standout. Looser needs less data but is more likely to flag a fluke.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="min">Minimum applications</Label>
                <Input id="min" type="number" min={1} value={minSample} onChange={(e) => setParam("min", e.target.value)} className="w-20 bg-card" />
                <p className="text-xs text-muted-foreground">Combos with fewer applications are listed separately, faded, and can't be called a standout.</p>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4 text-xs text-muted-foreground">
              <h3 className="text-sm font-medium text-foreground">How to read this</h3>
              <div className="space-y-1">
                <div className="font-medium text-foreground">Bars</div>
                <p>
                  <span className="text-blue-400">Blue</span> = interview rate, <span className="text-amber-500">amber</span> = reply rate (rejections excluded), the vertical line = the overall average of {Math.round(baseline * 100)}%. The multiple (e.g. 1.6×) is the combo's rate divided by that average.
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">Badges</div>
                <p><span className="text-emerald-400">Standout</span>: at least {minSample} applications and above average even at the pessimistic end of its range (at the confidence set above), so it's unlikely to be luck.</p>
                <p><span className="text-blue-400">Promising</span>: at least {minSample} applications and above average, but the sample is still too small to rule out luck.</p>
                <p><span className="text-red-400">Below average</span>: at least {minSample} applications and below average even at the optimistic end of its range.</p>
                <p>Low volume: under {minSample} applications.</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">Sorting</div>
                <p><span className="text-foreground">Best bet</span>: ranks by the pessimistic end of each combo's confidence range, so 1 of 1 doesn't beat 12 of 20.</p>
                <p><span className="text-foreground">Raw rate</span>: highest percentage first, regardless of sample size.</p>
                <p><span className="text-foreground">Volume</span>: most applications first.</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">How much data is enough for a standout?</div>
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
                <p>Each cell is rate · applications. Darker blue = higher rate, green outline = standout, muted = low volume.</p>
              </div>
            </div>
      </FilterPanel>
    </div>
  );
}
