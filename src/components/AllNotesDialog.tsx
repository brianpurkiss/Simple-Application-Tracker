import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarkdownField } from "@/components/fields";
import { EventNotes } from "@/components/EventNotes";
import type { JobEvent } from "@/lib/api";
import { EVENT_COLORS } from "@/lib/colors";
import { formatDate, formatTime } from "@/lib/format";
import { TIMED_EVENT_TYPES } from "@/lib/options";
import { cn } from "@/lib/utils";

// Every note for a job on one scrollable page: the general notes, then each screen and interview.
// General notes edit the job's draft, so they save with the page's Save bar.
export function AllNotesDialog({
  open,
  onOpenChange,
  notes,
  onNotesChange,
  events,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  events: JobEvent[];
}) {
  const interviews = events.filter((e) => TIMED_EVENT_TYPES.has(e.type));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>All Notes</DialogTitle></DialogHeader>
        <section className="space-y-2">
          <h3 className="text-sm font-medium">General Notes</h3>
          <MarkdownField label="Saved with the job's Save button." value={notes} onChange={onNotesChange} rows={10} />
        </section>
        {interviews.map((e) => (
          <section key={e.id} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <span className={cn("size-2.5 rounded-full", EVENT_COLORS[e.type]?.dot ?? "bg-neutral-400")} />
              {e.type}
              <span className="font-normal text-muted-foreground">
                {formatDate(e.date)}{e.time && ` · ${formatTime(e.time)}`}
                {e.description && ` · ${e.description}`}
              </span>
            </h3>
            <EventNotes event={e} rows={12} />
          </section>
        ))}
        {!interviews.length && <p className="text-sm text-muted-foreground">Log a Screen or Interview in History to take notes for it here.</p>}
      </DialogContent>
    </Dialog>
  );
}
