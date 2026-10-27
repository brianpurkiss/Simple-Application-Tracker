# Job Tracker

A local job-search tracker that keeps a full history of every application.

## Why I built it

I wanted something better than a spreadsheet. A spreadsheet row holds a snapshot: a status and maybe a date. It can't tell you when you applied, when they replied, when you followed up, or how many rounds you went through. I wanted the whole story of each job, in order.

Once the tracker was built, I realized that history was the start of something more useful. Every application records which resume version I sent, the kind of role and company, how I applied, and what happened next, with dates. That's enough data to analyze my resumes and my progress: which versions get replies and interviews, how long companies take to respond, and where applications stall.

## What it does

- **Jobs list**: a sortable, searchable list of every application. Status and Latest Update are calculated from each job's history. Jobs that have gone quiet show as Ghosted, and interviewing-stage jobs with no recent activity are highlighted amber with a "Needs follow-up" filter.
- **Job detail and history**: a page per job with its details (job type, company type, fit, work mode, how I applied, resume version) and a timeline of events: Applied, Contact, Follow-Up, Screen, Interview, Offer, Accepted, Rejection, Withdrew, Ghosted and Note.
- **Activity**: how the search is going over time. Weekly KPIs, a funnel from applied to offer, outcomes, response timing, weekly cohorts, and a chart or calendar view of events.
- **Performance**: resume analysis. Compares interview and reply rates across resume versions, optionally combined with another dimension (job type, company type and so on) in a heatmap. Small samples are dimmed, and a confidence setting controls what counts as a standout. Versions can be grouped (for example 2.x) and the page estimates how many applications you'd need.
- **Resumes**: a vault for each resume version: its PDF (up to 10 MB, stored in `jobs.db`), internal notes and a plain text copy. A job's resume version is linked to the vault by matching the version name.
- **Trash**: deleted jobs can be restored or deleted for good.

Built with React, Vite, Tailwind, TanStack Query and Table, Recharts, Express, SQLite and TypeScript.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. (The API runs on port 3001 behind it.)

## Data

Everything is stored in `data/jobs.db` (SQLite). To back up, copy that file somewhere safe.

- **Latest Update** in the list is calculated from each job's history, so log events rather than editing dates.
- Deleting a job moves it to the Trash (link at the bottom of the Jobs list), where it can be restored or deleted for good.
- **Status** is calculated from the history: the latest Applied / Screen / Interview / Offer / Accepted / Rejection / Withdrew / Ghosted event sets it. Follow-ups, contacts and notes don't change it. Applied or interviewing jobs with no contact or interview from them in 21+ days show as Ghosted automatically (`GHOSTED_DAYS`); logging a new contact or interview brings them back. The list shows which interview round a job is on.
- Rows highlighted amber are interviewing-stage jobs (including auto-ghosted ones that had a screen or interview) with no activity in 7+ days ("Needs follow-up"). Logging a Follow-Up clears it for 7 days; log a Ghosted event to close one out for good.
- Dropdown options (job types, company types, fit (Good Fit / Stretch / Settle), resume versions, event types) live in `src/lib/options.ts`. Job type and resume version also accept new values typed in.

## Keyboard shortcuts

On Windows and Linux, use Ctrl wherever Cmd is shown. Single-key shortcuts are ignored while typing in a field or when a dialog or menu is open.

| Shortcut | Action |
| --- | --- |
| `Q` | Open the Add Job dialog (from any page) |
| `H` / `J` | Go to the Jobs list |
| `R` | Go to Resumes |
| `F` | Go to Follow Up |
| `P` | Go to Performance |
| `A` | Go to Activity |
| `Cmd+F` | Jump to the job search |
| `Esc` | Leave the focused field; otherwise clear the active search/filters on Jobs, Performance and Activity (on a job, back to the Jobs list; on a resume, back to Resumes) |
| `Cmd+S` | Save changes (job detail page) |

## Importing

There's no built-in importer. Everyone's personal job tracker is laid out differently, so a one-size-fits-all importer would be too generic to be useful. If you want to bring in data from an existing spreadsheet, ask Claude to build a quick importer for your file. Point it at your export and this app's database schema (`server/db.ts`) and it can write a throwaway script in a few minutes.

## License

Released under the [MIT License](LICENSE.md).
