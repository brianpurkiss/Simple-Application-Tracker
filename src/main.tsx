import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalHotkeys, FOLLOW_UP } from "@/components/GlobalHotkeys";
import { Toaster } from "@/components/ui/sonner";
import JobsList from "@/pages/JobsList";
import JobDetail from "@/pages/JobDetail";
import ResumePerformance from "@/pages/ResumePerformance";
import Activity from "@/pages/Activity";
import Trash from "@/pages/Trash";
import "./index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

// Keyed by pathname so each page change remounts and replays the fade (query-string changes don't).
function PageFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div key={pathname} className="page-fade">{children}</div>;
}

function Nav() {
  const { pathname, search } = useLocation();
  // Follow Up is a filtered view of the jobs list, so match on the query string too.
  const onFollowUp = pathname === "/" && new URLSearchParams(search).get("status") === "followup";
  const isActive = (to: string) =>
    to === FOLLOW_UP ? onFollowUp : to === "/" ? pathname === "/" && !onFollowUp : pathname === to;
  const linkClass = (to: string) => (isActive(to) ? "text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <nav className="flex h-full text-sm">
      {[["/", "Jobs"], [FOLLOW_UP, "Follow Up"], ["/performance", "Performance"], ["/activity", "Activity"]].map(([to, label]) => (
        <Link key={to} to={to} className={`flex h-full items-center px-3 hover:bg-muted/50 ${linkClass(to)}`}>{label}</Link>
      ))}
    </nav>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <GlobalHotkeys />
        <div className="flex min-h-screen flex-col">
        <header className="border-b bg-card">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-5 px-3">
            <Link to="/" className="px-3 text-lg font-semibold">Application Tracker</Link>
            <Nav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
          <PageFade>
          <Routes>
            <Route path="/" element={<JobsList />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/performance" element={<ResumePerformance />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/stats" element={<Navigate to="/activity" replace />} />
            <Route path="/trash" element={<Trash />} />
          </Routes>
          </PageFade>
        </main>
        <footer className="border-t">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 text-xs text-muted-foreground">
            <a href="https://github.com/brianpurkiss/Simple-Application-Tracker" target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a>
            <a href="https://github.com/brianpurkiss/Simple-Application-Tracker/blob/main/LICENSE.md" target="_blank" rel="noreferrer" className="hover:text-foreground">MIT License</a>
          </div>
        </footer>
        </div>
        <Toaster position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
