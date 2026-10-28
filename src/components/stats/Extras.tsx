import { Link } from "react-router-dom";
import type { Extra } from "@/lib/insights";

export default function Extras({ items }: { items: Extra[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">Extras</h2>
        <p className="text-sm text-muted-foreground">Not exactly useful, but interesting.</p>
      </div>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((x) => {
          const detail = x.detail && (x.jobId ? <Link to={`/jobs/${x.jobId}`} className="hover:underline">{x.detail}</Link> : x.detail);
          return (
            <div key={x.label}>
              <dt className="text-sm text-muted-foreground">{x.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{x.value}</dd>
              {detail && <dd className="truncate text-sm text-muted-foreground">{detail}</dd>}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
