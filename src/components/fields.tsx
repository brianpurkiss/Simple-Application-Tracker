import { createContext, useContext, useId, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { WandSparkles } from "lucide-react";
import { toast } from "sonner";
import TurndownService from "turndown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { autoMarkdown } from "@/lib/autoMarkdown";
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

function Field({ label, id, className, action, children }: {
  label: string; id: string; className?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {action ? (
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
          {action}
        </div>
      ) : (
        <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      )}
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
  const input = { type: "text", inputMode: "numeric", "aria-invalid": invalid || undefined, "data-financial": "" } as const;
  const show = (v: string) => (v ? Number(v).toLocaleString("en-US") : "");
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 9);
  return (
    <Field label="Salary Range (USD per year)" id={id} className={className}>
      <div className="flex items-center gap-2">
        <Input id={id} {...input} className={lo.plain} value={show(min)} onChange={(e) => { lo.touch(); onMin(digits(e.target.value)); }} placeholder="Min" />
        <span className="text-muted-foreground">–</span>
        <Input {...input} className={hi.plain} aria-label="Salary maximum" value={show(max)} onChange={(e) => { hi.touch(); onMax(digits(e.target.value)); }} placeholder="Max" />
      </div>
      {invalid && <p className="text-xs text-destructive">Minimum can't be above the maximum.</p>}
    </Field>
  );
}

export function TextAreaField({ label, value, onChange, className, rows = 4, textareaClassName }: Base & { rows?: number; textareaClassName?: string }) {
  const id = useId();
  const { plain, touch } = useInline();
  return (
    <Field label={label} id={id} className={className}>
      <Textarea id={id} value={value} rows={rows} className={cn(plain, textareaClassName)} onChange={(e) => { touch(); onChange(e.target.value); }} />
    </Field>
  );
}

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
// Google Docs wraps every copy in <b style="font-weight:normal">, which would bold the whole paste.
turndown.addRule("gdocs-wrapper", {
  filter: (node) => node.nodeName === "B" && (node as HTMLElement).style.fontWeight === "normal",
  replacement: (content) => content,
});

const MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks];
const MARKDOWN_COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

// Markdown rendered read-only, styled like a MarkdownField that isn't being edited.
export const MarkdownText = ({ value, className }: { value: string; className?: string }) => (
  <div className={cn("markdown text-sm", className)}>
    <Markdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>{value}</Markdown>
  </div>
);

// Long text held as markdown: shown rendered until focused, then edited raw. Pasting rich text (a job
// posting, a Google Doc) converts it to markdown instead of flattening it. `autoFormat` adds a button
// that gives flat plain text (one line per paragraph) headings and bullets.
export function MarkdownField({ label, value, onChange, className, rows = 4, textareaClassName, placeholder, onBlur, autoFocus, autoFormat }: Base & {
  rows?: number; textareaClassName?: string; placeholder?: string; onBlur?: () => void; autoFocus?: boolean; autoFormat?: boolean;
}) {
  const id = useId();
  const { plain, touch } = useInline();
  const [editing, setEditing] = useState(false);
  const change = (v: string) => { touch(); onChange(v); };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html) return;
    e.preventDefault();
    const el = e.currentTarget;
    // Turndown pads list markers ("-   item"); tighten them to one space.
    const md = turndown.turndown(html).replace(/^(\s*)([-*]|\d+\.) +/gm, "$1$2 ");
    el.setRangeText(md, el.selectionStart, el.selectionEnd, "end");
    change(el.value);
  };

  const format = () => {
    const prev = value;
    const next = autoMarkdown(prev);
    if (next === prev) { toast("Already formatted"); return; }
    change(next);
    toast("Formatted as markdown", { action: { label: "Undo", onClick: () => change(prev) } });
  };

  const action = autoFormat && value.trim() ? (
    // preventDefault on mousedown keeps the textarea focused, so editing doesn't close.
    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onMouseDown={(e) => e.preventDefault()} onClick={format}>
      <WandSparkles /> Auto Markdown
    </Button>
  ) : undefined;

  return (
    <Field label={label} id={id} className={className} action={action}>
      {!editing && value.trim() ? (
        <div
          id={id}
          tabIndex={0}
          title="Click to edit"
          // Focus from a link inside shouldn't switch to editing; the link opens instead.
          onFocus={(e) => e.target === e.currentTarget && setEditing(true)}
          className={cn(
            "markdown min-h-16 w-full cursor-text rounded-md border border-input px-3 py-2 text-base shadow-xs md:text-sm dark:bg-input/30",
            plain,
            textareaClassName,
          )}
        >
          <Markdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>{value}</Markdown>
        </div>
      ) : (
        <Textarea
          id={id}
          value={value}
          rows={rows}
          autoFocus={editing || autoFocus}
          placeholder={placeholder}
          className={cn(plain, textareaClassName)}
          onChange={(e) => change(e.target.value)}
          onPaste={onPaste}
          onBlur={() => { setEditing(false); onBlur?.(); }}
        />
      )}
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, labels, className }: Base & { options: readonly string[]; labels?: Record<string, string> }) {
  const id = useId();
  // Keep unknown values (e.g. imported ones) selectable.
  const all = value && !options.includes(value) ? [value, ...options] : options;
  const { plain, touch } = useInline();
  return (
    <Field label={label} id={id} className={className}>
      <Select value={value} onValueChange={(v) => { touch(); onChange(v); }}>
        <SelectTrigger id={id} className={cn("w-full", plain)}><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {all.map((o) => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

// A single number, held as a string ("" is no value). `money` shows whole dollars with commas and is masked by
// "hide financials"; `decimals` allows a fractional part (percentages, years); `unit` is shown after the box.
export function NumberField({ label, value, onChange, money, decimals, unit, placeholder, className }: Base & {
  money?: boolean; decimals?: boolean; unit?: string; placeholder?: string;
}) {
  const id = useId();
  const { plain, touch } = useInline();
  const clean = (v: string) =>
    decimals ? v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 7) : v.replace(/\D/g, "").slice(0, money ? 9 : 3);
  const shown = money && value ? Number(value).toLocaleString("en-US") : value;
  return (
    <Field label={label} id={id} className={className}>
      <div className="flex items-center gap-2">
        {money && <span className="text-muted-foreground">$</span>}
        <Input
          id={id}
          type="text"
          inputMode={decimals ? "decimal" : "numeric"}
          data-financial={money ? "" : undefined}
          value={shown}
          placeholder={placeholder}
          className={cn(plain, money && "ml-0 w-full")}
          onChange={(e) => { touch(); onChange(clean(e.target.value)); }}
        />
        {unit && <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>}
      </div>
    </Field>
  );
}

const TRI_STATE = [{ key: "1", label: "Yes" }, { key: "0", label: "No" }, { key: "", label: "?", title: "Unknown" }] as const;

// Yes / No / Unknown, held as "1", "0" or "".
export function TriStateField({ label, value, onChange, className }: Base) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-sm">{label}</span>
      <Segmented options={TRI_STATE} value={value as "1" | "0" | ""} onChange={onChange} />
    </div>
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

/** What the app worked out for a fact field, shown while the field is left on automatic. */
export type FactHint = { values: string[]; reason: string; likely?: { value: string; reason: string } };

// `quiet` holds back the "Unknown" warning, e.g. on a new job before there's a title to work from.
function FactStatus({ manual, auto, onReset, onUseLikely, quiet }: { manual: boolean; auto: FactHint; onReset: () => void; onUseLikely: (v: string) => void; quiet?: boolean }) {
  const link = "underline underline-offset-4 hover:text-foreground";
  if (manual) {
    return (
      <p className="text-xs text-muted-foreground">
        Set by hand.{" "}
        {auto.values.length > 0 && <button type="button" className={link} onClick={onReset}>Back to automatic ({auto.values.join(", ")})</button>}
      </p>
    );
  }
  if (auto.values.length) return <p className="text-xs text-muted-foreground">Automatic · {auto.reason}</p>;
  if (auto.likely) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-500">
        Likely {auto.likely.value}: {auto.likely.reason}.{" "}
        <button type="button" className={link} onClick={() => onUseLikely(auto.likely!.value)}>Use it</button>
      </p>
    );
  }
  if (quiet) return null;
  return <p className="text-xs text-amber-600 dark:text-amber-500">Unknown: {auto.reason.toLowerCase()}. Pick one.</p>;
}

// Job Types: one pill per type. Left alone it shows the automatic types; toggling a pill sets them by hand,
// starting from what's shown.
export function JobTypesField({ label = "Job Type", value, onChange, options, auto, quiet, className }: {
  label?: string; value: string[]; onChange: (value: string[]) => void; options: readonly string[]; auto: FactHint; quiet?: boolean; className?: string;
}) {
  const manual = value.length > 0;
  const shown = manual ? value : auto.values;
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  const toggle = (o: string) => onChange(shown.includes(o) ? shown.filter((v) => v !== o) : [...shown, o]);
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label={label}>
        {all.map((o) => {
          const on = shown.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o)}
              className={cn(
                "rounded-full border px-2.5 py-0.5",
                on && manual && "border-transparent bg-primary text-primary-foreground",
                on && !manual && "border-dashed border-primary text-foreground",
                !on && "text-muted-foreground hover:text-foreground",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
      <FactStatus manual={manual} auto={auto} onReset={() => onChange([])} onUseLikely={(v) => onChange([v])} quiet={quiet} />
    </div>
  );
}

// Company Type: a select whose empty state shows the automatic value. Picking one sets it by hand.
export function CompanyTypeField({ label = "Company Type", value, onChange, options, auto, quiet, className }: {
  label?: string; value: string; onChange: (value: string) => void; options: readonly string[]; auto: FactHint; quiet?: boolean; className?: string;
}) {
  const id = useId();
  const all = value && !options.includes(value) ? [value, ...options] : options;
  const { plain, touch } = useInline();
  const set = (v: string) => { touch(); onChange(v); };
  return (
    <Field label={label} id={id} className={className}>
      {/* Keyed on manual vs automatic so clearing the value brings the placeholder back. */}
      <Select key={value ? "manual" : "auto"} value={value || undefined} onValueChange={set}>
        <SelectTrigger id={id} className={cn("w-full", plain)}>
          <SelectValue placeholder={auto.values[0] ? <span className="italic">{auto.values[0]}</span> : "Unknown"} />
        </SelectTrigger>
        <SelectContent>
          {all.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
      <FactStatus manual={!!value} auto={auto} onReset={() => set("")} onUseLikely={set} quiet={quiet} />
    </Field>
  );
}
