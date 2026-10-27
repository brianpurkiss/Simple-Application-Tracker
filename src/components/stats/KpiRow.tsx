import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { fmtPct, type Kpis } from "@/lib/stats";
import { cn } from "@/lib/utils";

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const diff = now - before;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn("size-4", diff > 0 && "text-emerald-500", diff < 0 && "text-red-400")} />
      {now} this week vs {before} last
    </span>
  );
}

const days = (n: number | null) => (n === null ? "–" : `${n}d`);

export default function KpiRow({ k }: { k: Kpis }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi label="Applications" value={String(k.applications)}>
        <Delta now={k.thisWeek} before={k.lastWeek} />
      </Kpi>
      <Kpi label="Response rate" value={fmtPct(k.responseRate)}>Heard anything back</Kpi>
      <Kpi label="Interview rate" value={fmtPct(k.interviewRate)}>Reached a screen or interview</Kpi>
      <Kpi label="Active pipeline" value={String(k.active)}>
        {k.needFollowUp ? `${k.needFollowUp} need a follow-up` : "Nothing waiting on you"}
      </Kpi>
      <Kpi label="Typical wait" value={days(k.medianResponseDays)}>
        Median to first reply · {days(k.medianRejectionDays)} to rejection
      </Kpi>
    </div>
  );
}
