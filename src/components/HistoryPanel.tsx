import { useRef, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EventInput, type JobEvent, useAddEvent, useDeleteEvent, useUpdateEvent } from "@/lib/api";
import { burstFrom, celebrate } from "@/lib/confetti";
import { formatDate, today } from "@/lib/format";
import { EVENT_TYPES } from "@/lib/options";
import { cn } from "@/lib/utils";

// One color per event type, shared by the dropdown, the timeline dots and the History Terms box.
export const EVENT_COLORS: Record<string, { dot: string; text: string }> = {
  Applied: { dot: "bg-amber-400", text: "text-amber-400" },
  Contact: { dot: "bg-blue-500", text: "text-blue-500" },
  "Follow-Up": { dot: "bg-violet-500", text: "text-violet-500" },
  Screen: { dot: "bg-sky-300", text: "text-sky-300" },
  Interview: { dot: "bg-sky-500", text: "text-sky-500" },
  Offer: { dot: "bg-emerald-500", text: "text-emerald-500" },
  Accepted: { dot: "bg-emerald-300", text: "text-emerald-300" },
  Rejection: { dot: "bg-red-500", text: "text-red-500" },
  Withdrew: { dot: "bg-neutral-500", text: "text-neutral-500" },
  Ghosted: { dot: "bg-stone-500", text: "text-stone-500" },
  Scam: { dot: "bg-orange-500", text: "text-orange-500" },
  Note: { dot: "bg-neutral-400", text: "text-neutral-400" },
};

function EventFields({ value, onChange, onSubmit }: { value: EventInput; onChange: (v: EventInput) => void; onSubmit: () => void }) {
  return (
    <>
      <Input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} className="w-40" />
      <Select value={value.type} onValueChange={(type) => onChange({ ...value, type })}>
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
          <span className="text-muted-foreground">{formatDate(event.date)}</span>
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
  const blank = (): EventInput => ({ date: today(), type: "Follow-Up", description: "" });
  const [draft, setDraft] = useState(blank);
  const add = useAddEvent(jobId);
  const addButton = useRef<HTMLButtonElement>(null);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    const { type } = draft;
    add.mutate(draft, {
      onSuccess: () => {
        setDraft(blank());
        if (type === "Offer" || type === "Accepted") celebrate();
        else if ((type === "Screen" || type === "Interview") && addButton.current) burstFrom(addButton.current, 135);
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
        <ul className="divide-y">
          {events.map((e) => <EventRow key={e.id} event={e} />)}
        </ul>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">No history yet.</p>
      )}
    </div>
  );
}
