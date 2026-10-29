import { RGB } from "@/lib/colors";
import { formatDate } from "@/lib/format";
import { type Cohort, fmtPct } from "@/lib/stats";
import { cn } from "@/lib/utils";

// Shade a rate cell by how high it is, using the column's own hue.
const shade = (value: number | null, rgb: string) =>
  value ? { backgroundColor: `rgba(${rgb}, ${Math.min(0.6, value / 100)})` } : undefined;

export default function CohortTable({ cohorts }: { cohorts: Cohort[] }) {
  const cols: { key: "response" | "interview" | "multiInterview" | "rejected" | "ghosted"; label: string; rgb: string }[] = [
    { key: "response", label: "Replied", rgb: RGB.amber },
    { key: "interview", label: "Screen / 1st Interview", rgb: RGB.blue },
    { key: "multiInterview", label: "2nd+ Interviews", rgb: RGB.deepBlue },
    { key: "rejected", label: "Rejected", rgb: RGB.slate },
    { key: "ghosted", label: "Ghosted", rgb: RGB.stone },
  ];
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">By Application Week</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-2 font-normal">Week Of</th>
              <th className="px-2 text-right font-normal">Apps</th>
              {cols.map((c) => <th key={c.key} className="px-2 text-center font-normal">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((r) => (
              <tr key={r.week} className={cn(r.maturing && "opacity-60")}>
                <td className="px-2 py-1">{formatDate(r.week)}{r.maturing && <span className="text-muted-foreground"> · maturing</span>}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.apps}</td>
                {cols.map((c) => (
                  <td key={c.key} className="rounded px-2 py-1 text-center tabular-nums" style={shade(r[c.key], c.rgb)}>
                    {fmtPct(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
