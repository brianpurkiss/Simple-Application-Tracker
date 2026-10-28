import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AddJobDialog } from "@/components/AddJobDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { useEvents, useJobs, useProfile, type ActivityEvent, type Job } from "@/lib/api";
import { weekStart } from "@/lib/activity";
import { daysSince, formatDate, formatTime, isActive, needsFollowUp, relativeDay, today } from "@/lib/format";
import { momentum } from "@/lib/insights";
import { INTERVIEWING_STATUSES, TIMED_EVENT_TYPES } from "@/lib/options";
import { EVENT_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { rowLink } from "@/lib/rowLink";

const WEEKS = 8;
const LIST_SIZE = 5;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
// The recruiting agency, when one is recorded.
const via = (j: Pick<Job, "agency_name"> | undefined) => j?.agency_name || "";
const quietDays = (j: Job) => daysSince(j.last_activity ?? j.applied_date) ?? 0;

function Card({ title, count, to, children }: { title: string; count?: number; to?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-medium">{title}{count ? <span className="ml-2 text-sm text-muted-foreground">{count}</span> : null}</h2>
        {to && count ? <Link to={to} className="text-sm text-muted-foreground hover:text-foreground">View all</Link> : null}
      </div>
      {children}
    </section>
  );
}

function HomeKpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function UpcomingInterviews({ events }: { events: ActivityEvent[] }) {
  const navigate = useNavigate();
  if (!events.length) return null;
  return (
    <section aria-label="Upcoming interviews" className="flex gap-3 overflow-x-auto pb-1">
      {events.map((e) => (
        <div
          key={e.id}
          {...rowLink(navigate, `/jobs/${e.job_id}`)}
          className={cn("min-w-56 shrink-0 cursor-pointer rounded-lg border bg-card px-4 py-3 hover:bg-muted/50", e.date === today() && "border-primary")}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={cn("size-2.5 rounded-full", EVENT_COLORS[e.type]?.dot)} />
            {relativeDay(e.date)}{e.time && ` · ${formatTime(e.time)}`}
            <span className="ml-auto font-normal text-muted-foreground">{e.type}</span>
          </div>
          <div className="mt-1 truncate font-medium">{e.title}</div>
          <div className="truncate text-sm text-muted-foreground">{e.company || "Unknown"}</div>
        </div>
      ))}
    </section>
  );
}

function JobRows({ jobs, detail, empty }: { jobs: Job[]; detail: (j: Job) => string; empty: string }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  if (!jobs.length) return <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>;
  const hidden = jobs.length - LIST_SIZE;
  return (
    <>
    <ul className="divide-y">
      {(showAll ? jobs : jobs.slice(0, LIST_SIZE)).map((j) => (
        <li key={j.id} {...rowLink(navigate, `/jobs/${j.id}`)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{j.title}</div>
            <div className="truncate text-sm text-muted-foreground">{j.company || "Unknown"}{via(j) && ` · via ${via(j)}`}</div>
          </div>
          <StatusBadge job={j} />
          <span className="w-28 text-right text-sm whitespace-nowrap text-muted-foreground">{detail(j)}</span>
        </li>
      ))}
    </ul>
    {hidden > 0 && (
      <div className="flex justify-center border-t py-2.5">
        <Button variant="ghost" size="sm" className="h-auto py-0 text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show Less" : `View More (${hidden})`}
        </Button>
      </div>
    )}
    </>
  );
}

function WeeklyBars({ counts }: { counts: { week: string; n: number }[] }) {
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <div className="flex h-32 items-end gap-2 px-4 pt-4 pb-3">
      {counts.map((c, i) => (
        <div key={c.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Week of ${formatDate(c.week)}: ${plural(c.n, "application")}`}>
          <span className="text-xs text-muted-foreground tabular-nums">{c.n}</span>
          <div className={i === counts.length - 1 ? "w-full rounded-sm bg-primary" : "w-full rounded-sm bg-muted-foreground/40"} style={{ height: `${(c.n / max) * 70}%`, minHeight: 2 }} />
          <span className="text-[11px] whitespace-nowrap text-muted-foreground">{new Date(`${c.week}T00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { search } = useLocation();
  const { data: jobs = [], isLoading } = useJobs();
  const { data: events = [] } = useEvents();
  const name = useProfile().data?.your_name;
  const todayIso = today();
  const nowTime = new Date().toTimeString().slice(0, 5);

  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const data = useMemo(() => {
    const followUp = jobs.filter(needsFollowUp).sort((a, b) => quietDays(b) - quietDays(a));
    // Same group as the Interviewing KPI; the freshest conversations first.
    const interviewing = jobs
      .filter((j) => isActive(j) && INTERVIEWING_STATUSES.has(j.status))
      .sort((a, b) => quietDays(a) - quietDays(b));
    const thisMonday = weekStart(todayIso);
    const weeks = Array.from({ length: WEEKS }, (_, i) =>
      new Date(Date.parse(thisMonday) - (WEEKS - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10));
    const weekly = weeks.map((week) => ({ week, n: jobs.filter((j) => j.applied_date && weekStart(j.applied_date) === week).length }));
    const recent = [...events].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, LIST_SIZE);
    const followUpsIn = (week: string) => events.filter((e) => e.type === "Follow-Up" && weekStart(e.date) === week).length;
    const followUps = { thisWeek: followUpsIn(thisMonday), lastWeek: followUpsIn(new Date(Date.parse(thisMonday) - 7 * 86_400_000).toISOString().slice(0, 10)) };
    const upcoming = events
      .filter((e) => TIMED_EVENT_TYPES.has(e.type) && (e.date > todayIso || (e.date === todayIso && (!e.time || e.time > nowTime))))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.id - b.id);
    return { upcoming, followUp, interviewing, weekly, recent, followUps, m: momentum(jobs, events, todayIso) };
  }, [jobs, events, todayIso]);

  // Old bookmarks like /?status=followup now live on /jobs.
  if (search) return <Navigate to={`/jobs${search}`} replace />;

  if (!isLoading && !jobs.length) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <title>Home | Application Tracker</title>
        <h1 className="text-xl font-semibold">Track your first application</h1>
        <p className="text-sm text-muted-foreground">Add a job and your follow-ups, streak, and weekly pace will show up here.</p>
        <AddJobDialog />
      </div>
    );
  }

  const { m, upcoming, followUps, followUp, interviewing, weekly, recent } = data;
  return (
    <div className="space-y-4">
      <title>Home | Application Tracker</title>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{name ? `Welcome back, ${name}` : "Home"}</h1>
        <AddJobDialog />
      </div>

      <UpcomingInterviews events={upcoming} />

      <div className="grid gap-4 sm:grid-cols-3">
        <HomeKpi label="Applied This Week" value={String(m.thisWeek.applications)}>
          {m.average ? `Average ${Number.isInteger(m.average.applications) ? m.average.applications : m.average.applications.toFixed(1)} a week` : "Your first week"}
        </HomeKpi>
        <HomeKpi label="Streak" value={plural(m.streak.current, "day")}>
          {m.streak.current ? "" : "Apply today to start one · "}Best {m.streak.best}
        </HomeKpi>
        <HomeKpi label="Follow-ups This Week" value={String(followUps.thisWeek)}>{followUps.lastWeek} last week</HomeKpi>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Follow Up" count={followUp.length}>
          <JobRows jobs={followUp} detail={(j) => `${quietDays(j)} days quiet`} empty="Nothing is waiting on a follow-up." />
        </Card>
        <Card title="Interviewing" count={interviewing.length}>
          <JobRows jobs={interviewing} detail={(j) => `${quietDays(j)} days quiet`} empty="No active interviews right now." />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Applications, last 8 weeks">
          <WeeklyBars counts={weekly} />
        </Card>
        <Card title="Recent activity" to="/activity" count={recent.length}>
          <ul className="divide-y">
            {recent.map((e) => (
              <li key={e.id}>
                <Link to={`/jobs/${e.job_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <span className="min-w-0 truncate"><span className="font-medium">{e.type}</span> · {e.company || e.title}{via(jobsById.get(e.job_id)) && ` · via ${via(jobsById.get(e.job_id))}`}</span>
                  <span className="whitespace-nowrap text-muted-foreground">{formatDate(e.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
