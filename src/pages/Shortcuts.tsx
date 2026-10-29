import { Keys } from "@/components/Keys";
import { GO_TO, MOD } from "@/lib/shortcuts";

// Rows without `keys` are commands found only through the command palette.
type Item = { keys?: readonly string[]; label: string; sep?: string; alt?: readonly string[] };

const GROUPS: { title: string; note?: string; items: Item[] }[] = [
  {
    title: "Everywhere",
    items: [
      { keys: [MOD, "K"], alt: [MOD, "P"], label: "Command palette: search actions and jobs" },
      { keys: ["C"], label: "Add a job" },
      { keys: ["/"], label: "Search the jobs list" },
      { keys: ["?"], label: "Keyboard shortcuts" },
      { keys: ["Esc"], label: "Clear search and filters (Jobs, Performance, Activity)" },
    ],
  },
  {
    title: "Command palette",
    items: [
      { label: "Type to find actions, jobs and resumes" },
      { keys: ["↓"], alt: ["↑"], label: "Move through the results" },
      { keys: ["Enter"], label: "Run the action or open the result" },
      { keys: ["Backspace"], label: "Step back out of a submenu (empty search)" },
      { keys: ["Esc"], label: "Close the palette" },
    ],
  },
  {
    title: "Go to",
    items: [
      ...GO_TO.map((g) => ({ keys: ["G", g.key.toUpperCase()], sep: "then", label: g.label })),
      { label: "Trash" },
    ],
  },
  {
    title: "Jobs list",
    items: [
      { keys: ["J"], alt: ["↓"], label: "Select the next job" },
      { keys: ["K"], alt: ["↑"], label: "Select the previous job" },
      { keys: ["Enter"], alt: ["O"], label: "Open the selected job" },
      { keys: ["L"], label: "Log history on the selected job" },
      { keys: [MOD, "F"], label: "Search the list" },
      { keys: ["Esc"], label: "Deselect the job and clear filters" },
      { keys: [MOD, "Click"], label: "Open a job in a new tab" },
      { label: "Filter by status…" },
      { label: "Filter by fit…" },
      { label: "Filter by company type…" },
      { label: "Filter by resume…" },
      { label: "Sort by…" },
      { label: "Switch between compact and expanded view" },
    ],
  },
  {
    title: "Job actions",
    note: "On a job page, or for the selected job in the jobs list",
    items: [
      { label: "Log history…" },
      { label: "Quick Log History: Applied, Contact, Interview, Note… (saves right away, dated today)" },
      { label: "Schedule Screen or Interview (pick the day and time)" },
      { label: "Schedule follow-up… (or clear it)" },
      { label: "Open job description" },
      { label: "Email the contact" },
      { label: "Call the contact" },
      { label: "Copy job link" },
      { label: "Copy cover letter" },
    ],
  },
  {
    title: "Job page",
    items: [
      { keys: ["J"], label: "Next job in the list" },
      { keys: ["K"], label: "Previous job in the list" },
      { keys: [MOD, "S"], label: "Save changes" },
      { keys: ["Esc"], label: "Leave the field, then go back" },
    ],
  },
  {
    title: "Job history",
    items: [{ keys: [MOD, "Enter"], label: "Add the history entry" }],
  },
  {
    title: "Resume page",
    items: [
      { keys: [MOD, "S"], label: "Save changes" },
      { keys: ["Esc"], label: "Leave the field, then go back" },
      { label: "Show jobs that used this resume" },
    ],
  },
  {
    title: "Calendar",
    items: [
      { keys: ["←"], alt: ["→"], label: "Previous or next day" },
      { keys: ["↑"], alt: ["↓"], label: "Previous or next week" },
    ],
  },
  {
    title: "User",
    items: [
      { keys: [MOD, "S"], label: "Save your name and cover letter" },
      { keys: ["Esc"], label: "Leave the field" },
    ],
  },
];

export default function Shortcuts() {
  return (
    <div className="space-y-4">
      <title>Keyboard Shortcuts &amp; Commands | Application Tracker</title>
      <h1 className="text-xl font-semibold">Keyboard Shortcuts &amp; Commands</h1>
      <div className="columns-1 gap-4 md:columns-2">
        {GROUPS.map((group) => (
          <section key={group.title} className="mb-4 break-inside-avoid rounded-lg border bg-card">
            <div className="border-b px-4 py-2.5">
              <h2 className="font-medium">{group.title}</h2>
              {group.note && <p className="text-xs text-muted-foreground">{group.note}</p>}
            </div>
            <ul className="divide-y">
              {group.items.map((item) => (
                <li key={(item.keys ?? []).join("+") + item.label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <span>{item.label}</span>
                  {item.keys ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <Keys keys={item.keys} sep={item.sep} />
                      {item.alt && (
                        <>
                          <span className="text-xs text-muted-foreground">or</span>
                          <Keys keys={item.alt} />
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Palette</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
