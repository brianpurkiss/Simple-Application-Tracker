import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChartNoAxesCombined, ExternalLink, FileUp, Briefcase, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextAreaField, TextField } from "@/components/fields";
import {
  type Resume, useDeleteResume, useRemoveResumePdf, useResume, useUpdateResume, useUploadResumePdf,
} from "@/lib/api";
import { isEditable, useHotkey } from "@/lib/hotkeys";

const EDITABLE = ["version", "notes", "plain_text"] as const;
type Draft = Record<(typeof EDITABLE)[number], string>;

const toDraft = (r: Resume): Draft => ({ version: r.version, notes: r.notes, plain_text: r.plain_text });

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function ResumeDetail() {
  const id = Number(useParams().id);
  const { data, isLoading } = useResume(id);
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!data) return <p>Resume not found. <Link to="/resumes" className="underline">Back to resumes</Link></p>;
  return <ResumeEditor key={data.id} resume={data} />;
}

function ResumeEditor({ resume }: { resume: Resume }) {
  const [draft, setDraft] = useState(() => toDraft(resume));
  const [saved, setSaved] = useState(() => toDraft(resume));
  const update = useUpdateResume(resume.id);
  const upload = useUploadResumePdf(resume.id);
  const removePdf = useRemoveResumePdf(resume.id);
  const deleteResume = useDeleteResume();
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const changed = EDITABLE.filter((k) => draft[k] !== saved[k]);

  const save = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const patch = Object.fromEntries(changed.map((k) => [k, draft[k]]));
    update.mutate(patch, {
      onSuccess: () => {
        setSaved(draft);
        toast.success("Saved");
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => toast.success("PDF saved"),
      onError: (err) => toast.error(err.message),
    });
    if (fileInput.current) fileInput.current.value = "";
  };

  const remove = () => {
    if (!confirm(`Delete resume "${saved.version}"? Jobs that used it keep their version label.`)) return;
    deleteResume.mutate(resume.id, {
      onSuccess: () => {
        navigate("/resumes");
        toast.success("Resume deleted", { description: saved.version });
      },
    });
  };

  useHotkey("Escape", (e) => {
    if (isEditable(e.target)) return (e.target as HTMLElement).blur();
    if (changed.length > 0 && !window.confirm("Discard unsaved changes?")) return;
    navigate("/resumes");
  });

  useHotkey("s", (e) => {
    e.preventDefault();
    if (changed.length > 0 && !update.isPending && draft.version.trim()) save();
  }, { mod: true });

  // The version in the URL changes when the PDF is replaced, so the preview reloads.
  const pdfUrl = `/api/resumes/${resume.id}/pdf?v=${encodeURIComponent(resume.updated_at)}`;

  return (
    <div className="space-y-5 pb-20">
      <title>{`${saved.version} | Resumes`}</title>
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/resumes")} title="Back"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{saved.version}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Used on {resume.job_count} {resume.job_count === 1 ? "job" : "jobs"} · Interviewed with {resume.interview_company_count}{" "}
            {resume.interview_company_count === 1 ? "company" : "companies"}
          </p>
        </div>
        <Button asChild variant="outline" title="View jobs that used this resume">
          <Link to={`/jobs?${new URLSearchParams({ resume: resume.version, status: "all" })}`}><Briefcase /> Jobs</Link>
        </Button>
        <Button asChild variant="outline" title="View activity for this resume">
          <Link to={`/activity?${new URLSearchParams({ resume: resume.version })}`}><ChartNoAxesCombined /> Activity</Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <TextField label="Version" value={draft.version} onChange={set("version")} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={resume.active}
                  disabled={update.isPending}
                  onChange={(e) => update.mutate({ active: e.target.checked }, { onError: (err) => toast.error(err.message) })}
                />
                Active
              </label>
              <TextAreaField label="Internal Notes" value={draft.notes} onChange={set("notes")} rows={8} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>PDF</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {resume.has_pdf ? (
                <p className="text-sm">
                  {resume.pdf_name} <span className="text-muted-foreground">· {formatSize(resume.pdf_size ?? 0)}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No PDF attached.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                <Button variant="outline" size="sm" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
                  <FileUp /> {resume.has_pdf ? "Replace" : "Upload PDF"}
                </Button>
                {resume.has_pdf && (
                  <>
                    <Button asChild variant="outline" size="sm">
                      <a href={pdfUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open</a>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removePdf.mutate()}>
                      <Trash2 /> Remove
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent>
            {resume.has_pdf ? (
              <iframe src={pdfUrl} title={`${saved.version} PDF`} className="h-[42rem] w-full rounded-md border" />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Upload a PDF to preview it here.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Plain Text</CardTitle></CardHeader>
          <CardContent>
            <TextAreaField
              label="Paste the plain text of this resume. It's what gets compared against job descriptions."
              value={draft.plain_text}
              onChange={set("plain_text")}
              rows={20}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={remove}>
          <Trash2 /> Delete
        </Button>
      </div>

      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3 px-6 py-3">
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
            <Button variant="outline" onClick={() => setDraft(saved)}>Discard</Button>
            <Button onClick={save} disabled={update.isPending || !draft.version.trim()}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}
