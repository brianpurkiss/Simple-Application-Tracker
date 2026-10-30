import { useEffect, useState } from "react";
import { confirmDialog, DISCARD } from "@/components/ConfirmDialog";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BellRing, ChevronRight, ExternalLink, Mail, Maximize2, Pencil, Phone, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineFields, MarkdownText } from "@/components/fields";
import { type Draft, EDITABLE, JobFormCards, toDraft, toPatch } from "@/components/JobFormCards";
import { COMP_KEYS, CompensationDetails, CompensationSummary } from "@/components/CompensationCard";
import { Collapsible } from "@/components/Collapsible";
import { salaryRangeInvalid } from "@/lib/salary";
import { FollowUpButton } from "@/components/FollowUpButton";
import { HistoryPanel } from "@/components/HistoryPanel";
import { AllNotesDialog, JobNotes } from "@/components/AllNotesDialog";
import { Keys } from "@/components/Keys";
import { StatusHistoryTermsIcon } from "@/components/StatusHistoryTerms";
import { StatusBadge } from "@/components/StatusBadge";
import { type Job, type JobEvent, useApplyJob, useDeleteJob, useJob, useJobs, useRestoreJob, useUpdateJob } from "@/lib/api";
import { factHints } from "@/lib/jobFacts";
import { useFactContext } from "@/hooks/useFactContext";
import { daysSince, formatDate, today } from "@/lib/format";
import { isEditable, overlayOpen, useHotkey } from "@/hooks/hotkeys";
import { useDraftForm } from "@/hooks/useDraftForm";
import { useLeaveGuard } from "@/hooks/useLeaveGuard";
import { useStickyTop } from "@/hooks/useStickyTop";
import { loadOrder, saveSelected } from "@/lib/listOrder";
import { jobActions, usePalette, usePaletteActions } from "@/components/CommandPalette";
import { MOD } from "@/lib/shortcuts";
import { needsFollowUp, progressParts } from "@/lib/jobs";
import { toastError, toastSaved } from "@/lib/demo";
import { cn } from "@/lib/utils";

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

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
  // The role's details read as a dossier until Edit; History, Notes and the follow-up date stay editable either way.
  const location = useLocation();
  // Quick Add lands here with { edit: true } so the rest of the details can be filled straight away.
  const [editing, setEditing] = useState(!!(location.state as { edit?: boolean } | null)?.edit);
  const update = useUpdateJob(job.id);
  const deleteJob = useDeleteJob();
  const restoreJob = useRestoreJob();
  const applyJob = useApplyJob(job.id);
  const navigate = useNavigate();
  // Drop the request once it's used, so a reload opens the job read-only.
  useEffect(() => {
    if ((location.state as { edit?: boolean } | null)?.edit) navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The automatic Job Type and Company Type come from every job, so this page reads the same model as the lists.
  const { data: allJobs = [] } = useJobs();
  const factCtx = useFactContext(allJobs);

  const discard = () => { setDraft(saved); setEpoch((n) => n + 1); };
  const exitEdit = () => { discard(); setEditing(false); };

  const { draft, setDraft, saved, setSaved, set, changed, canSave, save } = useDraftForm(EDITABLE, toDraft(job), {
    update,
    valid: (d) => !!d.title.trim() && !salaryRangeInvalid(d.salary_min, d.salary_max),
    toPatch,
    onSaved: () => { setEpoch((n) => n + 1); setEditing(false); },
    // Escape while editing drops back to reading, and with unsaved inline edits (notes, follow-up) it clears them and stays.
    // Otherwise step back when we came from the list so its filters (kept in the URL) survive.
    onLeave: () =>
      editing ? exitEdit()
        : changed.length > 0 ? discard()
        : (location.state as { fromList?: boolean } | null)?.fromList ? navigate(-1)
        : navigate("/jobs"),
  });
  useLeaveGuard(changed.length > 0);
  // History can move or remove the Applied event, which moves the job's applied date with it. Pick that up,
  // leaving an unsaved edit to the Applied field alone.
  const appliedOn = job.applied_date ?? "";
  useEffect(() => {
    setDraft((d) => (d.applied_date === saved.applied_date ? { ...d, applied_date: appliedOn } : d));
    setSaved((d) => ({ ...d, applied_date: appliedOn }));
  }, [appliedOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const badRange = salaryRangeInvalid(draft.salary_min, draft.salary_max);
  // Worked out from the draft, so the hints follow the title, company and description as they're edited.
  const hints = factHints({ id: job.id, title: draft.title, normalized_title: draft.normalized_title, company: draft.company, company_type: "", job_types: [], job_description: draft.job_description }, factCtx);

  const remove = () => {
    deleteJob.mutate(job.id, {
      onSuccess: () => {
        navigate("/jobs");
        toastSaved("Moved to trash", {
          description: job.title,
          action: { label: "Undo", onClick: () => restoreJob.mutate(job.id) },
          duration: 8000,
        });
      },
    });
  };

  const { logHistory, quickLog } = usePalette();

  // J and K step through the jobs list's current order, like they do on the list itself.
  const order = loadOrder();
  const at = order.indexOf(job.id);
  const nextId = at >= 0 ? order[at + 1] : undefined;
  const prevId = at > 0 ? order[at - 1] : undefined;
  const step = (id: number | undefined) => {
    if (id === undefined) return;
    saveSelected(id);
    navigate(`/jobs/${id}`, { replace: true, state: location.state });
  };
  const plainKey = (run: () => void) => (e: KeyboardEvent) => {
    if (isEditable(e.target) || overlayOpen()) return;
    e.preventDefault();
    run();
  };
  useHotkey("j", plainKey(() => step(nextId)));
  useHotkey("k", plainKey(() => step(prevId)));
  const startEdit = () => { if (!job.deleted_at) setEditing(true); };
  useHotkey("e", plainKey(startEdit));

  const cancelEdit = async () => {
    if (changed.length > 0 && !(await confirmDialog(DISCARD))) return;
    exitEdit();
  };
  const saveEdit = () => (changed.length > 0 ? save() : setEditing(false));

  // Applies right away and leaves any other unsaved edits alone.
  // Logging a follow-up clears the banner right away, ahead of the refetch.
  const [followedUpId, setFollowedUpId] = useState<number | null>(null);
  const followUpNeeded = needsFollowUp(job) && followedUpId !== job.id;
  const setFollowUp = (date: string | null) =>
    update.mutate({ follow_up_on: date }, {
      onSuccess: () => {
        const value = date ?? "";
        setSaved((d) => ({ ...d, follow_up_on: value }));
        setDraft((d) => ({ ...d, follow_up_on: value }));
        toastSaved(date ? `Follow-up scheduled for ${formatDate(date)}` : "Follow-up date cleared");
      },
      onError: (err) => toastError(err),
    });

  usePaletteActions([
    ...(nextId !== undefined ? [{ id: "next", label: "Next job", group: "This job", keys: ["J"], keywords: "following", run: () => step(nextId) }] : []),
    ...(prevId !== undefined ? [{ id: "prev", label: "Previous job", group: "This job", keys: ["K"], keywords: "back", run: () => step(prevId) }] : []),
    ...(!editing && !job.deleted_at ? [{ id: "edit", label: "Edit job details", group: "This job", keys: ["E"], keywords: "change description cover letter", run: startEdit }] : []),
    ...(job.deleted_at ? [] : jobActions(job, { logHistory, quickLog, setFollowUp, group: "This job", withGeneric: false })),
    ...(changed.length > 0 ? [{ id: "save", label: "Save changes", group: "This job", keys: [MOD, "S"], run: () => { if (canSave) save(); } }] : []),
  ]);

  const restore = () => restoreJob.mutate(job.id, { onSuccess: () => toastSaved("Restored from trash") });
  const markApplied = () => applyJob.mutate(today(), { onSuccess: () => toastSaved("Marked as applied"), onError: (e) => toastError(e) });

  const quiet = daysSince(job.last_activity ?? job.applied_date);
  const progress = progressParts(job);

  // Whichever column is shorter sticks while the other scrolls; leave room for the save bar when it's up.
  const barGap = editing || changed.length > 0 ? 80 : 16;
  const leftCol = useStickyTop<HTMLDivElement>(72, barGap);
  const rightCol = useStickyTop<HTMLElement>(72, barGap);

  // The dossier side reads from what's saved; the edit side writes the draft.
  const dossier = editing ? (
    <JobFormCards draft={draft} set={set} badRange={badRange} hints={hints} factCtx={factCtx} />
  ) : (
    <>
      <OverviewCard job={saved} hints={hints} className="order-1 lg:order-none" />
      <CompensationRead draft={saved} className="order-3 lg:order-none" />
      {saved.job_description.trim() ? (
        <Collapsible title="Job Description" meta={`${wordCount(saved.job_description).toLocaleString()} words`} preview className="order-3 lg:order-none">
          <MarkdownText value={saved.job_description} />
        </Collapsible>
      ) : (
        <EmptySection title="Job Description" hint="Paste the posting here so you have a copy if it comes down." onEdit={job.deleted_at ? undefined : startEdit} />
      )}
      {saved.cover_letter.trim() ? (
        <Collapsible title="Cover Letter" meta={`${wordCount(saved.cover_letter).toLocaleString()} words`} className="order-3 lg:order-none">
          <MarkdownText value={saved.cover_letter} />
        </Collapsible>
      ) : (
        <EmptySection title="Cover Letter" hint="Keep the letter you sent for this role." onEdit={job.deleted_at ? undefined : startEdit} />
      )}
    </>
  );

  return (
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
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span>{saved.company.trim() || "Unknown"}</span>
            <StatusBadge job={job} />
            {saved.jd_link && (
              <a href={saved.jd_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm hover:text-foreground">
                Job posting <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>
        {!job.deleted_at && (
          <div className="flex items-center gap-1">
            {!editing && (
              <Button variant="outline" onClick={startEdit} title="Edit job details (E)">
                <Pencil /> Edit <Keys keys={["E"]} small />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={remove} title="Move to trash">
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {/* Below lg the two columns dissolve into one stack: overview, then History and Notes, then the rest. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-5 lg:items-start">
        <div ref={leftCol.ref} style={leftCol.style} className="contents lg:sticky lg:col-span-3 lg:block lg:space-y-5">{dossier}</div>

        {/* Notes and the follow-up date stay click-to-edit here, outside Edit. */}
        <InlineFields epoch={epoch}>
        <aside ref={rightCol.ref} style={rightCol.style} className="order-2 space-y-5 lg:sticky lg:order-none lg:col-span-2">
          <Card>
            <CardHeader className="flex items-start justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-1">
                  History
                  <StatusHistoryTermsIcon />
                </CardTitle>
                {(quiet !== null || progress.length > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {[...progress, quiet !== null && (quiet === 0 ? "Active today" : `${quiet} ${quiet === 1 ? "day" : "days"} since last activity`)]
                      .filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <FollowUpButton
                value={draft.follow_up_on}
                onChange={set("follow_up_on")}
                onDone={(value) => { if (value !== saved.follow_up_on) setFollowUp(value || null); }}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {!job.deleted_at && followUpNeeded && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                  <BellRing className="size-4 shrink-0" />
                  Follow up needed
                </div>
              )}
              {job.saved && !job.deleted_at && (
                <div className="space-y-2.5 rounded-md border border-dotted border-slate-400/40 px-3 py-2.5 text-sm text-muted-foreground">
                  <p>Saved, not applied. It can be included on Segments, but never counts in Activity or Performance.</p>
                  <Button size="sm" variant="outline" className="w-full" onClick={markApplied} disabled={applyJob.isPending}>
                    Mark as Applied Today
                  </Button>
                </div>
              )}
              <HistoryPanel jobId={job.id} events={job.events} followUpNeeded={followUpNeeded} onFollowUpLogged={() => setFollowedUpId(job.id)} />
            </CardContent>
          </Card>

          <NotesCard jobId={job.id} notes={draft.notes} onNotesChange={set("notes")} events={job.events} />
        </aside>
        </InlineFields>
      </div>

      {(editing || changed.length > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3 px-4 py-3 sm:px-6">
            <span className="text-sm text-muted-foreground">
              {editing ? (changed.length > 0 ? "Editing · unsaved changes" : "Editing") : "Unsaved changes"}
            </span>
            {editing ? (
              <>
                <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                <Button onClick={saveEdit} disabled={update.isPending || !draft.title.trim() || badRange}>{changed.length > 0 ? "Save" : "Done"}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={discard}>Discard</Button>
                <Button onClick={save} disabled={!canSave}>Save</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// A label over a value, hidden when there's no value.
function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// The role at a glance, in the same sections and order as the Job card in Edit. Applied lives in History and
// pay in Compensation, so neither repeats here; a section with nothing in it is left out.
function OverviewCard({ job, hints, className }: { job: Draft; hints: ReturnType<typeof factHints>; className?: string }) {
  const manualTypes = JSON.parse(job.job_types) as string[];
  const types = manualTypes.length ? manualTypes : hints.jobTypes.values;
  const companyType = job.company_type || hints.companyType.values[0];
  const via = [job.applied_via, job.agency_name].filter(Boolean).join(" · ");
  const hasContact = job.contact_name || job.contact_email || job.contact_phone || job.contact_linkedin;
  const auto = <span className="ml-1 text-xs text-muted-foreground">auto</span>;

  return (
    <Card className={className}>
      <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
      <CardContent className="space-y-4 [&>*+*]:border-t [&>*+*]:pt-4">
        {(job.work_mode || companyType || types.length > 0) && (
          <OverviewSection title="Role">
            <Fact label="Work Mode">{job.work_mode}</Fact>
            <Fact label="Company Type">{companyType && <>{companyType}{!job.company_type && auto}</>}</Fact>
            <Fact label="Job Type" className="col-span-2 sm:col-span-1">
              {types.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                  {types.map((t) => (
                    <span key={t} className={cn("rounded-full border px-2.5 py-0.5", manualTypes.length ? "border-transparent bg-secondary" : "border-dashed")}>{t}</span>
                  ))}
                  {!manualTypes.length && auto}
                </div>
              )}
            </Fact>
          </OverviewSection>
        )}

        {(job.resume_version || via) && (
          <OverviewSection title="Application">
            <Fact label="Resume">{job.resume_version}</Fact>
            <Fact label="Applied Via">{via}</Fact>
          </OverviewSection>
        )}

        {job.fit && (
          <OverviewSection title="Your Take">
            <Fact label="Fit">{job.fit}</Fact>
          </OverviewSection>
        )}

        <section className="space-y-2">
          <SectionHeading>Point of Contact</SectionHeading>
          {hasContact ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              {job.contact_name && <span className="font-medium">{job.contact_name}</span>}
              {job.contact_email && <ContactLink href={`mailto:${job.contact_email}`} icon={<Mail />}>{job.contact_email}</ContactLink>}
              {job.contact_phone && <ContactLink href={`tel:${job.contact_phone}`} icon={<Phone />}>{job.contact_phone}</ContactLink>}
              {job.contact_linkedin && <ContactLink href={job.contact_linkedin} icon={<ExternalLink />} external>LinkedIn</ContactLink>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contact yet.</p>
          )}
        </section>

        {job.normalized_title && <p className="text-xs text-muted-foreground">Title analysis: {job.normalized_title}</p>}
      </CardContent>
    </Card>
  );
}

// Matches the section headings in the Job card's Edit view.
const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>
);

function OverviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHeading>{title}</SectionHeading>
      {/* Three across on wider screens, so short values don't leave gaps and the columns line up between sections. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{children}</dl>
    </section>
  );
}

function ContactLink({ href, icon, external, children }: { href: string; icon: React.ReactNode; external?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0"
    >
      {icon}<span className="truncate">{children}</span>
    </a>
  );
}

const COMP_FIELDS = ["salary_min", "salary_max", "offer_info", ...COMP_KEYS] as const;

function CompensationRead({ draft, className }: { draft: Draft; className?: string }) {
  const [open, setOpen] = useState(false);
  const any = COMP_FIELDS.some((k) => draft[k] !== "" && draft[k] !== "false");
  return (
    <Card className={className}>
      <CardHeader><CardTitle>Compensation</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {any ? (
          <>
            <CompensationSummary draft={draft} />
            {draft.offer_info.trim() && <MarkdownText value={draft.offer_info} />}
            <div>
              <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} /> Details
              </button>
              {open && <div className="mt-3"><CompensationDetails draft={draft} /></div>}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No pay or benefits noted yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

// A long-text section with nothing in it yet: one quiet line instead of an empty card.
function EmptySection({ title, hint, onEdit }: { title: string; hint: string; onEdit?: () => void }) {
  return (
    <div className="order-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed px-6 py-4 text-sm text-muted-foreground lg:order-none">
      <span className="font-semibold text-foreground">{title}</span>
      <span>· {hint}</span>
      {onEdit && <button type="button" className="ml-auto underline-offset-4 hover:text-foreground hover:underline" onClick={onEdit}>Add</button>}
    </div>
  );
}

// Every note for the job, edited in place, with a button to open them full screen.
function NotesCard({ jobId, notes, onNotesChange, events }: { jobId: number; notes: string; onNotesChange: (v: string) => void; events: JobEvent[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => setOpen(true)} title="Expand notes" aria-label="Expand notes">
            <Maximize2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <JobNotes jobId={jobId} notes={notes} onNotesChange={onNotesChange} events={events} rows={{ general: 6, event: 3 }} />
      </CardContent>
      <AllNotesDialog open={open} onOpenChange={setOpen} jobId={jobId} notes={notes} onNotesChange={onNotesChange} events={events} />
    </Card>
  );
}
