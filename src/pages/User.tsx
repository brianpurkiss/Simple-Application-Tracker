import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/fields";
import SalaryTarget from "@/components/stats/SalaryTarget";
import { useProfile, useResumes, useUpdateProfile } from "@/lib/api";
import { isEditable, useHotkey } from "@/hooks/hotkeys";
import { splitResumes } from "@/lib/options";

function Section({ title, children, action, className = "space-y-3" }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      <div className={`p-4 ${className}`}>{children}</div>
    </section>
  );
}

export default function User() {
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const { data: resumes = [] } = useResumes();
  const [name, setName] = useState("");
  const [coverLetter, setCoverLetter] = useState("");

  useEffect(() => setName(profile?.your_name ?? ""), [profile?.your_name]);
  useEffect(() => setCoverLetter(profile?.cover_letter ?? ""), [profile?.cover_letter]);

  const save = (patch: { your_name?: string; cover_letter?: string; hide_financials?: boolean }) =>
    update.mutate(patch, { onSuccess: () => toast.success("Saved"), onError: (err) => toast.error(err.message) });
  const saveName = () => name.trim() !== (profile?.your_name ?? "") && save({ your_name: name });
  const saveCoverLetter = () => coverLetter !== (profile?.cover_letter ?? "") && save({ cover_letter: coverLetter });

  useHotkey("s", (e) => {
    e.preventDefault();
    saveName();
    saveCoverLetter();
  }, { mod: true });
  useHotkey("Escape", (e) => {
    if (isEditable(e.target)) (e.target as HTMLElement).blur();
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  const { active: latest } = splitResumes(resumes);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <title>User | Application Tracker</title>
      <h1 className="text-xl font-semibold">User</h1>

      <Section title="You" className="space-y-6">
        <TextField
          label="Your Name"
          value={name}
          onChange={setName}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="Shown in the Home greeting"
          className="max-w-sm"
        />
        <SalaryTarget />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!profile?.hide_financials}
            onChange={(e) => save({ hide_financials: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            Hide financial numbers
            <span className="block text-xs text-muted-foreground">Replaces salaries with a placeholder across the app, so you can show it to others.</span>
          </span>
        </label>
      </Section>

      <Section
        title="Resumes"
        action={<Button asChild variant="ghost" size="sm"><Link to="/resumes">Manage resumes</Link></Button>}
      >
        {latest.length ? (
          <ul className="divide-y text-sm">
            {latest.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-1.5">
                <Link to={`/resumes/${r.id}`} className="font-medium hover:underline">{r.version}</Link>
                <span className="text-muted-foreground">{r.has_pdf ? r.pdf_name : "No PDF"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No active resumes. Mark a resume as active on its page.</p>
        )}
      </Section>

      <Section title="Cover Letter">
        <div onBlur={saveCoverLetter} className="[&_textarea]:max-h-[500px]">
          <TextAreaField label="Generic cover letter" value={coverLetter} onChange={setCoverLetter} rows={14} />
        </div>
      </Section>
    </div>
  );
}
