import { fmtPct, pct, type Outcome } from "@/lib/stats";

export default function OutcomeBar({ outcomes }: { outcomes: Outcome[] }) {
  const total = outcomes.reduce((sum, o) => sum + o.count, 0);
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">Where Applications Ended Up</h2>
      </div>
      <div className="flex h-5 overflow-hidden rounded-full bg-muted">
        {outcomes.filter((o) => o.count).map((o) => (
          <div key={o.key} title={`${o.label}: ${o.count}`} style={{ width: `${(o.count / total) * 100}%`, backgroundColor: o.color }} />
        ))}
      </div>
      <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {outcomes.map((o) => (
          <li key={o.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
            <span className="flex-1">{o.label}</span>
            <span className="tabular-nums">
              <span className="font-medium">{o.count}</span>
              <span className="text-muted-foreground"> · {fmtPct(pct(o.count, total))}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
