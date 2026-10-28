import { useState } from "react";
import { Input } from "@/components/ui/input";
import { TERM_CATEGORIES, type Term } from "@/lib/terminology";

const matches = (t: Term, q: string) =>
  [t.term, t.definition, t.calculation, ...(t.aliases ?? []), ...(t.avoid ?? [])].some((s) => s?.toLowerCase().includes(q));

export default function Terminology() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const categories = TERM_CATEGORIES
    .map((c) => ({ ...c, terms: q ? c.terms.filter((t) => matches(t, q)) : c.terms }))
    .filter((c) => c.terms.length > 0);

  return (
    <div className="space-y-4">
      <title>Terminology | Application Tracker</title>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Terminology</h1>
          <p className="text-sm text-muted-foreground">
            What each term means and how it is calculated. This is a reference doc for humans to understand and for AI to build with consistency.
          </p>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms"
          aria-label="Search terms"
          className="w-64"
        />
      </div>
      {categories.length === 0 && <p className="text-sm text-muted-foreground">No terms match "{query}".</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {categories.map((c) => (
          <section key={c.title} className="h-fit rounded-lg border bg-card">
            <div className="border-b px-4 py-2.5">
              <h2 className="font-medium">{c.title}</h2>
              {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
            </div>
            <dl className="divide-y">
              {c.terms.map((t) => (
                <div key={t.term} className="space-y-1 px-4 py-3 text-sm">
                  <dt className="font-medium">{t.term}</dt>
                  <dd>{t.definition}</dd>
                  {t.calculation && <dd className="text-xs text-muted-foreground">Calculation: {t.calculation}</dd>}
                  {t.aliases && <dd className="text-xs text-muted-foreground">Also appears as: {t.aliases.join(", ")}</dd>}
                  {t.avoid && <dd className="text-xs text-muted-foreground">Avoid: {t.avoid.join(", ")}</dd>}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
