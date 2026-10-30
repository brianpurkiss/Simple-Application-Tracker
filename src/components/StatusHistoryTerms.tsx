import type { ReactNode } from "react";
import { CircleHelp, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EVENT_COLORS, STATUS_COLORS } from "@/lib/colors";
import { GHOSTED_DAYS, STALE_DAYS } from "@/lib/options";
import { cn } from "@/lib/utils";

// The one place job statuses and history events are explained to users. Shared by the job page and the Jobs list;
// keep it in step with src/lib/terminology.ts.

// A status name as its badge.
const status = (name: string) => (
  <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_COLORS[name].badge)}>{name}</span>
);

// An event type name in its History color.
const term = (type: string) => <span className={EVENT_COLORS[type].text}>{type}</span>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Terms() {
  return (
    <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
      <Section title="Job Status">
        <p>A job's status comes from the latest event in its history.</p>
        <p>{status("Saved")} a posting you're keeping for analysis without applying.</p>
        <p>{status("Applied")} you applied and nothing has happened since.</p>
        <p>{status("Scheduled")} the latest screen or interview is still ahead. It becomes Interviewed once the date or time passes.</p>
        <p>{status("Interviewed")} you're in the interview process. Shown as "Screen" when only a screen has happened, otherwise "1st Interview", "2nd Interview" and so on.</p>
        <p>{status("Offer")} they made you an offer and you haven't accepted yet.</p>
        <p>{status("Accepted")} you accepted the offer.</p>
        <p>{status("Rejected")} they turned you down. Shown as "Rejected, Post Interview" if a screen or interview happened first, otherwise "Rejected, No Interview".</p>
        <p>{status("Withdrew")} you pulled out of the process or declined an offer.</p>
        <p>{status("Ghosted")} they stopped responding, logged by you or set automatically after {GHOSTED_DAYS}+ days of silence.</p>
        <p>{status("Scam")} the job turned out to be fake or fraudulent.</p>
        <p><strong className="font-medium text-foreground">Closed</strong> means Accepted, Rejected, Withdrew, Ghosted or Scam. <strong className="font-medium text-foreground">Active</strong> is everything else.</p>
      </Section>
      <Section title="Smart Filters">
        <p>Extra options in the Jobs list status dropdown, below the core ones.</p>
        <p><strong className="font-medium text-foreground">Going Cold</strong> applied {STALE_DAYS}+ days ago with no reply yet, but not long enough to count as ghosted (under {GHOSTED_DAYS} days). Jobs with a contact, rejection, screen or interview don't count.</p>
        <p><strong className="font-medium text-foreground">Warm Leads</strong> active jobs that came through a person: a Referral or an Inbound Recruiter.</p>
        <p><strong className="font-medium text-foreground">Recently Updated</strong> active jobs with something logged in the last {STALE_DAYS} days.</p>
      </Section>
      <Section title="History Events">
        <p>{term("Applied")}: you sent the application. Sets the status to Applied.</p>
        <p>{term("Contact")}: they reached out to you. Doesn't change the status.</p>
        <p>{term("Follow-Up")}: a check-in you sent. Doesn't change the status.</p>
        <p>{term("Screen")}: a recruiter or HR screen. Sets the status to Interviewed, or Scheduled while it is still ahead.</p>
        <p>{term("Interview")}: an interview with the company. Sets the status to Interviewed, or Scheduled while it is still ahead.</p>
        <p>{term("Offer")}: they made you an offer. Sets the status to Offer.</p>
        <p>{term("Accepted")}: you accepted it. Sets the status to Accepted.</p>
        <p>{term("Rejection")}: they turned you down. Sets the status to Rejected.</p>
        <p>{term("Withdrew")}: you pulled out of the process. Sets the status to Withdrew.</p>
        <p>{term("Ghosted")}: you logged that they stopped responding. The status also changes to Ghosted automatically after {GHOSTED_DAYS}+ days of silence.</p>
        <p>{term("Scam")}: the job turned out to be a scam. Sets the status to Scam.</p>
        <p>{term("Note")}: anything else worth remembering. Doesn't change the status.</p>
      </Section>
    </div>
  );
}

const TITLE = "Job Status and History Terms";

// Small info icon, for the History card header.
export function StatusHistoryTermsIcon() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" title={TITLE}><Info className="size-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{TITLE}</DialogTitle></DialogHeader>
        <Terms />
      </DialogContent>
    </Dialog>
  );
}

// Text link, for the foot of the Jobs list.
export function StatusHistoryTermsLink() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <CircleHelp className="size-4" /> Job Status Definitions
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{TITLE}</DialogTitle></DialogHeader>
        <Terms />
      </DialogContent>
    </Dialog>
  );
}
