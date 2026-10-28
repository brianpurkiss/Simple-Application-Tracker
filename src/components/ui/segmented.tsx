import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly { key: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-md border p-0.5">
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
  );
}
