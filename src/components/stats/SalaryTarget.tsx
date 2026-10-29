import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile, useUpdateProfile } from "@/lib/api";

// Saved to the profile on blur or Enter; blank clears it.
export default function SalaryTarget() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const saved = profile?.salary_target ?? null;
  const [value, setValue] = useState("");

  useEffect(() => setValue(saved == null ? "" : String(saved)), [saved]);

  const commit = () => {
    const next = value.trim() === "" ? null : Math.round(Number(value));
    if (next !== null && (!Number.isFinite(next) || next < 0)) return setValue(saved == null ? "" : String(saved));
    if (next !== saved) update.mutate({ salary_target: next });
  };

  return (
    <div className="space-y-1">
      <Label htmlFor="salary-target">Salary Target</Label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">$</span>
        <Input
          id="salary-target"
          data-financial=""
          type="number"
          min={0}
          step={1000}
          placeholder="e.g. 150000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-36 bg-card"
        />
      </div>
      <p className="text-xs text-muted-foreground">Shown as an amber dot on the salary ranges. Leave blank for none.</p>
    </div>
  );
}
