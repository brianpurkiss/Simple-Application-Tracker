import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Profile, useProfile, useUpdateProfile } from "@/lib/api";

type NumberKey = "salary_target" | "past_base_salary" | "past_package" | "past_days_off";

// A whole number on the profile, saved on blur or Enter; blank clears it. `money` adds the $ and hides it with
// "hide financial numbers".
export function ProfileNumber({ field, label, help, money = true, placeholder = "Yearly amount" }: {
  field: NumberKey; label: string; help?: string; money?: boolean; placeholder?: string;
}) {
  const id = useId();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const saved = (profile as Profile | undefined)?.[field] ?? null;
  const [value, setValue] = useState("");

  useEffect(() => setValue(saved == null ? "" : String(saved)), [saved]);

  const commit = () => {
    const next = value.trim() === "" ? null : Math.round(Number(value));
    if (next !== null && (!Number.isFinite(next) || next < 0)) return setValue(saved == null ? "" : String(saved));
    if (next !== saved) update.mutate({ [field]: next });
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        {money && <span className="text-sm text-muted-foreground">$</span>}
        <Input
          id={id}
          data-financial={money ? "" : undefined}
          type="number"
          min={0}
          step={money ? 1000 : 1}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-36 bg-card"
        />
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export default function SalaryTarget() {
  return (
    <ProfileNumber
      field="salary_target"
      label="Base Salary Target"
      help="Shown as an amber dot on the salary ranges and compared with each job's base range. Leave blank for none."
    />
  );
}
