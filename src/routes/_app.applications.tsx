import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  addManualApplication, deleteApplication, updateApplication,
  updateApplicationEvent, deleteApplicationEvent,
} from "@/lib/jobs/api.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ExternalLink, Plus, Trash2, CalendarIcon, X, Search, Pencil } from "lucide-react";
import { toast } from "sonner";

type Stage = "applied" | "screen" | "interview" | "offer" | "rejected" | "withdrawn";
const STAGES: Stage[] = ["applied", "screen", "interview", "offer", "rejected", "withdrawn"];

type RangeKey = "all" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

const searchSchema = z.object({
  stage: z.enum(["all", "applied", "screen", "interview", "offer", "rejected", "withdrawn"]).optional().default("all"),
  range: z.enum(["all", "this_week", "last_week", "this_month", "last_month", "custom"]).optional().default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_app/applications")({
  head: () => ({ meta: [{ title: "Applications — Job Monitor" }] }),
  validateSearch: searchSchema,
  component: ApplicationsPage,
});

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeekMon(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); }
function parseISODate(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function toISODate(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function fmtShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function computeRange(range: RangeKey, from?: string, to?: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (range === "all") return { start: null, end: null };
  if (range === "this_week") {
    const s = startOfWeekMon(now);
    return { start: s, end: endOfDay(addDays(s, 6)) };
  }
  if (range === "last_week") {
    const s = addDays(startOfWeekMon(now), -7);
    return { start: s, end: endOfDay(addDays(s, 6)) };
  }
  if (range === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (range === "last_month") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start: s, end: endOfMonth(s) };
  }
  const f = parseISODate(from);
  const t = parseISODate(to);
  return { start: f ? startOfDay(f) : null, end: t ? endOfDay(t) : null };
}

const PRESETS: Array<{ key: RangeKey; label: string }> = [
  { key: "all", label: "All time" },
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
];

function ApplicationsPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const update = useServerFn(updateApplication);
  const addManual = useServerFn(addManualApplication);
  const del = useServerFn(deleteApplication);

  const apps = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const { data } = await supabase.from("applications")
        .select("id, company, title, url, stage, applied_at, notes, linkedin_easy_apply")
        .order("applied_at", { ascending: false });
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["application-events"],
    queryFn: async () => {
      const { data } = await supabase.from("application_events")
        .select("id, application_id, stage, changed_at")
        .order("changed_at", { ascending: true });
      return data ?? [];
    },
  });

  const eventsByApp = useMemo(() => {
    const m = new Map<string, Array<{ id: string; stage: string; changed_at: string }>>();
    for (const e of events.data ?? []) {
      const arr = m.get(e.application_id) ?? [];
      arr.push({ id: e.id, stage: e.stage, changed_at: e.changed_at });
      m.set(e.application_id, arr);
    }
    return m;
  }, [events.data]);

  const { start, end } = useMemo(
    () => computeRange(search.range, search.from, search.to),
    [search.range, search.from, search.to],
  );

  const inRange = useMemo(() => {
    const list = apps.data ?? [];
    if (!start && !end) return list;
    return list.filter((a) => {
      if (!a.applied_at) return false;
      const t = new Date(a.applied_at).getTime();
      if (start && t < start.getTime()) return false;
      if (end && t > end.getTime()) return false;
      return true;
    });
  }, [apps.data, start, end]);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = { applied: 0, screen: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 };
    for (const a of inRange) c[a.stage as Stage] = (c[a.stage as Stage] ?? 0) + 1;
    return c;
  }, [inRange]);
  const total = inRange.length;

  const filtered = useMemo(() => {
    let list = search.stage === "all" ? inRange : inRange.filter((a) => a.stage === search.stage);
    const q = (search.q ?? "").trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        (a.company ?? "").toLowerCase().includes(q) ||
        (a.title ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [inRange, search.stage, search.q]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["application-events"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };
  const updateEvent = useServerFn(updateApplicationEvent);
  const deleteEvent = useServerFn(deleteApplicationEvent);

  const updM = useMutation({
    mutationFn: (v: {
      id: string;
      stage?: Stage;
      notes?: string | null;
      company?: string;
      title?: string;
      url?: string | null;
      applied_at?: string;
      linkedin_easy_apply?: boolean;
    }) => update({ data: v }),
    onSuccess: invalidateAll,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidateAll,
  });
  const addM = useMutation({
    mutationFn: (v: { company: string; title: string; url?: string; linkedin_easy_apply?: boolean }) => addManual({ data: v }),
    onSuccess: () => { invalidateAll(); setNc(""); setNt(""); setNu(""); setNeasy(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Add failed"),
  });
  const updEventM = useMutation({
    mutationFn: (v: { id: string; changed_at: string }) => updateEvent({ data: v }),
    onSuccess: invalidateAll,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const delEventM = useMutation({
    mutationFn: (id: string) => deleteEvent({ data: { id } }),
    onSuccess: invalidateAll,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const [nc, setNc] = useState("");
  const [nt, setNt] = useState("");
  const [nu, setNu] = useState("");
  const [neasy, setNeasy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const stats: Array<{ key: typeof search.stage; label: string; value: number }> = [
    { key: "all", label: "Total", value: total },
    { key: "applied", label: "Applied", value: counts.applied },
    { key: "screen", label: "Screen", value: counts.screen },
    { key: "interview", label: "Interview", value: counts.interview },
    { key: "offer", label: "Offer", value: counts.offer },
    { key: "rejected", label: "Rejected", value: counts.rejected },
    { key: "withdrawn", label: "Withdrawn", value: counts.withdrawn },
  ];

  const customFrom = parseISODate(search.from);
  const customTo = parseISODate(search.to);
  const rangeLabel = start && end
    ? (start.toDateString() === end.toDateString()
        ? fmtShort(start)
        : `${fmtShort(start)} – ${fmtShort(end)}`)
    : null;

  const setRange = (key: RangeKey) =>
    navigate({ search: (prev: typeof search) => ({ ...prev, range: key, from: undefined, to: undefined }) });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Applications</h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search company or role…"
          value={search.q ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            navigate({ search: (prev: typeof search) => ({ ...prev, q: v || undefined }) });
          }}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const active = search.range === p.key;
          return (
            <Button
              key={p.key}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => setRange(p.key)}
            >
              {p.label}
            </Button>
          );
        })}
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={search.range === "custom" ? "default" : "outline"}
            >
              <CalendarIcon className="h-4 w-4 mr-1" />
              {search.range === "custom" && rangeLabel ? rangeLabel : "Custom…"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={{ from: customFrom ?? undefined, to: customTo ?? undefined }}
              onSelect={(r) => {
                navigate({
                  search: (prev: typeof search) => ({
                    ...prev,
                    range: "custom",
                    from: r?.from ? toISODate(r.from) : undefined,
                    to: r?.to ? toISODate(r.to) : undefined,
                  }),
                });
                if (r?.from && r?.to) setCustomOpen(false);
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        {search.range !== "all" && (
          <>
            {search.range !== "custom" && rangeLabel && (
              <span className="text-xs text-muted-foreground ml-1">{rangeLabel}</span>
            )}
            <Button size="sm" variant="ghost" onClick={() => setRange("all")}>
              <X className="h-3 w-3 mr-1" />Clear
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stats.map((s) => {
          const active = search.stage === s.key;
          return (
            <button
              key={s.key}
              onClick={() => navigate({ search: (prev: typeof search) => ({ ...prev, stage: s.key }) })}
              className={`text-left rounded-md border p-3 transition-colors ${active ? "bg-accent border-foreground/20" : "hover:bg-accent/40"}`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-semibold mt-0.5">{s.value}</div>
            </button>
          );
        })}
      </div>

      <Card className="p-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (nc && nt) addM.mutate({ company: nc, title: nt, url: nu || undefined, linkedin_easy_apply: neasy });
          }}
        >
          <Input placeholder="Company" value={nc} onChange={(e) => setNc(e.target.value)} />
          <Input placeholder="Role" value={nt} onChange={(e) => setNt(e.target.value)} />
          <Input placeholder="URL (optional)" value={nu} onChange={(e) => setNu(e.target.value)} />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <Checkbox checked={neasy} onCheckedChange={(v) => setNeasy(v === true)} id="easy-apply" className="h-5 w-5" />
              <Label htmlFor="easy-apply" className="cursor-pointer">LinkedIn Easy Apply</Label>
            </label>
            <Button type="submit" disabled={!nc || !nt}><Plus className="h-4 w-4 mr-1" />Log application</Button>
          </div>
        </form>
      </Card>

      <div className="space-y-3">
        {filtered.map((a) => {
          const timeline = eventsByApp.get(a.id) ?? [];
          return (
            <Card key={a.id} className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg font-semibold leading-tight">
                      {a.title}
                      {a.company ? <span className="text-muted-foreground font-normal"> — {a.company}</span> : null}
                    </span>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {a.linkedin_easy_apply && (
                      <Badge variant="secondary" className="text-[10px]">Easy Apply</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Applied {a.applied_at?.slice(0, 10)}
                  </div>
                </div>
                <Select value={a.stage} onValueChange={(v) => updM.mutate({ id: a.id, stage: v as Stage })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" onClick={() => setEditingId(a.id)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => delM.mutate(a.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
              </div>

              {timeline.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {timeline.map((e, i) => (
                    <span key={e.id} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="opacity-50">→</span>}
                      <span className="font-medium text-foreground/80 capitalize">{e.stage}</span>
                      <span>· {fmtDateTime(e.changed_at)}</span>
                    </span>
                  ))}
                </div>
              )}

              <Textarea
                placeholder="Notes"
                defaultValue={a.notes ?? ""}
                onBlur={(e) => { const v = e.target.value; if (v !== (a.notes ?? "")) updM.mutate({ id: a.id, notes: v || null }); }}
                rows={2}
                className="w-full"
              />
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground text-center">
            {(apps.data?.length ?? 0) === 0
              ? "No applications yet."
              : "No applications match the current filters."}
          </Card>
        )}
      </div>

      <EditApplicationDialog
        appId={editingId}
        app={editingId ? (apps.data ?? []).find((x) => x.id === editingId) ?? null : null}
        events={editingId ? eventsByApp.get(editingId) ?? [] : []}
        onClose={() => setEditingId(null)}
        onSaveApp={(patch) => updM.mutate(patch)}
        onSaveEvent={(v) => updEventM.mutate(v)}
        onDeleteEvent={(id) => delEventM.mutate(id)}
      />
    </div>
  );
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocal(v: string): string {
  return new Date(v).toISOString();
}

type AppRow = {
  id: string; company: string; title: string; url: string | null;
  stage: string; applied_at: string | null; notes: string | null;
  linkedin_easy_apply: boolean | null;
};

function EditApplicationDialog({
  appId, app, events, onClose, onSaveApp, onSaveEvent, onDeleteEvent,
}: {
  appId: string | null;
  app: AppRow | null;
  events: Array<{ id: string; stage: string; changed_at: string }>;
  onClose: () => void;
  onSaveApp: (patch: { id: string; company?: string; title?: string; url?: string | null; applied_at?: string; linkedin_easy_apply?: boolean }) => void;
  onSaveEvent: (v: { id: string; changed_at: string }) => void;
  onDeleteEvent: (id: string) => void;
}) {
  const open = !!appId && !!app;
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [easy, setEasy] = useState(false);

  useMemo(() => {
    if (app) {
      setCompany(app.company ?? "");
      setTitle(app.title ?? "");
      setUrl(app.url ?? "");
      setAppliedAt(app.applied_at ? toDatetimeLocal(app.applied_at) : "");
      setEasy(!!app.linkedin_easy_apply);
    }
  }, [app?.id]);

  if (!app || !appId) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit application</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Role</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1">
            <Label>Applied at</Label>
            <Input type="datetime-local" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <Checkbox checked={easy} onCheckedChange={(v) => setEasy(v === true)} className="h-5 w-5" id="edit-easy" />
            <Label htmlFor="edit-easy" className="cursor-pointer">LinkedIn Easy Apply</Label>
          </label>

          <div className="pt-2">
            <div className="text-sm font-medium mb-2">Status history</div>
            {events.length === 0 && (
              <div className="text-xs text-muted-foreground">No status changes recorded.</div>
            )}
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <span className="text-xs capitalize w-20 shrink-0">{e.stage}</span>
                  <Input
                    type="datetime-local"
                    value={toDatetimeLocal(e.changed_at)}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      if (v) onSaveEvent({ id: e.id, changed_at: fromDatetimeLocal(v) });
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDeleteEvent(e.id)}
                    title="Remove status entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              onSaveApp({
                id: appId,
                company,
                title,
                url: url || null,
                applied_at: appliedAt ? fromDatetimeLocal(appliedAt) : undefined,
                linkedin_easy_apply: easy,
              });
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
