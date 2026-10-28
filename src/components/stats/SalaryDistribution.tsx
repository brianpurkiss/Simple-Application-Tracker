import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { PillToggle } from "@/components/ui/pill-toggle";
import type { Job } from "@/lib/api";
import { reachedInterview } from "@/lib/jobs";
import { k, salaryCurve } from "@/lib/salary";

const STEP = 5000;
const SMOOTHING = 10_000; // Gaussian sigma in dollars
const round = (n: number) => Math.round(n / 1000) * 1000;

// Where salaries cluster. All roles by default; the Interviewed button narrows it to roles that reached an interview.
export default function SalaryDistribution({ jobs }: { jobs: Job[] }) {
  const [interviewed, setInterviewed] = useState(false);
  const [raw, setRaw] = useState(false);
  const key = raw ? "count" : "smooth";

  const curve = useMemo(
    () => salaryCurve(interviewed ? jobs.filter(reachedInterview) : jobs, STEP, 0.05, raw ? 0 : SMOOTHING),
    [jobs, interviewed, raw],
  );

  // Round labels on the axis.
  const ticks = useMemo(() => {
    const lo = curve.points[0]?.salary ?? 0;
    const hi = curve.points.at(-1)?.salary ?? 0;
    const every = hi - lo > 200_000 ? 50_000 : hi - lo > 100_000 ? 25_000 : 10_000;
    const out: number[] = [];
    for (let t = Math.ceil(lo / every) * every; t <= hi; t += every) out.push(t);
    return out;
  }, [curve]);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Salary Distribution</h2>
          <p className="text-sm text-muted-foreground">
            {curve.jobCount
              ? `${curve.jobCount} role${curve.jobCount === 1 ? "" : "s"} · ${k(curve.low!)} low · ${k(round(curve.mean!))} mean · ${k(curve.high!)} high · ${curve.openEnded} without range`
              : interviewed
                ? "No interviewed roles have a salary yet."
                : "Add salaries to roles to see the distribution."}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <PillToggle pressed={interviewed} onClick={() => setInterviewed((v) => !v)}>Interviewed</PillToggle>
          <PillToggle pressed={raw} onClick={() => setRaw((v) => !v)}>Raw</PillToggle>
        </div>
      </div>
      {curve.jobCount > 0 && (
        <AreaChart responsive data={curve.points} style={{ width: "100%", height: 260 }} margin={{ top: 8, right: 16, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="fill-salary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="salary" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={k} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
          <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(s) => k(Number(s))}
            formatter={(v) => [raw ? v : Number(v).toFixed(1), raw ? "Roles whose range includes this" : "Smoothed roles"]}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
            itemStyle={{ color: "var(--foreground)" }}
          />
          {curve.peak != null && <ReferenceLine x={curve.peak} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
          <Area type="monotone" dataKey={key} name="Roles" stroke="#3b82f6" strokeWidth={2} isAnimationActive={false} fill="url(#fill-salary)" />
        </AreaChart>
      )}
    </div>
  );
}
