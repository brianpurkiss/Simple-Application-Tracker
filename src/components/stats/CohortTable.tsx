import { formatDate } from "@/lib/format";
import { type Cohort, fmtPct } from "@/lib/stats";
import { cn } from "@/lib/utils";

// Shade a rate cell by how high it is, using the column's own hue.
const shade = (value: number | null, rgb: string) =>
  value ? { backgroundColor: `rgba(${rgb}, ${Math.min(0.6, value / 100)})` } : undefined;

export default function CohortTable({ cohorts }: { cohorts: Cohort[] }) {
  const cols: { key: "response" | "interview" | "rejected" | "ghosted"; label: string; rgb: string }[] = [
    { key: "response", label: "Replied", rgb: "245, 158, 11" },
    { key: "interview", label: "Interview", rgb: "59, 130, 246" },
    { key: "rejected", label: "Rejected", rgb: "239, 68, 68" },
    { key: "ghosted", label: "Ghosted", rgb: "163, 163, 163" },
  ];
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">By Application Week</h2>
        <p className="text-sm text-muted-foreground">How each week's applications turned out. Recent weeks are still maturing.</p>
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
