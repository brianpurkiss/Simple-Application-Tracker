import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextAreaField, TextField } from "@/components/fields";
import { type ResumeInput, uploadResumePdf, useCreateResume } from "@/lib/api";
import { DEMO, toastError, toastSaved } from "@/lib/demo";

const blank = (): ResumeInput => ({ version: "", notes: "", plain_text: "" });

export function AddResumeDialog() {
  const [open, setOpen] = useState(false);
  const [resume, setResume] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const create = useCreateResume();
  const navigate = useNavigate();

  const set = (key: keyof ResumeInput) => (value: string) => setResume((r) => ({ ...r, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await create.mutateAsync(resume);
      // The resume exists either way; a bad PDF shouldn't lose what was typed.
      if (file) await uploadResumePdf(created.id, file).catch((err: Error) => toastError(err));
      setOpen(false);
      setResume(blank());
      setFile(null);
      toastSaved(`Added ${created.version}`);
      // The demo saves nothing, so there's no new resume page to open.
      if (!DEMO) navigate(`/resumes/${created.id}`);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus /> New Resume</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New Resume</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <TextField label="Version" value={resume.version!} onChange={set("version")} required autoFocus placeholder="General 1.0" />
            <div className="space-y-1.5">
              <Label htmlFor="resume-pdf" className="text-xs text-muted-foreground">PDF (optional)</Label>
              <Input id="resume-pdf" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <TextAreaField label="Internal Notes" value={resume.notes!} onChange={set("notes")} rows={3} />
            <TextAreaField label="Plain Text Version" value={resume.plain_text!} onChange={set("plain_text")} rows={8} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !resume.version?.trim()}>Add Resume</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
