import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addManualCompany, deleteManualCompany, markCompanyChecked } from "@/lib/jobs/api.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { toast } from "sonner";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/checklist")({
  head: () => ({ meta: [{ title: "Manual checklist — Job Monitor" }] }),
  component: ChecklistPage,
});

function ChecklistPage() {
  const qc = useQueryClient();
  const mark = useServerFn(markCompanyChecked);
  const add = useServerFn(addManualCompany);
  const del = useServerFn(deleteManualCompany);

  const list = useQuery({
    queryKey: ["manual-companies"],
    queryFn: async () => {
      const { data } = await supabase.from("manual_companies")
        .select("id, name, url, last_checked_at")
        .order("name", { ascending: true });
      return data ?? [];
    },
  });

  const markM = useMutation({
    mutationFn: (id: string) => mark({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manual-companies"] }),
  });
  const addM = useMutation({
    mutationFn: (v: { name: string; url: string }) => add({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manual-companies"] }); setName(""); setUrl(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Add failed"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manual-companies"] }),
  });

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Manual checklist</h1>
        <p className="text-sm text-muted-foreground">Click a company name to open their careers page — the timestamp updates automatically.</p>
      </div>

      <Card className="p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name && url) addM.mutate({ name, url }); }}
        >
          <Input placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="https://example.com/careers" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" disabled={!name || !url || addM.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </form>
      </Card>

      <Card className="divide-y divide-border">
        {(list.data ?? []).map((c) => (
          <ChecklistRow
            key={c.id}
            id={c.id}
            name={c.name}
            url={c.url}
            lastCheckedAt={c.last_checked_at}
            onClickName={() => markM.mutate(c.id)}
            onDelete={() => delM.mutate(c.id)}
          />
        ))}
        {(list.data ?? []).length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No companies yet — add one above.</p>
        )}
      </Card>
    </div>
  );
}

function ChecklistRow({
  id: _id, name, url, lastCheckedAt, onClickName, onDelete,
}: { id: string; name: string; url: string; lastCheckedAt: string | null; onClickName: () => void; onDelete: () => void }) {
  const rel = useRelativeTime(lastCheckedAt);
  return (
    <div className="p-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={onClickName}
          className="font-medium text-sm hover:underline inline-flex items-center gap-1"
        >
          {name}
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </a>
        <div className="text-xs text-muted-foreground truncate">{url}</div>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums w-32 text-right">
        Checked {rel}
      </div>
      <Button size="sm" variant="outline" onClick={onClickName}>Mark checked</Button>
      <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
