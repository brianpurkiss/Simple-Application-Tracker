import { type Combo, fmtPct, type Metric } from "@/lib/stats";
import { fmtLift } from "./ComboRow";

const Card = ({ combo, metric, tone, fade }: { combo: Combo; metric: Metric; tone: "good" | "bad"; fade?: string }) => (
  <div className={`rounded-lg border p-4 ${tone === "good" ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-500/30 bg-slate-500/5"}`}>
    <div className={fade}>
      <div className={`text-xs uppercase tracking-wide ${tone === "good" ? "text-emerald-400" : "text-slate-400"}`}>
        {tone === "good" ? "Standout" : "Room to Grow"}
      </div>
      <div className="mt-1 font-medium">{combo.parts.join(" + ")}</div>
      <div className="mt-1 text-sm tabular-nums">
        <span className="text-lg font-semibold">{fmtPct(metric === "interview" ? combo.interviewRate : combo.rejectedRate)}</span>
        <span className="text-muted-foreground">
          {" "}
          {metric === "interview" ? "interview" : "rejected or ghosted"} · {fmtLift(combo.lift)} average · {combo.n} apps
        </span>
      </div>
    </div>
  </div>
);

// `fade` is applied to the text only, so the card boxes stay put while their contents fade.
export default function Highlights({ combos, metric, baseline, fade }: { combos: Combo[]; metric: Metric; baseline: number; fade?: string }) {
  const score = (c: Combo) => (metric === "interview" ? c.lo : -c.hi);
  const good = combos.filter((c) => c.tier === "standout").sort((a, b) => score(b) - score(a)).slice(0, 3);
  const bad = combos.filter((c) => c.tier === "under").sort((a, b) => (metric === "interview" ? b.hi - a.hi : a.lo - b.lo)).slice(-1);
  const promising = combos.filter((c) => c.tier === "watch").sort((a, b) => score(b) - score(a));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {good.map((c) => <Card key={c.key} combo={c} metric={metric} tone="good" fade={fade} />)}
        {bad.map((c) => <Card key={c.key} combo={c} metric={metric} tone="bad" fade={fade} />)}
      </div>
      {!good.length && (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <span className={fade}>
          {promising.length ? (
            <>
              {promising.length === 1 ? "One combo is" : `${promising.length} combos are`} {metric === "interview" ? "above" : "below"} the {Math.round(baseline * 100)}% average, but there isn't enough data to rule out luck yet:{" "}
              {promising.map((c, i) => (
                <span key={c.key}>
                  {i > 0 && ", "}
                  <span className="text-foreground">{c.parts.join(" + ")}</span> ({metric === "interview" ? c.interviews : c.rejected}/{c.n}, {fmtLift(c.lift)})
                </span>
              ))}
              . Keep sending to see if it holds.
            </>
          ) : (
            <>No combo with enough volume is {metric === "interview" ? "above" : "below"} the {Math.round(baseline * 100)}% average.</>
          )}
          </span>
        </p>
      )}
    </div>
  );
}
