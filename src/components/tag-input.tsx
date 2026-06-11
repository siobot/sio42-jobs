import { useState, type KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  tone?: "default" | "emerald" | "ruby" | "sapphire" | "amethyst" | "topaz" | "aqua";
};

const toneClasses: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-secondary text-secondary-foreground border-border",
  emerald: "bg-[color:var(--jewel-emerald)]/15 text-[color:var(--jewel-emerald)] border-[color:var(--jewel-emerald)]/30",
  ruby: "bg-[color:var(--jewel-ruby)]/15 text-[color:var(--jewel-ruby)] border-[color:var(--jewel-ruby)]/30",
  sapphire: "bg-[color:var(--jewel-sapphire)]/15 text-[color:var(--jewel-sapphire)] border-[color:var(--jewel-sapphire)]/30",
  amethyst: "bg-[color:var(--jewel-amethyst)]/15 text-[color:var(--jewel-amethyst)] border-[color:var(--jewel-amethyst)]/30",
  topaz: "bg-[color:var(--jewel-topaz)]/15 text-[color:var(--jewel-topaz)] border-[color:var(--jewel-topaz)]/30",
  aqua: "bg-[color:var(--jewel-aqua)]/15 text-[color:var(--jewel-aqua)] border-[color:var(--jewel-aqua)]/30",
};

export function TagInput({ values, onChange, placeholder, className, tone = "default" }: Props) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge
            key={v}
            variant="outline"
            className={cn("gap-1 pl-2 pr-1 py-0.5 font-normal", toneClasses[tone])}
          >
            <span className="text-xs">{v}</span>
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded-sm hover:bg-foreground/10 p-0.5"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No terms yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft && commit(draft)}
          placeholder={placeholder ?? "Type a term and press Enter"}
          className="h-9 text-sm"
        />
        <button
          type="button"
          onClick={() => commit(draft)}
          disabled={!draft.trim()}
          className="inline-flex items-center justify-center rounded-md border border-border bg-secondary px-2 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40"
          aria-label="Add term"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
