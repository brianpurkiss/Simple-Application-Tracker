import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MarkdownField } from "@/components/fields";
import { EventNotes } from "@/components/EventNotes";
import { type EventInput, type JobEvent, useAddEvent } from "@/lib/api";
import { today } from "@/lib/format";
import { TIMED_EVENT_TYPES } from "@/lib/options";
import { toastError } from "@/lib/demo";

type NotesProps = { jobId: number; notes: string; onNotesChange: (v: string) => void; events: JobEvent[] };

// A dated note being written, handed to `onSave` as a Note event; nothing is stored until Save.
export function NoteForm({ rows, onSave, onDone, pending = false }: { rows: number; onSave: (note: EventInput) => void; onDone: () => void; pending?: boolean }) {
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const submit = () => {
    if (text.trim()) onSave({ type: "Note", date, description: text, notes: "", time: null });
  };
  return (
    <div
      className="space-y-2 rounded-lg border bg-muted/30 p-3"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Note dated</span>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} className="h-8 w-40" aria-label="Note date" />
      </div>
      <MarkdownField label="" value={text} onChange={setText} rows={rows} autoFocus placeholder="Anything worth remembering…" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!text.trim() || pending}>Save</Button>
      </div>
    </div>
  );
}

// A new note on a saved job.
function NewNote({ jobId, rows, onDone }: { jobId: number; rows: number; onDone: () => void }) {
  const add = useAddEvent(jobId);
  return <NoteForm rows={rows} onDone={onDone} pending={add.isPending} onSave={(note) => add.mutate(note, { onSuccess: onDone, onError: (e) => toastError(e) })} />;
}

// Every note for a job: the general notes, then dated notes, screens and interviews, newest first, all edited
// in place. General notes edit the job's draft, so they save with the page's Save bar; the rest save on blur.
export function JobNotes({ jobId, notes, onNotesChange, events, rows }: NotesProps & { rows: { general: number; event: number } }) {
  const [adding, setAdding] = useState(false);
  const dated = events.filter((e) => e.type === "Note" || TIMED_EVENT_TYPES.has(e.type));
  return (
    <div className="space-y-5">
      <MarkdownField label="General" value={notes} onChange={onNotesChange} rows={rows.general} />
      <div className="space-y-4 border-t pt-4">
        {adding ? (
          <NewNote jobId={jobId} rows={rows.event} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" className="w-full border-dashed text-muted-foreground" onClick={() => setAdding(true)}>
            <Plus /> Add note
          </Button>
        )}
        {dated.map((e) => <EventNotes key={e.id} event={e} rows={rows.event} />)}
      </div>
    </div>
  );
}

// The same notes, full screen.
export function AllNotesDialog({ open, onOpenChange, ...notes }: NotesProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Notes</DialogTitle></DialogHeader>
        <JobNotes {...notes} rows={{ general: 10, event: 10 }} />
      </DialogContent>
    </Dialog>
  );
}
