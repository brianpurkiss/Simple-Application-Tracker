import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EventInput } from "@/lib/api";
import { EVENT_COLORS } from "@/lib/colors";
import { burstFrom, celebrate } from "@/lib/confetti";
import { today } from "@/lib/format";
import { EVENT_TYPES, TIMED_EVENT_TYPES } from "@/lib/options";
import { cn } from "@/lib/utils";

// Confetti for the events worth celebrating; `anchor` is where the smaller burst comes from.
export function celebrateEvent(type: string, anchor: HTMLElement | null) {
  if (type === "Offer" || type === "Accepted") celebrate();
  else if ((type === "Screen" || type === "Interview") && anchor) burstFrom(anchor, 135);
}

export const blankEvent = (): EventInput => ({ date: today(), type: "Follow-Up", description: "", notes: "", time: null });

export function EventFields({ value, onChange, onSubmit }: { value: EventInput; onChange: (v: EventInput) => void; onSubmit: () => void }) {
  return (
    <>
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
      <Input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} className="w-40" />
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
