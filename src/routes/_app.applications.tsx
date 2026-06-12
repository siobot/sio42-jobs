import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { addManualApplication, deleteApplication, updateApplication } from "@/lib/jobs/api.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ExternalLink, Plus, Trash2, CalendarIcon, X } from "lucide-react";
import { toast } from "sonner";

type Stage = "applied" | "screen" | "interview" | "offer" | "rejected" | "withdrawn";
const STAGES: Stage[] = ["applied", "screen", "interview", "offer", "rejected", "withdrawn"];

type RangeKey = "all" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

const searchSchema = z.object({
  stage: z.enum(["all", "applied", "screen", "interview", "offer", "rejected", "withdrawn"]).optional().default("all"),
  range: z.enum(["all", "this_week", "last_week", "this_month", "last_month", "custom"]).optional().default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_app/applications")({
  head: () => ({ meta: [{ title: "Applications — Job Monitor" }] }),
  validateSearch: searchSchema,
  component: ApplicationsPage,
});

// Local-date helpers (calendar periods in user TZ)
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeekMon(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
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
  // custom
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
        .select("id, company, title, url, stage, applied_at, next_action, next_action_at, notes")
        .order("applied_at", { ascending: false });
      return data ?? [];
    },
  });

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
    return search.stage === "all" ? inRange : inRange.filter((a) => a.stage === search.stage);
  }, [inRange, search.stage]);

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
  const [customOpen, setCustomOpen] = useState(false);

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
    ? (start.getTime() === end.getTime() - (24*60*60*1000 - 1) || start.toDateString() === end.toDateString()
        ? fmtShort(start)
        : `${fmtShort(start)} – ${fmtShort(end)}`)
    : null;

  const setRange = (key: RangeKey) =>
    navigate({ search: (prev) => ({ ...prev, range: key, from: undefined, to: undefined }) });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Applications</h1>

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
                  search: (prev) => ({
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
              onClick={() => navigate({ search: (prev) => ({ ...prev, stage: s.key }) })}
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
        {filtered.map((a) => (
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
        {filtered.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground text-center">
            {(apps.data?.length ?? 0) === 0
              ? "No applications yet."
              : rangeLabel
                ? `No applications in ${rangeLabel}${search.stage !== "all" ? ` for stage "${search.stage}"` : ""}.`
                : "No applications in this stage."}
          </Card>
        )}
      </div>
    </div>
  );
}
