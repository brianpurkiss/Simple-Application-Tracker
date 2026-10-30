import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ConfirmDialog";
import { InlineFields, MarkdownField } from "@/components/fields";
import { type JobEvent, useDeleteEvent, useUpdateEvent } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";
import { toastError } from "@/lib/demo";

// Markdown notes for one history event, labeled with the event. Saves when the field loses focus.
// A Note event is all text, held in its description; screens and interviews keep theirs in `notes`.
export function EventNotes({ event, rows = 4 }: { event: JobEvent; rows?: number }) {
  const isNote = event.type === "Note";
  const field = isNote ? "description" : "notes";
  const [value, setValue] = useState(event[field]);
  // Bumped after a save so the field goes back to plain text, like the job's own fields after Save.
  const [epoch, setEpoch] = useState(0);
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  // Pick up changes saved elsewhere (e.g. the same notes open in the other view).
  useEffect(() => setValue(event[field]), [event, field]);

  const save = () => {
    if (value === event[field]) return setEpoch((n) => n + 1);
    update.mutate({ id: event.id, [field]: value }, { onSuccess: () => setEpoch((n) => n + 1), onError: (e) => toastError(e) });
  };

  const when = `${formatDate(event.date)}${event.time ? `, ${formatTime(event.time)}` : ""}`;
  const label = [event.type, when, !isNote && event.description].filter(Boolean).join(" · ");

  return (
    <InlineFields epoch={epoch}>
      <div className="group relative">
        <MarkdownField
          label={label}
          value={value}
          onChange={setValue}
          onBlur={save}
          rows={rows}
          placeholder={isNote ? "Anything worth remembering…" : "Questions asked, answers, names, impressions, next steps…"}
        />
        {isNote && (
          <Button
            size="icon"
            variant="ghost"
            title="Delete note"
            className="absolute -top-1.5 right-0 size-6 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={async () => {
              if (await confirmDialog({ message: `Delete this note from ${formatDate(event.date)}?`, confirmLabel: "Delete", destructive: true })) {
                remove.mutate(event.id, { onError: (e) => toastError(e) });
              }
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </InlineFields>
  );
}
