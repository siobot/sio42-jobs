import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Briefcase, ListChecks, Send, Settings, History, LogOut } from "lucide-react";
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

export function AppShell({ children, email }: { children: React.ReactNode; email?: string | null }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 border-r border-border bg-sidebar text-sidebar-foreground p-4 flex flex-col gap-1">
        <div className="px-2 py-3 mb-2">
          <div className="text-lg font-semibold tracking-tight">Job Monitor</div>
          {email && <div className="text-xs text-muted-foreground truncate mt-0.5">{email}</div>}
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
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/50",
                )}
              >
                <Icon className="h-4 w-4" />
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
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">{children}</div>
      </main>
    </div>
  );
}
