import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/lib/colors";
import type { CumulativePoint } from "@/lib/insights";

const SERIES = [
  { key: "applications", label: "Applications", color: CHART.applied },
  { key: "replies", label: "Replies", color: CHART.reply },
  { key: "interviews", label: "Interviews", color: CHART.interview },
] as const;

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function PipelineCumulative({ data }: { data: CumulativePoint[] }) {
  if (data.length < 2) return null;
  const last = data[data.length - 1];
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Total Progress</h2>
          <p className="text-sm text-muted-foreground">Running totals. Every week the lines only go up.</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label} <span className="tabular-nums text-muted-foreground">({last[s.key]})</span>
            </span>
          ))}
        </div>
      </div>
      <AreaChart responsive data={data} style={{ width: "100%", height: 260 }} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="week" tickFormatter={shortDate} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
        <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip
          labelFormatter={(w) => `Through week of ${shortDate(String(w))}`}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
          itemStyle={{ color: "var(--foreground)" }}
        />
        {SERIES.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
        ))}
      </AreaChart>
    </div>
  );
}
