import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Base = { label: string; value: string; onChange: (value: string) => void; className?: string };

function Field({ label, id, className, children }: { label: string; id: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function TextField({ label, value, onChange, className, ...props }: Base & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const id = useId();
  return (
    <Field label={label} id={id} className={className}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...props} />
    </Field>
  );
}

export function TextAreaField({ label, value, onChange, className, rows = 4 }: Base & { rows?: number }) {
  const id = useId();
  return (
    <Field label={label} id={id} className={className}>
      <Textarea id={id} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, className }: Base & { options: readonly string[] }) {
  const id = useId();
  // Keep unknown values (e.g. imported ones) selectable.
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Field label={label} id={id} className={className}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {all.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

// Text input with a filtered suggestion list — pick a known value or type a new one.
export function ComboField({ label, value, onChange, options, className, placeholder }: Base & { options: readonly string[]; placeholder?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const query = value.trim().toLowerCase();
  const matches = options.filter((o) => o.toLowerCase().includes(query) && o !== value);
  const show = open && matches.length > 0;

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + step + matches.length) % matches.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && show) {
      if (e.key === "Enter") e.preventDefault();
      pick(matches[highlight] ?? matches[0]);
    } else if (e.key === "Escape" && show) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Field label={label} id={id} className={cn("relative", className)}>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-expanded={show}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {show && (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {matches.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn("cursor-pointer rounded-sm px-2 py-1.5", i === highlight && "bg-accent text-accent-foreground")}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
