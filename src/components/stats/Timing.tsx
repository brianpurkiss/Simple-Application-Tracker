import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, REJECTED_POST, REJECTED_PRE } from "@/lib/colors";
import { GHOSTED_DAYS } from "@/lib/options";
import type { SpanStats, TimingPoint } from "@/lib/stats";

const SERIES = [
  { key: "interview", label: "First Interview", dot: "bg-blue-500" },
  { key: "rejectedNoInterview", label: "Rejected, No Interview", dot: REJECTED_PRE.dot },
  { key: "rejected", label: "Rejected, Post Interview", dot: REJECTED_POST.dot },
] as const;

export default function Timing({ data, afterInterview }: { data: TimingPoint[]; afterInterview: SpanStats }) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">How Long Replies Take</h2>
          <p className="text-sm text-muted-foreground">Days from applying. Past {GHOSTED_DAYS} days silence counts as ghosted.</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${s.dot}`} />
              {s.label} <span className="tabular-nums text-muted-foreground">({data.reduce((n, d) => n + d[s.key], 0)})</span>
            </span>
          ))}
        </div>
      </div>
      <BarChart responsive data={data} style={{ width: "100%", height: 260 }} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
        <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.4 }}
          labelFormatter={(b) => `${b} days`}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
          itemStyle={{ color: "var(--foreground)" }}
        />
        <Bar dataKey="interview" name="First Interview" fill={CHART.interview} radius={[3, 3, 0, 0]} />
        <Bar dataKey="rejectedNoInterview" name="Rejected, No Interview" fill={REJECTED_PRE.hex} radius={[3, 3, 0, 0]} />
        <Bar dataKey="rejected" name="Rejected, Post Interview" fill={REJECTED_POST.hex} radius={[3, 3, 0, 0]} />
      </BarChart>
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium">First Interview to Rejection</h3>
        <p className="text-sm text-muted-foreground">Days from first interview to a formal rejection.</p>
        {afterInterview ? (
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              ["Min", afterInterview.min],
              ["Max", afterInterview.max],
              ["Avg", Math.round(afterInterview.avg * 10) / 10],
              ["Median", afterInterview.median],
              ["Roles", afterInterview.count],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No interviewed roles have been rejected yet.</p>
        )}
      </div>
    </div>
  );
}
