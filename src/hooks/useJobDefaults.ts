import { useProfile, useResumes } from "@/lib/api";
import { today } from "@/lib/format";

// What a new job starts with: today's date, the starred resume, and the profile's usual work mode and route.
// `ready` is false until the profile and resumes have loaded, so forms don't start from the wrong values.
export function useJobDefaults() {
  const profile = useProfile();
  const resumes = useResumes();
  const favorite = resumes.data?.find((r) => r.id === profile.data?.favorite_resume_id);
  return {
    ready: !profile.isLoading && !resumes.isLoading,
    defaults: {
      applied_date: today(),
      resume_version: favorite?.version ?? "",
      work_mode: profile.data?.default_work_mode ?? "Remote",
      applied_via: profile.data?.default_applied_via ?? "Direct",
    },
  };
}
