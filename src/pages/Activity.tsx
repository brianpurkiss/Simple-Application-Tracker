import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Legend } from "@/components/stats/Legend";
import { FilterBox, FilterPanel, FilterToggle } from "@/components/stats/FilterMenu";
import { Label } from "@/components/ui/label";
import { PillToggle } from "@/components/ui/pill-toggle";
import { Segmented } from "@/components/ui/segmented";
import CohortTable from "@/components/stats/CohortTable";
import Extras from "@/components/stats/Extras";
import FlowSankey from "@/components/stats/FlowSankey";
import Funnel from "@/components/stats/Funnel";
import KpiRow from "@/components/stats/KpiRow";
import Momentum from "@/components/stats/Momentum";
import OutcomeBar from "@/components/stats/OutcomeBar";
import SalaryDistribution from "@/components/stats/SalaryDistribution";
import Timing from "@/components/stats/Timing";
import WeekdayInsights from "@/components/stats/WeekdayInsights";
import { type ActivityEvent, type Job, useBoards, useEvents, useJobs, useResumes, useStarredGroups } from "@/lib/api";
import { isApplication } from "@/lib/jobs";
import { resolveCompanyType, resolveJobTypes, type FactContext } from "@/lib/jobFacts";
import { useFactContext } from "@/hooks/useFactContext";
import { COMPANY_TYPE_PARAM, RESUME_PARAM, STAR_FILTERS } from "@/lib/jobFilters";
import { VERSION_MODES, flow, funnel, interviewToRejection, kpis, outcomes, resumeFamily, timing, weeklyCohorts } from "@/lib/stats";
import {
  CATEGORIES,
  type Category,
  weeklySeries,
} from "@/lib/activity";
import { today } from "@/lib/format";
import { extras, momentum, rollingAverage } from "@/lib/insights";
import { useParamUpdater } from "@/hooks/useParamUpdater";
import { jobGroupKeys } from "@/lib/titles/starred";
import { perfDimValues } from "@/lib/titles/perfDims";

// Each filter lives in the URL as a repeated param so views can be shared and survive reloads.
const FILTERS = [
  { param: COMPANY_TYPE_PARAM, label: "Company Type", field: "company_type", tab: "companyType" },
  { param: RESUME_PARAM, label: "Resume Version", field: "resume_version", tab: "resume" },
] as const;

// A job matches when it is in any picked starred group (see STAR_FILTERS in jobFilters).
const valueOf = (j: Job, field: (typeof FILTERS)[number]["field"], grouped: boolean, ctx: FactContext) => {
  if (field === "resume_version") {
    const v = j.resume_version.trim();
    return grouped ? resumeFamily(v) : v;
  }
  return resolveCompanyType(j, ctx).value;
};

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function AreaView({ events }: { events: ActivityEvent[] }) {
  // Rejections start hidden so the applications and interviews trend reads first.
  const [hidden, setHidden] = useState<Set<Category>>(new Set(["rejection"]));
  const [mode, setMode] = useState<"weekly" | "cumulative">("weekly");
  const weekly = weeklySeries(events);
  const trend = rollingAverage(weekly.map((w) => w.applied), 4);
  const perWeek = weekly.map((w, i) => ({ ...w, trend: trend[i] }));
  const data = useMemo(() => {
    if (mode === "weekly") return perWeek;
    // Running totals; the 4-week average only makes sense per week.
    const running = { applied: 0, interview: 0, offer: 0, rejection: 0, resume: 0, other: 0 };
    return weekly.map((w) => {
      for (const k of Object.keys(running) as (keyof typeof running)[]) running[k] += w[k];
      return { ...w, ...running };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, mode]);
  const toggle = (c: Category) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(c)) next.add(c);
      return next;
    });
  const shown = CATEGORIES.filter((c) => c.key !== "other" && !hidden.has(c.key));

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            options={[{ key: "weekly", label: "By Week" }, { key: "cumulative", label: "Cumulative" }] as const}
            value={mode}
            onChange={setMode}
          />
          <div className="text-sm text-muted-foreground">
            {mode === "weekly" ? "Events per Week (Weeks Start Monday)" : "Running Total of Events"}
          </div>
        </div>
        <Legend keys={["applied", "interview", "offer", "rejection", "resume"]} hidden={hidden} onToggle={toggle} />
      </div>
      <div className="overflow-x-auto">
        <ComposedChart responsive data={data} style={{ width: "100%", minWidth: 480, height: 340 }} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <defs>
            {shown.map((c) => (
              <linearGradient key={c.key} id={`fill-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={c.color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tickFormatter={shortDate} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
          <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(w) => `${mode === "weekly" ? "Week of" : "Through week of"} ${shortDate(String(w))}`}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
            itemStyle={{ color: "var(--foreground)" }}
          />
          {shown.map((c) => (
            <Area
              key={c.key}
              type="monotone"
              dataKey={c.key}
              name={c.label}
              stroke={c.color}
              strokeWidth={2}
              isAnimationActive={false}
              fill={`url(#fill-${c.key})`}
            />
          ))}
          {mode === "weekly" && !hidden.has("applied") && (
            <Line type="monotone" dataKey="trend" name="Applications, 4-Week Average" stroke="#b45309" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {(["applied", "interview"] as const).map((key) => {
          const c = CATEGORIES.find((x) => x.key === key)!;
          const avg = weekly.length ? weekly.reduce((sum, w) => sum + w[key], 0) / weekly.length : 0;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="text-muted-foreground">Avg {c.label} / Week</span>
              <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>
            </div>
          );
        })}
        <div className="text-muted-foreground">across {weekly.length} weeks</div>
      </div>
    </div>
  );
}

export default function Activity() {
  const { data: events = [], isLoading: loadingEvents } = useEvents();
  const { data: allJobs = [], isLoading: loadingJobs } = useJobs();
  // Saved postings weren't applied to; they still help work out titles and types.
  const jobs = useMemo(() => allJobs.filter(isApplication), [allJobs]);
  const { data: resumes = [] } = useResumes();
  const [params] = useSearchParams();
  const updateParams = useParamUpdater();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: stars = [] } = useStarredGroups();
  const { data: boards = [] } = useBoards();
  const factCtx = useFactContext(allJobs);
  const grouped = params.get("versions") === "grouped";
  const selected = FILTERS.map((f) => params.getAll(f.param).map((v) => (f.field === "resume_version" && grouped ? resumeFamily(v) : v)));

  const starSelected = STAR_FILTERS.map((f) => params.getAll(f.param));
  // Group keys per job, for matching against the starred filters.
  const jobKeys = useMemo(
    () => new Map(jobs.map((j) => [j.id, jobGroupKeys(factCtx.titles.get(j.id), resolveJobTypes(j, factCtx).values)])),
    [jobs, factCtx],
  );
  const starOptions = useMemo(
    () =>
      STAR_FILTERS.map((f) =>
        stars
          .filter((s) => s.kind === f.kind)
          // A starred group with no jobs keeps its pill, as it keeps its row on Segments.
          .map((s) => ({ ...s, count: jobs.filter((j) => jobKeys.get(j.id)?.[f.kind].includes(s.key)).length })),
      ),
    [stars, jobs, jobKeys],
  );

  // Each option with how many jobs have it.
  const options = useMemo(
    () =>
      FILTERS.map((f) => {
        const counts = new Map<string, number>();
        for (const j of jobs) {
          const v = valueOf(j, f.field, grouped, factCtx);
          if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        return [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
      }),
    [jobs, grouped, factCtx],
  );
  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          FILTERS.every((f, i) => !selected[i].length || selected[i].includes(valueOf(j, f.field, grouped, factCtx))) &&
          STAR_FILTERS.every((f, i) => !starSelected[i].length || starSelected[i].some((k) => jobKeys.get(j.id)?.[f.kind].includes(k))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, grouped, jobKeys, factCtx, params.toString()],
  );
  const filteredEvents = useMemo(() => {
    const ids = new Set(filteredJobs.map((j) => j.id));
    const jobEvents = events.filter((e) => ids.has(e.job_id));
    // Resume creation dates sit alongside job events; only the resume filter narrows them.
    const picked = selected[FILTERS.findIndex((f) => f.field === "resume_version")];
    const resumeEvents = resumes
      .filter((r) => !picked.length || picked.includes(grouped ? resumeFamily(r.version) : r.version))
      .map((r): ActivityEvent => ({ id: -r.id, job_id: 0, resume_id: r.id, date: r.created_at.slice(0, 10), time: null, type: "New Resume", title: r.version, company: "" }));
    return [...jobEvents, ...resumeEvents].sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, filteredJobs, resumes, grouped, params.toString()]);
  const filtersActive = grouped || selected.some((s) => s.length > 0) || starSelected.some((s) => s.length > 0);

  const toggleValue = (param: string, value: string) =>
    updateParams((p) => {
      const current = p.getAll(param);
      p.delete(param);
      (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]).forEach((v) => p.append(param, v));
    });
  const setVersions = (mode: string) =>
    updateParams((p) => {
      // Selected resumes mean different things in each mode, so start that filter fresh.
      p.delete("resume");
      if (mode === "grouped") p.set("versions", "grouped");
      else p.delete("versions");
    });
  const clearFilters = () =>
    updateParams((p) => [...FILTERS.map((f) => f.param), ...STAR_FILTERS.map((f) => f.param), "versions"].forEach((k) => p.delete(k)));

  const todayIso = today();
  const stats = useMemo(() => kpis(filteredJobs, filteredEvents, todayIso), [filteredJobs, filteredEvents, todayIso]);
  const momentumStats = useMemo(() => momentum(filteredJobs, filteredEvents, todayIso), [filteredJobs, filteredEvents, todayIso]);
  const segmentValues = useMemo(() => perfDimValues(stars, factCtx), [stars, factCtx]);
  const trivia = useMemo(() => extras(filteredJobs, filteredEvents, todayIso, segmentValues, boards), [filteredJobs, filteredEvents, todayIso, segmentValues, boards]);
  if (loadingEvents || loadingJobs) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
    <div className="min-w-0 flex-1 space-y-6">
      <title>Activity | Application Tracker</title>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Activity</h1>
        <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} active={filtersActive} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:block sm:space-y-4">
        <KpiRow k={stats} />
        <Momentum m={momentumStats} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Funnel steps={funnel(filteredJobs)} />
        <OutcomeBar outcomes={outcomes(filteredJobs)} />
      </div>
      <FlowSankey {...flow(filteredJobs)} />
      <div className="space-y-4">
        <h2 className="font-medium">Timeline</h2>
        <AreaView events={filteredEvents} />
        <WeekdayInsights events={filteredEvents} />
      </div>
      <Timing data={timing(filteredJobs)} afterInterview={interviewToRejection(filteredJobs)} />
      <CohortTable cohorts={weeklyCohorts(filteredJobs)} />
      <SalaryDistribution jobs={filteredJobs} />
      <Extras items={trivia} />
    </div>
      <FilterPanel open={filtersOpen}>
        <FilterBox>
        <div className="space-y-4">
          {STAR_FILTERS.map((f, i) => starOptions[i].length > 0 && (
            <div key={f.param} className="space-y-1">
              <Label><Link to={`/segments?tab=${f.tab}`} className="hover:underline">{f.label}</Link></Label>
              <div className="flex flex-wrap gap-1.5 pt-1 text-sm">
                {starOptions[i].map((o) => (
                  <PillToggle key={o.key} pressed={starSelected[i].includes(o.key)} onClick={() => toggleValue(f.param, o.key)}>
                    {o.label} <span className="tabular-nums opacity-70">({o.count})</span>
                  </PillToggle>
                ))}
              </div>
            </div>
          ))}
          {FILTERS.map((f, i) => (
            <div key={f.param} className="space-y-1">
              <Label><Link to={`/segments?tab=${f.tab}`} className="hover:underline">{f.label}</Link></Label>
              {f.field === "resume_version" && (
                <div>
                  <Segmented options={VERSION_MODES} value={grouped ? "grouped" : "separate"} onChange={setVersions} />
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1 text-sm">
                {options[i].map(([o, n]) => (
                  <PillToggle key={o} pressed={selected[i].includes(o)} onClick={() => toggleValue(f.param, o)}>
                    {o} <span className="tabular-nums opacity-70">({n})</span>
                  </PillToggle>
                ))}
                {!options[i].length && <span className="text-muted-foreground">None yet</span>}
              </div>
              {f.field === "resume_version" && (
                <p className="text-xs text-muted-foreground">Grouped merges minor revisions (Resume 2.0, 2.1, 2.2 become Resume 2.x).</p>
              )}
            </div>
          ))}
          {filtersActive && <Button variant="outline" size="sm" onClick={clearFilters}>Clear Filters</Button>}
        </div>
        </FilterBox>
      </FilterPanel>
    </div>
  );
}
