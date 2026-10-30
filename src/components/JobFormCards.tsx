import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComboField, CompanyTypeField, JobTypesField, MarkdownField, SelectField, TextField } from "@/components/fields";
import { COMP_KEYS, CompensationCard, compToPatch, isCompKey } from "@/components/CompensationCard";
import { type Job, type JobInput, useSuggestions } from "@/lib/api";
import { type FactContext, factHints, typeNames } from "@/lib/jobFacts";
import { toSalary } from "@/lib/salary";
import { APPLIED_VIA, FITS, RESUME_VERSIONS, WORK_MODES, sortResumeVersions } from "@/lib/options";

export const EDITABLE = [
  "title", "normalized_title", "company", "company_type", "fit", "salary_min", "salary_max", "job_types", "resume_version", "work_mode", "applied_date",
  "follow_up_on", "jd_link", "applied_via", "agency_name", "contact_name", "contact_email", "contact_phone", "contact_linkedin", "offer_info", "notes",
  "job_description", "cover_letter", ...COMP_KEYS,
] as const satisfies readonly (keyof JobInput)[];

export type Draft = Record<(typeof EDITABLE)[number], string>;

// Every draft value is a string; Job Types are held as JSON so a change in the list counts as an edit.
export const toDraft = (job: Job): Draft =>
  Object.fromEntries(EDITABLE.map((k) => [k, k === "job_types" ? JSON.stringify(job.job_types ?? []) : String(job[k] ?? "")])) as Draft;

// A new job's draft: every field empty, then whatever is given.
export const blankDraft = (values: Partial<Draft> = {}): Draft => ({
  ...(Object.fromEntries(EDITABLE.map((k) => [k, k === "job_types" ? "[]" : ""])) as Draft),
  ...values,
});

// A draft string back to what the API takes.
export const toPatch = (k: keyof Draft, v: string): unknown =>
  k === "applied_date" || k === "follow_up_on" ? v || null
    : k === "salary_min" || k === "salary_max" ? toSalary(v)
    : k === "job_types" ? JSON.parse(v)
    : isCompKey(k) ? compToPatch(k, v)
    : v;

// The fields a job should have, filled or not. Only ever a soft check: saving never waits on them.
export const keyFieldsFilled = (d: Pick<Draft, "title" | "company" | "jd_link" | "resume_version">, savedOnly = false) =>
  [d.title, d.company, d.jd_link, ...(savedOnly ? [] : [d.resume_version])].every((v) => v.trim());

// The job's editable details as cards, shared by the job page's Edit view and the Add Job page.
// The order classes stack them under the job page's History and Notes below lg.
export function JobFormCards({ draft, set, badRange, hints, factCtx, applied = true, autoFocus }: {
  draft: Draft;
  set: (key: keyof Draft) => (value: string) => void;
  badRange: boolean;
  hints: ReturnType<typeof factHints>;
  factCtx: FactContext;
  /** The Applied date field. The Add Job page leaves it out and logs Applied in its History instead. */
  applied?: boolean;
  autoFocus?: boolean;
}) {
  const titles = useSuggestions("title", []);
  const resumeVersions = sortResumeVersions(useSuggestions("resume_version", RESUME_VERSIONS));
  const agencyNames = useSuggestions("agency_name", []);
  const [showOverride, setShowOverride] = useState(!!draft.normalized_title);

  return (
    <>
      {/* In the order you'd fill it in with the posting open: what and where, the role, how you applied, then your take. */}
      <Card className="order-1 lg:order-none">
        <CardHeader><CardTitle>Job</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ComboField label="Job Title" value={draft.title} onChange={set("title")} options={titles} autoFocus={autoFocus} />
            <TextField label="Company" value={draft.company} onChange={set("company")} />
            <TextField label="Job Description Link" value={draft.jd_link} onChange={set("jd_link")} placeholder="https://" className="sm:col-span-2" />
          </div>

          {/* The Unknown warnings wait for a title, so a blank new job doesn't open full of them. */}
          <Section title="Role">
            <SelectField label="Work Mode" value={draft.work_mode} onChange={set("work_mode")} options={WORK_MODES} />
            <CompanyTypeField value={draft.company_type} onChange={set("company_type")} options={typeNames(factCtx, "company")} auto={hints.companyType} quiet={!draft.title.trim()} />
            <JobTypesField
              value={JSON.parse(draft.job_types) as string[]}
              onChange={(v) => set("job_types")(JSON.stringify(v))}
              options={typeNames(factCtx, "job")}
              auto={hints.jobTypes}
              quiet={!draft.title.trim()}
              className="sm:col-span-2"
            />
          </Section>

          <Section title="Application">
            <ComboField label="Resume Version" value={draft.resume_version} onChange={set("resume_version")} options={resumeVersions} placeholder="General 1.0" />
            <SelectField label="Applied Via" value={draft.applied_via} onChange={set("applied_via")} options={APPLIED_VIA} />
            {/* Only asked for when an agency was involved, or one is already noted. */}
            {(draft.applied_via === "Recruiting Agency" || draft.agency_name) && (
              <ComboField label="Agency Name" value={draft.agency_name} onChange={set("agency_name")} options={agencyNames} />
            )}
            {applied && <TextField label="Applied" type="date" value={draft.applied_date} onChange={set("applied_date")} />}
          </Section>

          <Section title="Your Take">
            <SelectField label="Fit" value={draft.fit} onChange={set("fit")} options={FITS} />
          </Section>

          {/* Rarely needed, so folded away; open when it already holds a value. */}
          <details open={showOverride} onToggle={(e) => setShowOverride(e.currentTarget.open)} className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">Title analysis override</summary>
            <TextField
              label="Normalized Title (for title analysis only)"
              value={draft.normalized_title}
              onChange={set("normalized_title")}
              placeholder="Optional. e.g. Senior Software Engineer"
              className="mt-3"
            />
          </details>
        </CardContent>
      </Card>

      <Card className="order-3 lg:order-none">
        <CardHeader><CardTitle>Point of Contact</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Name" value={draft.contact_name} onChange={set("contact_name")} />
          <TextField label="Email" type="email" value={draft.contact_email} onChange={set("contact_email")} />
          <TextField label="Phone" type="tel" value={draft.contact_phone} onChange={set("contact_phone")} />
          <TextField label="LinkedIn URL" value={draft.contact_linkedin} onChange={set("contact_linkedin")} placeholder="https://linkedin.com/in/…" />
        </CardContent>
      </Card>

      <div className="order-3 lg:order-none">
        <CompensationCard draft={draft} set={set} badRange={badRange} />
      </div>

      <Card className="order-3 lg:order-none">
        <CardHeader><CardTitle>Job Description</CardTitle></CardHeader>
        <CardContent>
          <MarkdownField
            label="Paste the full job description here so you have a copy if the posting comes down."
            value={draft.job_description}
            onChange={set("job_description")}
            autoFormat
            rows={18}
            textareaClassName="max-h-[500px] overflow-y-auto"
          />
        </CardContent>
      </Card>

      <Card className="order-3 lg:order-none">
        <CardHeader><CardTitle>Cover Letter</CardTitle></CardHeader>
        <CardContent>
          <MarkdownField
            label="The cover letter you sent for this role."
            value={draft.cover_letter}
            onChange={set("cover_letter")}
            rows={14}
            textareaClassName="max-h-[500px] overflow-y-auto"
          />
        </CardContent>
      </Card>
    </>
  );
}

// A labelled group of fields inside the Job card.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
