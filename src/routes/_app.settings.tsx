import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  addSource, deleteSource, toggleSource, saveKeywordConfig, importLegacy, restoreDefaults,
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

  const [draft, setDraft] = useState<KeywordConfig | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // sync draft when server data loads/changes
  useEffect(() => {
    if (cfg.data && !draft) setDraft(cfg.data);
  }, [cfg.data, draft]);

  const saveM = useMutation({
    mutationFn: (config: KeywordConfig) => save({ data: { config } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["keyword-config"] }); toast.success("Filters saved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const dirty = useMemo(
    () => !!draft && !!cfg.data && JSON.stringify(draft) !== JSON.stringify(cfg.data),
    [draft, cfg.data],
  );

  if (!draft) {
    return <div className="mt-4 text-sm text-muted-foreground">Loading filters…</div>;
  }

  const update = (patch: Partial<KeywordConfig>) => setDraft({ ...draft, ...patch });
  const updateGroup = (key: string, terms: string[]) =>
    update({ keywords: { ...draft.keywords, [key]: terms } });
  const renameGroup = (oldKey: string, newKey: string) => {
    const trimmed = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!trimmed || trimmed === oldKey || draft.keywords[trimmed]) return;
    const entries = Object.entries(draft.keywords).map(([k, v]) =>
      k === oldKey ? [trimmed, v] as const : [k, v] as const,
    );
    update({ keywords: Object.fromEntries(entries) });
  };
  const removeGroup = (key: string) => {
    const next = { ...draft.keywords };
    delete next[key];
    update({ keywords: next });
  };
  const addGroup = () => {
    const slug = newGroup.trim().toLowerCase().replace(/\s+/g, "_");
    if (!slug || draft.keywords[slug]) return;
    update({ keywords: { ...draft.keywords, [slug]: [] } });
    setNewGroup("");
  };

  const groupTones = ["sapphire", "amethyst", "emerald", "topaz", "aqua", "ruby"] as const;
  const groupKeys = Object.keys(draft.keywords);

  return (
    <div className="space-y-4 mt-4">
      {/* Sticky action bar */}
      <div className="sticky top-14 md:top-0 z-20 -mx-4 px-4 md:mx-0 md:px-0 py-2 bg-background/80 backdrop-blur flex items-center justify-between gap-2 border-b border-border">
        <div className="text-xs text-muted-foreground">
          {dirty ? <span className="text-[color:var(--jewel-topaz)]">Unsaved changes</span> : "All changes saved"}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft(cfg.data ?? DEFAULT_KEYWORD_CONFIG)}
            disabled={!dirty}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revert
          </Button>
          <Button
            size="sm"
            onClick={() => saveM.mutate(draft)}
            disabled={!dirty || saveM.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saveM.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Remote-only toggle */}
      <Card className="p-4 flex items-center gap-3">
        <Globe className="h-5 w-5 text-[color:var(--jewel-aqua)] shrink-0" />
        <Label htmlFor="remoteOnly" className="flex-1 cursor-pointer">
          <div className="text-sm font-medium">Remote only</div>
          <div className="text-xs text-muted-foreground">Require a remote term in the title or location</div>
        </Label>
        <Switch
          id="remoteOnly"
          checked={draft.remote_only}
          onCheckedChange={(v) => update({ remote_only: v })}
        />
      </Card>

      {/* Keyword groups */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[color:var(--jewel-amethyst)]" />
          <div>
            <div className="text-sm font-medium">Keyword groups</div>
            <div className="text-xs text-muted-foreground">
              A job matches if any term in any group appears in its title.
            </div>
          </div>
        </div>

        <Accordion type="multiple" defaultValue={groupKeys.slice(0, 1)} className="space-y-2">
          {groupKeys.map((key, i) => (
            <AccordionItem
              key={key}
              value={key}
              className="border border-border rounded-md px-3 bg-card/50"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{key.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {draft.keywords[key].length} term{draft.keywords[key].length === 1 ? "" : "s"}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    defaultValue={key}
                    onBlur={(e) => renameGroup(key, e.target.value)}
                    className="h-8 text-sm sm:max-w-xs"
                    placeholder="Group name"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGroup(key)}
                    className="text-[color:var(--jewel-ruby)] hover:text-[color:var(--jewel-ruby)] hover:bg-[color:var(--jewel-ruby)]/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove group
                  </Button>
                </div>
                <TagInput
                  values={draft.keywords[key]}
                  onChange={(next) => updateGroup(key, next)}
                  placeholder="e.g. customer support"
                  tone={groupTones[i % groupTones.length]}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
            placeholder="New group name (e.g. devrel)"
            className="h-9 text-sm"
          />
          <Button onClick={addGroup} disabled={!newGroup.trim()} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add group
          </Button>
        </div>
      </Card>

      {/* Exclusions */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-[color:var(--jewel-ruby)]" />
          <div>
            <div className="text-sm font-medium">Exclusions</div>
            <div className="text-xs text-muted-foreground">
              Skip jobs whose title contains any of these terms — unless an exception is also present.
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Block terms</div>
            <TagInput
              values={draft.exclusions.terms}
              onChange={(next) => update({ exclusions: { ...draft.exclusions, terms: next } })}
              tone="ruby"
              placeholder="e.g. engineer"
            />
          </div>
          <div>
            <div className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Exceptions (allow anyway)</div>
            <TagInput
              values={draft.exclusions.exceptions}
              onChange={(next) => update({ exclusions: { ...draft.exclusions, exceptions: next } })}
              tone="emerald"
              placeholder="e.g. support engineer"
            />
          </div>
        </div>
      </Card>

      {/* Remote terms */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-[color:var(--jewel-aqua)]" />
          <div>
            <div className="text-sm font-medium">Remote terms</div>
            <div className="text-xs text-muted-foreground">Words that count as remote when “Remote only” is on.</div>
          </div>
        </div>
        <TagInput
          values={draft.remote_terms}
          onChange={(next) => update({ remote_terms: next })}
          tone="aqua"
          placeholder="e.g. anywhere"
        />
      </Card>

      {/* Location excludes */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-[color:var(--jewel-topaz)]" />
          <div>
            <div className="text-sm font-medium">Location excludes</div>
            <div className="text-xs text-muted-foreground">Skip jobs whose location mentions any of these places.</div>
          </div>
        </div>
        <TagInput
          values={draft.location_exclude}
          onChange={(next) => update({ location_exclude: next })}
          tone="topaz"
          placeholder="e.g. California"
        />
      </Card>

      {/* Non-English markers */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-[color:var(--jewel-amethyst)]" />
          <div>
            <div className="text-sm font-medium">Non-English markers</div>
            <div className="text-xs text-muted-foreground">Title fragments that signal a non-English posting.</div>
          </div>
        </div>
        <TagInput
          values={draft.non_english_markers}
          onChange={(next) => update({ non_english_markers: next })}
          tone="amethyst"
          placeholder="e.g. (m/w/d)"
        />
      </Card>

      <div className="flex flex-wrap gap-2 justify-between items-center pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDraft(DEFAULT_KEYWORD_CONFIG)}
          className="text-muted-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to defaults
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-muted-foreground"
        >
          <Code2 className="h-3.5 w-3.5 mr-1" />
          {showAdvanced ? "Hide" : "Show"} raw JSON
        </Button>
      </div>

      {showAdvanced && (
        <Card className="p-4 space-y-2">
          <div className="text-xs text-muted-foreground">
            Edit the raw config. Press “Apply JSON” to load it back into the editor above.
          </div>
          <Textarea
            rows={16}
            className="font-mono text-xs"
            defaultValue={JSON.stringify(draft, null, 2)}
            key={JSON.stringify(draft)}
            id="json-editor"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const el = document.getElementById("json-editor") as HTMLTextAreaElement | null;
              if (!el) return;
              try {
                setDraft(JSON.parse(el.value) as KeywordConfig);
                toast.success("JSON applied — review and Save");
              } catch {
                toast.error("Invalid JSON");
              }
            }}
          >
            Apply JSON
          </Button>
        </Card>
      )}
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
