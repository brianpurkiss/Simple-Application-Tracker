import { Link } from "react-router-dom";
import { EXTRA_GROUPS, type Extra } from "@/lib/insights";

export default function Extras({ items }: { items: Extra[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="font-medium">
        Extra Data <span className="text-sm font-normal text-muted-foreground">· Because data is fun.</span>
      </h2>
      {EXTRA_GROUPS.map((group) => {
        const rows = items.filter((x) => x.group === group);
        if (!rows.length) return null;
        return (
          <section key={group} className="space-y-3">
            <h3 className="border-b pb-1 text-sm font-medium">{group}</h3>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((x) => {
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
          </section>
        );
      })}
    </div>
  );
}
