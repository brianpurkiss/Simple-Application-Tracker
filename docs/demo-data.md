# Demo data: reference for AI assistants

Read this before you change anything that touches the public demo:
- `server/scripts/anonymize.ts`
- `demo/seed.json`
- `demo/config.ts`
- `scripts/build-demo.ts`
- `src/lib/demo.ts`
- `.github/workflows/pages.yml`
- the database schema, since a new column can carry real data into the seed

It covers what the demo is, why it's built this way, and the rules that keep the maintainer's real job search out of the repository.

**The prime directive: no real data, and nothing that lets someone work real data back out, may ever be committed.** If a change would weaken any rule below, stop and ask the maintainer. Don't look for a way around it.

---

## What the demo is

- **What:** a static, read-only copy of the app, hosted on GitHub Pages at `/Simple-Application-Tracker/`.
- **Data:** built from a made-up dataset, `demo/seed.json`, which comes from the maintainer's real job search.
- **Theme:** the seed is retold as a hunt for over-the-top, whimsical candy jobs: candy making, taste testing, giving candy to children, paid hundreds of thousands of dollars.
- **What is kept from the real search:** its *shape*. That means volume, timing, weekday patterns, pipeline outcomes, how titles group together, and resume-version families.
- **What is never kept:** its *content*. Names, companies, contacts, notes, links, exact dates, exact salaries and times of day are all replaced.

## Pipeline

```
real data/jobs.db ──npm run demo:seed -- --salary-multiplier=<n|min-max>──▶ demo/seed.json   (committed)
demo/seed.json ──npm run build:demo──▶ dist-demo/                                             (gitignored)
push to main ──.github/workflows/pages.yml──▶ build:demo ──▶ GitHub Pages
```

1. **`server/scripts/anonymize.ts`** (`npm run demo:seed`)
   - Opens the real DB **read-only** and turns it into the portable JSON format (`server/portable.ts`).
   - Rebuilds every row from allowlisted fields and word pools.
   - Runs a leak check.
   - Writes `demo/seed.json` only if the check passes.
   - The maintainer runs this by hand, rarely. CI never runs it, and CI never sees the real DB.
2. **`scripts/build-demo.ts`** (`npm run build:demo`)
   - Imports the seed into a throwaway DB.
   - Runs the real API against that DB with the clock frozen at `DEMO_NOW`.
   - Saves every GET response into `demo/.snapshot/api.json`.
   - Runs `vite build` with `VITE_DEMO=1`, which bundles that snapshot through the `@demo-snapshot` alias.
   - Writes `404.html` (for SPA deep links), `.nojekyll`, and the resume PDFs.
3. **In the browser:**
   - `request()` in `src/lib/api.ts` serves GETs from the snapshot.
   - Every write throws `DemoReadOnlyError`, which shows one shared "read-only" toast (`toastError` in `src/lib/demo.ts`).
   - Stars and the hide-financials toggle are kept in local state only.
   - Derived fields (status, auto-ghost, Scheduled) come from the real server code, so the demo always matches the app's logic.

`npm run demo` builds the demo and previews it locally. Normal `dev`/`start` builds point `@demo-snapshot` at the empty `demo/empty-snapshot.json` stub. Switching between demo and real builds is safe.

## The frozen clock

- `demo/config.ts` holds `DEMO_NOW` (local wall time, no `Z`) and `DEMO_BASE`.
- `src/lib/clock.ts` is the single source of "now":
  - `FROZEN_NOW` freezes it in Node.
  - `VITE_FROZEN_NOW` freezes it in the browser.
  - Server SQL receives `@today` and `@now_time` as parameters.
- **Rule:** new code that needs the current date or time must go through `clock.ts` (`now()`, `today()`, `nowTime()`). Otherwise the demo goes stale.
- **Exceptions:** `datetime('now')` write defaults, plus hotkeys and confetti timing, which need the real clock.

## Anonymization rules (what anonymize.ts guarantees)

| Data | Treatment |
| --- | --- |
| Free text (notes, JDs, event descriptions and notes, offer info, cover letters, resume notes and plain text) | Never copied. When the real field is non-empty, it is replaced with a canned candy template, so fill rates stay realistic. |
| Contacts (name, email, phone, LinkedIn) | Always blank, not even fake values. |
| `jd_link` | Always blank. |
| Companies, agencies | Mapped one-to-one onto generated candy names, so per-company patterns survive. |
| Job titles | Role words (Manager, Engineer, Nurse…) and connectors are kept so titles still parse. Every other word becomes a candy word from `WORD_POOL`, handed out most-frequent first. The Segments grouping keeps working. |
| Job/company types, synonyms, starred groups | Remapped through the same word and type pools. Starter synonym sets that exist verbatim in `server/db.ts` are kept, because they're generic. |
| Resume versions | Each family name gets a candy name. Version numbers are kept, so family grouping still works. |
| Resume PDFs | Regenerated: one placeholder page per resume, with the fake name. |
| Profile | Fake name and cover letter. `salary_target` is a fixed demo value (500k). `hide_financials` is off. |
| Salaries | Each job is scaled by a multiplier given on the command line (a range picks one per job, keyed on real details that never reach the seed). Each end of the range then gets its own random nudge of −0.2 to +0.2 to the multiplier, drawn fresh every run, and is rounded to $5k. |
| Dates | Shifted by whole weeks so the run day lands on `DEMO_NOW` (weekdays preserved). Each job's dates then move together by −1, 0 or +1 day, keyed on private details, and never past the demo day. |
| Timestamps (`created_at` etc.) | Time of day is set to a fixed `12:00:00`, so entry times don't leak. |
| Event times | Re-drawn randomly within working hours (9:00–16:30, on the quarter hour) every run. Real screens and interviews dated on or after the demo day are replaced by a fixed, curated schedule, which makes the Home callout ("Interview in 15 min") show. |

### Leak check

Before writing, the script searches the whole output (whole-word, case-insensitive) for:
- every real company, agency, contact name, email, email local part, phone digit run, LinkedIn and JD link;
- the real `your_name`;
- every real title word and type name that was replaced.

Any hit exits non-zero and **nothing is written**. Never weaken, skip or catch this check to get a run through. Fix the mapping instead.

One known soft spot: replaced words that also appear in `anonymize.ts` or `server/db.ts` are treated as generic and *exempt* from the check. That's why the next section matters.

## Hard rules for future changes

1. **Never put the salary multiplier anywhere in the repo.** That includes code, defaults, comments, README examples, commit messages, and the seed. It is a required command-line argument with no default. Help text and docs use example values only (2.5, 2-2.4), never the maintainer's real values. If the multiplier were known, every demo salary could be divided back to a real one.
2. **Never tailor the anonymizer to the maintainer.** No real company names, no words from the maintainer's field or titles, no real resume-version names in the word pools, templates, comments or examples. Pools must stay generic, because a word in the script's own text is exempt from the leak check (see above).
3. **Never copy a real value through to the seed.** `anonymize.ts` builds jobs, events, resumes and profile rows by spreading the real row (`...r`) and then overriding fields. **A new free-text or identifying column added to the schema will pass straight into the seed unless you add an explicit override.** Whenever a migration adds a column to `jobs`, `events`, `resumes` or `profile`, update the anonymizer in the same change: blank it, template it, or map it. Add any identifying value to the leak check's needles.
4. **Don't copy free text, even partially.** No excerpts, no "first sentence", and no real text run through word swaps. Use a canned template, chosen only by whether the real field was empty.
5. **Never key any randomness on public values.** For example, job ids are in the seed, so keying on them lets anyone recompute the picks. Deterministic picks must be keyed on real details that never reach the seed. Per-run randomness uses `crypto.randomInt`.
6. **Keep real salary figures, salary targets and resume names out of code and copy.** Placeholders and examples use generic values ($50k–$60k, "Min"/"Max", "XXX 2.3"). The user's real target belongs only in their database.
7. **Never commit the real DB or exports.** `data/` (including `data/*.json` exports), backups, `demo/.snapshot` and `dist-demo` are gitignored. Keep it that way.
8. **CI builds only from `demo/seed.json`.** Don't make the build or the workflow read `data/` or run the anonymizer.
9. **No contacts in the demo**, made-up or otherwise.
10. **Don't commit, push or rewrite history unless the maintainer asks.** Older commits on `main` contain some identifying data from before this process existed. Rewriting history is the maintainer's call.

## Known residual signals (accepted, but don't make them worse)

- Job and event ids keep their real values, and the number of jobs per company is preserved. Together these reveal volume and ordering, but not identity.
- Overall timing, weekly patterns and outcome rates are deliberately kept. That's the point of the demo.
- A few generic category words (for example, retail or eCommerce as a company type) can appear in starter lists. They're generic, but don't add more field-specific ones.

## Regenerating the seed (maintainer workflow)

```bash
npm run demo:seed -- --salary-multiplier=<your private value or range>
npm run demo           # build + preview; check Home, Jobs, Segments, Performance, a job page, a resume page
```

Then review `git diff demo/seed.json` by eye for anything recognizable before committing. The leak check is a safety net, not a substitute for looking. Pushing to `main` redeploys Pages.

If the leak check fails:
- **A real name or word:** fix the mapping or the pool. Never add the real value to the script to exempt it.
- **A generic word** (one that genuinely isn't identifying): you can add it to a pool or template, but only if it's not from the maintainer's field.

## When you (an AI assistant) are asked to work on this

Before finishing any change to the files listed at the top or to the schema, check:
- Does every field of every row written to the seed still go through an explicit override or a mapping?
- Did I add any real value, the multiplier, a field-specific word, or a real resume or company name anywhere, including comments and examples?
- Is any new randomness keyed on something that appears in the seed?
- Does new date or time code go through `src/lib/clock.ts`?
- Does `npm run typecheck` pass? If the seed changed, does `npm run demo:seed` (leak check) pass and `npm run demo` render?

When in doubt, leave the data out and ask.
