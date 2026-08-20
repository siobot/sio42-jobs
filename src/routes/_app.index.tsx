import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runScan } from "@/lib/jobs/api.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { RefreshCw } from "lucide-react";
import { JobActions } from "@/components/job-actions";

type Status = "new" | "interested" | "applied" | "dismissed" | "archived";


export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Jobs Feed — Job Monitor" }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const scan = useServerFn(runScan);

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [news, interested, applied, latestRun] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "interested"),
        supabase.from("applications").select("id", { count: "exact", head: true }),
        supabase.from("scan_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        newCount: news.count ?? 0,
        interested: interested.count ?? 0,
        applied: applied.count ?? 0,
        latestRun: latestRun.data,
      };
    },
  });

  const recent = useQuery({
    queryKey: ["dashboard-recent"],
    queryFn: async () => {
      const { data } = await supabase.from("jobs")
        .select("id, company, title, url, source, first_seen_at, matched_groups, status")
        .eq("status", "new")
        .order("first_seen_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const interested = useQuery({
    queryKey: ["dashboard-interested"],
    queryFn: async () => {
      const { data } = await supabase.from("jobs")
        .select("id, company, title, url, source, status_updated_at, matched_groups, status")
        .eq("status", "interested")
        .order("status_updated_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const scanM = useMutation({
    mutationFn: () => scan({ data: undefined as never }),
    onSuccess: (r) => {
      toast.success(`Scan complete — ${r.newCount} new of ${r.matched} matched (${r.fetched} fetched)`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Scan failed"),
  });

  const lastRunRel = useRelativeTime(stats.data?.latestRun?.finished_at ?? stats.data?.latestRun?.started_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Jobs Feed</h1>
          <p className="text-sm text-muted-foreground">Last scan: {lastRunRel}</p>
        </div>
        <Button onClick={() => scanM.mutate()} disabled={scanM.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${scanM.isPending ? "animate-spin" : ""}`} />
          {scanM.isPending ? "Scanning…" : "Run scan now"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="New matches" value={stats.data?.newCount ?? 0} to="/" />
        <StatCard label="Interested" value={stats.data?.interested ?? 0} to="/" />
        <StatCard label="Applied" value={stats.data?.applied ?? 0} to="/applications" />
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium mb-3">Recently added</h2>
        <div className="divide-y divide-border">
          {(recent.data ?? []).map((j) => (
            <div key={j.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0 flex-1">
                <a href={j.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline truncate block">
                  {j.title}
                </a>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {j.company} · {j.source}
                  {(j.matched_groups ?? []).map((g) => (
                    <Badge key={g} variant="secondary" className="ml-1 text-[10px]">{g}</Badge>
                  ))}
                </div>
              </div>
              <JobActions jobId={j.id} status={j.status as Status} />
            </div>
          ))}
          {(recent.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No jobs yet — run a scan to start.</p>
          )}

        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium mb-3">Interested</h2>
        <div className="divide-y divide-border">
          {(interested.data ?? []).map((j) => (
            <div key={j.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0 flex-1">
                <a href={j.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline truncate block">
                  {j.title}
                </a>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {j.company} · {j.source}
                  {(j.matched_groups ?? []).map((g) => (
                    <Badge key={g} variant="secondary" className="ml-1 text-[10px]">{g}</Badge>
                  ))}
                </div>
              </div>
              <JobActions jobId={j.id} status={j.status as Status} />
            </div>
          ))}
          {(interested.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No jobs marked interested yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to as "/"} className="block">
      <Card className="p-4 hover:bg-accent/30 transition-colors">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold mt-1">{value}</div>
      </Card>
    </Link>
  );
}
