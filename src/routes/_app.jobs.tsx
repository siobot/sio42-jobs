import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { setJobStatus } from "@/lib/jobs/api.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ExternalLink, Heart, Send, X, Archive } from "lucide-react";

const searchSchema = z.object({
  status: z.enum(["all", "new", "interested", "applied", "dismissed", "archived"]).optional().default("new"),
});

export const Route = createFileRoute("/_app/jobs")({
  head: () => ({ meta: [{ title: "Jobs feed — Job Monitor" }] }),
  validateSearch: searchSchema,
  component: JobsPage,
});

type Status = "new" | "interested" | "applied" | "dismissed" | "archived";

function JobsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const setStatus = useServerFn(setJobStatus);

  const [q, setQ] = useState("");
  const [source, setSource] = useState<string>("all");

  const jobs = useQuery({
    queryKey: ["jobs", search.status, q, source],
    queryFn: async () => {
      let query = supabase.from("jobs")
        .select("id, company, title, location, url, source, job_date, matched_keywords, matched_groups, first_seen_at, status")
        .order("first_seen_at", { ascending: false })
        .limit(500);
      if (search.status !== "all") query = query.eq("status", search.status);
      if (source !== "all") query = query.eq("source", source);
      if (q.trim()) query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: (v: { id: string; status: Status }) => setStatus({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const tabs: Array<{ key: typeof search.status; label: string }> = [
    { key: "new", label: "New" },
    { key: "interested", label: "Interested" },
    { key: "applied", label: "Applied" },
    { key: "dismissed", label: "Dismissed" },
    { key: "archived", label: "Archived" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Jobs feed</h1>

      <div className="flex flex-wrap gap-2 items-center">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={search.status === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => navigate({ search: { status: t.key } })}
          >
            {t.label}
          </Button>
        ))}
        <div className="ml-auto flex gap-2 items-center">
          <Input placeholder="Search title or company" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="greenhouse">Greenhouse</SelectItem>
              <SelectItem value="ashby">Ashby</SelectItem>
              <SelectItem value="lever">Lever</SelectItem>
              <SelectItem value="doist">Doist</SelectItem>
              <SelectItem value="remotive">Remotive</SelectItem>
              <SelectItem value="weworkremotely">WeWorkRemotely</SelectItem>
              <SelectItem value="workingnomads">WorkingNomads</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="divide-y divide-border">
        {(jobs.data ?? []).map((j) => (
          <div key={j.id} className="p-3 flex items-start gap-3">
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
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" title="Interested" onClick={() => mut.mutate({ id: j.id, status: "interested" })}>
                <Heart className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Applied" onClick={() => mut.mutate({ id: j.id, status: "applied" })}>
                <Send className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Dismiss" onClick={() => mut.mutate({ id: j.id, status: "dismissed" })}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Archive" onClick={() => mut.mutate({ id: j.id, status: "archived" })}>
                <Archive className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {(jobs.data ?? []).length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No jobs match this filter.</p>
        )}
      </Card>
    </div>
  );
}
