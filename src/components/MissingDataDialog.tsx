import { useState } from "react";
import { ListX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Job } from "@/lib/api";
import { MISSING_FIELDS, type MissingField, missingCount } from "@/lib/missing";
import { cn } from "@/lib/utils";

// Sections laid out like the job page: the left column's cards, then the right column, then the full-width ones.
const LAYOUT: { column: string; sections: string[] }[] = [
  { column: "sm:col-span-3", sections: ["Job", "Application", "Point of Contact", "Compensation"] },
  { column: "sm:col-span-2", sections: ["Notes", "Job Description", "Cover Letter"] },
];

export function MissingDataDialog({ jobs, value, onPick }: { jobs: Job[]; value: string; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (f: MissingField) => {
    onPick(f.key);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ListX className="size-4" /> Filter by missing data
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Filter by Missing Data</DialogTitle>
          <DialogDescription>Pick a field to list every job that doesn't have it filled in.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-5">
          {LAYOUT.map(({ column, sections }) => (
            <div key={column} className={cn("space-y-4", column)}>
              {sections.map((section) => (
                <div key={section} className="space-y-1.5">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section}</h3>
                  <div className={cn("grid gap-1.5", column === "sm:col-span-3" && "sm:grid-cols-2")}>
                    {MISSING_FIELDS.filter((f) => f.section === section).map((f) => {
                      const n = missingCount(jobs, f);
                      return (
                        <Button
                          key={f.key}
                          variant="outline"
                          size="sm"
                          onClick={() => pick(f)}
                          className={cn("justify-between font-normal", value === f.key && "border-primary bg-accent")}
                        >
                          <span className="truncate">{f.label}</span>
                          <span className={cn("tabular-nums", n ? "text-muted-foreground" : "text-muted-foreground/50")}>{n}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
