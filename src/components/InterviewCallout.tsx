import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useEvents } from "@/lib/api";
import { TIMED_EVENT_TYPES } from "@/lib/options";

const WINDOW_MIN = 25;
const FLASH_MIN = 3; // flashes once the interview is this close

// Navbar callout for a screen or interview starting within the next 25 minutes; links to that job.
export function InterviewCallout() {
  const { data: events = [] } = useEvents();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  let next: { jobId: number; minutes: number } | null = null;
  for (const e of events) {
    if (!e.time || !TIMED_EVENT_TYPES.has(e.type)) continue;
    const [y, mo, d] = e.date.slice(0, 10).split("-").map(Number);
    const [h, mi] = e.time.split(":").map(Number);
    const minutes = Math.ceil((new Date(y, mo - 1, d, h, mi).getTime() - now) / 60_000);
    if (minutes < 0 || minutes > WINDOW_MIN) continue;
    if (!next || minutes < next.minutes) next = { jobId: e.job_id, minutes };
  }
  if (!next) return null;

  return (
    <Link
      to={`/jobs/${next.jobId}`}
      title="Go to this interview's job"
      className={`mr-2 rounded-full bg-amber-400 px-3 py-1 text-sm font-semibold text-black hover:bg-amber-300 ${next.minutes <= FLASH_MIN ? "animate-pulse" : ""}`}
    >
      Interview in {next.minutes}min
    </Link>
  );
}
