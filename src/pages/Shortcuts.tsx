import { Keys } from "@/components/Keys";
import { GO_TO, MOD } from "@/lib/shortcuts";

type Item = { keys: readonly string[]; label: string; sep?: string; alt?: readonly string[] };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Everywhere",
    items: [
      { keys: [MOD, "K"], alt: [MOD, "P"], label: "Command palette: search actions and jobs" },
      { keys: ["C"], label: "Add a job" },
      { keys: ["/"], label: "Search the jobs list" },
      { keys: ["?"], label: "Keyboard shortcuts" },
      { keys: ["Esc"], label: "Clear search and filters" },
    ],
  },
  {
    title: "Go to",
    items: GO_TO.map((g) => ({ keys: ["G", g.key.toUpperCase()], sep: "then", label: g.label })),
  },
  {
    title: "Jobs list",
    items: [
      { keys: ["J"], alt: ["↓"], label: "Select the next job" },
      { keys: ["K"], alt: ["↑"], label: "Select the previous job" },
      { keys: ["Enter"], alt: ["O"], label: "Open the selected job" },
      { keys: ["L"], label: "Log history on the selected job" },
    ],
  },
  {
    title: "Job and resume details",
    items: [
      { keys: ["J"], label: "Next job in the list (job page)" },
      { keys: ["K"], label: "Previous job in the list (job page)" },
      { keys: [MOD, "S"], label: "Save changes" },
      { keys: ["Esc"], label: "Leave the field, then go back" },
    ],
  },
  {
    title: "Job history",
    items: [{ keys: [MOD, "Enter"], label: "Add the history entry" }],
  },
];

export default function Shortcuts() {
  return (
    <div className="space-y-4">
      <title>Keyboard shortcuts | Application Tracker</title>
      <div>
        <h1 className="text-xl font-semibold">Keyboard shortcuts</h1>
        <p className="text-sm text-muted-foreground">
          Single-key shortcuts are ignored while you're typing in a field or have a dialog open. Press {MOD} K anywhere to find any action.
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
                  <span className="flex items-center gap-2">
                    <Keys keys={item.keys} sep={item.sep} />
                    {item.alt && (
                      <>
                        <span className="text-xs text-muted-foreground">or</span>
                        <Keys keys={item.alt} />
                      </>
                    )}
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
