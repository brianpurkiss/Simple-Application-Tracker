import { Fragment } from "react";

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Go to",
    items: [
      { keys: ["H"], label: "Jobs" },
      { keys: ["J"], label: "Jobs" },
      { keys: ["F"], label: "Follow Up" },
      { keys: ["R"], label: "Resumes" },
      { keys: ["P"], label: "Performance" },
      { keys: ["A"], label: "Activity" },
    ],
  },
  {
    title: "Jobs",
    items: [
      { keys: ["Q"], label: "Add a job" },
      { keys: [MOD, "F"], label: "Search jobs (on the jobs list)" },
      { keys: ["Esc"], label: "Clear search and filters" },
    ],
  },
  {
    title: "Job and resume details",
    items: [
      { keys: [MOD, "S"], label: "Save changes" },
      { keys: ["Esc"], label: "Leave the field, then go back" },
    ],
  },
  {
    title: "Job history",
    items: [{ keys: [MOD, "Enter"], label: "Add the history entry" }],
  },
];

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs text-foreground">
      {children}
    </kbd>
  );
}

export default function Shortcuts() {
  return (
    <div className="space-y-4">
      <title>Keyboard shortcuts | Application Tracker</title>
      <div>
        <h1 className="text-xl font-semibold">Keyboard shortcuts</h1>
        <p className="text-sm text-muted-foreground">
          Single-key shortcuts are ignored while you're typing in a field or have a dialog open.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title} className="rounded-lg border bg-card">
            <h2 className="border-b px-4 py-2.5 font-medium">{group.title}</h2>
            <ul className="divide-y">
              {group.items.map((item) => (
                <li key={item.keys.join("+") + item.label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <span>{item.label}</span>
                  <span className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <Fragment key={k}>
                        {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                        <Key>{k}</Key>
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
