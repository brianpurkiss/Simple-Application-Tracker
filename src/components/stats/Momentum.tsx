import type { Momentum as MomentumStats } from "@/lib/insights";
import { Kpi } from "@/components/stats/KpiRow";
import { plural } from "@/lib/text";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function Momentum({ m }: { m: MomentumStats }) {
  const { thisWeek, average, streak } = m;
  const bestShare = m.best.applications ? Math.round((thisWeek.applications / m.best.applications) * 100) : null;
  const toGo = average ? Math.ceil(average.applications) - thisWeek.applications : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Application Streak" value={plural(streak.current, "day")}>
        {streak.current ? "Days in a row with an application" : "Apply today to start a new one"} · Best {streak.best}
        {m.weeksOnPace > 1 && <div>{m.weeksOnPace} weeks in a row at {m.paceTarget}+ a week</div>}
      </Kpi>
      <Kpi label="Applications This Week" value={String(thisWeek.applications)}>
        {average ? (toGo > 0 ? `${toGo} more to match your ${fmt(average.applications)}/week average` : `Ahead of your ${fmt(average.applications)}/week average`) : "Your first week"}
        <div>
          {plural(thisWeek.interviews, "interview")}
          {average && ` (average ${fmt(average.interviews)})`}
        </div>
      </Kpi>
      <Kpi label="Active Pipeline" value={String(m.pipeline.active)}>
        Still in play · {m.pipeline.interviewing} interviewing
      </Kpi>
      <Kpi label="Best Week" value={plural(m.best.applications, "application")}>
        {plural(m.best.interviews, "interview")} in your best interview week
        {bestShare !== null && <div>This week is {bestShare}% of your best</div>}
      </Kpi>
    </div>
  );
}
