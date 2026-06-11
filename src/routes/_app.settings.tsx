import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  addSource, deleteSource, toggleSource, saveKeywordConfig, importLegacy,
} from "@/lib/jobs/api.functions";
import { DEFAULT_KEYWORD_CONFIG, type KeywordConfig } from "@/lib/jobs/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { TagInput } from "@/components/tag-input";
import { Trash2, Plus, Upload, RotateCcw, Save, Sparkles, Ban, Globe, MapPin, Languages, Code2, Tag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Sources & filters — Job Monitor" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sources & filters</h1>
      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">ATS sources</TabsTrigger>
          <TabsTrigger value="filters">Keyword filters</TabsTrigger>
          <TabsTrigger value="import">Import legacy data</TabsTrigger>
        </TabsList>
        <TabsContent value="sources"><SourcesTab /></TabsContent>
        <TabsContent value="filters"><FiltersTab /></TabsContent>
        <TabsContent value="import"><ImportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function SourcesTab() {
  const qc = useQueryClient();
  const add = useServerFn(addSource);
  const tog = useServerFn(toggleSource);
  const del = useServerFn(deleteSource);

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      const { data } = await supabase.from("sources").select("*").order("type").order("name");
      return data ?? [];
    },
  });
  const addM = useMutation({
    mutationFn: (v: { type: "greenhouse" | "ashby" | "lever"; slug: string; name: string }) => add({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sources"] }); setSlug(""); setName(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Add failed"),
  });
  const togM = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => tog({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const [type, setType] = useState<"greenhouse" | "ashby" | "lever">("greenhouse");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4">
        <form
          className="grid grid-cols-[160px_1fr_1fr_auto] gap-2"
          onSubmit={(e) => { e.preventDefault(); if (slug && name) addM.mutate({ type, slug, name }); }}
        >
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="greenhouse">Greenhouse</SelectItem>
              <SelectItem value="ashby">Ashby</SelectItem>
              <SelectItem value="lever">Lever</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Board slug (e.g. linear)" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!slug || !name}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </form>
      </Card>

      <Card className="divide-y divide-border">
        {(sources.data ?? []).map((s) => (
          <div key={s.id} className="p-3 flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground w-20">{s.type}</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">{s.slug}</div>
            </div>
            <Switch checked={s.enabled} onCheckedChange={(v) => togM.mutate({ id: s.id, enabled: v })} />
            <Button size="icon" variant="ghost" onClick={() => delM.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function FiltersTab() {
  const qc = useQueryClient();
  const save = useServerFn(saveKeywordConfig);

  const cfg = useQuery({
    queryKey: ["keyword-config"],
    queryFn: async () => {
      const { data } = await supabase.from("keyword_config").select("config").maybeSingle();
      return (data?.config as KeywordConfig | undefined) ?? DEFAULT_KEYWORD_CONFIG;
    },
  });

  const [draft, setDraft] = useState<string>("");
  const current = cfg.data;
  const initialJson = current ? JSON.stringify(current, null, 2) : "";

  const saveM = useMutation({
    mutationFn: (config: KeywordConfig) => save({ data: { config } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["keyword-config"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  function onSave() {
    try {
      const parsed = JSON.parse(draft || initialJson) as KeywordConfig;
      saveM.mutate(parsed);
    } catch {
      toast.error("Invalid JSON");
    }
  }

  function setRemoteOnly(v: boolean) {
    const next = { ...(current ?? DEFAULT_KEYWORD_CONFIG), remote_only: v };
    saveM.mutate(next);
    setDraft(JSON.stringify(next, null, 2));
  }

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 flex items-center gap-3">
        <Label htmlFor="remoteOnly" className="flex-1">
          <div className="text-sm font-medium">Remote only</div>
          <div className="text-xs text-muted-foreground">Require &quot;remote&quot; in title or location</div>
        </Label>
        <Switch id="remoteOnly" checked={!!current?.remote_only} onCheckedChange={setRemoteOnly} />
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Keyword config (JSON)</div>
        <p className="text-xs text-muted-foreground">
          Edit keyword groups, exclusions, non-English markers, location excludes, remote terms.
        </p>
        <Textarea
          rows={20}
          className="font-mono text-xs"
          defaultValue={initialJson}
          key={initialJson}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saveM.isPending}>Save</Button>
          <Button variant="outline" onClick={() => { setDraft(JSON.stringify(DEFAULT_KEYWORD_CONFIG, null, 2)); }}>
            Reset to defaults (preview)
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ImportTab() {
  const qc = useQueryClient();
  const importFn = useServerFn(importLegacy);
  const [files, setFiles] = useState<Record<string, unknown>>({});

  async function read(name: string, file: File) {
    const text = await file.text();
    try {
      setFiles((f) => ({ ...f, [name]: JSON.parse(text) }));
    } catch {
      toast.error(`${name}: invalid JSON`);
    }
  }
  const importM = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: () => importFn({ data: files as any }),
    onSuccess: (s) => {
      toast.success(`Imported: ${s.sources} sources, ${s.manual} manual, ${s.jobs} jobs${s.configSaved ? ", config" : ""}`);
      qc.invalidateQueries();
      setFiles({});
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const slots = [
    { key: "config", label: "config.json" },
    { key: "applied", label: "applied.json" },
    { key: "interested", label: "interested.json" },
    { key: "dismissed", label: "dismissed.json" },
  ];

  return (
    <Card className="p-4 mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload any combination of your old Python tool's JSON files. Existing rows are kept; only new ones are added.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((s) => (
          <label key={s.key} className="border border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:bg-accent/30">
            <div className="text-sm font-medium">{s.label}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {files[s.key] ? "✓ loaded" : "Click to choose file"}
            </div>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) read(s.key, f); }}
            />
          </label>
        ))}
      </div>
      <Button onClick={() => importM.mutate()} disabled={importM.isPending || Object.keys(files).length === 0}>
        <Upload className="h-4 w-4 mr-1" />
        {importM.isPending ? "Importing…" : "Import selected files"}
      </Button>
    </Card>
  );
}
