import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PillToggle } from "@/components/ui/pill-toggle";
import { NumberField, SalaryRangeField, SelectField, TextAreaField, TriStateField } from "@/components/fields";
import { type Job, useProfile } from "@/lib/api";
import { annualPackage, BENEFITS, benefitsSummary, changeFrom, COMP_SOURCES, EQUITY_TYPES, hasExtras, paidDaysOff, type TargetFit, targetFit } from "@/lib/compensation";
import { STATUS_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { formatSalary, k, toSalary } from "@/lib/salary";

// The compensation fields beyond base salary, as edited on the job page.
const NUMBER_KEYS = [
  "bonus_pct", "bonus_amount", "equity_annual", "equity_vest_years", "signing_bonus", "relocation", "match_rate_pct",
  "match_cap_pct", "hsa_employer", "stipends_annual", "medical_premium_pct", "pto_days", "sick_days", "holidays",
  "parental_leave_weeks",
] as const satisfies readonly (keyof Job)[];
const BENEFIT_KEYS = BENEFITS.map((b) => b.key);
export const COMP_KEYS = ["comp_source", "equity_type", "pto_unlimited", ...NUMBER_KEYS, ...BENEFIT_KEYS] as const satisfies readonly (keyof Job)[];
type CompKey = (typeof COMP_KEYS)[number];

export const isCompKey = (key: string): key is CompKey => (COMP_KEYS as readonly string[]).includes(key);

const num = (v: string) => (v.trim() === "" ? null : Number(v));

// Draft strings back to API values: numbers and tri-states are null when blank.
export function compToPatch(key: CompKey, value: string): unknown {
  if (key === "pto_unlimited") return value === "true";
  if (key === "comp_source" || key === "equity_type") return value;
  return num(value);
}

type Draft = Record<CompKey | "salary_min" | "salary_max" | "offer_info", string>;

// The draft as a job, so the summary follows the fields as they're typed.
const fromDraft = (d: Draft) => ({
  ...(Object.fromEntries(NUMBER_KEYS.map((key) => [key, num(d[key])])) as Record<(typeof NUMBER_KEYS)[number], number | null>),
  ...(Object.fromEntries(BENEFIT_KEYS.map((key) => [key, num(d[key])])) as Record<(typeof BENEFIT_KEYS)[number], 0 | 1 | null>),
  salary_min: toSalary(d.salary_min),
  salary_max: toSalary(d.salary_max),
  pto_unlimited: d.pto_unlimited === "true",
});

// A titled group of fields that expands and collapses. It starts open only when `filled`, so a posting stays compact.
function Section({ title, filled, children }: { title: string; filled: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(filled);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} /> {title}
      </button>
      {open && children}
    </section>
  );
}

const FIT_TEXT: Record<TargetFit["kind"], { label: string; detail: (pct: number) => string }> = {
  within: { label: "In range", detail: (pct) => `Your target sits ${pct}% of the way up the range.` },
  above: { label: "Below your target", detail: (pct) => `The range tops out ${pct}% under your target.` },
  below: { label: "A step up", detail: (pct) => `The range starts ${pct}% above your target.` },
};

// Green when the target is in the lower half of the range (room to grow), the Applied amber in the upper half,
// blue when the whole range is above it, rose when the range tops out under it.
const fitDot = (fit: TargetFit) =>
  fit.kind === "below" ? "bg-blue-500"
    : fit.kind === "above" ? "bg-rose-500"
    : fit.pct <= 50 ? "bg-emerald-500"
    : STATUS_COLORS.Applied.dot;

// The base range as a bar with the Base Salary Target as a dot, colored by fitDot: inside the bar when it's in range, past an end when not.
function TargetBar({ fit }: { fit: TargetFit }) {
  const left = fit.kind === "within" ? 15 + fit.pct * 0.7 : fit.kind === "above" ? 95 : 5;
  return (
    <div className="relative h-3 w-40" aria-hidden>
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted-foreground/30" style={{ left: "15%", right: "15%" }} />
      <div className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${fitDot(fit)}`} style={{ left: `${left}%` }} />
    </div>
  );
}

export function CompensationCard({ draft, set, badRange }: { draft: Draft; set: (key: keyof Draft) => (value: string) => void; badRange: boolean }) {
  const comp = fromDraft(draft);
  const pkg = annualPackage(comp);
  const daysOff = paidDaysOff(comp);
  const benefits = benefitsSummary(comp);
  const { data: profile } = useProfile();
  const fit = targetFit(comp.salary_min, comp.salary_max, profile?.salary_target ?? null);
  const daysDiff = !daysOff.unlimited && daysOff.days != null && profile?.past_days_off != null ? daysOff.days - profile.past_days_off : null;
  const vsPast = [
    ["base", changeFrom(profile?.past_base_salary ?? null, comp.salary_min, comp.salary_max)],
    // With nothing beyond base, the package is just the base salary, so it isn't compared.
    ["package", hasExtras(comp) ? changeFrom(profile?.past_package ?? null, pkg?.min ?? null, pkg?.max ?? null) : null],
    ["days off", daysDiff == null ? null : `${daysDiff > 0 ? "+" : daysDiff < 0 ? "−" : "±"}${Math.abs(daysDiff)}`],
  ].filter((p): p is [string, string] => p[1] != null);
  const filled = (...keys: (keyof Draft)[]) => keys.some((key) => draft[key] !== "" && draft[key] !== "false");
  const money = (key: keyof Draft, label: string, unit?: string) => (
    <NumberField label={label} value={draft[key]} onChange={set(key)} money unit={unit} />
  );

  return (
    <Card>
      <CardHeader><CardTitle>Compensation <span className="text-sm font-normal text-muted-foreground">(WIP)</span></CardTitle></CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Est. annual package</p>
            <p className="text-lg font-semibold">{pkg ? formatSalary(pkg.min, pkg.max) : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {pkg && hasExtras(comp) ? "Base plus bonus, equity, 401k match, HSA and stipends. One-time cash not included." : "Base salary only so far."}
            </p>
          </div>
          {fit && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Base vs. target</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{FIT_TEXT[fit.kind].label}</span>
                <TargetBar fit={fit} />
              </div>
              <p className="text-xs text-muted-foreground">{FIT_TEXT[fit.kind].detail(fit.pct)}</p>
            </div>
          )}
          <SelectField
            label="Source"
            value={draft.comp_source}
            onChange={set("comp_source")}
            options={COMP_SOURCES.map((o) => o.value)}
            labels={Object.fromEntries(COMP_SOURCES.map((o) => [o.value, o.label]))}
            className="w-32"
          />
        </div>
        {vsPast.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Vs. past job: {vsPast.map(([what, change]) => `${what} ${change}`).join(" · ")}
          </p>
        )}
        {(daysOff.days != null || daysOff.unlimited || benefits.yes + benefits.no > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {(daysOff.days != null || daysOff.unlimited) && (
              <span>{daysOff.unlimited ? `Unlimited PTO${daysOff.days ? ` + ${daysOff.days} days` : ""}` : `${daysOff.days} paid days off`}</span>
            )}
            {benefits.yes + benefits.no > 0 && (
              <span>Benefits: {benefits.yes} yes · {benefits.no} no{benefits.unknown ? ` · ${benefits.unknown} unknown` : ""}</span>
            )}
          </div>
        )}

        <Section title="Pay" filled={false}>
          <SalaryRangeField min={draft.salary_min} max={draft.salary_max} onMin={set("salary_min")} onMax={set("salary_max")} invalid={badRange} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField label="Target bonus" value={draft.bonus_pct} onChange={set("bonus_pct")} decimals unit="% of base" />
            {money("bonus_amount", "Or flat bonus", "/ yr")}
            <SelectField
              label="Equity"
              value={draft.equity_type}
              onChange={set("equity_type")}
              options={EQUITY_TYPES.map((o) => o.value)}
              labels={Object.fromEntries(EQUITY_TYPES.map((o) => [o.value, o.label]))}
            />
            {money("equity_annual", "Equity value", "/ yr")}
            <NumberField label="Vesting" value={draft.equity_vest_years} onChange={set("equity_vest_years")} decimals unit="years" />
          </div>
        </Section>

        <Section title="Retirement & accounts" filled={filled("match_rate_pct", "match_cap_pct", "hsa_employer", "stipends_annual")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField label="401k match" value={draft.match_rate_pct} onChange={set("match_rate_pct")} decimals unit="% of contributions" />
            <NumberField label="Up to" value={draft.match_cap_pct} onChange={set("match_cap_pct")} decimals unit="% of salary" />
            {money("hsa_employer", "Employer HSA", "/ yr")}
            {money("stipends_annual", "Stipends (home office, learning…)", "/ yr")}
          </div>
          {comp.match_rate_pct != null && comp.match_cap_pct != null && comp.salary_max != null && (
            <p className="text-xs text-muted-foreground">
              Worth up to {k(Math.round((comp.salary_max * comp.match_cap_pct * comp.match_rate_pct) / 10_000))} a year at the top of the range.
            </p>
          )}
        </Section>

        <Section title="One-time" filled={filled("signing_bonus", "relocation")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {money("signing_bonus", "Signing bonus")}
            {money("relocation", "Relocation")}
          </div>
        </Section>

        <Section title="Benefits" filled={filled(...BENEFIT_KEYS, "medical_premium_pct")}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {BENEFITS.map((b) => <TriStateField key={b.key} label={b.label} value={draft[b.key]} onChange={set(b.key)} />)}
          </div>
          <NumberField label="Medical premium paid by employer" value={draft.medical_premium_pct} onChange={set("medical_premium_pct")} unit="%" className="sm:w-1/2" />
        </Section>

        <Section title="Time off" filled={filled("pto_days", "pto_unlimited", "holidays", "sick_days", "parental_leave_weeks")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-end gap-2">
              <NumberField label="PTO" value={draft.pto_days} onChange={set("pto_days")} unit="days / yr" className="flex-1" />
              <PillToggle
                pressed={draft.pto_unlimited === "true"}
                onClick={() => set("pto_unlimited")(String(draft.pto_unlimited !== "true"))}
                className="mb-1.5 text-xs"
              >
                Unlimited
              </PillToggle>
            </div>
            <NumberField label="Paid holidays" value={draft.holidays} onChange={set("holidays")} unit="days / yr" />
            <NumberField label="Sick days (if separate)" value={draft.sick_days} onChange={set("sick_days")} unit="days / yr" />
            <NumberField label="Parental leave" value={draft.parental_leave_weeks} onChange={set("parental_leave_weeks")} unit="weeks" />
          </div>
        </Section>

        <TextAreaField label="Compensation Notes" value={draft.offer_info} onChange={set("offer_info")} rows={3} />
      </CardContent>
    </Card>
  );
}
