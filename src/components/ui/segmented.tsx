import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// `collapse` swaps the buttons for a dropdown below sm, for option sets too wide to fit on a phone.
export function Segmented<T extends string>({ options, value, onChange, collapse }: {
  options: readonly { key: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (key: T) => void;
  collapse?: boolean;
}) {
  return (
    <>
      {collapse && (
        <Select value={value} onValueChange={(v) => onChange(v as T)}>
          <SelectTrigger className="bg-card sm:hidden"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className={cn("inline-flex flex-wrap rounded-md border p-0.5", collapse && "max-sm:hidden")}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            aria-label={o.title}
            title={o.title}
            onClick={() => onChange(o.key)}
            className={cn("rounded px-2.5 py-1 text-sm", value === o.key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}
