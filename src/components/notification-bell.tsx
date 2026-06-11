import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "@/lib/jobs/api.functions";
import { ensureServiceWorker, updateAppBadge } from "@/lib/push/register";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const del = useServerFn(deleteNotification);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list() as Promise<Notification[]>,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  // Foreground toast for newly arrived unread notifications
  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  useEffect(() => {
    if (!q.data) return;
    if (!primed.current) {
      q.data.forEach((n) => seenIds.current.add(n.id));
      primed.current = true;
      return;
    }
    for (const n of q.data) {
      if (!seenIds.current.has(n.id) && !n.read_at) {
        toast.success(n.title, { description: n.body ?? undefined });
      }
      seenIds.current.add(n.id);
    }
  }, [q.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const markReadM = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: refresh,
  });
  const markAllM = useMutation({ mutationFn: () => markAll(), onSuccess: refresh });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: refresh,
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-medium">Notifications</div>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllM.mutate()}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-border">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`p-3 flex gap-2 items-start ${n.read_at ? "" : "bg-accent/40"}`}
              >
                <button
                  type="button"
                  className="flex-1 text-left min-w-0"
                  onClick={() => {
                    if (!n.read_at) markReadM.mutate(n.id);
                    if (n.kind === "scan_complete") navigate({ to: "/jobs" });
                  }}
                >
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  {n.body && (
                    <div className="text-xs text-muted-foreground truncate">{n.body}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                </button>
                <div className="flex flex-col gap-1 shrink-0">
                  {!n.read_at && (
                    <button
                      type="button"
                      onClick={() => markReadM.mutate(n.id)}
                      className="p-1 rounded hover:bg-accent"
                      aria-label="Mark read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => delM.mutate(n.id)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                    aria-label="Dismiss"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
