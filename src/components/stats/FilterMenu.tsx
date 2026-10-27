import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterToggle({ open, onToggle, active }: { open: boolean; onToggle: () => void; active: boolean }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn("inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent", open && "bg-accent")}
    >
      <Menu className="size-4" />
      Filters
      {active && <span className="size-1.5 rounded-full bg-blue-500" title="Non-default filters applied" />}
    </button>
  );
}

// Sits beside the page content (not over it). The wrapper's width animates, so the content
// beside it glides narrower instead of jumping; the inner panel keeps a fixed width.
export function FilterPanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      className={cn(
        "shrink-0 overflow-x-hidden transition-[width,margin,opacity,visibility] duration-300 ease-out lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto",
        open ? "visible opacity-100 lg:w-96" : "invisible -mt-6 h-0 overflow-hidden opacity-0 lg:-ml-6 lg:mt-0 lg:h-auto lg:w-0",
      )}
    >
      <aside className="w-full space-y-4 lg:w-96">{children}</aside>
    </div>
  );
}

// One box in the filter panel.
export function FilterBox({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border bg-card p-4", className)}>{children}</section>;
}
