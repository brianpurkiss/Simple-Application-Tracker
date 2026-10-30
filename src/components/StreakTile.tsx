import { formatDate, today } from "@/lib/format";
import { plural } from "@/lib/text";
import { cn } from "@/lib/utils";

const MILESTONES = [3, 7, 14, 30, 60, 100];

// The last two weeks as dots, so a streak looks like something you can keep building.
export function StreakTile({ current, best, days, children }: { current: number; best: number; days: { date: string; n: number }[]; children?: React.ReactNode }) {
  const todayIso = today();
  const next = MILESTONES.find((n) => n > current);
  const hint = !current
    ? "Apply today to start one."
    : next ? `${plural(next - current, "more day")} to a ${next}-day streak.` : "Legendary streak!";
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="text-3xl font-semibold tabular-nums">{plural(current, "day")}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium">Streak <span className="font-normal text-muted-foreground">· Best {best}</span></div>
          <div className="text-sm text-muted-foreground">{hint}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5" aria-label="Applications over the last 14 days">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${formatDate(d.date)}: ${plural(d.n, "application")}`}
            className={cn(
              "h-2.5 flex-1 rounded-full",
              d.n ? "bg-primary" : d.date === todayIso ? "border border-dashed border-primary bg-transparent" : "bg-muted",
            )}
          />
        ))}
      </div>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
