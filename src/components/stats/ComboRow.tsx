import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { type Combo, fmtPct, type Metric, type Tier } from "@/lib/stats";
import { k } from "@/lib/salary";
import { formatDate, statusLabel } from "@/lib/format";
import type { Phase } from "@/lib/useSettled";
import { cn } from "@/lib/utils";

const TIER_STYLE: Record<Tier, { label: string; className: string } | null> = {
  standout: { label: "Standout", className: "bg-emerald-500/15 text-emerald-400" },
  watch: { label: "Promising", className: "bg-blue-500/15 text-blue-400" },
  under: { label: "Below Average", className: "bg-red-500/15 text-red-400" },
  low: { label: "Low Volume", className: "bg-muted text-muted-foreground" },
  even: null,
};

// Bars use a fixed 0–50% axis: real rates rarely pass 50%, so a 0–100% axis leaves every bar cramped at the left.
export const BAR_MAX = 50;
const TICKS = [10, 20, 30, 40];
const barPct = (rate: number | null) => `${(Math.min(rate ?? 0, BAR_MAX) / BAR_MAX) * 100}%`;

export const fmtLift = (lift: number | null) => (lift === null ? "–" : `${lift.toFixed(1)}×`);

export default function ComboRow({ combo, metric, baseline, index = 0, phase = "in" }: { combo: Combo; metric: Metric; baseline: number; index?: number; phase?: Phase }) {
  const [open, setOpen] = useState(false);
  // Mount with empty bars, then fill on the next frame so a new row animates in too.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const filled = mounted && phase === "in";
  const fadeOut = phase === "out" && "opacity-0";
  const barMotion = cn(
    "transition-[width] ease-out motion-reduce:transition-none",
    filled ? "duration-500" : "duration-200",
  );
  const barDelay = { transitionDelay: filled ? `${Math.min(index * 30, 300)}ms` : "0ms" };
  const tier = TIER_STYLE[combo.tier];
  return (
    <li className={cn("space-y-1", combo.tier === "low" && "opacity-50")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="block w-full space-y-1 text-left" aria-expanded={open}>
        <div className={cn("flex items-baseline justify-between gap-2 text-sm transition-opacity duration-200 motion-reduce:transition-none", fadeOut)}>
          <span className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
            <span className="truncate">
              {combo.parts.map((p, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-muted-foreground"> + </span>}
                  <span className={i === 0 ? "font-medium" : undefined}>{p}</span>
                </span>
              ))}
            </span>
            {tier && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs", tier.className)}>{tier.label}</span>}
          </span>
          <span className="shrink-0 tabular-nums">
            <span className="font-medium">{fmtPct(metric === "interview" ? combo.interviewRate : combo.responseRate)}</span>
            <span className="text-muted-foreground">
              {" "}
              · {metric === "interview" ? combo.interviews : combo.replied}/{combo.n} · {fmtLift(combo.lift)} avg
              {combo.interviewSalaryMean !== null && ` · ${k(Math.round(combo.interviewSalaryMean))} Mean`}
              {combo.interviewSalaryMax !== null && ` · ${k(combo.interviewSalaryMax)} Max`}
            </span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-muted">
          {TICKS.map((t) => (
            <div key={t} className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${(t / BAR_MAX) * 100}%` }} />
          ))}
          <div className={cn("absolute inset-y-0 left-0 rounded-full bg-amber-500/40", barMotion)} style={{ ...barDelay, width: filled ? barPct(combo.responseRate) : 0 }} />
          <div className={cn("absolute inset-y-0 left-0 rounded-full bg-blue-500", barMotion)} style={{ ...barDelay, width: filled ? barPct(combo.interviewRate) : 0 }} />
          <div
            className={cn("absolute -inset-y-0.5 w-0.5 bg-foreground/60 transition-opacity duration-200 motion-reduce:transition-none", fadeOut)}
            style={{ left: barPct(baseline * 100) }}
            title={`Average: ${Math.round(baseline * 100)}%`}
          />
        </div>
      </button>
      {open && (
        <ul className="ml-5 divide-y rounded-md border text-sm">
          {combo.jobs.map((j) => (
            <li key={j.id}>
              <Link to={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-3 py-1.5 hover:bg-accent/50">
                <span className="truncate">{j.company} <span className="text-muted-foreground">· {j.title} · {j.resume_version}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(j)} · {formatDate(j.applied_date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
