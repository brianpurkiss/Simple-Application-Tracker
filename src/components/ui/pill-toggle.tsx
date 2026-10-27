import { cn } from "@/lib/utils";

export function PillToggle({ pressed, className, ...props }: React.ComponentProps<"button"> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "rounded-full border px-3 py-1",
        pressed ? "border-transparent bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
