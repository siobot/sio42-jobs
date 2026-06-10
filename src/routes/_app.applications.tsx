import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addManualApplication, deleteApplication, updateApplication } from "@/lib/jobs/api.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/applications")({
  head: () => ({ meta: [{ title: "Applications — Job Monitor" }] }),
  component: ApplicationsPage,
});

type Stage = "applied" | "screen" | "interview" | "offer" | "rejected" | "withdrawn";
const STAGES: Stage[] = ["applied", "screen", "interview", "offer", "rejected", "withdrawn"];

function ApplicationsPage() {
  const qc = useQueryClient();
  const update = useServerFn(updateApplication);
  const addManual = useServerFn(addManualApplication);
  const del = useServerFn(deleteApplication);

  const apps = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const { data } = await supabase.from("applications")
        .select("id, company, title, url, stage, applied_at, next_action, next_action_at, notes")
        .order("applied_at", { ascending: false });
      return data ?? [];
    },
  });

  const updM = useMutation({
    mutationFn: (v: { id: string; stage?: Stage; next_action?: string | null; notes?: string | null }) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });
  const addM = useMutation({
    mutationFn: (v: { company: string; title: string; url?: string }) => addManual({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["applications"] }); setNc(""); setNt(""); setNu(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Add failed"),
  });

  const [nc, setNc] = useState("");
  const [nt, setNt] = useState("");
  const [nu, setNu] = useState("");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Applications</h1>

      <Card className="p-4">
        <form
          className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
          onSubmit={(e) => { e.preventDefault(); if (nc && nt) addM.mutate({ company: nc, title: nt, url: nu || undefined }); }}
        >
          <Input placeholder="Company" value={nc} onChange={(e) => setNc(e.target.value)} />
          <Input placeholder="Role" value={nt} onChange={(e) => setNt(e.target.value)} />
          <Input placeholder="URL (optional)" value={nu} onChange={(e) => setNu(e.target.value)} />
          <Button type="submit" disabled={!nc || !nt}><Plus className="h-4 w-4 mr-1" />Log application</Button>
        </form>
      </Card>

      <div className="space-y-3">
        {(apps.data ?? []).map((a) => (
          <Card key={a.id} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer" className="font-medium hover:underline inline-flex items-center gap-1">
                      {a.title} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  ) : <span className="font-medium">{a.title}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.company} · Applied {a.applied_at?.slice(0, 10)}
                </div>
              </div>
              <Select value={a.stage} onValueChange={(v) => updM.mutate({ id: a.id, stage: v as Stage })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => delM.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Next action"
                defaultValue={a.next_action ?? ""}
                onBlur={(e) => { const v = e.target.value; if (v !== (a.next_action ?? "")) updM.mutate({ id: a.id, next_action: v || null }); }}
              />
              <Textarea
                placeholder="Notes"
                defaultValue={a.notes ?? ""}
                onBlur={(e) => { const v = e.target.value; if (v !== (a.notes ?? "")) updM.mutate({ id: a.id, notes: v || null }); }}
                rows={2}
              />
            </div>
          </Card>
        ))}
        {(apps.data ?? []).length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground text-center">No applications yet.</Card>
        )}
      </div>
    </div>
  );
}
