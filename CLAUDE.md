# Notes for AI assistants

- Demo data: before touching `server/scripts/anonymize.ts`, `demo/`, `scripts/build-demo.ts`, `src/lib/demo.ts`, the Pages workflow, or adding a database column, read [docs/demo-data.md](docs/demo-data.md). It holds the rules that keep the maintainer's real job search out of this repository.
- Status and event wording: the user-facing "Job Status and History Terms" modal lives in `src/components/StatusHistoryTerms.tsx` (job page and Jobs list). Update it together with `src/lib/terminology.ts` whenever a status or event type changes.
