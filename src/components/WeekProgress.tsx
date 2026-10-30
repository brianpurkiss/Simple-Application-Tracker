import { weekStart } from "@/lib/activity";
import { today } from "@/lib/format";
import { cn } from "@/lib/utils";

// Applications so far this week against the usual weekly pace, as a bar along the bottom of the card.
const KEEP_GOING = [
  (n: number) => `Nice momentum. ${n} more to match your average. Keep at it!`,
  (n: number) => `You're on the board! ${n} more to match your average.`,
  (n: number) => `Every application counts. ${n} more to match your average.`,
  (n: number) => `Keep it rolling: ${n} more to match your average.`,
  (n: number) => `Progress is progress. ${n} more to match your average. Keep at it!`,
  (n: number) => `You're building something. ${n} more to match your average.`,
];

function weekMessage(done: number, target: number, previousBest: number, seed: number) {
  const left = target - done;
  if (done > 0 && done >= previousBest && previousBest > 0) return "Your best week yet! 🎉";
  if (done >= target) return "Target beaten. Everything now is a bonus.";
  if (done === 0) return "Fresh week, fresh start. Just one application gets you moving.";
  if (left === 1) return "So close! Just 1 more to match your average.";
  return KEEP_GOING[seed % KEEP_GOING.length](left);
}

export function WeekProgress({ done, target, previousBest, average }: { done: number; target: number; previousBest: number; average: number | null }) {
  const reached = done >= target;
  // Stable while the page is open; shifts as the week and your count change.
  const seed = Math.floor(Date.parse(weekStart(today())) / 604_800_000) + done;
  const message = weekMessage(done, target, previousBest, seed);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="shrink-0 text-3xl font-semibold whitespace-nowrap tabular-nums">{done}<span className="text-xl text-muted-foreground"> / {target}</span></div>
        <div className="min-w-0">
          <div className="text-sm font-medium">Applied This Week</div>
          <div className="text-sm text-muted-foreground">{message}</div>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Applications this week"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(done, target)}
        title={average ? `Average ${Number.isInteger(average) ? average : average.toFixed(1)} a week` : undefined}
        className="h-1.5 bg-muted"
      >
        <div className={cn("h-full transition-[width] duration-500", reached ? "bg-emerald-500" : "bg-primary")} style={{ width: `${Math.min(100, (done / target) * 100)}%` }} />
      </div>
    </div>
  );
}
