import { Fragment, type ReactNode, StrictMode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Activity as ActivityIcon, BellRing, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChartPie, CircleUser, Menu, Search, X,
  type LucideIcon,
} from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProfile } from "@/lib/api";
import { setHideFinancials } from "@/lib/salary";
import { DEMO } from "@/lib/demo";
import { DEMO_NOW } from "../demo/config.ts";
import { formatDate } from "@/lib/format";
import { GlobalHotkeys } from "@/components/GlobalHotkeys";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { QuickAddJobDialog } from "@/components/QuickAddJobDialog";
import { InterviewCallout } from "@/components/InterviewCallout";
import { PaletteProvider, usePalette } from "@/components/CommandPalette";
import { FOLLOW_UP, MOD } from "@/lib/shortcuts";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import JobsList from "@/pages/JobsList";
import JobDetail from "@/pages/JobDetail";
import NewJob from "@/pages/NewJob";
import User from "@/pages/User";
import Resumes from "@/pages/Resumes";
import ResumeDetail from "@/pages/ResumeDetail";
import ResumePerformance from "@/pages/ResumePerformance";
import Activity from "@/pages/Activity";
import Calendar from "@/pages/Calendar";
import Segments from "@/pages/Segments";
import Backups from "@/pages/Backups";
import Boards from "@/pages/Boards";
import Exporter from "@/pages/Exporter";
import Trash from "@/pages/Trash";
import Shortcuts from "@/pages/Shortcuts";
import Terminology from "@/pages/Terminology";
import "./index.css";

// The demo's data never changes, so it's fetched once.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, ...(DEMO && { staleTime: Infinity }) } },
});

const REPO = "https://github.com/brianpurkiss/Simple-Application-Tracker";

// A strip at the top of the footer on the public demo.
function DemoBanner() {
  return (
    <div className="border-b bg-primary/10 text-center text-xs text-muted-foreground">
      <div className="mx-auto max-w-[1600px] px-4 py-1.5 sm:px-3">
        Demo with made-up data, frozen on {formatDate(DEMO_NOW.slice(0, 10))}, {new Date(DEMO_NOW).getFullYear()} · changes aren't saved ·{" "}
        <a href={REPO} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">Get the app on GitHub</a>
      </div>
    </div>
  );
}

// Keyed by pathname so each page change remounts and replays the fade (query-string changes don't).
function PageFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div key={pathname} className="page-fade">{children}</div>;
}

// Applies the profile's "hide financial numbers" setting before the page renders, and remounts the page when it flips
// so components that format salaries outside React state pick it up. Nothing renders until the profile has loaded,
// so figures never flash on page load.
function FinancialsGate({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const hide = !!profile?.hide_financials;
  setHideFinancials(hide);
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-hide-financials", hide);
  }, [hide]);
  if (!profile) return null;
  return <Fragment key={String(hide)}>{children}</Fragment>;
}

// Reset scroll on page change; keyed on pathname so query-string filter changes don't jump to the top.
function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// [path, label, icon, label in the mobile menu when it differs]
const NAV_ITEMS: [string, string, LucideIcon, string?][] = [
  ["/jobs", "Jobs", BriefcaseBusiness],
  [FOLLOW_UP, "Follow Up", BellRing],
  ["/segments", "Segments", ChartPie],
  ["/performance", "Performance", ChartNoAxesCombined],
  ["/activity", "Activity", ActivityIcon],
  ["/calendar", "Cal", CalendarDays, "Calendar"],
];

const FOOTER_LINKS: [string, string][] = [
  ["/shortcuts", "Keyboard Shortcuts"],
  ["/terminology", "Terminology"],
  ["/exporter", "Exporter"],
  ...(DEMO ? [] : [["/backups", "Backups"] as [string, string]]),
];

// Link color for a nav item, shared by the desktop and mobile menus.
function useNavLinkClass() {
  const { pathname, search } = useLocation();
  // Follow Up is a filtered view of the jobs list, so match on the query string too.
  const onFollowUp = pathname === "/jobs" && new URLSearchParams(search).get("status") === "followup";
  const isActive = (to: string) =>
    to === FOLLOW_UP ? onFollowUp : to === "/jobs" ? pathname === "/jobs" && !onFollowUp : pathname === to;
  return (to: string) => (isActive(to) ? "text-foreground" : "text-muted-foreground hover:text-foreground");
}

function Nav() {
  const linkClass = useNavLinkClass();
  return (
    <nav className="hidden h-full text-sm lg:flex">
      {NAV_ITEMS.map(([to, label, Icon]) => (
        <Link key={to} to={to} className={`flex h-full items-center gap-1.5 px-3 hover:bg-muted/50 ${linkClass(to)}`}>
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

// The most-used links stay in the header as icons below lg, beside the title.
const QUICK_LINKS = NAV_ITEMS.slice(0, 2);
const SECONDARY_LINKS = NAV_ITEMS.slice(2);

function QuickLinks() {
  const linkClass = useNavLinkClass();
  return (
    <nav className="flex items-center lg:hidden">
      {QUICK_LINKS.map(([to, label, Icon]) => (
        <Link key={to} to={to} title={label} aria-label={label} className={`rounded-md p-2 hover:bg-muted/50 ${linkClass(to)}`}>
          <Icon className="size-5" />
        </Link>
      ))}
    </nav>
  );
}

// Below lg the nav links and User collapse into a panel that slides down under the header: the common links large
// up top, the rest smaller beneath. Closes on navigation, Escape, or a tap outside.
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  const linkClass = useNavLinkClass();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      <nav
        className={`absolute inset-x-0 top-full border-b bg-card shadow-lg transition-[opacity,translate,visibility] duration-200 ease-out motion-reduce:transition-none ${
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
        }`}
      >
        <div className="px-4 pt-3 empty:hidden sm:hidden"><InterviewCallout /></div>
        <div className="grid grid-cols-2 gap-3 p-4">
          {QUICK_LINKS.map(([to, label, Icon]) => (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-4 font-medium hover:bg-muted/50 ${linkClass(to)}`}
            >
              <Icon className="size-6" />
              {label}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 border-t px-2 py-2 text-sm">
          {SECONDARY_LINKS.map(([to, label, Icon, long]) => (
            <Link key={to} to={to} className={`flex items-center gap-2 rounded-md px-2 py-2.5 hover:bg-muted/50 ${linkClass(to)}`}>
              <Icon className="size-4" />
              {long ?? label}
            </Link>
          ))}
        </div>
        <div className="border-t px-2 py-1.5 text-xs">
          <Link to="/user" className={`flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 ${linkClass("/user")}`}>
            <CircleUser className="size-4" />
            User Profile
          </Link>
        </div>
      </nav>
    </div>
  );
}

// Right-aligned search button and link to the User page (in the mobile menu below lg), which also holds the resumes summary.
function UserLink() {
  const active = useLocation().pathname === "/user";
  const palette = usePalette();
  return (
    <div className="ml-auto flex items-center">
      <div className="hidden sm:block"><InterviewCallout /></div>
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
        className={`hidden rounded-md p-2 hover:bg-muted/50 lg:block ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        <CircleUser className="size-5" />
      </Link>
      <MobileMenu />
    </div>
  );
}

function App() {
  return (
    <>
        <PaletteProvider>
        <ScrollToTop />
        <GlobalHotkeys />
        <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b bg-card">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-1 sm:gap-5 sm:px-3">
            <Link to="/" className="px-3 text-lg font-semibold whitespace-nowrap"><span className="hidden sm:inline">Application </span>Tracker</Link>
            <Nav />
            <QuickLinks />
            <UserLink />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <FinancialsGate>
          <PageFade>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jobs" element={<JobsList />} />
            <Route path="/jobs/new" element={<NewJob />} />
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
            {!DEMO && <Route path="/backups" element={<Backups />} />}
            <Route path="/exporter" element={<Exporter />} />
            <Route path="/boards" element={<Boards />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/shortcuts" element={<Shortcuts />} />
            <Route path="/terminology" element={<Terminology />} />
          </Routes>
          </PageFade>
          </FinancialsGate>
        </main>
        <footer className="border-t">
          {DEMO && <DemoBanner />}
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {FOOTER_LINKS.map(([to, label], i) => (
                <Fragment key={to}>
                  {i > 0 && <span aria-hidden="true">·</span>}
                  <Link to={to} className="hover:text-foreground">{label}</Link>
                </Fragment>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <a href={REPO} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                GitHub
              </a>
              <a href={`${REPO}/blob/main/LICENSE.md`} target="_blank" rel="noreferrer" className="hover:text-foreground">MIT License</a>
            </div>
          </div>
        </footer>
        </div>
        <QuickAddJobDialog />
        <ConfirmHost />
        <Toaster position="bottom-right" />
        </PaletteProvider>
    </>
  );
}

// A data router (rather than <BrowserRouter>) so pages can block navigation with useBlocker.
const router = createBrowserRouter([{ path: "*", element: <App /> }], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
