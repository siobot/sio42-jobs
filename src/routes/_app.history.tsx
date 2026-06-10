import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    </div>
  );
}
