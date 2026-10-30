export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export const FOLLOW_UP = "/jobs?status=followup";

// "G" then a letter jumps to a page. Shared by the key handler, the command palette and the shortcuts page.
export const GO_TO = [
  { key: "h", label: "Home", to: "/" },
  { key: "j", label: "Jobs", to: "/jobs" },
  { key: "f", label: "Follow Up", to: FOLLOW_UP },
  { key: "b", label: "Job Boards", to: "/boards" },
  { key: "r", label: "Resumes", to: "/resumes" },
  { key: "u", label: "User", to: "/user" },
  { key: "p", label: "Performance", to: "/performance" },
  { key: "s", label: "Segments", to: "/segments" },
  { key: "a", label: "Activity", to: "/activity" },
  { key: "c", label: "Calendar", to: "/calendar" },
  { key: "t", label: "Terminology", to: "/terminology" },
] as const;
