import type { FollowUps as FollowUpStats, Momentum as MomentumStats, Wins as WinsStats } from "@/lib/insights";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StreakTile } from "@/components/StreakTile";
import { WeekProgress } from "@/components/WeekProgress";
import { cn } from "@/lib/utils";
import { pct } from "@/lib/stats";

// Proactive effort that paid off: a follow-up you sent that got a reply other than a rejection.
function FollowUpWins({ f }: { f: FollowUpStats }) {
  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <h3 className="font-medium">Follow-Ups That Got a Reply</h3>
      <div className="mt-2 text-3xl font-semibold tabular-nums">
        {f.replied} <span className="text-xl text-muted-foreground">of {f.followedUp}</span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {f.followedUp ? `${pct(f.replied, f.followedUp)}% · reply within 14 days` : "Follow up on a quiet application to start"}
      </div>
    </div>
  );
}

function Wins({ wins }: { wins: WinsStats }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 sm:p-5">
      <Dialog>
        <DialogTrigger asChild>
          <button type="button" className="font-medium hover:underline" title="See all wins">Wins So Far</button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Wins</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {wins.groups.map((g) => (
              <section key={g.title} className="space-y-2">
                <h3 className="text-sm font-semibold">{g.title}</h3>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((i) => (
                    <span
                      key={i.label}
                      className={cn("rounded-full border px-3 py-1 text-sm", i.earned ? "bg-muted/50 font-medium" : "border-dashed text-muted-foreground opacity-60")}
                    >
                      {i.earned && "🏆 "}{i.label}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap gap-2">
        {wins.badges.map((b) => (
          <span key={b} className="rounded-full border bg-muted/50 px-3 py-1 text-sm font-medium">🏆 {b}</span>
        ))}
        {!wins.badges.length && <span className="text-sm text-muted-foreground">Your first win is a few applications away.</span>}
      </div>
      {wins.next && <div className="text-sm text-muted-foreground">Next up: {wins.next}</div>}
    </div>
  );
}

export default function Momentum({ m, wins, followUps }: { m: MomentumStats; wins: WinsStats; followUps: FollowUpStats }) {
  const { thisWeek } = m;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeekProgress done={thisWeek.applications} target={m.paceTarget} previousBest={m.previousBest} average={m.average?.applications ?? null} />
        <StreakTile current={m.streak.current} best={m.streak.best} days={m.recentDays}>
          {m.weeksOnPace > 1 ? `${m.weeksOnPace} weeks in a row at ${m.paceTarget}+ a week` : null}
        </StreakTile>
        <FollowUpWins f={followUps} />
        <Wins wins={wins} />
      </div>
    </div>
  );
}
