import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TimingPoint } from "@/lib/stats";

export default function Timing({ data }: { data: TimingPoint[] }) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">How long replies take</h2>
          <p className="text-sm text-muted-foreground">Days from applying. Past 21 days silence counts as ghosted.</p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-blue-500" />First contact</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-red-500" />Rejection</span>
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
        <Bar dataKey="response" name="First contact" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="rejection" name="Rejection" fill="#ef4444" radius={[3, 3, 0, 0]} />
      </BarChart>
    </div>
  );
}
