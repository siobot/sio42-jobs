import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Send, Settings, History, LogOut, Menu, X, Compass } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { markAllNotificationsRead } from "@/lib/jobs/api.functions";
import { ensureServiceWorker, updateAppBadge } from "@/lib/push/register";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Jobs Feed", icon: LayoutDashboard, tour: "nav-feed" },
  { to: "/applications", label: "Applications", icon: Send, tour: "nav-applications" },
  { to: "/checklist", label: "Other Career Pages", icon: ListChecks, tour: "nav-checklist" },
  { to: "/history", label: "Scan history", icon: History, tour: "nav-history" },
  { to: "/settings", label: "Settings", icon: Settings, tour: "nav-settings" },
] as const;

const secondaryItemClass =
  "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors";

export function AppShell({ children, email, isDemo }: { children: React.ReactNode; email?: string | null; isDemo?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  // close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [path]);

  // Opening / returning to the app means notifications have been seen:
  // clear the home-screen icon badge and mark them read server-side.
  const lastClearRef = useRef(0);
  useEffect(() => {
    ensureServiceWorker();

    let cancelled = false;
    const clearBadge = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastClearRef.current < 30_000) return; // debounce rapid focus events
      lastClearRef.current = now;
      await updateAppBadge(0);
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled || !data.session) return;
        await markAllNotificationsRead();
      } catch {
        // non-fatal: badge is already cleared locally
      }
    };

    void clearBadge();
    const onVisibility = () => void clearBadge();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  // lock body scroll while drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);


  const sidebar = (
    <>
      <div className="px-2 py-3 mb-2 flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-lg shrink-0"
          style={{ background: "var(--gradient-jewel)", boxShadow: "var(--shadow-glow)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold tracking-tight flex items-center gap-2">
            Job Monitor
            {isDemo && (
              <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                Demo
              </span>
            )}
          </div>
          {email && <div className="text-xs text-muted-foreground truncate">{email}</div>}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden p-1 rounded-md hover:bg-sidebar-accent/60"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex flex-col gap-1">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              data-tour={n.tour}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium border border-sidebar-border"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-primary")} />
              {n.label}
            </Link>
          );
        })}
        <div className="my-2 border-t border-sidebar-border" />
        {isDemo && (
          <Link to="/" search={{ tour: "1" }} className={secondaryItemClass}>
            <Compass className="h-4 w-4" /> Take the tour
          </Link>
        )}
        <button type="button" onClick={() => supabase.auth.signOut()} className={secondaryItemClass}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </nav>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 border-r border-sidebar-border bg-sidebar text-sidebar-foreground p-4 flex-col gap-1">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="relative w-72 max-w-[80%] border-r border-sidebar-border bg-sidebar text-sidebar-foreground p-4 flex flex-col gap-1 shadow-xl animate-in slide-in-from-left duration-200">
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-sidebar-border bg-background/80 backdrop-blur px-4 h-14">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-md hover:bg-sidebar-accent/60"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="md:hidden flex items-center gap-2 min-w-0">
            <div
              className="h-6 w-6 rounded-md shrink-0"
              style={{ background: "var(--gradient-jewel)" }}
              aria-hidden
            />
            <span className="text-sm font-semibold truncate">Job Monitor</span>
          </div>
        </header>
        <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
