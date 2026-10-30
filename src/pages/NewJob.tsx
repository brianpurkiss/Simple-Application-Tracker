import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MarkdownField, MarkdownText } from "@/components/fields";
import { type Draft, EDITABLE, JobFormCards, blankDraft, keyFieldsFilled, toPatch } from "@/components/JobFormCards";
import { EventFields, blankEvent } from "@/components/EventFields";
import { FollowUpButton } from "@/components/FollowUpButton";
import { HISTORY_TYPES } from "@/components/HistoryPanel";
import { NoteForm } from "@/components/AllNotesDialog";
import { type EventInput, useAddEventTo, useCreateJob, useJobs } from "@/lib/api";
import { factHints } from "@/lib/jobFacts";
import { salaryRangeInvalid } from "@/lib/salary";
import { EVENT_COLORS } from "@/lib/colors";
import { formatDate, formatTime, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFactContext } from "@/hooks/useFactContext";
import { useJobDefaults } from "@/hooks/useJobDefaults";
import { useLeaveGuard } from "@/hooks/useLeaveGuard";
import { useStickyTop } from "@/hooks/useStickyTop";
import { isEditable, useHotkey } from "@/hooks/hotkeys";
import { DEMO, toastError, toastSaved } from "@/lib/demo";

// Quick Add's "Open full form" brings along what was typed there.
type NewJobState = { prefill?: Partial<Draft> } | null;

// Applied is the job's own row at the top of History, so it isn't offered again.
const LOG_TYPES = HISTORY_TYPES.filter((t) => t !== "Applied");

// The job page's Edit view for a job that doesn't exist yet: every field, starting from the profile's defaults,
// with History and Notes beside it. Events and notes wait here and are logged once the job is created.
export default function NewJob() {
  const { ready, defaults } = useJobDefaults();
  const prefill = (useLocation().state as NewJobState)?.prefill;
  if (!ready) return <p className="text-muted-foreground">Loading…</p>;
  return <NewJobForm empty={blankDraft(defaults)} prefill={prefill} />;
}

// `empty` is the form with only the defaults in it: anything beyond that, carried over from Quick Add or typed here, is unsaved.
function NewJobForm({ empty, prefill }: { empty: Draft; prefill?: Partial<Draft> }) {
  const [draft, setDraft] = useState(() => ({ ...empty, ...prefill }));
  // Saved postings are kept for segment analysis without being applied to.
  const [savedOnly, setSavedOnly] = useState(false);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const create = useCreateJob();
  const addEvent = useAddEventTo();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: jobs = [] } = useJobs();
  const factCtx = useFactContext(jobs);

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = EDITABLE.some((k) => draft[k] !== empty[k]) || savedOnly || events.length > 0;
  const badRange = salaryRangeInvalid(draft.salary_min, draft.salary_max);
  const busy = create.isPending || addEvent.isPending;
  // Job Type and Company Type are worked out live from the other jobs as the title, company and description are typed.
  const hints = factHints({ id: -1, title: draft.title, normalized_title: draft.normalized_title, company: draft.company, company_type: "", job_types: [], job_description: draft.job_description }, factCtx);

  useLeaveGuard(dirty && createdId === null);
  // Go on to the new job once the guard has let go, replacing this page so Back doesn't return to a blank form.
  useEffect(() => {
    if (createdId !== null) navigate(`/jobs/${createdId}`, { replace: true });
  }, [createdId, navigate]);

  // Back where we came from, or to the list when this page was opened directly. The leave guard asks about unsaved changes.
  const leave = () => (location.key === "default" ? navigate("/jobs") : navigate(-1));

  const save = () => {
    if (badRange || busy) return;
    (document.activeElement as HTMLElement | null)?.blur();
    const filled = EDITABLE.filter((k) => draft[k] !== "" && !(k === "job_types" && draft[k] === "[]"));
    const job = Object.fromEntries(filled.map((k) => [k, toPatch(k, draft[k])]));
    create.mutate(
      { ...job, ...(savedOnly ? { applied_date: null, saved: true } : {}) },
      {
        onSuccess: async (created) => {
          // The job exists now, so the history and notes waiting here can be logged against it.
          try {
            for (const e of events) await addEvent.mutateAsync({ jobId: created.id, ...e });
          } catch (err) {
            toastError(err as Error);
          }
          toastSaved(`${savedOnly ? "Saved" : "Added"} ${created.title}`);
          // The demo saves nothing, so there's no new job page to open.
          if (!DEMO) setCreatedId(created.id);
        },
        onError: (err) => toastError(err),
      },
    );
  };

  useHotkey("s", (e) => {
    e.preventDefault();
    save();
  }, { mod: true });
  useHotkey("Escape", (e) => {
    if (isEditable(e.target)) return (e.target as HTMLElement).blur();
    leave();
  });

  const addPending = (e: EventInput) => setEvents((list) => [...list, e]);
  const removePending = (e: EventInput) => setEvents((list) => list.filter((x) => x !== e));
  const history = events.filter((e) => e.type !== "Note");
  const notes = events.filter((e) => e.type === "Note");

  // Whichever column is shorter sticks while the other scrolls, as on the job page; the save bar is always up.
  const leftCol = useStickyTop<HTMLDivElement>(72, 80);
  const rightCol = useStickyTop<HTMLElement>(72, 80);

  return (
    <div className="space-y-5 pb-20">
      <title>Add Job | Application Tracker</title>
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={leave} title="Back"><ArrowLeft /></Button>
        <h1 className="text-2xl font-semibold">{draft.title.trim() || "Add Job"}</h1>
      </div>

      {/* Below lg the two columns dissolve into one stack: Job, then History and Notes, then the rest. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-5 lg:items-start">
        <div ref={leftCol.ref} style={leftCol.style} className="contents lg:sticky lg:col-span-3 lg:block lg:space-y-5">
          <JobFormCards draft={draft} set={set} badRange={badRange} hints={hints} factCtx={factCtx} applied={false} autoFocus />
        </div>

        <aside ref={rightCol.ref} style={rightCol.style} className="order-2 space-y-5 lg:sticky lg:order-none lg:col-span-2">
          <Card>
            <CardHeader className="flex items-start justify-between">
              <CardTitle>History</CardTitle>
              <FollowUpButton value={draft.follow_up_on} onChange={set("follow_up_on")} />
            </CardHeader>
            <CardContent className="space-y-3">
              <LogEvent onAdd={addPending} />
              <ul className="divide-y">
                {!savedOnly && (
                  <li className="flex items-center gap-3 py-2.5">
                    <span className={cn("size-2.5 shrink-0 rounded-full", EVENT_COLORS.Applied.dot)} />
                    <span className="text-sm font-medium">Applied</span>
                    <Input type="date" value={draft.applied_date} onChange={(e) => set("applied_date")(e.target.value || today())} className="h-8 w-40" aria-label="Applied date" />
                  </li>
                )}
                {history.map((e, i) => <PendingRow key={i} event={e} onRemove={() => removePending(e)} />)}
              </ul>
              <label className="flex items-start gap-2 border-t pt-3 text-sm">
                <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} className="mt-0.5" />
                <span>Save reference role, not applied (yet)</span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <MarkdownField label="General" value={draft.notes} onChange={set("notes")} rows={6} />
              <AddNote onAdd={addPending} />
              {notes.map((e, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Note · {formatDate(e.date)}
                    <Button variant="ghost" size="icon" className="ml-auto size-6" title="Remove note" onClick={() => removePending(e)}><X /></Button>
                  </div>
                  <MarkdownText value={e.description} />
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm text-muted-foreground">New job</span>
          <Button variant="outline" onClick={leave}>Cancel</Button>
          {/* Soft check: highlights Save once the key fields are filled, never blocks it. */}
          <Button variant={keyFieldsFilled(draft, savedOnly) ? "default" : "outline"} onClick={save} disabled={busy || badRange}>
            {savedOnly ? "Save Job" : "Add Job"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// History's "Log event", folded behind a button like on the job page.
function LogEvent({ onAdd }: { onAdd: (e: EventInput) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(() => blankEvent());
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onAdd(draft);
    setDraft(blankEvent());
    setAdding(false);
  };
  return adding ? (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
      <EventFields value={draft} onChange={setDraft} onSubmit={submit} types={LOG_TYPES} />
      <Button type="submit">Add</Button>
      <Button type="button" variant="ghost" size="icon" title="Cancel" onClick={() => { setDraft(blankEvent()); setAdding(false); }}><X /></Button>
    </form>
  ) : (
    <Button variant="outline" size="sm" className="w-full border-dashed text-muted-foreground" onClick={() => setAdding(true)}>
      <Plus /> Log event
    </Button>
  );
}

function AddNote({ onAdd }: { onAdd: (e: EventInput) => void }) {
  const [adding, setAdding] = useState(false);
  return adding ? (
    <NoteForm rows={3} onSave={(note) => { onAdd(note); setAdding(false); }} onDone={() => setAdding(false)} />
  ) : (
    <Button variant="outline" size="sm" className="w-full border-dashed text-muted-foreground" onClick={() => setAdding(true)}>
      <Plus /> Add note
    </Button>
  );
}

// An event waiting to be logged, shown like a History row.
function PendingRow({ event, onRemove }: { event: EventInput; onRemove: () => void }) {
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", EVENT_COLORS[event.type]?.dot ?? "bg-neutral-400")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-medium">{event.type}</span>
          <span className="text-muted-foreground">{formatDate(event.date)}{event.time && ` · ${formatTime(event.time)}`}</span>
        </div>
        {event.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{event.description}</p>}
      </div>
      <Button size="icon" variant="ghost" className="size-7 opacity-0 transition-opacity group-hover:opacity-100" title="Remove" onClick={onRemove}><X /></Button>
    </li>
  );
}
