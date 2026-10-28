import { CHART } from "@/lib/colors";
import { fmtPct, type FunnelStep } from "@/lib/stats";

const COLORS = [CHART.applied, CHART.applied, CHART.interview, CHART.deepInterview, CHART.offer];
const H = 100;
const MIN = 4;

export default function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = steps[0]?.count || 1;
  const heights = steps.map((s) => Math.max((s.count / max) * H, MIN));
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">Funnel</h2>
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const left = heights[i];
          const right = i < steps.length - 1 ? heights[i + 1] : left;
          const pts = [
            [0, (H - left) / 2],
            [100, (H - right) / 2],
            [100, (H + right) / 2],
            [0, (H + left) / 2],
          ]
            .map((p) => p.join(","))
            .join(" ");
          return (
            <div key={s.label} className="min-w-0">
              <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-40 w-full">
                <polygon points={pts} fill={COLORS[i]} stroke={COLORS[i]} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="mt-2 px-2 text-center">
                <div className="text-2xl font-semibold tabular-nums">{s.count}</div>
                <div className="truncate text-sm">{s.label}</div>
                {i > 0 && <div className="text-xs text-muted-foreground">{fmtPct(s.ofTotal)} of total</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
