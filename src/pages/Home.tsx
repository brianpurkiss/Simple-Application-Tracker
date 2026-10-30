import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddJobButton } from "@/components/AddJobButton";
import { StatusBadge } from "@/components/StatusBadge";
import { StreakTile } from "@/components/StreakTile";
import { WeekProgress } from "@/components/WeekProgress";
import { useEvents, useJobs, useProfile, type ActivityEvent, type Job } from "@/lib/api";
import { addDays, weekStart } from "@/lib/activity";
import { daysSince, formatDate, formatTime, relativeDay, today } from "@/lib/format";
import { nowTime } from "@/lib/clock";
import { isApplication, isGoingCold, isInterviewing, isScheduledDue, isWarmLead, needsFollowUp } from "@/lib/jobs";
import { momentum } from "@/lib/insights";
import { TIMED_EVENT_TYPES } from "@/lib/options";
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
          <span className="hidden sm:inline-flex"><StatusBadge job={j} /></span>
          <span className="shrink-0 text-right text-sm whitespace-nowrap sm:w-28 text-muted-foreground">{detail(j)}</span>
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
  const { data: allJobs = [], isLoading } = useJobs();
  const jobs = useMemo(() => allJobs.filter(isApplication), [allJobs]);
  const { data: events = [] } = useEvents();
  const name = useProfile().data?.your_name;
  const todayIso = today();
  const time = nowTime();

  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const data = useMemo(() => {
    const followUp = jobs.filter(needsFollowUp).sort((a, b) => Number(isScheduledDue(b)) - Number(isScheduledDue(a)) || quietDays(b) - quietDays(a));
    // Same group as the Interviewing KPI and the Jobs list chip; the freshest conversations first.
    const interviewing = jobs
      .filter((j) => isApplication(j) && isInterviewing(j))
      .sort((a, b) => quietDays(a) - quietDays(b));
    // Warm leads you're still working, quietest first; Going Cold are the oldest unanswered applications.
    const warm = jobs.filter(isWarmLead).sort((a, b) => quietDays(b) - quietDays(a));
    const cold = jobs.filter(isGoingCold).sort((a, b) => quietDays(b) - quietDays(a));
    const thisMonday = weekStart(todayIso);
    const weeks = Array.from({ length: WEEKS }, (_, i) =>
      addDays(thisMonday, -(WEEKS - 1 - i) * 7));
    const weekly = weeks.map((week) => ({ week, n: jobs.filter((j) => j.applied_date && weekStart(j.applied_date) === week).length }));
    const recent = [...events].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, LIST_SIZE);
    const upcoming = events
      .filter((e) => TIMED_EVENT_TYPES.has(e.type) && (e.date > todayIso || (e.date === todayIso && !!e.time && e.time > time)))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.id - b.id);
    return { upcoming, followUp, interviewing, warm, cold, weekly, recent, m: momentum(jobs, events, todayIso) };
  }, [jobs, events, todayIso, time]);

  // Old bookmarks like /?status=followup now live on /jobs.
  if (search) return <Navigate to={`/jobs${search}`} replace />;

  if (!isLoading && !jobs.length) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <title>Home | Application Tracker</title>
        <h1 className="text-xl font-semibold">Track your first application</h1>
        <p className="text-sm text-muted-foreground">Add a job and your follow-ups, streak, and weekly pace will show up here.</p>
        <AddJobButton />
      </div>
    );
  }

  const { m, upcoming, followUp, interviewing, warm, cold, weekly, recent } = data;
  return (
    <div className="space-y-4">
      <title>Home | Application Tracker</title>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{name ? `Welcome back, ${name}` : "Home"}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" title="Your job board links (G then B)">
            <Link to="/boards"><Globe /> Job Boards</Link>
          </Button>
          <AddJobButton />
        </div>
      </div>

      <UpcomingInterviews events={upcoming} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeekProgress done={m.thisWeek.applications} target={m.paceTarget} previousBest={m.previousBest} average={m.average?.applications ?? null} />
        <StreakTile current={m.streak.current} best={m.streak.best} days={m.recentDays} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Follow Up" titleTo={FOLLOW_UP} count={followUp.length}>
          <JobRows jobs={followUp} detail={(j) => (isScheduledDue(j) ? `Scheduled ${formatDate(j.follow_up_on)}` : `${quietDays(j)} days quiet`)} empty="🎉 Nothing is waiting on a follow-up." />
        </Card>
        <Card title="Interviewing" titleTo="/jobs?status=interviewing" count={interviewing.length}>
          <JobRows jobs={interviewing} detail={(j) => `${quietDays(j)} days quiet`} empty={`No active interviews yet${name ? `, ${name}` : ""}. Reach out to a few of your leads to get conversations started.`} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Warm Leads" titleTo="/jobs?status=warm" count={warm.length}>
          <JobRows jobs={warm} detail={(j) => `${quietDays(j)} days quiet`} empty="No referrals or recruiter leads in play." />
        </Card>
        <Card title="Going Cold" titleTo="/jobs?status=cold" count={cold.length}>
          <JobRows jobs={cold} detail={(j) => `${quietDays(j)} days quiet`} empty="🎉 Nothing is waiting on a reply." />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
