import { useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EventInput, type JobEvent, useAddEvent, useDeleteEvent, useUpdateEvent } from "@/lib/api";
import { burstFrom, celebrate } from "@/lib/confetti";
import { formatDate, formatTime, today } from "@/lib/format";
import { EVENT_COLORS } from "@/lib/colors";
import { EVENT_TYPES, TIMED_EVENT_TYPES } from "@/lib/options";
import { cn } from "@/lib/utils";

// One color per event type, shared by the dropdown, the timeline dots and the History Terms box.
export { EVENT_COLORS };

const HISTORY_SIZE = 5;

// Confetti for the events worth celebrating; `anchor` is where the smaller burst comes from.
export function celebrateEvent(type: string, anchor: HTMLElement | null) {
  if (type === "Offer" || type === "Accepted") celebrate();
  else if ((type === "Screen" || type === "Interview") && anchor) burstFrom(anchor, 135);
}

export const blankEvent = (): EventInput => ({ date: today(), type: "Follow-Up", description: "", time: null });

export function EventFields({ value, onChange, onSubmit }: { value: EventInput; onChange: (v: EventInput) => void; onSubmit: () => void }) {
  return (
    <>
      <Input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} className="w-40" />
      <Select value={value.type} onValueChange={(type) => onChange({ ...value, type, time: TIMED_EVENT_TYPES.has(type) ? value.time : null })}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {EVENT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              <span className={cn("mr-2 inline-block size-2.5 rounded-full align-middle", EVENT_COLORS[t]?.dot)} />
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {TIMED_EVENT_TYPES.has(value.type) && (
        <Input type="time" value={value.time ?? ""} onChange={(e) => onChange({ ...value, time: e.target.value || null })} className="w-32" />
      )}
      <Input
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit(); }
        }}
        placeholder="Details (who, what, next steps…)"
        className="min-w-48 flex-1"
      />
    </>
  );
}

function EventRow({ event }: { event: JobEvent }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EventInput>(event);
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  const save = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    update.mutate({ id: event.id, ...draft }, { onSuccess: () => setEditing(false), onError: (e) => toast.error(e.message) });
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
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(true)}><Pencil /></Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => confirm(`Delete this ${event.type} event?`) && remove.mutate(event.id)}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export function HistoryPanel({ jobId, events }: { jobId: number; events: JobEvent[] }) {
  const [draft, setDraft] = useState(blankEvent);
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
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <EventFields value={draft} onChange={setDraft} onSubmit={submit} />
        <Button ref={addButton} type="submit" disabled={add.isPending}>Add</Button>
      </form>
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
