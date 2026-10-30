import { useRef, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EventFields, blankEvent, celebrateEvent } from "@/components/EventFields";
import { burstFrom } from "@/lib/confetti";
import { type EventInput, type JobEvent, useAddEvent, useDeleteEvent, useUpdateEvent } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";
import { EVENT_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/demo";
import { EVENT_TYPES } from "@/lib/options";

const HISTORY_SIZE = 5;
// Notes live in the Notes card, dated alongside screens and interviews, so History leaves them out.
const HISTORY_TYPES = EVENT_TYPES.filter((t) => t !== "Note");

function EventRow({ event }: { event: JobEvent }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EventInput>(event);
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  const save = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    update.mutate({ id: event.id, ...draft }, { onSuccess: () => setEditing(false), onError: (e) => toastError(e) });
  };

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <EventFields value={draft} onChange={setDraft} onSubmit={save} />
        <Button size="icon" onClick={save}>
          <Check />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => { setDraft(event); setEditing(false); }}><X /></Button>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 py-2.5">
      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", EVENT_COLORS[event.type]?.dot ?? "bg-neutral-400")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-medium">{event.type}</span>
          <Link to={`/calendar?date=${event.date}`} title="View on calendar" className="text-muted-foreground hover:text-foreground hover:underline">
            {formatDate(event.date)}{event.time && ` · ${formatTime(event.time)}`}
          </Link>
        </div>
        {event.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{event.description}</p>}
      </div>
      <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" className="size-7" onClick={() => { setDraft(event); setEditing(true); }}><Pencil /></Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={async () => {
            if (await confirmDialog({ message: `Delete this ${event.type} event?`, confirmLabel: "Delete", destructive: true })) remove.mutate(event.id);
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export function HistoryPanel({ jobId, events: all, followUpNeeded = false, onFollowUpLogged }: {
  jobId: number;
  events: JobEvent[];
  followUpNeeded?: boolean;
  onFollowUpLogged?: () => void;
}) {
  const events = all.filter((e) => e.type !== "Note");
  const [draft, setDraft] = useState(blankEvent);
  // The add form stays folded behind a button so the list reads first.
  const [adding, setAdding] = useState(false);
  const add = useAddEvent(jobId);
  const addButton = useRef<HTMLButtonElement>(null);
  const [showAll, setShowAll] = useState(false);
  const hidden = events.length - HISTORY_SIZE;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    const { type } = draft;
    add.mutate(draft, {
      onSuccess: () => {
        setDraft(blankEvent());
        celebrateEvent(type, addButton.current);
        if (type === "Follow-Up" && followUpNeeded) {
          if (addButton.current) burstFrom(addButton.current, 135);
          onFollowUpLogged?.();
        }
        setAdding(false);
      },
      onError: (err) => toastError(err),
    });
  };

  return (
    <div className="space-y-3">
      {adding ? (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <EventFields value={draft} onChange={setDraft} onSubmit={submit} types={HISTORY_TYPES} />
          <Button ref={addButton} type="submit" disabled={add.isPending}>Add</Button>
          <Button type="button" variant="ghost" size="icon" title="Cancel" onClick={() => { setDraft(blankEvent()); setAdding(false); }}><X /></Button>
        </form>
      ) : (
        <Button variant="outline" size="sm" className="w-full border-dashed text-muted-foreground" onClick={() => setAdding(true)}>
          <Plus /> Log event
        </Button>
      )}
      {events.length ? (
        <>
          <ul className="divide-y">
            {(showAll ? events : events.slice(0, HISTORY_SIZE)).map((e) => <EventRow key={e.id} event={e} />)}
          </ul>
          {hidden > 0 && (
            <div className="flex justify-center border-t pt-2.5">
              <Button variant="ghost" size="sm" className="h-auto py-0 text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show Less" : `View More (${hidden})`}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">No history yet.</p>
      )}
    </div>
  );
}
