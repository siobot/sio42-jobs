import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Briefcase, ListChecks, Send, Settings, History, LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs feed", icon: Briefcase },
  { to: "/applications", label: "Applications", icon: Send },
  { to: "/checklist", label: "Checklist", icon: ListChecks },
  { to: "/history", label: "Scan history", icon: History },
  { to: "/settings", label: "Sources & filters", icon: Settings },
] as const;

export function AppShell({ children, email, isDemo }: { children: React.ReactNode; email?: string | null; isDemo?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  // close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [path]);

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
          <div className="text-base font-semibold tracking-tight">Job Monitor</div>
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
      <nav className="flex flex-col gap-1 flex-1">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
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
      </nav>
      <button
        onClick={() => supabase.auth.signOut()}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/50"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
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
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-sidebar-border bg-background/80 backdrop-blur px-4 h-14">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-sidebar-accent/60"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
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
