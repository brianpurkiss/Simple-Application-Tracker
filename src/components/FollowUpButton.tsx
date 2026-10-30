import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TextField } from "@/components/fields";
import { addDays, weekStart } from "@/lib/activity";
import { formatDate, today } from "@/lib/format";

// The History card's "Schedule follow up" button and its date picker. `value` is a date string, "" for none.
export function FollowUpButton({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
          <CalendarClock />
          {value ? `Follow up ${formatDate(value)}` : "Schedule follow up"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Scheduled Follow Up</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <TextField label="Follow Up On" type="date" value={value} onChange={onChange} />
          <div className="flex flex-wrap gap-1.5">
            {[
              ["Tomorrow", addDays(today(), 1)],
              ["In 3 Days", addDays(today(), 3)],
              ["Next Monday", addDays(weekStart(today()), 7)],
            ].map(([label, date]) => (
              <Button key={label} variant={value === date ? "secondary" : "outline"} size="sm" className="h-7 text-xs" onClick={() => onChange(date)}>
                {label}
              </Button>
            ))}
          </div>
          {value > today() && (
            <p className="text-xs text-muted-foreground">Held out of Follow Up and Ghosted until {formatDate(value)}.</p>
          )}
        </div>
        <DialogFooter>
          {value && <Button variant="outline" onClick={() => onChange("")}>Clear</Button>}
          <DialogClose asChild><Button>Done</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
