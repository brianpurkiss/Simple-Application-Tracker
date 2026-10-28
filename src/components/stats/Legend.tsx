import { CATEGORIES, type Category } from "@/lib/activity";
import { cn } from "@/lib/utils";

// New resumes are squares so they stand apart from job events.
export const shapeOf = (c: Category) => (c === "resume" ? "rounded-[2px]" : "rounded-full");

export function Legend({ keys, hidden, onToggle }: { keys: Category[]; hidden?: Set<Category>; onToggle?: (c: Category) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {CATEGORIES.filter((c) => keys.includes(c.key)).map((c) => {
        const off = hidden?.has(c.key);
        const body = (
          <>
            <span className={cn("size-2.5", shapeOf(c.key))} style={{ backgroundColor: c.color, opacity: off ? 0.3 : 1 }} />
            <span className={cn(off && "text-muted-foreground line-through")}>{c.label}</span>
          </>
        );
        return onToggle ? (
          <button key={c.key} type="button" onClick={() => onToggle(c.key)} className="inline-flex items-center gap-1.5">
            {body}
          </button>
        ) : (
          <span key={c.key} className="inline-flex items-center gap-1.5">{body}</span>
        );
      })}
    </div>
  );
}
