import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, ExternalLink, Mail, Phone, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComboField, InlineFields, SalaryRangeField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { salaryRangeInvalid, toSalary } from "@/lib/salary";
import { HistoryPanel } from "@/components/HistoryPanel";
import { EVENT_COLORS } from "@/lib/colors";
import { StatusBadge } from "@/components/StatusBadge";
import { type Job, type JobInput, useDeleteJob, useJob, useRestoreJob, useSuggestions, useUpdateJob } from "@/lib/api";
import { daysSince, formatDate, today } from "@/lib/format";
import { isEditable, overlayOpen, useHotkey } from "@/hooks/hotkeys";
import { useDraftForm } from "@/hooks/useDraftForm";
import { loadOrder, saveSelected } from "@/lib/listOrder";
import { jobActions, usePalette, usePaletteActions } from "@/components/CommandPalette";
import { MOD } from "@/lib/shortcuts";
import { FilterAccordion } from "@/components/stats/FilterMenu";
import { APPLIED_VIA, COMPANY_TYPES, FITS, GHOSTED_DAYS, JOB_TYPES, RESUME_VERSIONS, WORK_MODES, sortResumeVersions } from "@/lib/options";

// An event type name in its History color.
const term = (type: string) => <span className={EVENT_COLORS[type].text}>{type}</span>;

const EDITABLE = [
  "title", "normalized_title", "company", "company_type", "fit", "salary_min", "salary_max", "job_type", "resume_version", "work_mode", "applied_date",
  "follow_up_on", "jd_link", "applied_via", "agency_name", "contact_name", "contact_email", "contact_phone", "contact_linkedin", "offer_info", "notes",
  "job_description", "cover_letter",
] as const satisfies readonly (keyof JobInput)[];

type Draft = Record<(typeof EDITABLE)[number], string>;

const toDraft = (job: Job): Draft =>
  Object.fromEntries(EDITABLE.map((k) => [k, String(job[k] ?? "")])) as Draft;

export default function JobDetail() {
  const id = Number(useParams().id);
  const { data, isLoading } = useJob(id);
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!data) return <p>Job not found. <Link to="/jobs" className="underline">Back to jobs</Link></p>;
  return <JobEditor key={data.id} job={data} />;
}

function JobEditor({ job }: { job: NonNullable<ReturnType<typeof useJob>["data"]> }) {
  // Bumped on save and discard so edited fields go back to plain text.
  const [epoch, setEpoch] = useState(0);
  const update = useUpdateJob(job.id);
  const deleteJob = useDeleteJob();
  const restoreJob = useRestoreJob();
  const navigate = useNavigate();
  const location = useLocation();
  const titles = useSuggestions("title", []);
  const jobTypes = useSuggestions("job_type", JOB_TYPES);
  const resumeVersions = sortResumeVersions(useSuggestions("resume_version", RESUME_VERSIONS));
  const agencyNames = useSuggestions("agency_name", []);

  const { draft, setDraft, saved, setSaved, set, changed, canSave, save } = useDraftForm(EDITABLE, toDraft(job), {
    update,
    valid: (d) => !!d.title.trim() && !salaryRangeInvalid(d.salary_min, d.salary_max),
    toPatch: (k, v) => (k === "applied_date" || k === "follow_up_on" ? v || null : k === "salary_min" || k === "salary_max" ? toSalary(v) : v),
    onSaved: () => setEpoch((n) => n + 1),
    // Step back when we came from the list so its filters (kept in the URL) survive.
    onLeave: () => ((location.state as { fromList?: boolean } | null)?.fromList ? navigate(-1) : navigate("/jobs")),
  });
  const badRange = salaryRangeInvalid(draft.salary_min, draft.salary_max);

  const remove = () => {
    deleteJob.mutate(job.id, {
      onSuccess: () => {
        navigate("/jobs");
        toast.success("Moved to trash", {
          description: job.title,
          action: { label: "Undo", onClick: () => restoreJob.mutate(job.id) },
          duration: 8000,
        });
      },
    });
  };

  const { logHistory } = usePalette();

  // J and K step through the jobs list's current order, like they do on the list itself.
  const order = loadOrder();
  const at = order.indexOf(job.id);
  const nextId = at >= 0 ? order[at + 1] : undefined;
  const prevId = at > 0 ? order[at - 1] : undefined;
  const step = (id: number | undefined) => {
    if (id === undefined || (changed.length > 0 && !window.confirm("Discard unsaved changes?"))) return;
    saveSelected(id);
    navigate(`/jobs/${id}`, { replace: true, state: location.state });
  };
  const stepKey = (id: number | undefined) => (e: KeyboardEvent) => {
    if (isEditable(e.target) || overlayOpen()) return;
    e.preventDefault();
    step(id);
  };
  useHotkey("j", stepKey(nextId));
  useHotkey("k", stepKey(prevId));

  // Applies right away and leaves any other unsaved edits alone.
  const setFollowUp = (date: string | null) =>
    update.mutate({ follow_up_on: date }, {
      onSuccess: () => {
        const value = date ?? "";
        setSaved((d) => ({ ...d, follow_up_on: value }));
        setDraft((d) => ({ ...d, follow_up_on: value }));
        toast.success(date ? `Follow-up scheduled for ${formatDate(date)}` : "Follow-up date cleared");
      },
      onError: (err) => toast.error(err.message),
    });

  usePaletteActions([
    ...(nextId !== undefined ? [{ id: "next", label: "Next job", group: "This job", keys: ["J"], keywords: "following", run: () => step(nextId) }] : []),
    ...(prevId !== undefined ? [{ id: "prev", label: "Previous job", group: "This job", keys: ["K"], keywords: "back", run: () => step(prevId) }] : []),
    ...(job.deleted_at ? [] : jobActions(job, { logHistory, setFollowUp, group: "This job", withGeneric: false })),
    ...(changed.length > 0 ? [{ id: "save", label: "Save changes", group: "This job", keys: [MOD, "S"], run: () => { if (canSave) save(); } }] : []),
  ]);

  const restore = () => restoreJob.mutate(job.id, { onSuccess: () => toast.success("Restored from trash") });

  const quiet = daysSince(job.last_activity ?? job.applied_date);

  return (
    <InlineFields epoch={epoch}>
    <div className="space-y-5 pb-20">
      <title>{`${saved.title} | Application Tracker`}</title>
      {job.deleted_at && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
          This job is in the trash.
          <Button size="sm" variant="outline" className="ml-auto" onClick={restore}>
            <RotateCcw /> Restore
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Back"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{saved.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground">
            <span>{saved.company}</span>
            <StatusBadge job={job} />
            {saved.jd_link && (
              <a href={saved.jd_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm hover:text-foreground">
                Job description <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>
        {!job.deleted_at && (
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={remove}>
            <Trash2 /> Delete
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>Job</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <ComboField label="Job Title" value={draft.title} onChange={set("title")} options={titles} />
              <TextField label="Company" value={draft.company} onChange={set("company")} />
              <TextField
                label="Normalized Title (for title analysis only)"
                value={draft.normalized_title}
                onChange={set("normalized_title")}
                placeholder="Optional. e.g. Director of eCommerce"
                className="sm:col-span-2"
              />
              <ComboField label="Job Type" value={draft.job_type} onChange={set("job_type")} options={jobTypes} />
              <SelectField label="Company Type" value={draft.company_type} onChange={set("company_type")} options={COMPANY_TYPES} />
              <SelectField label="Fit" value={draft.fit} onChange={set("fit")} options={FITS} />
              <SelectField label="Work Mode" value={draft.work_mode} onChange={set("work_mode")} options={WORK_MODES} />
              <TextField label="Job Description Link" value={draft.jd_link} onChange={set("jd_link")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Application</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField label="Applied" type="date" value={draft.applied_date} onChange={set("applied_date")} />
              <ComboField label="Resume Version" value={draft.resume_version} onChange={set("resume_version")} options={resumeVersions} placeholder="Product 1.2" />
              <SelectField label="Applied Via" value={draft.applied_via} onChange={set("applied_via")} options={APPLIED_VIA} />
              <ComboField label="Agency Name" value={draft.agency_name} onChange={set("agency_name")} options={agencyNames} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Point of Contact</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField label="Name" value={draft.contact_name} onChange={set("contact_name")} />
              <div className="flex items-end gap-1">
                <TextField label="Email" type="email" value={draft.contact_email} onChange={set("contact_email")} className="flex-1" />
                {saved.contact_email && (
                  <Button asChild variant="ghost" size="icon" title="Send email">
                    <a href={`mailto:${saved.contact_email}`}><Mail /></a>
                  </Button>
                )}
              </div>
              <div className="flex items-end gap-1">
                <TextField label="Phone" type="tel" value={draft.contact_phone} onChange={set("contact_phone")} className="flex-1" />
                {saved.contact_phone && (
                  <Button asChild variant="ghost" size="icon" title="Call">
                    <a href={`tel:${saved.contact_phone}`}><Phone /></a>
                  </Button>
                )}
              </div>
              <div className="flex items-end gap-1">
                <TextField label="LinkedIn URL" value={draft.contact_linkedin} onChange={set("contact_linkedin")} placeholder="https://linkedin.com/in/…" className="flex-1" />
                {saved.contact_linkedin && (
                  <Button asChild variant="ghost" size="icon" title="Open LinkedIn profile">
                    <a href={saved.contact_linkedin} target="_blank" rel="noreferrer"><ExternalLink /></a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Compensation</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <SalaryRangeField min={draft.salary_min} max={draft.salary_max} onMin={set("salary_min")} onMax={set("salary_max")} invalid={badRange} />
              <TextAreaField label="Offer Info (base, bonus, equity, benefits, deadline…)" value={draft.offer_info} onChange={set("offer_info")} rows={3} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card className="h-fit">
            <CardHeader className="flex items-start justify-between">
              <div className="space-y-1.5">
                <CardTitle>History</CardTitle>
                {quiet !== null && (
                  <p className="text-xs text-muted-foreground">
                    {quiet === 0 ? "Active today" : `${quiet} ${quiet === 1 ? "day" : "days"} since last activity`}
                  </p>
                )}
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                    <CalendarClock />
                    {draft.follow_up_on ? `Follow up ${formatDate(draft.follow_up_on)}` : "Schedule follow up"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader><DialogTitle>Scheduled Follow Up</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <TextField label="Follow Up On" type="date" value={draft.follow_up_on} onChange={set("follow_up_on")} />
                    <p className="text-xs text-muted-foreground">
                      {draft.follow_up_on > today()
                        ? `Held out of Follow Up and Ghosted until ${formatDate(draft.follow_up_on)}.`
                        : "Pick a date to keep this job out of Follow Up and Ghosted until then."}
                    </p>
                  </div>
                  <DialogFooter>
                    {draft.follow_up_on && <Button variant="outline" onClick={() => set("follow_up_on")("")}>Clear</Button>}
                    <DialogClose asChild><Button>Done</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <HistoryPanel jobId={job.id} events={job.events} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <TextAreaField label="Notes" value={draft.notes} onChange={set("notes")} rows={8} />
            </CardContent>
          </Card>

          <FilterAccordion title="History Terms" className="space-y-3 text-xs text-muted-foreground">
            <p>{term("Applied")}: you sent the application. Sets the status to Applied.</p>
            <p>{term("Contact")}: they reached out to you. Doesn't change the status.</p>
            <p>{term("Follow-Up")}: a check-in you sent. Doesn't change the status.</p>
            <p>{term("Screen")}: a recruiter or HR screen. Sets the status to Interviewed, or Scheduled while it is still ahead.</p>
            <p>{term("Interview")}: an interview with the company. Sets the status to Interviewed, or Scheduled while it is still ahead.</p>
            <p>{term("Offer")}: they made you an offer.</p>
            <p>{term("Accepted")}: you accepted it.</p>
            <p>{term("Rejection")}: they turned you down.</p>
            <p>{term("Withdrew")}: you pulled out of the process.</p>
            <p>{term("Ghosted")}: you logged that they stopped responding. The status also changes to Ghosted automatically after {GHOSTED_DAYS}+ days of silence.</p>
            <p>{term("Scam")}: the job turned out to be a scam. Sets the status to Scam.</p>
            <p>{term("Note")}: anything else worth remembering. Doesn't change the status.</p>
          </FilterAccordion>
        </div>

        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Job Description</CardTitle></CardHeader>
          <CardContent>
            <TextAreaField
              label="Paste the full job description here so you have a copy if the posting comes down."
              value={draft.job_description}
              onChange={set("job_description")}
              rows={18}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Cover Letter</CardTitle></CardHeader>
          <CardContent>
            <TextAreaField
              label="The cover letter you sent for this role."
              value={draft.cover_letter}
              onChange={set("cover_letter")}
              rows={14}
            />
          </CardContent>
        </Card>
      </div>

      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3 px-6 py-3">
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
            <Button variant="outline" onClick={() => { setDraft(saved); setEpoch((n) => n + 1); }}>Discard</Button>
            <Button onClick={save} disabled={update.isPending || !draft.title.trim() || badRange}>Save</Button>
          </div>
        </div>
      )}
    </div>
    </InlineFields>
  );
}
