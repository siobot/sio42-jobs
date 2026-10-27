import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { runScan, setJobStatus } from "@/lib/jobs/api.functions";
import {
  listDiscoverySuggestions, approveSuggestion, dismissSuggestion,
  dismissAllSuggestions, triggerDiscovery, importDiscoveredJob,
} from "@/lib/jobs/discovery.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { RefreshCw, Sparkles, X, Loader2 } from "lucide-react";
import { JobActions } from "@/components/job-actions";
import { ProductTour } from "@/components/product-tour";

type Status = "new" | "interested" | "applied" | "dismissed" | "archived";

const DEMO_LOADING_MESSAGES = [
  "Building your keyword filters…",
  "Scanning career pages and job boards…",
  "Matching postings against your keywords…",
  "Marking a few favorites…",
];

const searchSchema = z.object({
  demo: z.literal("1").optional(),
  tour: z.literal("1").optional(),
});

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Jobs Feed — Job Monitor" }] }),
  validateSearch: searchSchema,
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const scan = useServerFn(runScan);
  const setStatus = useServerFn(setJobStatus);

  // "Try the demo" lands here right after sign-in, before any scan has run —
  // kick one off now and show loading skeletons instead of an empty feed.
  const [demoLoading, setDemoLoading] = useState(search.demo === "1");
  const [messageIndex, setMessageIndex] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const closeTour = useCallback(() => setTourOpen(false), []);

  // "Take the tour" in the sidebar links here with ?tour=1.
  useEffect(() => {
    if (search.tour !== "1") return;
    navigate({ to: "/", search: {}, replace: true });
    setTourOpen(true);
  }, [search.tour, navigate]);

  useEffect(() => {
    if (!demoLoading) return;
    const t = setInterval(
      () => setMessageIndex((i) => (i + 1) % DEMO_LOADING_MESSAGES.length),
      1800,
    );
    return () => clearInterval(t);
  }, [demoLoading]);

  useEffect(() => {
    if (search.demo !== "1") return;
    // Drop the flag from the URL immediately so a refresh mid-scan (or
    // coming back later) doesn't re-trigger this.
    navigate({ to: "/", search: {}, replace: true });
    (async () => {
      try {
        await scan({ data: undefined as never });
        const { data: fresh } = await supabase
          .from("jobs").select("id")
          .order("first_seen_at", { ascending: false })
          .limit(2);
        for (const j of fresh ?? []) {
          await setStatus({ data: { id: j.id, status: "interested" } });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load demo jobs");
      } finally {
        setDemoLoading(false);
        qc.invalidateQueries();
        setTourOpen(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Discovery
  const listSuggestionsFn = useServerFn(listDiscoverySuggestions);
  const approveFn = useServerFn(approveSuggestion);
  const dismissFn = useServerFn(dismissSuggestion);
  const dismissAllFn = useServerFn(dismissAllSuggestions);
  const triggerFn = useServerFn(triggerDiscovery);

  const suggestions = useQuery({
    queryKey: ["discovery-suggestions"],
    queryFn: () => listSuggestionsFn(),
  });

  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const discoverM = useMutation({
    mutationFn: () => triggerFn({ data: undefined as never }),
    onMutate: () => setDiscoveryRunning(true),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      const result = r as Record<string, number>;
      toast.success(
        `Discovery complete: ${result.jobsFetched} jobs scanned, ${result.companiesFound} companies found, ${result.companiesSuggested} new suggestions`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Discovery failed"),
    onSettled: () => setDiscoveryRunning(false),
  });

  const approveM = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      qc.invalidateQueries({ queryKey: ["sources"] });
      toast.success("Company added to your tracked sources");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Track failed"),
  });

  const dismissM = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      toast.success("Suggestion dismissed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Dismiss failed"),
  });

  const dismissAllM = useMutation({
    mutationFn: () => dismissAllFn({ data: undefined as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      toast.success("All suggestions dismissed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Dismiss all failed"),
  });

  const [actionedUrls, setActionedUrls] = useState<Set<string>>(new Set());
  const importJobFn = useServerFn(importDiscoveredJob);
  const importJobM = useMutation({
    mutationFn: (data: { title: string; url: string; company: string; location: string; ats_type: string; status: "interested" | "applied" | "dismissed" }) =>
      importJobFn({ data }),
    onSuccess: (_r, vars) => {
      setActionedUrls((prev) => new Set(prev).add(vars.url));
      qc.invalidateQueries({ queryKey: ["dashboard-recent"] });
      qc.invalidateQueries({ queryKey: ["dashboard-interested"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      const label = vars.status === "interested" ? "Marked interested" : vars.status === "applied" ? "Added to applications" : "Marked not interested";
      toast.success(label);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const discoveredItems = suggestions.data ?? [];

  const lastRunRel = useRelativeTime(stats.data?.latestRun?.finished_at ?? stats.data?.latestRun?.started_at);

  return (
    <div className="space-y-6">
      <div data-tour="scan" className="inline-flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Jobs Feed</h1>
          <Button size="sm" onClick={() => scanM.mutate()} disabled={scanM.isPending || demoLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${scanM.isPending || demoLoading ? "animate-spin" : ""}`} />
            {scanM.isPending || demoLoading ? "Scanning…" : "Run scan now"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => discoverM.mutate()} disabled={discoveryRunning}>
            {discoveryRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Discovering…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Discover new</>
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {demoLoading ? "Setting up your demo…" : `Last scan: ${lastRunRel}`}
        </p>
      </div>

      {demoLoading ? (
        <div className="relative">
          <DashboardSkeleton />
          <div className="absolute inset-0 flex items-start justify-center pt-24 sm:pt-32" aria-live="polite">
            <Card className="px-6 py-5 flex flex-col items-center gap-3 text-center shadow-xl max-w-sm">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <div className="text-base font-medium">{DEMO_LOADING_MESSAGES[messageIndex]}</div>
              <div className="text-xs text-muted-foreground">
                Running a live search of real job boards — this takes a few seconds.
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="New matches" value={stats.data?.newCount ?? 0} to="/" />
            <StatCard label="Interested" value={stats.data?.interested ?? 0} to="/" />
            <StatCard label="Applied" value={stats.data?.applied ?? 0} to="/applications" />
          </div>

          <Card className="p-4" data-tour="interested">
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
                  <JobActions jobId={j.id} status={j.status as Status} company={j.company} />
                </div>
              ))}
              {(interested.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No jobs marked interested yet.</p>
              )}
            </div>
          </Card>

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
                  <JobActions jobId={j.id} status={j.status as Status} company={j.company} />
                </div>
              ))}
              {(recent.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No jobs yet — run a scan to start.</p>
              )}
            </div>
          </Card>

          {/* Discovered */}
          {discoveredItems.some((s) => {
            const suggestion = s as unknown as { matching_roles: Array<{ url: string }> };
            return (suggestion.matching_roles ?? []).some((r) => !actionedUrls.has(r.url));
          }) && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-medium">Discovered</h2>
                </div>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => dismissAllM.mutate()}
                  disabled={dismissAllM.isPending}
                  className="text-muted-foreground text-xs"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  {dismissAllM.isPending ? "Clearing…" : "Dismiss all"}
                </Button>
              </div>
              <div className="divide-y divide-border">
                {discoveredItems.flatMap((s) => {
                  const suggestion = s as unknown as { id: string; ats_type: string; slug: string; company_name: string; matching_roles: Array<{ title: string; url: string; location: string }> };
                  const roles = (suggestion.matching_roles ?? []).filter((r) => !actionedUrls.has(r.url));
                  const company = suggestion.company_name || suggestion.slug;
                  const busy = approveM.isPending || dismissM.isPending;
                  if (roles.length === 0) return [];
                  return roles.map((role, i) => (
                    <div key={`${suggestion.id}-${i}`} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <a href={role.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate block">
                          {role.title}
                        </a>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {company} · {suggestion.ats_type}
                          {role.location && <span className="ml-1">· {role.location}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => importJobM.mutate({ title: role.title, url: role.url, company, location: role.location, ats_type: suggestion.ats_type, status: "interested" })}
                        >Interested</Button>
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => importJobM.mutate({ title: role.title, url: role.url, company, location: role.location, ats_type: suggestion.ats_type, status: "applied" })}
                        >Applied</Button>
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => importJobM.mutate({ title: role.title, url: role.url, company, location: role.location, ats_type: suggestion.ats_type, status: "dismissed" })}
                        >Not Interested</Button>
                        <Button size="sm" variant="ghost" onClick={() => approveM.mutate(suggestion.id)} disabled={busy} className="text-muted-foreground">
                          Track company
                        </Button>
                      </div>
                    </div>
                  ));
                })}
              </div>
            </Card>
          )}
        </>
      )}
      <ProductTour open={tourOpen && !demoLoading} onClose={closeTour} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-12" />
          </Card>
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, section) => (
        <Card key={section} className="p-4 space-y-3">
          <Skeleton className="h-4 w-28" />
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-40 shrink-0" />
              </div>
            ))}
          </div>
        </Card>
      ))}
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
