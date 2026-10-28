import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/api";
import { type Combo, fmtPct, interviewed, type Metric, type Tier } from "@/lib/stats";
import { k } from "@/lib/salary";
import { formatDate } from "@/lib/format";
import { statusLabel } from "@/lib/jobs";
import type { Phase } from "@/hooks/useSettled";
import { cn } from "@/lib/utils";

const tierStyle = (metric: Metric): Record<Tier, { label: string; className: string } | null> => ({
  standout: { label: "Standout", className: "bg-emerald-500/15 text-emerald-400" },
  watch: { label: "Promising", className: metric === "interview" ? "bg-blue-500/15 text-blue-400" : "bg-slate-500/15 text-slate-300" },
  under: { label: "Room to Grow", className: "bg-slate-500/15 text-slate-300" },
  low: { label: "Low Volume", className: "bg-muted text-muted-foreground" },
  even: null,
});

// Bars use a fixed 0–50% axis: real rates rarely pass 50%, so a 0–100% axis leaves every bar cramped at the left.
// Rejection rates run much higher, so that view uses the full 0–100% axis.
const barMax = (metric: Metric) => (metric === "interview" ? 50 : 100);
const TICKS: Record<Metric, number[]> = { interview: [10, 20, 30, 40], rejected: [20, 40, 60, 80] };

export const fmtLift = (lift: number | null) => (lift === null ? "–" : `${lift.toFixed(1)}×`);

function companyLabel(j: Job) {
  const via = j.agency_name || (j.applied_via === "Recruiting Agency" ? "recruiter" : "");
  return (
    <>
      {j.company || (via && <span className="text-muted-foreground italic">Unknown</span>)}
      {via && <span className="text-muted-foreground"> · via {via}</span>}
    </>
  );
}

export default function ComboRow({ combo, metric, baseline, index = 0, phase = "in" }: { combo: Combo; metric: Metric; baseline: number; index?: number; phase?: Phase }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
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
  const tier = tierStyle(metric)[combo.tier];
  const isInterview = metric === "interview";
  const max = barMax(metric);
  const barPct = (rate: number | null) => `${(Math.min(rate ?? 0, max) / max) * 100}%`;
  const hit = combo.hits;
  const others = combo.jobs.filter((j) => !hit.includes(j));
  const listed = showAll ? [...hit, ...others] : hit;
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
            <span className="font-medium">{fmtPct(metric === "interview" ? combo.interviewRate : combo.rejectedRate)}</span>
            <span className="text-muted-foreground">
              {" "}
              · {metric === "interview" ? combo.interviews : combo.rejected}/{combo.n} · {fmtLift(combo.lift)} avg
              {combo.interviewSalaryMean !== null && ` · ${k(Math.round(combo.interviewSalaryMean))} Mean`}
              {combo.interviewSalaryMax !== null && ` · ${k(combo.interviewSalaryMax)} Max`}
            </span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-muted">
          {TICKS[metric].map((t) => (
            <div key={t} className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${(t / max) * 100}%` }} />
          ))}
          <div className={cn("absolute inset-y-0 left-0 rounded-full", isInterview ? "bg-blue-500" : "bg-slate-500", barMotion)} style={{ ...barDelay, width: filled ? barPct(isInterview ? combo.interviewRate : combo.rejectedRate) : 0 }} />
          <div
            className={cn("absolute -inset-y-0.5 w-0.5 bg-foreground/60 transition-opacity duration-200 motion-reduce:transition-none", fadeOut)}
            style={{ left: barPct(baseline * 100) }}
            title={`Average: ${Math.round(baseline * 100)}%`}
          />
        </div>
      </button>
      {open && (
        <ul className="ml-5 divide-y rounded-md border text-sm">
          {listed.map((j) => (
            <li key={j.id}>
              <Link to={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-3 py-1.5 hover:bg-accent/50">
                <span className="truncate">{companyLabel(j)} <span className="text-muted-foreground">· {j.title} · {j.resume_version}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(j)} · {formatDate(j.applied_date)}</span>
              </Link>
            </li>
          ))}
          {!hit.length && !showAll && <li className="px-3 py-1.5 text-muted-foreground">{isInterview ? "No interviews yet." : "No rejections or ghosting yet."}</li>}
          {others.length > 0 && (
            <li className="flex justify-center py-1">
              <Button variant="ghost" size="sm" className="text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show Less" : `View More (${others.length})`}
              </Button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
