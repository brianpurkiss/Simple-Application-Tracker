import { type ReactNode, StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Activity as ActivityIcon, BellRing, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChartPie, CircleUser, Search,
  type LucideIcon,
} from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalHotkeys } from "@/components/GlobalHotkeys";
import { InterviewCallout } from "@/components/InterviewCallout";
import { PaletteProvider, usePalette } from "@/components/CommandPalette";
import { FOLLOW_UP, MOD } from "@/lib/shortcuts";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import JobsList from "@/pages/JobsList";
import JobDetail from "@/pages/JobDetail";
import User from "@/pages/User";
import Resumes from "@/pages/Resumes";
import ResumeDetail from "@/pages/ResumeDetail";
import ResumePerformance from "@/pages/ResumePerformance";
import Activity from "@/pages/Activity";
import Calendar from "@/pages/Calendar";
import Segments from "@/pages/Segments";
import Backups from "@/pages/Backups";
import Trash from "@/pages/Trash";
import Shortcuts from "@/pages/Shortcuts";
import Terminology from "@/pages/Terminology";
import "./index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

// Keyed by pathname so each page change remounts and replays the fade (query-string changes don't).
function PageFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div key={pathname} className="page-fade">{children}</div>;
}

// Reset scroll on page change; keyed on pathname so query-string filter changes don't jump to the top.
function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const NAV_ITEMS: [string, string, LucideIcon][] = [
  ["/jobs", "Jobs", BriefcaseBusiness],
  [FOLLOW_UP, "Follow Up", BellRing],
  ["/segments", "Segments", ChartPie],
  ["/performance", "Performance", ChartNoAxesCombined],
  ["/activity", "Activity", ActivityIcon],
  ["/calendar", "Cal", CalendarDays],
];

function Nav() {
  const { pathname, search } = useLocation();
  // Follow Up is a filtered view of the jobs list, so match on the query string too.
  const onFollowUp = pathname === "/jobs" && new URLSearchParams(search).get("status") === "followup";
  const isActive = (to: string) =>
    to === FOLLOW_UP ? onFollowUp : to === "/jobs" ? pathname === "/jobs" && !onFollowUp : pathname === to;
  const linkClass = (to: string) => (isActive(to) ? "text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <nav className="flex h-full text-sm">
      {NAV_ITEMS.map(([to, label, Icon]) => (
        <Link key={to} to={to} className={`flex h-full items-center gap-1.5 px-3 hover:bg-muted/50 ${linkClass(to)}`}>
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

// Right-aligned search button and link to the User page, which also holds the resumes summary.
function UserLink() {
  const active = useLocation().pathname === "/user";
  const palette = usePalette();
  return (
    <div className="ml-auto flex items-center">
      <InterviewCallout />
      <button
        type="button"
        onClick={palette.toggle}
        title={`Search and commands (${MOD} K)`}
        aria-label="Search and commands"
        className="rounded-md p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <Search className="size-5" />
      </button>
      <Link
        to="/user"
        title="User (G then U)"
        aria-label="User"
        className={`rounded-md p-2 hover:bg-muted/50 ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        <CircleUser className="size-5" />
      </Link>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PaletteProvider>
        <ScrollToTop />
        <GlobalHotkeys />
        <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b bg-card">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-5 px-3">
            <Link to="/" className="px-3 text-lg font-semibold">Application Tracker</Link>
            <Nav />
            <UserLink />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
          <PageFade>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jobs" element={<JobsList />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/user" element={<User />} />
            <Route path="/resumes" element={<Resumes />} />
            <Route path="/resumes/:id" element={<ResumeDetail />} />
            <Route path="/performance" element={<ResumePerformance />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/segments" element={<Segments />} />
            <Route path="/titles" element={<Navigate to="/segments" replace />} />
            <Route path="/stats" element={<Navigate to="/activity" replace />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/shortcuts" element={<Shortcuts />} />
            <Route path="/terminology" element={<Terminology />} />
          </Routes>
          </PageFade>
        </main>
        <footer className="border-t">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <Link to="/shortcuts" className="hover:text-foreground">Keyboard Shortcuts</Link>
              <Link to="/terminology" className="hover:text-foreground">Terminology</Link>
              <Link to="/backups" className="hover:text-foreground">Backups</Link>
            </div>
            <div className="flex items-center gap-4">
              <a href="https://github.com/brianpurkiss/Simple-Application-Tracker" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                GitHub
              </a>
              <a href="https://github.com/brianpurkiss/Simple-Application-Tracker/blob/main/LICENSE.md" target="_blank" rel="noreferrer" className="hover:text-foreground">MIT License</a>
            </div>
          </div>
        </footer>
        </div>
        <Toaster position="bottom-right" />
        </PaletteProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
