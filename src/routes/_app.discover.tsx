import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listDiscoverySuggestions, approveSuggestion, dismissSuggestion, dismissAllSuggestions,
  triggerDiscovery, getDiscoveryStats,
} from "@/lib/jobs/discovery.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, Check, X, Loader2, Sparkles, ExternalLink, Building2, Settings,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/discover")({
  head: () => ({ meta: [{ title: "Discover Companies — Job Monitor" }] }),
  component: DiscoverPage,
});

const ATS_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  lever: "Lever",
};

function DiscoverPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDiscoverySuggestions);
  const approveFn = useServerFn(approveSuggestion);
  const dismissFn = useServerFn(dismissSuggestion);
  const dismissAllFn = useServerFn(dismissAllSuggestions);
  const triggerFn = useServerFn(triggerDiscovery);
  const statsFn = useServerFn(getDiscoveryStats);

  const suggestions = useQuery({
    queryKey: ["discovery-suggestions"],
    queryFn: () => listFn(),
  });

  const stats = useQuery({
    queryKey: ["discovery-stats"],
    queryFn: () => statsFn(),
  });

  const approveM = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      qc.invalidateQueries({ queryKey: ["discovery-stats"] });
      qc.invalidateQueries({ queryKey: ["sources"] });
      toast.success("Company added to your tracked sources");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approve failed"),
  });

  const dismissM = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      qc.invalidateQueries({ queryKey: ["discovery-stats"] });
      toast.success("Company dismissed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Dismiss failed"),
  });

  const dismissAllM = useMutation({
    mutationFn: () => dismissAllFn({ data: undefined as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      qc.invalidateQueries({ queryKey: ["discovery-stats"] });
      toast.success("All suggestions dismissed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Dismiss all failed"),
  });

  const [running, setRunning] = useState(false);
  const triggerM = useMutation({
    mutationFn: () => triggerFn({ data: undefined as never }),
    onMutate: () => setRunning(true),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["discovery-suggestions"] });
      qc.invalidateQueries({ queryKey: ["discovery-stats"] });
      const result = r as Record<string, number>;
      toast.success(
        `Discovery complete: ${result.jobsFetched} jobs scanned, ${result.companiesFound} companies found, ${result.companiesSuggested} new suggestions`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Discovery failed"),
    onSettled: () => setRunning(false),
  });

  const items = suggestions.data ?? [];
  const st = stats.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Discover Companies</h1>
        <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Settings className="h-3.5 w-3.5" /> Configure in Settings
        </Link>
      </div>

      {/* Stats bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Pending suggestions:</span>{" "}
            <span className="font-medium">{st?.pendingCount ?? 0}</span>
          </div>
          {st?.lastRun && (
            <>
              <div>
                <span className="text-muted-foreground">Last run:</span>{" "}
                <span className="font-medium">{new Date(st.lastRun.started_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Jobs scanned:</span>{" "}
                <span className="font-medium">{st.lastRun.jobs_fetched ?? 0}</span>
              </div>
            </>
          )}
          <div className="ml-auto flex gap-2">
            {items.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => dismissAllM.mutate()}
                disabled={dismissAllM.isPending}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                {dismissAllM.isPending ? "Clearing…" : "Dismiss all"}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => triggerM.mutate()}
              disabled={running}
            >
              {running ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Running…</>
              ) : (
                <><Search className="h-3.5 w-3.5 mr-1" />Run discovery now</>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Suggestion list */}
      {items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
          <div className="font-medium mb-1">No pending suggestions</div>
          <div>Run a discovery scan to find new companies, or check back after the weekly scan runs.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s as unknown as Suggestion}
              onApprove={() => approveM.mutate(s.id)}
              onDismiss={() => dismissM.mutate(s.id)}
              busy={approveM.isPending || dismissM.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Suggestion = {
  id: string;
  ats_type: string;
  slug: string;
  company_name: string;
  matching_roles: Array<{ title: string; url: string; location: string }>;
  discovered_at: string;
};

function SuggestionCard({
  suggestion: s,
  onApprove,
  onDismiss,
  busy,
}: {
  suggestion: Suggestion;
  onApprove: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const roles = (s.matching_roles ?? []) as Array<{ title: string; url: string; location: string }>;
  const preview = expanded ? roles : roles.slice(0, 3);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{s.company_name || s.slug}</span>
            <Badge variant="outline" className="text-[10px]">
              {ATS_LABELS[s.ats_type] ?? s.ats_type}
            </Badge>
            <span className="text-xs text-muted-foreground">/{s.slug}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {roles.length} matching role{roles.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={onDismiss}
            disabled={busy}
            className="text-muted-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Dismiss
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={busy}
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Track
          </Button>
        </div>
      </div>

      {roles.length > 0 && (
        <div className="space-y-1.5 pl-8">
          {preview.map((role, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="font-medium truncate flex-1">{role.title}</span>
              {role.location && (
                <span className="text-muted-foreground shrink-0">{role.location}</span>
              )}
              {role.url && (
                <a
                  href={role.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
          {roles.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline"
            >
              {expanded ? "Show less" : `+ ${roles.length - 3} more`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
