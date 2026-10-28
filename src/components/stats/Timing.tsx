import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TimingPoint } from "@/lib/stats";

const SERIES = [
  { key: "interview", label: "First Interview", dot: "bg-blue-500" },
  { key: "rejectedNoInterview", label: "Rejected, No Interview", dot: "bg-red-400" },
  { key: "rejected", label: "Rejected", dot: "bg-red-600" },
] as const;

export default function Timing({ data }: { data: TimingPoint[] }) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">How Long Replies Take</h2>
          <p className="text-sm text-muted-foreground">Days from applying. Past 21 days silence counts as ghosted.</p>
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
        <Bar dataKey="interview" name="First Interview" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="rejectedNoInterview" name="Rejected, No Interview" fill="#f87171" radius={[3, 3, 0, 0]} />
        <Bar dataKey="rejected" name="Rejected" fill="#dc2626" radius={[3, 3, 0, 0]} />
      </BarChart>
    </div>
  );
}
