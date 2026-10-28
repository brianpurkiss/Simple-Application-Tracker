import { Fragment } from "react";
import { cn } from "@/lib/utils";

// Keycaps for a shortcut, joined by `sep` ("+" for chords, "then" for sequences).
export function Keys({ keys, sep = "+", small }: { keys: readonly string[]; sep?: string; small?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <Fragment key={k + i}>
          {i > 0 && <span className="text-xs text-muted-foreground">{sep}</span>}
          <kbd
            className={cn(
              "inline-flex items-center justify-center rounded border bg-muted px-1.5 font-mono text-foreground",
              small ? "h-5 min-w-5 text-[11px]" : "h-6 min-w-6 text-xs",
            )}
          >
            {k}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
