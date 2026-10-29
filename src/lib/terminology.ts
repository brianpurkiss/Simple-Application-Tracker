// Canonical terminology for the app. Rendered on the Terminology page (/terminology).
// Use these exact terms and casing for any UI label, chart title, tooltip or help text.
// Update this file when adding or renaming a user-facing term, status, event or metric.

export type Term = {
  term: string;
  definition: string;
  /** How the value is computed, when it is a metric or derived value. */
  calculation?: string;
  /** Other names the same thing is (or was) called in the UI or code. */
  aliases?: string[];
  /** Wording that should not be used for this term. */
  avoid?: string[];
};

type TermCategory = { title: string; description?: string; terms: Term[] };

export const TERM_CATEGORIES: TermCategory[] = [
  {
    title: "Statuses",
    description: "Status is never stored. It is derived from the latest event in a job's history, defaulting to Applied.",
    terms: [
      { term: "Applied", definition: "The job has been applied to and nothing has happened since. Shown as \"Waiting for Response\" in the outcomes chart." },
      {
        term: "Scheduled",
        definition: "The latest screen or interview is still ahead. Not an event; it shows until the date (or the time, when one is set) passes, then the job becomes Interviewed.",
        calculation: "Latest status event is a Screen or Interview dated after today, or dated today with a start time that hasn't arrived. Counts as interviewing.",
      },
      {
        term: "Interviewed",
        definition: "The job has reached a screen or interview. Displayed as \"Screen\" when only a screen has happened, otherwise \"1st Interview\", \"2nd Interview\" and so on.",
        calculation: "The round number counts Interview events only. Screen events do not add a round.",
        aliases: ["Interviewing"],
      },
      { term: "Offer", definition: "An offer has been received and not yet accepted." },
      { term: "Accepted", definition: "The offer was accepted." },
      {
        term: "Rejected",
        definition: "The company rejected the application. Displayed as \"Rejected, Post Interview\" if a screen or interview happened first, otherwise \"Rejected, No Interview\".",
        calculation: "Post Interview when interview count + screen count > 0.",
        avoid: ["Rejected After Interview", "Rejected (alone, to mean rejected after an interview)"],
      },
      { term: "Withdrew", definition: "You withdrew the application or declined an offer." },
      {
        term: "Ghosted",
        definition: "The company stopped responding. Set by logging a Ghosted event, or automatically for Applied and Interviewed jobs after 21 days of silence (GHOSTED_DAYS). Logging a new contact or interview reverses the automatic version.",
        calculation: "Silence is measured from the last time you heard from them (Applied, Contact, Screen, Interview or Offer event), or from the applied date if none.",
      },
      { term: "Scam", definition: "The posting turned out to be fake or fraudulent." },
      { term: "Closed", definition: "Any of Accepted, Rejected, Withdrew, Ghosted or Scam (CLOSED_STATUSES)." },
      { term: "Active", definition: "Any status that is not closed." },
      { term: "Interviewing (group)", definition: "Jobs with status Interviewed or Offer (INTERVIEWING_STATUSES). Used for the \"interviewing\" count in Momentum." },
    ],
  },
  {
    title: "Events",
    description: "A job's history is a list of events. Each event type may set the status.",
    terms: [
      { term: "Applied", definition: "You submitted the application. Sets status Applied." },
      { term: "Contact", definition: "The company reached out or replied (not a screen or interview). Does not change status." },
      { term: "Follow-Up", definition: "You followed up with them. Does not change status; clears the Follow Up flag for 7 days." },
      { term: "Screen", definition: "A recruiter or initial screen. Sets status Interviewed." },
      { term: "Interview", definition: "An interview round. Sets status Interviewed." },
      { term: "Offer", definition: "An offer was received. Sets status Offer." },
      { term: "Accepted", definition: "You accepted the offer. Sets status Accepted." },
      { term: "Rejection", definition: "The company rejected you. Sets status Rejected. Counted as \"Rejections\" in the activity chart.", avoid: ["Rejected (as an event name)"] },
      { term: "Withdrew", definition: "You withdrew. Sets status Withdrew." },
      { term: "Ghosted", definition: "You marked the job as ghosted. Sets status Ghosted." },
      { term: "Scam", definition: "You marked the job as a scam. Sets status Scam." },
      { term: "Note", definition: "A free-text note. Does not change status." },
      {
        term: "Last Heard",
        definition: "The date of the latest Applied, Contact, Screen, Interview or Offer event. Drives automatic ghosting.",
      },
      { term: "Upcoming Interviews", definition: "Home strip of Screen and Interview events dated today or later, soonest first. Screen and Interview events can have a start time. Hidden when there are none." },
      { term: "Last Activity", definition: "The date of the latest event of any type, ignoring Screens and Interviews that are still in the future. Drives the \"days since last activity\" count and the Follow Up flag." },
      { term: "Latest Update", definition: "The Jobs list column showing the most recent Contact, Screen, Interview, Offer, Accepted or Rejection event (UPDATE_EVENT_TYPES)." },
      { term: "First Contact", definition: "The earliest Contact, Screen, Interview or Offer event. A rejection is not a contact.", aliases: ["first_contact"] },
    ],
  },
  {
    title: "Job fields",
    terms: [
      { term: "Applied date", definition: "The date you applied (applied_date). Basis for waiting times, weekly cohorts and eligibility.", aliases: ["Applied (form label and list column)"], avoid: ["Date"] },
      { term: "Job Type", definition: "The discipline of the role (Product, Marketing, eCommerce…), separate from its level (Seniority) and the industry (Company Type). A job can have more than one; the first is the main one. Worked out automatically when not set by hand: from jobs in the same title family, then words in the title. Unknown when nothing says.", avoid: ["Type"] },
      { term: "Company Type", definition: "The kind of company: eCommerce/DTC, SaaS, B2B Services… Worked out automatically when not set by hand: from your other jobs at the same company, then words in the title that name it. Unknown otherwise, sometimes with a Likely hint from the job description to accept." },
      { term: "Likely", definition: "A Company Type guess from the job description or from titles that usually go with one type. Shown on the job page with Use it; never counted until accepted." },
      { term: "Fit", definition: "How well the role matches what you want: Good Fit, Stretch, Settle, Pivot." },
      { term: "Work Mode", definition: "Remote, Hybrid or In Office (work_mode).", avoid: ["Location"] },
      { term: "Expanded View", definition: "Job list layout that adds Resume, Job Type and Company Type columns, with Fit and salary under the title and the recruiter under the company. Compact View is the default dense layout; your choice is remembered." },
      { term: "Applied Via", definition: "How you found the role: Direct, Recruiting Agency, Referral, Inbound Recruiter." },
      { term: "Resume Version", definition: "The resume version sent with the application (resume_version). Matched to the Resumes vault by exact version name.", aliases: ["Resume", "Version"], avoid: ["Resume (as a filter label)", "Version (outside the Resumes pages)"] },
    ],
  },
  {
    title: "Salary",
    terms: [
      { term: "Salary Range", definition: "A role's minimum and maximum yearly pay in USD (salary_min, salary_max). Either may be missing. Shown as \"$150k–$180k\", \"$160k+\", \"Up to $180k\" or \"$150k\" when equal." },
      { term: "Open-ended range", definition: "A role with only a minimum or only a maximum. Counted at its single known value and reported as \"without range\"." },
      { term: "Midpoint", definition: "The middle of a role's range: (min + max) / 2, using whichever side exists if only one is set. Basis for \"mean\" salary figures on the Performance page." },
      { term: "Top of Range", definition: "A role's maximum, or its minimum if there is no maximum. Basis for Highest, Lowest, Average and Median Salary in Extras." },
      { term: "Salary Target", definition: "Your target yearly salary (profile.salary_target), set on the User page and drawn as a reference line on salary charts.", avoid: ["Salary target (sentence case)"] },
      {
        term: "Salary Distribution",
        definition: "Activity chart of how many roles' ranges cover each pay level.",
        calculation: "Each role adds 1 to every $5k step inside its range, then the curve is Gaussian-smoothed (sigma $10k) with a 5% tail trim. \"Raw\" turns smoothing off. The dashed line marks the peak.",
      },
      {
        term: "Mean (salary)",
        definition: "Three different bases are used, so always say which: mean of midpoints across interviewed roles (Performance combo rows), mean of midpoints across all paid roles (Salary Range chart), and the count-weighted mean of the smoothed curve (distribution chart). Extras \"Average Salary\" is the mean of Top of Range.",
      },
    ],
  },
  {
    title: "User",
    description: "Personal details kept on the User page (the profile table).",
    terms: [
      { term: "Your Name", definition: "Your name (your_name), used to personalise the Home greeting." },
      { term: "Cover Letter", definition: "One generic cover letter (cover_letter) to start from when applying." },
    ],
  },
  {
    title: "Resumes",
    terms: [
      { term: "Resume Version", definition: "A named resume, for example \"eCom 2.3\". Stored in the Resumes vault with a PDF, internal notes and a plain text copy." },
      { term: "Family / Grouped (2.x)", definition: "Versions grouped by major number: \"eCom 2.3\" and \"eCom 2.1\" both become \"eCom 2.x\". The alternative mode is \"Separate\"." },
      { term: "Active / Inactive (resume)", definition: "A resume is active if its active flag is on and it is the highest version of its family among flagged-active ones. Flagged-off or older versions are inactive. The Resumes page lists the two groups separately and only active ones appear on the User page; inactive ones stay in the vault and in stats." },
      { term: "Jobs (resume)", definition: "Number of jobs using the version (job_count)." },
      { term: "Interviews (resume)", definition: "Distinct companies that reached a screen or interview with the version (interview_company_count). Not the same as the Activity \"Interviews\" KPI.", calculation: "count(distinct company) with a Screen or Interview event." },
      { term: "Success Rate (resume)", definition: "Share of a version's jobs that reached a screen or interview.", calculation: "interview_job_count / job_count. Counts jobs, has no age exclusion, and ignores Offer/Accepted jobs that lack a Screen or Interview event." },
      { term: "Lucky Resume", definition: "Extras card showing the version tied to the most interviews." },
    ],
  },
  {
    title: "Core metrics",
    description: "Helpers in src/lib/stats.ts that the Activity and Performance pages share.",
    terms: [
      { term: "Interviewed (metric)", definition: "A job counts as interviewed if it had a screen or interview, or its status is Offer or Accepted.", aliases: ["reached interview"] },
      { term: "Heard Back", definition: "A job counts as heard back if it had first contact, a rejection, or was interviewed. A rejection counts as hearing back.", aliases: ["Replied (cohort)", "Reply (Total Progress, Extras)", "Response (KPI)"] },
      { term: "Multiple Interviews", definition: "Two or more interviews, or any offer." },
      { term: "Reply date", definition: "The earlier of first contact and the rejection date. Used by Replies in Total Progress and Fastest/Slowest Reply.", avoid: ["Using \"first reply\" for first contact alone (Typical Wait does this)"] },
      { term: "Offer (metric)", definition: "A job whose status is Offer or Accepted." },
      { term: "pct", definition: "Percent rounded to a whole number. Shown as \"–\" when there is no denominator." },
    ],
  },
  {
    title: "Activity page",
    terms: [
      { term: "Applications (KPI)", definition: "Number of filtered jobs, with a change vs the previous 7 days.", calculation: "Delta compares the rolling 7 days ending today against the 7 days before." },
      { term: "Interviews (KPI)", definition: "Number of Screen and Interview events (events, not jobs), with a 7-day change." },
      { term: "Response Rate", definition: "Share of applications that heard back.", calculation: "Heard Back / all filtered jobs. No age exclusion.", avoid: ["Avg Response (for the Performance baseline)"] },
      { term: "Interview Rate", definition: "Share of applications that reached a screen or interview.", calculation: "Interviewed / all filtered jobs." },
      { term: "Typical Wait", definition: "Median days from the applied date to first contact, with the median days to rejection alongside. Only includes jobs that have the date." },
      { term: "Funnel", definition: "Applied → Heard Back → Screen / 1st Interview → Multiple Interviews → Offer. Each step is labelled \"N% of total\" against all applications.", avoid: ["Screen/1st Interview (no spaces)"] },
      { term: "Where Applications Ended Up", definition: "Outcomes bar of current statuses: Waiting for Response, Interviewed, Rejected, Post Interview, Rejected, No Interview, Withdrew, Ghosted, Scam. Offer and Accepted are not included. Percent is of the rows shown.", avoid: ["Rejected After Interview"] },
      { term: "How Long Replies Take", definition: "Timing chart bucketing days from application into 0–3, 4–7, 8–14, 15–21 and 22+, for First Interview, Rejected, No Interview and Rejected, Post Interview. Silence past 21 days (GHOSTED_DAYS) counts as ghosted." },
      { term: "By Application Week", definition: "Cohort table grouped by the Monday of the application week. Columns: Replied, Screen / 1st Interview, 2nd+ Interviews, Rejected, Ghosted, each as a percent of that week's applications. Recent weeks are marked as maturing." },
      { term: "Event categories", definition: "Applications, Interviews, Offers (Offer and Accepted events), Rejections, New Resumes and Other. Weeks start on Monday.", aliases: ["Activity categories"] },
      { term: "4-Week Average", definition: "Rolling average of weekly applications on the activity chart." },
    ],
  },
  {
    title: "Momentum and extras",
    terms: [
      { term: "Application Streak", definition: "Consecutive days with at least one application. Stays alive if today is empty but yesterday had one. Best streak is also tracked." },
      { term: "Pace target", definition: "Rounded mean applications per week across all full weeks, minimum 1. Weeks on pace counts consecutive weeks at or above it." },
      { term: "Applications This Week", definition: "Compared against the trailing 8-week average." },
      { term: "Follow-ups This Week", definition: "Home tile counting Follow-Up events logged since Monday, with last week's count for comparison." },
      { term: "Active Pipeline", definition: "Count of active jobs, with how many are interviewing." },
      { term: "Best Week", definition: "The most applications in a single week." },
      { term: "Total Progress", definition: "Cumulative chart of Applications, Replies and Interviews over time." },
      { term: "Extras", definition: "Fastest/Slowest Reply, Quickest/Slowest Rejection, Most Interviews at One Company, Busiest Day/Week, Applications per Active Day, Lucky Resume, Days Searching, Events Logged, Ghosted, Mondays vs. Fridays, and four salary cards (Highest, Lowest, Average, Median)." },
    ],
  },
  {
    title: "Performance page",
    description: "Compares resume versions, optionally combined with a second dimension.",
    terms: [
      { term: "Dimension", definition: "A job attribute to compare by: Job Type, Company Type, Fit, Work Mode or Resume." },
      { term: "Combo", definition: "One row of the analysis: a resume version combined with a dimension value, with its eligible job count, hits and rate." },
      {
        term: "Eligible jobs",
        definition: "Jobs counted in the analysis.",
        calculation: "Has an applied date, is at least the minimum age old (default 8 days), and has every grouped dimension filled in. The Rejected, No Interview metric raises the minimum age to the ghost days (default 21).",
      },
      { term: "Metric", definition: "What counts as a hit. \"Interviews\": job was interviewed. \"Rejected, No Interview\": never interviewed and either rejected, ghosted, or silent past the ghost days (so it includes ghosted jobs)." },
      { term: "Baseline", definition: "Overall hit rate across all eligible jobs: hits / eligible.", aliases: ["Avg Interview Rate / Avg Rejected, No Interview Rate (Performance header)"], avoid: ["Avg Response"] },
      { term: "Lift", definition: "A combo's rate divided by the baseline, shown like \"1.6×\", or \"avg\" when near 1." },
      { term: "Standout Confidence", definition: "How strict the Wilson interval is when judging tiers: Strict 95%, Balanced 90% (default), Loose 80%." },
      { term: "Standout", definition: "Tier: the rate is confidently above the baseline." },
      { term: "Promising", definition: "Tier: above the baseline but not yet confident (internally \"watch\")." },
      { term: "Room to Grow", definition: "Tier: confidently below the baseline (internally \"under\").", avoid: ["Below Average", "Below average"] },
      { term: "Low Volume", definition: "Tier: fewer applications than the minimum sample (default 10), so no judgement is made.", avoid: ["Low volume"] },
      { term: "Minimum Applications", definition: "The minimum sample size for a combo to be judged." },
      { term: "Skip Applications from the Last [n] days", definition: "The minimum age for eligible jobs." },
      { term: "Count as Ghosted After [n] days of silence", definition: "The ghost days setting, used only by the Rejected, No Interview metric." },
      { term: "Sort", definition: "Best Bet (confidence-weighted), Raw Rate, or Volume." },
      { term: "Heatmap", definition: "Resume × one dimension grid. Each cell shows rate and sample size, for example \"40% ·n5\"." },
    ],
  },
  {
    title: "Job titles",
    description: "Titles are grouped automatically at read time (src/lib/titles). Nothing is stored and no title pairings are hand-made.",
    terms: [
      {
        term: "Title Family",
        definition: "Jobs with the same rung word and the same work, however the title is worded. \"Director of eCommerce\", \"eCommerce Director\" and \"Director, E-Commerce\" are one family. Labelled with the most common title in it.",
        calculation: "Rung word (Director, Head, Manager, VP, Chief, or IC) + function. Functions match when they have the same number of words and a fuzzball token_sort_ratio of 95 or more (MATCH_THRESHOLD).",
      },
      { term: "Function", definition: "What the work is: the title with the rung word, seniority modifiers, company name and parenthetical text removed. For example \"eCommerce\" or \"Product Manager\"." },
      {
        term: "Seniority",
        definition: "A 1–9 rank on one ladder shared by IC, Management and Executive titles. IC: Entry 1, Mid 2, Senior 3, Staff / Lead 4, Principal 5, Distinguished 6. Management: Supervisor 2, Manager 3, Senior Manager 4, Director 5, Head 5, Senior Director 6. Executive: VP 7, SVP / President 8, C-level 9.",
        calculation: "The highest rung word present wins. Senior/Executive move a management rung up one; Associate/Assistant move it down one. Global, Fractional, Interim and Acting don't change rank.",
      },
      {
        term: "Segments page",
        definition: "One row per Title Family with Jobs, Applications (jobs with an applied date), Rejections (status Rejected), Interviews and Interview Rate. Expanding a row lists every original title in it. Titles that roll up from a narrower family are shown muted.",
        calculation: "Interview Rate = Interviews / Applications. Shown muted below the minimum sample (MIN_SAMPLE). A job also counts toward every broader family it rolls up to, so rows don't sum to the job total.",
      },
      {
        term: "Roll-up",
        definition: "A title counting toward a broader family as well as its own. \"Director of Growth & eCommerce Revenue\" also counts under Director of eCommerce and Director of Growth.",
        calculation: "Same rung word, and the broader family's function words are a strict subset of this one's.",
      },
      {
        term: "Auto group",
        definition: "A title group created automatically when no job has that exact title. \"Director, Digital Experience Experimentation\" and \"Sr. Director, Digital Experience and Channels\" both roll up to an Auto group \"Director of Digital Experience\". Tagged Auto on the Segments page.",
        calculation: "The words two families on the same rung share. The words must sit next to each other in at least one title. A single shared word only counts when it is a whole function somewhere else (e.g. Head of CRO). IC groups must keep their role word (e.g. Product Manager).",
      },
      {
        term: "Synonyms",
        definition: "Sets of terms you enter on the Segments page that mean the same thing in a title, such as eCommerce, eCom, e-Commerce, eComm. Every term is treated as the first one, which is also how it is displayed. Titles themselves are never changed.",
      },
      {
        term: "Normalized Title",
        definition: "Optional field on a job. When set, title analysis uses it instead of the posted title, which stays as is. Use it to place a complex or unusual title in the right group.",
      },
      {
        term: "Titles without Pairings",
        definition: "Title groups holding a single title that nothing else matched and that doesn't roll up anywhere. Hidden behind \"View Titles without Pairings\" on the Segments page so they can be fixed with a synonym or Normalized Title, or left alone if the role is unique.",
      },
      { term: "Other (title)", definition: "A title with no recognizable rung or role word, such as \"General submission\". Seniority is Unspecified." },
    ],
  },
  {
    title: "Workflow flags",
    terms: [
      {
        term: "Follow Up",
        definition: "Interviewing-stage jobs that have gone quiet. Appears as the Follow Up nav link, the Jobs list filter, the amber row highlight and the Home card.",
        calculation: "Quiet for 7+ days (STALE_DAYS, from last activity or applied date) AND (auto-ghosted with a screen or interview, OR status Interviewed). Offer is excluded. Skipped while the job's Follow Up On date is in the future.",
        avoid: ["Needs follow-up", "Follow up (lowercase)"],
      },
      { term: "Interviewing (Home card)", definition: "Home card listing active jobs with status Interviewed or Offer, freshest activity first." },
      { term: "Stale", definition: "7 days without activity (STALE_DAYS).", aliases: ["Declared Stale (legacy)"] },
      { term: "Auto-ghosted", definition: "A job shown as Ghosted by the 21-day rule rather than by a Ghosted event (auto_ghosted). Not applied while a Follow Up On date is in the future." },
      { term: "Trash", definition: "Deleted jobs. They can be restored or permanently deleted." },
    ],
  },
];
