import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// A titled card that expands and collapses. With `preview`, the collapsed state shows the top of the
// content fading out instead of hiding it.
export function Collapsible({ title, meta, preview, defaultOpen = false, className, children }: {
  title: string;
  meta?: React.ReactNode;
  preview?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen((o) => !o);
  return (
    <section className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 px-6 py-4 text-left">
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="font-semibold">{title}</span>
        {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
      </button>
      {open ? (
        <div className="px-6 pb-6">{children}</div>
      ) : preview ? (
        <div className="relative px-6 pb-4">
          <div className="max-h-48 overflow-hidden [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" aria-hidden>
            {children}
          </div>
          <button type="button" onClick={toggle} className="mt-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Show all
          </button>
        </div>
      ) : null}
    </section>
  );
}
