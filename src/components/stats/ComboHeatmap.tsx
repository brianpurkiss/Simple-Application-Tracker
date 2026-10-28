import { useMemo } from "react";
import { comboBy, type DimValues, fmtPct, type Metric, type PerfDim } from "@/lib/stats";
import type { Job } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ComboHeatmap({ jobs, rowDim, colDim, values, metric, minSample, minAge, groupVersions, ghostDays }: {
  ghostDays: number;
  groupVersions: boolean;
  jobs: Job[];
  rowDim: PerfDim;
  colDim: PerfDim;
  values: DimValues;
  metric: Metric;
  minSample: number;
  minAge: number;
}) {
  const { combos } = useMemo(() => comboBy(jobs, [rowDim, colDim], { values, metric, minSample, minAge, groupVersions, ghostDays }), [jobs, rowDim, colDim, values, metric, minSample, minAge, groupVersions, ghostDays]);
  const rows = [...new Set(combos.map((c) => c.parts[0]))].sort();
  const cols = [...new Set(combos.map((c) => c.parts[1]))].sort();
  const cell = new Map(combos.map((c) => [c.parts.join("\u0000"), c]));
  const max = Math.max(0.01, ...combos.filter((c) => c.tier !== "low").map((c) => (metric === "interview" ? c.interviewRate : c.rejectedRate) ?? 0)) / 100;

  if (!combos.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c} className="px-2 pb-1 text-left text-xs font-normal text-muted-foreground">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th className="whitespace-nowrap pr-2 text-left font-medium">{r}</th>
              {cols.map((c) => {
                const combo = cell.get(`${r}\u0000${c}`);
                if (!combo) return <td key={c} className="rounded bg-muted/30" />;
                const rate = (metric === "interview" ? combo.interviewRate : combo.rejectedRate) ?? 0;
                const low = combo.tier === "low";
                return (
                  <td
                    key={c}
                    title={`${r} + ${c}: ${rate}% of ${combo.n}`}
                    className={cn("rounded px-2 py-1.5 text-center tabular-nums", low && "text-muted-foreground opacity-60", combo.tier === "standout" && "ring-1 ring-emerald-400")}
                    style={{ backgroundColor: low ? "var(--muted)" : `rgb(${metric === "interview" ? "59 130 246" : "249 115 22"} / ${0.12 + 0.55 * (rate / 100 / max)})` }}
                  >
                    {fmtPct(rate)} <span className="text-xs text-muted-foreground">·{combo.n}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
