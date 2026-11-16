import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink } from "lucide-react";
import { JobActions } from "@/components/job-actions";

type Status = "new" | "interested" | "applied" | "dismissed" | "archived";

export const Route = createFileRoute("/_app/history")({
  head: () => ({ meta: [{ title: "Scan history — Job Monitor" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const runs = useQuery({
    queryKey: ["scan-runs"],
    queryFn: async () => {
      const { data } = await supabase.from("scan_runs")
        .select("*").order("started_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scan history</h1>
      <Tabs defaultValue="scans">
        <TabsList>
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="dismissed">Recently not interested</TabsTrigger>
        </TabsList>
        <TabsContent value="dismissed"><RecentlyDismissed /></TabsContent>
        <TabsContent value="scans">
          <div className="space-y-3">
            {(runs.data ?? []).map((r) => {
              const errs = Array.isArray(r.errors) ? (r.errors as Array<{ source: string; error: string }>) : [];
              const counts = r.source_counts as Record<string, number> | null;
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">
                      {new Date(r.started_at).toLocaleString()} <span className="text-muted-foreground">· {r.triggered_by}</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">{r.fetched_count} fetched</Badge>
                      <Badge variant="secondary">{r.matched_count} matched</Badge>
                      <Badge>{r.new_count} new</Badge>
                    </div>
                  </div>
                  {counts && (
                    <div className="flex flex-wrap gap-1 text-xs">
                      {Object.entries(counts).map(([k, v]) => (
                        <span key={k} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{k}: {v}</span>
                      ))}
                    </div>
                  )}
                  {errs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {errs.map((e, i) => (
                        <div key={i} className="text-xs text-destructive">{e.source}: {e.error}</div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
            {(runs.data ?? []).length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground text-center">No scans yet.</Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RecentlyDismissed() {
  // Key starts with "jobs" so JobActions' refresh invalidates it after a change.
  const jobs = useQuery({
    queryKey: ["jobs", "recently-dismissed"],
    queryFn: async () => {
      const { data } = await supabase.from("jobs")
        .select("id, company, title, location, url, source, job_date, matched_keywords, matched_groups, status")
        .eq("status", "dismissed")
        .order("status_updated_at", { ascending: false, nullsFirst: false })
        .limit(10);
      return data ?? [];
    },
  });

  return (
    <Card className="divide-y divide-border">
      {(jobs.data ?? []).map((j) => (
        <div key={j.id} className="p-3 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <a href={j.url} target="_blank" rel="noreferrer" className="font-medium text-sm hover:underline truncate">
                {j.title}
              </a>
              <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {j.company} · {j.location || "—"} · {j.source}
              {j.job_date ? ` · ${j.job_date}` : ""}
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(j.matched_groups ?? []).map((g) => (
                <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>
              ))}
              {(j.matched_keywords ?? []).slice(0, 4).map((k) => (
                <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <JobActions jobId={j.id} status={j.status as Status} company={j.company} hideDismiss />
          </div>
        </div>
      ))}
      {!jobs.isLoading && (jobs.data ?? []).length === 0 && (
        <p className="p-6 text-sm text-muted-foreground text-center">No jobs marked Not Interested.</p>
      )}
    </Card>
  );
}
