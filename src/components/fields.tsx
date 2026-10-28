import { createContext, useContext, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Base = { label: string; value: string; onChange: (value: string) => void; className?: string };

// Wrap a page in this to render its fields as plain text until they're edited.
// Bump `epoch` (on save or discard) to send every edited field back to plain.
const InlineContext = createContext<{ epoch: number } | null>(null);
export const InlineFields = ({ epoch, children }: { epoch: number; children: React.ReactNode }) => (
  <InlineContext.Provider value={{ epoch }}>{children}</InlineContext.Provider>
);

const PLAIN =
  "border-transparent bg-transparent shadow-none hover:border-input focus-visible:bg-input/30 data-[state=open]:bg-input/30 " +
  "dark:bg-transparent [&_svg]:opacity-0 hover:[&_svg]:opacity-50 focus-visible:[&_svg]:opacity-50";

// Pulls the control left by its padding + border so the text lines up with the label, edited or not.
const FLUSH = "-ml-[13px] w-[calc(100%+13px)]";

// Class for a control and a callback to mark it edited. Outside InlineFields, controls stay regular.
function useInline(flush = true): { plain: string | undefined; touch: () => void } {
  const ctx = useContext(InlineContext);
  const [touchedAt, setTouchedAt] = useState<number | null>(null);
  if (!ctx) return { plain: undefined, touch: () => {} };
  return { plain: cn(flush && FLUSH, touchedAt !== ctx.epoch && PLAIN), touch: () => setTouchedAt(ctx.epoch) };
}

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
  const { plain, touch } = useInline();
  return (
    <Field label={label} id={id} className={className}>
      <Input id={id} value={value} className={plain} onChange={(e) => { touch(); onChange(e.target.value); }} {...props} />
    </Field>
  );
}

export function SalaryRangeField({ min, max, onMin, onMax, invalid, className }: {
  min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; invalid?: boolean; className?: string;
}) {
  const id = useId();
  const lo = useInline();
  const hi = useInline(false);
  // Shown with commas, held as plain digits.
  const input = { type: "text", inputMode: "numeric", "aria-invalid": invalid || undefined } as const;
  const show = (v: string) => (v ? Number(v).toLocaleString("en-US") : "");
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 9);
  return (
    <Field label="Salary Range (USD per year)" id={id} className={className}>
      <div className="flex items-center gap-2">
        <Input id={id} {...input} className={lo.plain} value={show(min)} onChange={(e) => { lo.touch(); onMin(digits(e.target.value)); }} placeholder="Min  150,000" />
        <span className="text-muted-foreground">–</span>
        <Input {...input} className={hi.plain} aria-label="Salary maximum" value={show(max)} onChange={(e) => { hi.touch(); onMax(digits(e.target.value)); }} placeholder="Max  180,000" />
      </div>
      {invalid && <p className="text-xs text-destructive">Minimum can't be above the maximum.</p>}
    </Field>
  );
}

export function TextAreaField({ label, value, onChange, className, rows = 4 }: Base & { rows?: number }) {
  const id = useId();
  const { plain, touch } = useInline();
  return (
    <Field label={label} id={id} className={className}>
      <Textarea id={id} value={value} rows={rows} className={plain} onChange={(e) => { touch(); onChange(e.target.value); }} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, className }: Base & { options: readonly string[] }) {
  const id = useId();
  // Keep unknown values (e.g. imported ones) selectable.
  const all = value && !options.includes(value) ? [value, ...options] : options;
  const { plain, touch } = useInline();
  return (
    <Field label={label} id={id} className={className}>
      <Select value={value} onValueChange={(v) => { touch(); onChange(v); }}>
        <SelectTrigger id={id} className={cn("w-full", plain)}><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {all.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

// Text input with a filtered suggestion list — pick a known value or type a new one.
export function ComboField({ label, value, onChange, options, className, placeholder, required, autoFocus }: Base & { options: readonly string[]; placeholder?: string; required?: boolean; autoFocus?: boolean }) {
  const id = useId();
  const { plain, touch } = useInline();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const query = value.trim().toLowerCase();
  const matches = options.filter((o) => o.toLowerCase().includes(query) && o !== value);
  const show = open && matches.length > 0;

  const pick = (option: string) => {
    touch();
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
        required={required}
        autoFocus={autoFocus}
        className={plain}
        role="combobox"
        aria-expanded={show}
        onChange={(e) => {
          touch();
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
