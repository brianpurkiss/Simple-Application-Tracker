import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Legend, shapeOf } from "@/components/stats/Legend";
import { type Category, CATEGORIES, WEEKDAYS, addDays, categoryOf, colorOf, eventsByDay, monthDays } from "@/lib/activity";
import { useEvents, useResumes, type ActivityEvent } from "@/lib/api";
import { formatDate, today } from "@/lib/format";
import { isEditable, overlayOpen } from "@/hooks/hotkeys";
import { cn } from "@/lib/utils";

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export default function Calendar() {
  const { data: jobEvents = [], isLoading } = useEvents();
  const { data: resumes = [] } = useResumes();
  const now = today();
  // A date param (from a job's history) opens the calendar on that day instead of today.
  const [params] = useSearchParams();
  const linked = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : null;
  const [selected, setSelected] = useState(linked ?? now);
  const [hidden, setHidden] = useState<Set<Category>>(new Set(["rejection"]));
  const toggle = (c: Category) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(c)) next.add(c);
      return next;
    });

  // Resume creation dates sit alongside job events, as on the activity chart.
  const events = useMemo(
    () => [
      ...jobEvents,
      ...resumes.map((r): ActivityEvent => ({ id: -r.id, job_id: 0, resume_id: r.id, date: r.created_at.slice(0, 10), time: null, type: "New Resume", title: r.version, company: "" })),
    ],
    [jobEvents, resumes],
  );
  const byDay = useMemo(() => eventsByDay(events.filter((e) => !hidden.has(categoryOf(e)))), [events, hidden]);

  // Oldest first. Only months with activity show, plus the current month so today is always there.
  const months = useMemo(() => {
    const keys = new Set(events.map((e) => e.date.slice(0, 7)));
    keys.add(now.slice(0, 7));
    if (linked) keys.add(linked.slice(0, 7));
    return [...keys].sort();
  }, [events, now, linked]);
  const days = useMemo(
    () => months.flatMap((k) => monthDays(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1)),
    [months],
  );

  // Start on the linked day, centered, or at the bottom where the current month is.
  useLayoutEffect(() => {
    if (isLoading) return;
    const cell = linked && document.querySelector(`[data-day="${linked}"]`);
    if (cell) {
      // Scroll margins (for the arrow keys) would skew scrollIntoView's centering, so compute it directly.
      const box = cell.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + box.top + box.height / 2 - window.innerHeight / 2);
    }
    else window.scrollTo(0, document.documentElement.scrollHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Arrows step a day (left/right) or a week (up/down); gaps between active months are skipped.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const step = ARROWS[e.key];
      if (!step || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isEditable(e.target) || overlayOpen()) return;
      e.preventDefault();
      const target = addDays(selected, step);
      const next = days.includes(target) ? target : step > 0 ? days.find((d) => d > target) : [...days].reverse().find((d) => d < target);
      if (next) setSelected(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, days]);

  // Keep the selected day clear of the sticky header and the details panel.
  useEffect(() => {
    document.querySelector(`[data-day="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  const picked = byDay.get(selected) ?? [];

  return (
    <div className="space-y-6">
      <title>Calendar | Application Tracker</title>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <Legend keys={CATEGORIES.map((c) => c.key)} hidden={hidden} onToggle={toggle} />
      </div>

      {months.map((key) => {
        const year = Number(key.slice(0, 4));
        const month = Number(key.slice(5, 7)) - 1;
        const monthDates = monthDays(year, month);
        const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
        return (
          <section key={key} className="space-y-2">
            <h2 className="text-lg font-semibold">
              {new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <div className="overflow-x-auto">
              <div className="grid min-w-[560px] grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="bg-card px-2 py-1.5 text-xs text-muted-foreground">{d}</div>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <div key={`pad-${i}`} className="bg-card" />
                ))}
                {monthDates.map((day) => (
                  <button
                    key={day}
                    type="button"
                    data-day={day}
                    onClick={() => setSelected(day)}
                    className={cn(
                      "flex min-h-24 scroll-mt-20 scroll-mb-64 flex-col items-start gap-1.5 bg-card p-2 text-left hover:bg-accent/50",
                      selected === day && "ring-2 ring-primary ring-inset",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        day === now ? "rounded-full bg-primary px-1.5 py-0.5 font-medium text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {(byDay.get(day) ?? []).map((e) => (
                        <span key={e.id} className={cn("size-2.5", shapeOf(categoryOf(e)))} style={{ backgroundColor: colorOf(categoryOf(e)) }} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-0 -mx-6 max-h-60 space-y-2 overflow-y-auto border-t bg-card px-6 py-3">
        <h3 className="text-sm font-medium">
          {formatDate(selected)} · {picked.length} event{picked.length === 1 ? "" : "s"}
        </h3>
        {picked.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged this day.</p>}
        <ul className="divide-y rounded-md border">
          {picked.map((e) => (
            <li key={e.id}>
              <Link to={e.resume_id ? `/resumes/${e.resume_id}` : `/jobs/${e.job_id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50">
                <span className={cn("size-2.5 shrink-0", shapeOf(categoryOf(e)))} style={{ backgroundColor: colorOf(categoryOf(e)) }} />
                <span className="w-32 shrink-0 text-muted-foreground">{e.type}</span>
                <span className="truncate">{e.title}{e.company && <span className="text-muted-foreground"> · {e.company}</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
