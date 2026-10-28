import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EventFields, blankEvent, celebrateEvent } from "@/components/HistoryPanel";
import { type Job, useAddEvent } from "@/lib/api";

// Jobs list dialog: log a history event without opening the job. Open while `job` is set.
export function QuickAddEvent({ job, onClose }: { job: Job | null; onClose: () => void }) {
  // Keep showing the last job while the dialog animates out.
  const lastJob = useRef(job);
  if (job) lastJob.current = job;
  const shown = lastJob.current;

  const [draft, setDraft] = useState(blankEvent);
  const add = useAddEvent(shown?.id ?? 0);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (job) setDraft(blankEvent());
  }, [job]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!shown) return;
    (document.activeElement as HTMLElement | null)?.blur();
    const { type } = draft;
    add.mutate(draft, {
      onSuccess: () => {
        onClose();
        celebrateEvent(type, addButton.current);
        toast.success(`${type} added to ${shown.title}`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          // Land on the type dropdown rather than the date.
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[role=combobox]")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add history</DialogTitle>
          <p className="truncate text-sm text-muted-foreground" title={shown?.title}>{shown?.title}</p>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <EventFields value={draft} onChange={setDraft} onSubmit={submit} />
          <Button ref={addButton} type="submit" disabled={add.isPending}>Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
