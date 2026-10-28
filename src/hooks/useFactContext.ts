import { useMemo } from "react";
import { type Job, useJobTypeMatches, useTitleSynonyms } from "@/lib/api";
import type { FactContext } from "@/lib/jobFacts";
import { consolidateTitles } from "@/lib/titles/consolidate";

// Titles and the Job Type rules every page needs. Built once per change, not per render.
export function useFactContext(jobs: Job[]): FactContext {
  const { data: synonyms } = useTitleSynonyms();
  const { data: matches } = useJobTypeMatches();
  return useMemo(
    () => ({
      titles: consolidateTitles(jobs, { synonyms: (synonyms ?? []).map((s) => s.terms) }),
      jobTypeRules: (matches ?? []).map((m) => ({ term: m.term, jobType: m.job_type })),
    }),
    [jobs, synonyms, matches],
  );
}
