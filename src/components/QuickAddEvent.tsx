import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EventFields, blankEvent, celebrateEvent } from "@/components/EventFields";
import { type Job, useAddEvent } from "@/lib/api";
import { celebrate } from "@/lib/confetti";
import { toastError, toastSaved } from "@/lib/demo";
import { loggableTypes, needsFollowUp } from "@/lib/jobs";
import { EVENT_TYPES } from "@/lib/options";

// Jobs list dialog: log a history event without opening the job. Open while `job` is set.
export function QuickAddEvent({ job, type, onClose }: { job: Job | null; type?: string; onClose: () => void }) {
  // Keep showing the last job while the dialog animates out.
  const lastJob = useRef(job);
  if (job) lastJob.current = job;
  const shown = lastJob.current;

  const [draft, setDraft] = useState(blankEvent);
  const add = useAddEvent(shown?.id ?? 0);
  const onJobsList = useLocation().pathname === "/jobs";
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (job) setDraft({ ...blankEvent(), ...(type && { type }) });
  }, [job, type]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!shown) return;
    (document.activeElement as HTMLElement | null)?.blur();
    const { type } = draft;
    // Checked before the mutation, since logging the follow-up drops the job off the Follow Up list.
    const clearedFollowUp = onJobsList && type === "Follow-Up" && needsFollowUp(shown);
    add.mutate(draft, {
      onSuccess: () => {
        onClose();
        celebrateEvent(type, addButton.current);
        if (clearedFollowUp) celebrate(500);
        toastSaved(`${type} added to ${shown.title}`);
      },
      onError: (err) => toastError(err),
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
          <EventFields value={draft} onChange={setDraft} onSubmit={submit} types={loggableTypes(EVENT_TYPES, !!shown?.applied_date)} />
          <Button ref={addButton} type="submit" disabled={add.isPending}>Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
