import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AddJobDialog } from "@/components/AddJobDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { useEvents, useJobs, useProfile, type ActivityEvent, type Job } from "@/lib/api";
import { addDays, weekStart } from "@/lib/activity";
import { daysSince, formatDate, formatTime, relativeDay, today } from "@/lib/format";
import { isActive, needsFollowUp } from "@/lib/jobs";
import { momentum } from "@/lib/insights";
import { INTERVIEWING_STATUSES, TIMED_EVENT_TYPES } from "@/lib/options";
import { EVENT_COLORS } from "@/lib/colors";
import { plural } from "@/lib/text";
import { cn } from "@/lib/utils";
import { rowLink } from "@/lib/rowLink";
import { FOLLOW_UP } from "@/lib/shortcuts";

const WEEKS = 8;
const LIST_SIZE = 5;

// The recruiting agency, when one is recorded.
const via = (j: Pick<Job, "agency_name"> | undefined) => j?.agency_name || "";
const quietDays = (j: Job) => daysSince(j.last_activity ?? j.applied_date) ?? 0;

function Card({ title, count, to, titleTo, children }: { title: string; count?: number; to?: string; titleTo?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-medium">
          {titleTo ? <Link to={titleTo} className="hover:underline">{title}</Link> : title}
          {count ? <span className="ml-2 text-sm text-muted-foreground">{count}</span> : null}
        </h2>
        {to && count ? <Link to={to} className="text-sm text-muted-foreground hover:text-foreground">View all</Link> : null}
      </div>
      {children}
    </section>
  );
}

// Applications so far this week against the usual weekly pace, as a bar along the bottom of the card.
const KEEP_GOING = [
  (n: number) => `Nice momentum. ${n} more to match your average. Keep at it!`,
  (n: number) => `You're on the board! ${n} more to match your average.`,
  (n: number) => `Every application counts. ${n} more to match your average.`,
  (n: number) => `Keep it rolling: ${n} more to match your average.`,
  (n: number) => `Progress is progress. ${n} more to match your average. Keep at it!`,
  (n: number) => `You're building something. ${n} more to match your average.`,
];

function weekMessage(done: number, target: number, previousBest: number, seed: number) {
  const left = target - done;
  if (done > 0 && done >= previousBest && previousBest > 0) return "Your best week yet! 🎉";
  if (done >= target) return "Target beaten. Everything now is a bonus.";
  if (done === 0) return "Fresh week, fresh start. Just one application gets you moving.";
  if (left === 1) return "So close! Just 1 more to match your average.";
  return KEEP_GOING[seed % KEEP_GOING.length](left);
}

function WeekProgress({ done, target, previousBest, average }: { done: number; target: number; previousBest: number; average: number | null }) {
  const reached = done >= target;
  // Stable while the page is open; shifts as the week and your count change.
  const seed = Math.floor(Date.parse(weekStart(today())) / 604_800_000) + done;
  const message = weekMessage(done, target, previousBest, seed);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="shrink-0 text-3xl font-semibold whitespace-nowrap tabular-nums">{done}<span className="text-xl text-muted-foreground"> / {target}</span></div>
        <div className="min-w-0">
          <div className="text-sm font-medium">Applied This Week</div>
          <div className="text-sm text-muted-foreground">{message}</div>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Applications this week"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(done, target)}
        title={average ? `Average ${Number.isInteger(average) ? average : average.toFixed(1)} a week` : undefined}
        className="h-1.5 bg-muted"
      >
        <div className={cn("h-full transition-[width] duration-500", reached ? "bg-emerald-500" : "bg-primary")} style={{ width: `${Math.min(100, (done / target) * 100)}%` }} />
      </div>
    </div>
  );
}

const MILESTONES = [3, 7, 14, 30, 60, 100];

// The last two weeks as dots, so a streak looks like something you can keep building.
function StreakTile({ current, best, days }: { current: number; best: number; days: { date: string; n: number }[] }) {
  const todayIso = today();
  const next = MILESTONES.find((n) => n > current);
  const hint = !current
    ? "Apply today to start one."
    : next ? `${plural(next - current, "more day")} to a ${next}-day streak.` : "Legendary streak!";
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="text-3xl font-semibold tabular-nums">{plural(current, "day")}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium">Streak <span className="font-normal text-muted-foreground">· Best {best}</span></div>
          <div className="text-sm text-muted-foreground">{hint}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5" aria-label="Applications over the last 14 days">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${formatDate(d.date)}: ${plural(d.n, "application")}`}
            className={cn(
              "h-2.5 flex-1 rounded-full",
              d.n ? "bg-primary" : d.date === todayIso ? "border border-dashed border-primary bg-transparent" : "bg-muted",
            )}
          />
        ))}
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

function WeeklyBars({ counts, target }: { counts: { week: string; n: number }[]; target: number }) {
  const max = Math.max(1, target, ...counts.map((c) => c.n));
  const scale = (n: number) => `${(n / max) * 80}%`;
  return (
    <div className="px-4 pt-4 pb-3">
      <div className="relative h-24">
        <div
          className="absolute inset-x-0 border-t border-dashed border-primary/60"
          style={{ bottom: scale(target) }}
        />
        <div className="flex h-full items-end gap-2">
          {counts.map((c, i) => (
            <div key={c.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Week of ${formatDate(c.week)}: ${plural(c.n, "application")}`}>
              <span className="text-xs text-muted-foreground tabular-nums">{c.n}</span>
              <div className={i === counts.length - 1 ? "w-full rounded-sm bg-primary" : "w-full rounded-sm bg-muted-foreground/40"} style={{ height: scale(c.n), minHeight: 2 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-2">
        {counts.map((c) => (
          <span key={c.week} className="flex-1 text-center text-[11px] whitespace-nowrap text-muted-foreground">{new Date(`${c.week}T00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="w-5 border-t border-dashed border-primary/60" />
        Weekly average ({target})
      </div>
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
      addDays(thisMonday, -(WEEKS - 1 - i) * 7));
    const weekly = weeks.map((week) => ({ week, n: jobs.filter((j) => j.applied_date && weekStart(j.applied_date) === week).length }));
    const recent = [...events].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, LIST_SIZE);
    const upcoming = events
      .filter((e) => TIMED_EVENT_TYPES.has(e.type) && (e.date > todayIso || (e.date === todayIso && (!e.time || e.time > nowTime))))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.id - b.id);
    return { upcoming, followUp, interviewing, weekly, recent, m: momentum(jobs, events, todayIso) };
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

  const { m, upcoming, followUp, interviewing, weekly, recent } = data;
  return (
    <div className="space-y-4">
      <title>Home | Application Tracker</title>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{name ? `Welcome back, ${name}` : "Home"}</h1>
        <AddJobDialog />
      </div>

      <UpcomingInterviews events={upcoming} />

      <div className="grid gap-4 sm:grid-cols-2">
        <WeekProgress done={m.thisWeek.applications} target={m.paceTarget} previousBest={m.previousBest} average={m.average?.applications ?? null} />
        <StreakTile current={m.streak.current} best={m.streak.best} days={m.recentDays} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Follow Up" titleTo={FOLLOW_UP} count={followUp.length}>
          <JobRows jobs={followUp} detail={(j) => (j.follow_up_on ? `Scheduled ${formatDate(j.follow_up_on)}` : `${quietDays(j)} days quiet`)} empty="Nothing is waiting on a follow-up." />
        </Card>
        <Card title="Interviewing" titleTo="/jobs?status=interviewing" count={interviewing.length}>
          <JobRows jobs={interviewing} detail={(j) => `${quietDays(j)} days quiet`} empty="No active interviews right now." />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Applications, last 8 weeks">
          <WeeklyBars counts={weekly} target={m.paceTarget} />
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
