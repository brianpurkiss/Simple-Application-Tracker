import { useMemo } from "react";
import { type Job, useFactTypes, useTitleSynonyms } from "@/lib/api";
import { buildFactModel, type FactContext } from "@/lib/jobFacts";
import { consolidateTitles } from "@/lib/titles/consolidate";

// Titles and the Job Type / Company Type model every page needs. Built once per change, not per render.
export function useFactContext(jobs: Job[]): FactContext {
  const { data: synonyms } = useTitleSynonyms();
  const { data: types } = useFactTypes();
  return useMemo(() => {
    const sets = (synonyms ?? []).map((s) => s.terms);
    const titles = consolidateTitles(jobs, { synonyms: sets });
    return { titles, model: buildFactModel(jobs, titles, types ?? [], sets) };
  }, [jobs, synonyms, types]);
}
