import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBox, FilterPanel, FilterToggle } from "@/components/stats/FilterMenu";
import { Label } from "@/components/ui/label";
import { PillToggle } from "@/components/ui/pill-toggle";
import { Segmented } from "@/components/ui/segmented";
import CohortTable from "@/components/stats/CohortTable";
import Extras from "@/components/stats/Extras";
import Funnel from "@/components/stats/Funnel";
import KpiRow from "@/components/stats/KpiRow";
import Momentum from "@/components/stats/Momentum";
import OutcomeBar from "@/components/stats/OutcomeBar";
import PipelineCumulative from "@/components/stats/PipelineCumulative";
import SalaryDistribution from "@/components/stats/SalaryDistribution";
import Timing from "@/components/stats/Timing";
import WeekdayInsights from "@/components/stats/WeekdayInsights";
import { type ActivityEvent, type Job, useEvents, useJobs, useResumes } from "@/lib/api";
import { VERSION_MODES, funnel, interviewToRejection, kpis, outcomes, resumeFamily, timing, weeklyCohorts } from "@/lib/stats";
import {
  CATEGORIES,
  type Category,
  categoryOf,
  colorOf,
  eventsByDay,
  monthGrid,
  weeklySeries,
} from "@/lib/activity";
import { formatDate, today } from "@/lib/format";
import { cumulative, extras, momentum, rollingAverage } from "@/lib/insights";
import { useParamUpdater } from "@/lib/useParamUpdater";
import { cn } from "@/lib/utils";

const VIEWS = [{ key: "chart", label: "Chart" }, { key: "calendar", label: "Calendar" }] as const;

// Each filter lives in the URL as a repeated param so views can be shared and survive reloads.
const FILTERS = [
  { param: "job_type", label: "Job Type", field: "job_type" },
  { param: "company_type", label: "Company Type", field: "company_type" },
  { param: "resume", label: "Resume Version", field: "resume_version" },
  { param: "applied_via", label: "Applied Via", field: "applied_via" },
] as const;

const valueOf = (j: Job, field: (typeof FILTERS)[number]["field"], grouped: boolean) => {
  const v = (j[field] ?? "").trim();
  return field === "resume_version" && grouped ? resumeFamily(v) : v;
};

// New resumes are squares so they stand apart from job events.
const shapeOf = (c: Category) => (c === "resume" ? "rounded-[2px]" : "rounded-full");

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function Legend({ keys, hidden, onToggle }: { keys: Category[]; hidden?: Set<Category>; onToggle?: (c: Category) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {CATEGORIES.filter((c) => keys.includes(c.key)).map((c) => {
        const off = hidden?.has(c.key);
        const body = (
          <>
            <span className={cn("size-2.5", shapeOf(c.key))} style={{ backgroundColor: c.color, opacity: off ? 0.3 : 1 }} />
            <span className={cn(off && "text-muted-foreground line-through")}>{c.label}</span>
          </>
        );
        return onToggle ? (
          <button key={c.key} type="button" onClick={() => onToggle(c.key)} className="inline-flex items-center gap-1.5">
            {body}
          </button>
        ) : (
          <span key={c.key} className="inline-flex items-center gap-1.5">{body}</span>
        );
      })}
    </div>
  );
}

function AreaView({ events }: { events: ActivityEvent[] }) {
  // Rejections start hidden so the applications and interviews trend reads first.
  const [hidden, setHidden] = useState<Set<Category>>(new Set(["rejection"]));
  const weekly = weeklySeries(events);
  const trend = rollingAverage(weekly.map((w) => w.applied), 4);
  const data = weekly.map((w, i) => ({ ...w, trend: trend[i] }));
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
        <div className="text-sm text-muted-foreground">Events per Week (Weeks Start Monday)</div>
        <Legend keys={["applied", "interview", "offer", "rejection", "resume"]} hidden={hidden} onToggle={toggle} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {(["applied", "interview"] as const).map((key) => {
          const c = CATEGORIES.find((x) => x.key === key)!;
          const avg = data.length ? data.reduce((sum, w) => sum + w[key], 0) / data.length : 0;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="text-muted-foreground">Avg {c.label} / Week</span>
              <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>
            </div>
          );
        })}
        <div className="text-muted-foreground">across {data.length} weeks</div>
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
            labelFormatter={(w) => `Week of ${shortDate(String(w))}`}
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
          {!hidden.has("applied") && (
            <Line type="monotone" dataKey="trend" name="Applications, 4-Week Average" stroke="#b45309" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </div>
    </div>
  );
}

function CalendarView({ events }: { events: ActivityEvent[] }) {
  const now = today();
  const [cursor, setCursor] = useState(() => {
    // Start on the month of the latest event so the page opens on something.
    const latest = events.length ? events[events.length - 1].date : now;
    const [y, m] = latest.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<Category>>(new Set(["rejection"]));
  const toggle = (c: Category) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(c)) next.add(c);
      return next;
    });
  const byDay = eventsByDay(events.filter((e) => !hidden.has(categoryOf(e))));
  const days = monthGrid(cursor.year, cursor.month);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  const goToday = () => {
    const [y, m] = now.split("-").map(Number);
    setCursor({ year: y, month: m - 1 });
    setSelected(now);
  };
  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const picked = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={goToday}>Today</Button>
          <h2 className="ml-2 text-lg font-semibold">{title}</h2>
        </div>
        <Legend keys={CATEGORIES.map((c) => c.key)} hidden={hidden} onToggle={toggle} />
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-card px-2 py-1.5 text-xs text-muted-foreground">{d}</div>
          ))}
          {days.map((day) => {
            const items = byDay.get(day) ?? [];
            const inMonth = Number(day.slice(5, 7)) - 1 === cursor.month;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                className={cn(
                  "flex min-h-24 flex-col items-start gap-1.5 bg-card p-2 text-left hover:bg-accent/50",
                  !inMonth && "opacity-40",
                  selected === day && "ring-2 ring-primary ring-inset",
                )}
              >
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    day === now ? "rounded-full bg-primary px-1.5 py-0.5 font-medium text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {Number(day.slice(8))}
                </span>
                <span className="flex flex-wrap gap-1">
                  {items.map((e) => (
                    <span key={e.id} className={cn("size-2.5", shapeOf(categoryOf(e)))} style={{ backgroundColor: colorOf(categoryOf(e)) }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            {formatDate(selected)} · {picked.length} event{picked.length === 1 ? "" : "s"}
          </h3>
          {picked.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged this day.</p>}
          <ul className="divide-y rounded-md border">
            {picked.map((e) => (
              <li key={e.id}>
                <Link to={e.resume_id ? `/resumes/${e.resume_id}` : `/jobs/${e.job_id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50">
                  <span className={cn("size-2.5 shrink-0", shapeOf(categoryOf(e)))} style={{ backgroundColor: colorOf(categoryOf(e)) }} />
                  <span className="w-32 shrink-0 text-muted-foreground">{e.type}</span>
                  <span className="truncate">{e.title}{e.company && <span className="text-muted-foreground"> · {e.company}</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Activity() {
  const { data: events = [], isLoading: loadingEvents } = useEvents();
  const { data: jobs = [], isLoading: loadingJobs } = useJobs();
  const { data: resumes = [] } = useResumes();
  const [params, setParams] = useSearchParams();
  const updateParams = useParamUpdater();
  const view = params.get("view") === "calendar" ? "calendar" : "chart";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const grouped = params.get("versions") === "grouped";
  const selected = FILTERS.map((f) => params.getAll(f.param).map((v) => (f.field === "resume_version" && grouped ? resumeFamily(v) : v)));

  // Each option with how many jobs have it.
  const options = useMemo(
    () =>
      FILTERS.map((f) => {
        const counts = new Map<string, number>();
        for (const j of jobs) {
          const v = valueOf(j, f.field, grouped);
          if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        return [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
      }),
    [jobs, grouped],
  );
  const filteredJobs = useMemo(
    () => jobs.filter((j) => FILTERS.every((f, i) => !selected[i].length || selected[i].includes(valueOf(j, f.field, grouped)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, grouped, params.toString()],
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
  const filtersActive = grouped || selected.some((s) => s.length > 0);

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
    updateParams((p) => [...FILTERS.map((f) => f.param), "versions"].forEach((k) => p.delete(k)));

  const stats = useMemo(() => kpis(filteredJobs, filteredEvents, today()), [filteredJobs, filteredEvents]);
  const momentumStats = useMemo(() => momentum(filteredJobs, filteredEvents, today()), [filteredJobs, filteredEvents]);
  const progress = useMemo(() => cumulative(filteredJobs, today()), [filteredJobs]);
  const trivia = useMemo(() => extras(filteredJobs, filteredEvents, today()), [filteredJobs, filteredEvents]);
  if (loadingEvents || loadingJobs) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
    <div className="min-w-0 flex-1 space-y-6">
      <title>Activity | Application Tracker</title>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Activity</h1>
        <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} active={filtersActive} />
      </div>
      <KpiRow k={stats} />
      <Momentum m={momentumStats} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Funnel steps={funnel(filteredJobs)} />
        <OutcomeBar outcomes={outcomes(filteredJobs)} />
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Timeline</h2>
        <Segmented options={VIEWS} value={view} onChange={(key) => setParams(key === "chart" ? {} : { view: key })} />
      </div>
        {view === "chart" ? <AreaView events={filteredEvents} /> : <CalendarView events={filteredEvents} />}
        {view === "calendar" && <WeekdayInsights events={filteredEvents} />}
      </div>
      <PipelineCumulative data={progress} />
      <Timing data={timing(filteredJobs)} afterInterview={interviewToRejection(filteredJobs)} />
      <CohortTable cohorts={weeklyCohorts(filteredJobs)} />
      <SalaryDistribution jobs={filteredJobs} />
      <Extras items={trivia} />
    </div>
      <FilterPanel open={filtersOpen}>
        <FilterBox>
        <div className="space-y-4">
          {FILTERS.map((f, i) => (
            <div key={f.param} className="space-y-1">
              <Label>{f.label}</Label>
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
                <p className="text-xs text-muted-foreground">Grouped merges minor revisions (eCom 2.0, 2.1, 2.2 become eCom 2.x).</p>
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
