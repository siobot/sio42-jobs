import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addManualCompany, deleteManualCompany, markCompanyChecked, updateManualCompany } from "@/lib/jobs/api.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_app/checklist")({
  head: () => ({ meta: [{ title: "Manual checklist — Job Monitor" }] }),
  component: ChecklistPage,
});

function ChecklistPage() {
  const qc = useQueryClient();
  const mark = useServerFn(markCompanyChecked);
  const add = useServerFn(addManualCompany);
  const del = useServerFn(deleteManualCompany);
  const update = useServerFn(updateManualCompany);

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
  const updateM = useMutation({
    mutationFn: (v: { id: string; url: string }) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["manual-companies"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

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
            onDeleteRequest={() => setPendingDelete({ id: c.id, name: c.name })}
            onSaveUrl={(url) => updateM.mutateAsync({ id: c.id, url })}
          />
        ))}
        {(list.data ?? []).length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No companies yet — add one above.</p>
        )}
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete company?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{pendingDelete?.name}</strong> from the checklist? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) delM.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function freshness(lastCheckedAt: string | null) {
  if (!lastCheckedAt) {
    return { dot: "bg-muted-foreground/40", text: "text-muted-foreground" };
  }
  const days = (Date.now() - new Date(lastCheckedAt).getTime()) / 86_400_000;
  if (days <= 7) return { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (days <= 30) return { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

function ChecklistRow({
  id: _id, name, url, lastCheckedAt, onClickName, onDeleteRequest, onSaveUrl,
}: { id: string; name: string; url: string; lastCheckedAt: string | null; onClickName: () => void; onDeleteRequest: () => void; onSaveUrl: (url: string) => Promise<unknown> }) {
  const rel = useRelativeTime(lastCheckedAt);
  const f = freshness(lastCheckedAt);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(url);
  const [saving, setSaving] = useState(false);

  const startEdit = () => { setDraft(url); setIsEditing(true); };
  const cancel = () => { setIsEditing(false); setDraft(url); };
  const save = async () => {
    if (!draft || draft === url) { setIsEditing(false); return; }
    setSaving(true);
    try { await onSaveUrl(draft); setIsEditing(false); }
    catch { /* toast handled in mutation */ }
    finally { setSaving(false); }
  };

  return (
    <div className="p-3 flex items-center gap-4">
      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${f.dot}`} aria-hidden />
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
        {isEditing ? (
          <div className="mt-1 flex items-center gap-1">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") { e.preventDefault(); cancel(); }
              }}
              className="h-7 text-xs"
              placeholder="https://example.com/careers"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={saving}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancel} disabled={saving}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground truncate">{url}</div>
        )}
      </div>
      <div className={`text-xs tabular-nums w-32 text-right ${f.text}`}>
        {lastCheckedAt ? `Checked ${rel}` : "Never checked"}
      </div>
      <Button size="icon" variant="ghost" onClick={startEdit} aria-label="Edit URL"><Pencil className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onDeleteRequest}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
