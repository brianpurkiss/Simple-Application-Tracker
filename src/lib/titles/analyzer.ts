// Seam between whatever produces TitleInfo and everything that uses it. Today only the rule-based
// analyzer exists; an AI analyzer will plug in here without changes downstream.
//
// Intended AI path (not built yet):
// - Runs server-side with the user's own API key and is off when no key is configured.
// - Sends titles (with company for context) in batches and asks for structured output matching
//   TitleInfo, with source "ai".
// - Passes the existing function labels into the prompt so the model reuses them instead of
//   inventing near-duplicates ("E-Commerce" vs "Ecommerce").
// - Caches results per job in a generic table, so job-description analysis can share it later:
//   job_analysis(job_id, kind, input_hash, schema_version, model, result_json, created_at),
//   with kind "title" now and "description" later. Re-run only when the input hash or schema changes.
// - The client merges those results over the rule output with resolveTitles().

import { consolidateTitles } from "./consolidate.ts";
import type { TitleInfo, TitleInput } from "./types.ts";

export interface TitleAnalyzer {
  id: TitleInfo["source"];
  analyze(jobs: TitleInput[]): Map<number, TitleInfo> | Promise<Map<number, TitleInfo>>;
}

export const rulesAnalyzer: TitleAnalyzer = { id: "rules", analyze: consolidateTitles };

// AI results win per job when present; otherwise the rule result stands.
export function resolveTitles(rules: Map<number, TitleInfo>, overrides?: Map<number, TitleInfo>): Map<number, TitleInfo> {
  if (!overrides?.size) return rules;
  const merged = new Map(rules);
  for (const [id, info] of overrides) merged.set(id, info);
  return merged;
}
