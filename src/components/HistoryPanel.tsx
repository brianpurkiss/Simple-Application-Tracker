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

const typeColor: Record<string, string> = {
  Applied: "bg-amber-400",
  "Contact From Them": "bg-blue-500",
  "Follow-Up": "bg-violet-500",
  "Recruiter Screen": "bg-sky-300",
  Interview: "bg-sky-500",
  Offer: "bg-emerald-500",
  Accepted: "bg-emerald-300",
  Rejection: "bg-red-500",
  Withdrew: "bg-neutral-500",
  Ghosted: "bg-stone-500",
  Note: "bg-neutral-400",
};

function EventFields({ value, onChange }: { value: EventInput; onChange: (v: EventInput) => void }) {
  return (
    <>
      <Input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} className="w-40" />
      <Select value={value.type} onValueChange={(type) => onChange({ ...value, type })}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
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

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <EventFields value={draft} onChange={setDraft} />
        <Button
          size="icon"
          onClick={() => update.mutate({ id: event.id, ...draft }, { onSuccess: () => setEditing(false), onError: (e) => toast.error(e.message) })}
        >
          <Check />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => { setDraft(event); setEditing(false); }}><X /></Button>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 py-2.5">
      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", typeColor[event.type] ?? "bg-neutral-400")} />
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { type } = draft;
    add.mutate(draft, {
      onSuccess: () => {
        setDraft(blank());
        if (type === "Offer" || type === "Accepted") celebrate();
        else if ((type === "Recruiter Screen" || type === "Interview") && addButton.current) burstFrom(addButton.current, 135);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <EventFields value={draft} onChange={setDraft} />
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
