import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { type ActivityEvent } from "@/lib/api";
import { type Category, colorOf, weekdayCounts } from "@/lib/activity";

const PANELS: { category: Category; title: string; noun: string }[] = [
  { category: "applied", title: "Applications by Day", noun: "applications" },
  { category: "interview", title: "Interviews by Day", noun: "interviews" },
];

function Panel({ events, category, title, noun }: { events: ActivityEvent[] } & (typeof PANELS)[number]) {
  const data = weekdayCounts(events, category);
  const total = data.reduce((n, d) => n + d.count, 0);
  const max = Math.max(...data.map((d) => d.count));
  const min = Math.min(...data.map((d) => d.count));
  const color = colorOf(category);
  const names = (n: number) => data.filter((d) => d.count === n).map((d) => d.day).join(", ");

  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {total === 0 || max === min ? (
          <p className="text-sm text-muted-foreground">{total === 0 ? `No ${noun} yet.` : `Evenly spread across the week.`}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Most on <span className="font-medium text-foreground">{names(max)}</span> ({max}, {Math.round((max / total) * 100)}%) · fewest on{" "}
            <span className="font-medium text-foreground">{names(min)}</span> ({min})
          </p>
        )}
      </div>
      <BarChart responsive data={data} style={{ width: "100%", height: 180 }} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
        <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.4 }}
          formatter={(v) => [v, noun]}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
          itemStyle={{ color: "var(--foreground)" }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {/* The busiest day keeps full color; the rest fade back so it stands out. */}
          {data.map((d) => (
            <Cell key={d.day} fill={color} fillOpacity={total > 0 && d.count === max ? 1 : 0.35} />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
}

export default function WeekdayInsights({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {PANELS.map((p) => (
        <Panel key={p.category} events={events} {...p} />
      ))}
    </div>
  );
}
