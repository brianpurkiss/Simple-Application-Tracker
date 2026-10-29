import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { type JobEvent, useUpdateEvent } from "@/lib/api";

// Full notes for one history event. Saves when the field loses focus.
export function EventNotes({ event, rows = 10, autoFocus }: { event: JobEvent; rows?: number; autoFocus?: boolean }) {
  const [value, setValue] = useState(event.notes);
  const update = useUpdateEvent();

  // Pick up changes saved elsewhere (e.g. the same notes open in the other view).
  useEffect(() => setValue(event.notes), [event.notes]);

  const save = () => {
    if (value !== event.notes) update.mutate({ id: event.id, notes: value }, { onError: (e) => toast.error(e.message) });
  };

  return (
    <Textarea
      value={value}
      rows={rows}
      autoFocus={autoFocus}
      aria-label={`${event.type} notes`}
      placeholder="Questions asked, answers, names, impressions, next steps…"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
    />
  );
}
