import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { fmtPct, type Kpis } from "@/lib/stats";
import { cn } from "@/lib/utils";

export function Kpi({ label, value, children, className }: { label: string; value: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 sm:p-5", className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const diff = now - before;
  const pct = before > 0 ? Math.round((Math.abs(diff) / before) * 100) : null;
  const label = diff === 0 ? "0% past 7 days" : pct === null ? `${diff} new past 7 days` : `${pct}% past 7 days`;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn("size-4", diff > 0 && "text-emerald-500", diff < 0 && "text-muted-foreground")} />
      {label}
    </span>
  );
}

const days = (n: number | null) => (n === null ? "–" : `${n}d`);

export default function KpiRow({ k }: { k: Kpis }) {
  return (
    <div className="grid gap-4 max-sm:contents sm:grid-cols-2 lg:grid-cols-5">
      <Kpi label="Applications" value={String(k.applications)}>
        <Delta now={k.last7} before={k.prev7} />
      </Kpi>
      <Kpi label="Interviews" value={String(k.interviews)}>
        <Delta now={k.interviewsLast7} before={k.interviewsPrev7} />
      </Kpi>
      <Kpi label="Response Rate" value={fmtPct(k.responseRate)}>Heard anything back</Kpi>
      <Kpi label="Interview Rate" value={fmtPct(k.interviewRate)}>Reached a screen or interview</Kpi>
      <Kpi label="Typical Wait" value={days(k.medianResponseDays)} className="max-sm:col-span-2">
        Median to first reply · {days(k.medianRejectionDays)} to rejection
      </Kpi>
    </div>
  );
}
