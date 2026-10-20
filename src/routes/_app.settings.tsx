import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  detectAndAddCompany, deleteSource, toggleSource, saveKeywordConfig, importLegacy, restoreDefaults,
  getSchedule, saveSchedule, savePushSubscription, deletePushSubscription, hasPushSubscription,
} from "@/lib/jobs/api.functions";
import { VAPID_PUBLIC_KEY } from "@/lib/push/config";
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from "@/lib/push/register";
import { ATS_TYPES, DEFAULT_KEYWORD_CONFIG, SOURCE_LABELS, type KeywordConfig } from "@/lib/jobs/types";
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
import { Trash2, Plus, Upload, RotateCcw, Save, Sparkles, Ban, Globe, MapPin, Languages, Code2, Tag, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Job Monitor" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">ATS sources</TabsTrigger>
          <TabsTrigger value="filters">Keyword filters</TabsTrigger>
          <TabsTrigger value="schedule">Scheduled scans</TabsTrigger>
          <TabsTrigger value="import">Import legacy data</TabsTrigger>
        </TabsList>
        <TabsContent value="sources"><SourcesTab /></TabsContent>
        <TabsContent value="filters"><FiltersTab /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
        <TabsContent value="import"><ImportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

const TYPE_LABELS = SOURCE_LABELS;
const AGGREGATOR_TYPES = ["remotive", "weworkremotely", "workingnomads"] as const;
type SourceRow = {
  id: string;
  type: string;
  slug: string;
  name: string;
  enabled: boolean;
};

function SourcesTab() {
  const qc = useQueryClient();
  const detect = useServerFn(detectAndAddCompany);
  const tog = useServerFn(toggleSource);
  const del = useServerFn(deleteSource);
  const restore = useServerFn(restoreDefaults);

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      const { data } = await supabase.from("sources").select("*").order("name");
      return (data ?? []) as SourceRow[];
    },
  });
  const detectM = useMutation({
    mutationFn: (v: { url: string; name?: string }) => detect({ data: v }),
    onSuccess: (r) => {
      if (r.status === "needs_name") { setNeedsNameFor(url); return; }
      qc.invalidateQueries({ queryKey: ["sources"] });
      qc.invalidateQueries({ queryKey: ["manual-companies"] });
      setUrl(""); setNeedsNameFor(null); setManualName("");
      if (r.status === "added_ats") toast.success(`Added ${r.name} as a ${TYPE_LABELS[r.type] ?? r.type} source`);
      else if (r.status === "added_manual") toast.success(`${r.name} isn't on a supported ATS — added to Other Career Pages`);
      else toast.info(`${r.name} is already on your list`);
    },
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
  const restoreM = useMutation({
    mutationFn: () => restore({ data: undefined as never }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      toast.success(
        r.addedSources + r.addedManual === 0
          ? "Nothing to restore — defaults already present"
          : `Restored ${r.addedSources} source${r.addedSources === 1 ? "" : "s"} and ${r.addedManual} manual compan${r.addedManual === 1 ? "y" : "ies"}`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Restore failed"),
  });

  const [url, setUrl] = useState("");
  const [needsNameFor, setNeedsNameFor] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");

  const all = sources.data ?? [];
  const ats = all.filter((s) => (ATS_TYPES as readonly string[]).includes(s.type));
  const aggregators = all.filter((s) => (AGGREGATOR_TYPES as readonly string[]).includes(s.type));

  const renderRow = (s: SourceRow, isAggregator: boolean) => (
    <div key={s.id} className="p-3 flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-24 shrink-0 truncate">
        {TYPE_LABELS[s.type] ?? s.type}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{s.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {isAggregator ? "Aggregated board — no slug needed" : s.slug}
        </div>
      </div>
      <Switch checked={s.enabled} onCheckedChange={(v) => togM.mutate({ id: s.id, enabled: v })} />
      <Button size="icon" variant="ghost" onClick={() => delM.mutate(s.id)} aria-label="Remove">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Add a company</div>
        {needsNameFor ? (
          <form
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2"
            onSubmit={(e) => { e.preventDefault(); if (manualName) detectM.mutate({ url: needsNameFor, name: manualName }); }}
          >
            <Input
              autoFocus
              placeholder="Display name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <Button type="submit" disabled={!manualName || detectM.isPending}>
              <Plus className="h-4 w-4 mr-1" />{detectM.isPending ? "Adding…" : "Add"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setNeedsNameFor(null); setManualName(""); }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <form
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"
            onSubmit={(e) => { e.preventDefault(); if (url) detectM.mutate({ url }); }}
          >
            <Input
              placeholder="https://company.com/careers"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" disabled={!url || detectM.isPending}>
              <Plus className="h-4 w-4 mr-1" />{detectM.isPending ? "Checking…" : "Add"}
            </Button>
          </form>
        )}
        {needsNameFor && (
          <p className="text-xs text-muted-foreground">
            Couldn't automatically determine a name for that page — enter one to finish adding it.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Paste a company's careers page. We'll check whether it uses a supported job board (Greenhouse,
          Ashby, Lever, Workable, Workday, Recruitee, Personio, BambooHR, Breezy, Pinpoint,
          SmartRecruiters, or Teamtailor) and add it here — otherwise it's added to the{" "}
          <a href="/checklist" className="underline">Other Career Pages</a> checklist instead.
          Remote-job aggregators (Remotive, We Work Remotely, Working Nomads) are added
          automatically and listed below.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          ATS boards <span className="text-xs normal-case">({ats.length})</span>
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => restoreM.mutate()}
          disabled={restoreM.isPending}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          {restoreM.isPending ? "Restoring…" : "Restore default sources"}
        </Button>
      </div>
      <Card className="divide-y divide-border">
        {ats.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground italic">No ATS boards yet.</div>
        ) : (
          ats.map((s) => renderRow(s, false))
        )}
      </Card>

      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide pt-2">
        Remote-job boards <span className="text-xs normal-case">({aggregators.length})</span>
      </h2>
      <Card className="divide-y divide-border">
        {aggregators.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground italic">
            No aggregator boards yet — click “Restore default sources” to add them.
          </div>
        ) : (
          aggregators.map((s) => renderRow(s, true))
        )}
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

      {/* Remote */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-[color:var(--jewel-aqua)] shrink-0" />
          <Label htmlFor="remoteOnly" className="flex-1 cursor-pointer">
            <div className="text-sm font-medium">Remote only</div>
            <div className="text-xs text-muted-foreground">Require one of the terms below in the title or location</div>
          </Label>
          <Switch
            id="remoteOnly"
            checked={draft.remote_only}
            onCheckedChange={(v) => update({ remote_only: v })}
          />
        </div>
        <TagInput
          values={draft.remote_terms}
          onChange={(next) => update({ remote_terms: next })}
          tone="aqua"
          placeholder="e.g. anywhere"
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

      {/* Company excludes */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-[color:var(--jewel-ruby)]" />
          <div>
            <div className="text-sm font-medium">Excluded companies</div>
            <div className="text-xs text-muted-foreground">
              Never show jobs from these companies. Add one with Remove company on any job; remove a
              name here to see that company again.
            </div>
          </div>
        </div>
        <TagInput
          values={draft.company_exclude ?? []}
          onChange={(next) => update({ company_exclude: next })}
          tone="ruby"
          placeholder="e.g. Acme"
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

function ScheduleTab() {
  const qc = useQueryClient();
  const get = useServerFn(getSchedule);
  const save = useServerFn(saveSchedule);

  const q = useQuery({
    queryKey: ["scan-schedule"],
    queryFn: () => get(),
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [frequency, setFrequency] = useState<"hourly" | "6h" | "daily" | "weekly" | null>(null);
  const [runAtLocal, setRunAtLocal] = useState<string>("09:00");
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });

  useEffect(() => {
    if (q.data && enabled === null) {
      setEnabled(Boolean(q.data.enabled));
      setFrequency((q.data.frequency ?? "daily") as "hourly" | "6h" | "daily" | "weekly");
      if (q.data.run_at_local) setRunAtLocal(q.data.run_at_local.slice(0, 5));
      if (q.data.timezone) setTimezone(q.data.timezone);
    }
  }, [q.data, enabled]);

  const saveM = useMutation({
    mutationFn: () => save({ data: {
      enabled: enabled ?? false,
      frequency: frequency ?? "daily",
      run_at_local: runAtLocal,
      timezone,
    } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-schedule"] });
      toast.success("Schedule saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (enabled === null || frequency === null) {
    return <div className="mt-4 text-sm text-muted-foreground">Loading…</div>;
  }

  const last = q.data?.last_run_at ? new Date(q.data.last_run_at) : null;
  const next = q.data?.next_run_at ? new Date(q.data.next_run_at) : null;
  const showTimeOfDay = frequency === "daily" || frequency === "weekly";

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium">Run scans automatically</div>
            <div className="text-xs text-muted-foreground">
              We'll check your sources on a schedule and notify you in-app when new matching jobs appear.
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="freq" className="text-xs uppercase tracking-wide text-muted-foreground">Frequency</Label>
          <Select
            value={frequency}
            onValueChange={(v) => setFrequency(v as typeof frequency)}
            disabled={!enabled}
          >
            <SelectTrigger id="freq" className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Every hour</SelectItem>
              <SelectItem value="6h">Every 6 hours</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showTimeOfDay && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="run-at" className="text-xs uppercase tracking-wide text-muted-foreground">
                Time of day
              </Label>
              <Input
                id="run-at"
                type="time"
                value={runAtLocal}
                onChange={(e) => setRunAtLocal(e.target.value)}
                disabled={!enabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz" className="text-xs uppercase tracking-wide text-muted-foreground">
                Timezone
              </Label>
              <Input
                id="tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/New_York"
                disabled={!enabled}
              />
              <p className="text-[10px] text-muted-foreground">
                IANA timezone (e.g. America/New_York, Europe/London). Actual runs fire within ~15 min of this time.
              </p>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Last automatic scan: {last ? last.toLocaleString() : "never"}</div>
          {enabled && next && <div>Next scan: around {next.toLocaleString()}</div>}
        </div>

        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending} size="sm">
          <Save className="h-3.5 w-3.5 mr-1" />
          {saveM.isPending ? "Saving…" : "Save schedule"}
        </Button>
      </Card>

      <PushNotificationsCard />
    </div>
  );
}

function PushNotificationsCard() {
  const qc = useQueryClient();
  const save = useServerFn(savePushSubscription);
  const del = useServerFn(deletePushSubscription);
  const has = useServerFn(hasPushSubscription);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["push-status"],
    queryFn: () => has() as Promise<{ count: number }>,
  });

  useEffect(() => {
    const ok = typeof window !== "undefined"
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
    setSupported(ok);
    if (ok) {
      setPermission(Notification.permission);
      getCurrentSubscription().then((s) => setSubscribed(Boolean(s)));
    }
  }, []);

  useEffect(() => {
    if (status.data && status.data.count > 0) setSubscribed(true);
  }, [status.data]);

  const enable = async () => {
    setBusy(true);
    try {
      const sub = await subscribeToPush(VAPID_PUBLIC_KEY);
      if (!sub) {
        toast.error(Notification.permission === "denied"
          ? "Notifications are blocked in your browser settings."
          : "Could not enable push notifications.");
        setPermission(Notification.permission);
        return;
      }
      const json = sub.toJSON();
      await save({ data: {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        user_agent: navigator.userAgent.slice(0, 500),
      } });
      setSubscribed(true);
      setPermission(Notification.permission);
      toast.success("Push notifications enabled");
      qc.invalidateQueries({ queryKey: ["push-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = await unsubscribeFromPush();
      if (sub) await del({ data: { endpoint: sub.endpoint } });
      setSubscribed(false);
      toast.success("Push notifications disabled");
      qc.invalidateQueries({ queryKey: ["push-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">Push notifications</div>
          <div className="text-xs text-muted-foreground">
            Get an alert on your device — and a badge on the app icon — when new jobs are found,
            even when the app is closed.
          </div>
        </div>
        <Switch
          checked={subscribed}
          disabled={busy || supported === false}
          onCheckedChange={(v) => (v ? enable() : disable())}
        />
      </div>
      {supported === false && (
        <div className="text-xs text-muted-foreground">
          Your browser doesn't support push notifications.
        </div>
      )}
      {supported && permission === "denied" && (
        <div className="text-xs text-destructive">
          Notifications are blocked. Enable them in your browser site settings, then try again.
        </div>
      )}
      <div className="text-xs text-muted-foreground">
        <strong>iPhone / iPad:</strong> first add this site to your Home Screen via Safari's
        Share menu, open the installed app, then enable the toggle. Badge updates require iOS 16.4+.
      </div>
    </Card>
  );
}
