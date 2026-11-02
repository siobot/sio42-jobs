import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setJobNotes } from "@/lib/jobs/api.functions";

// Notes on a job marked Interested. They carry over to the application when
// the job is marked Applied.
export function JobNotes({ jobId, notes }: { jobId: string; notes: string | null }) {
  const qc = useQueryClient();
  const save = useServerFn(setJobNotes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");

  const saveM = useMutation({
    mutationFn: (text: string) => save({ data: { id: jobId, notes: text } }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-interested"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save notes"),
  });

  const start = () => { setDraft(notes ?? ""); setEditing(true); };
  const cancel = () => { setDraft(notes ?? ""); setEditing(false); };
  const submit = () => {
    if (draft.trim() === (notes ?? "")) { setEditing(false); return; }
    saveM.mutate(draft);
  };

  if (editing) {
    return (
      <div className="mt-2 space-y-1">
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          maxLength={5000}
          rows={3}
          className="text-xs"
        />
        <div className="flex gap-1">
          <Button size="sm" className="h-7" onClick={submit} disabled={saveM.isPending}>Save notes</Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={cancel} disabled={saveM.isPending}>Cancel</Button>
        </div>
      </div>
    );
  }

  if (notes) {
    return (
      <button
        type="button"
        onClick={start}
        className="mt-1.5 block w-full text-left text-xs text-foreground/80 whitespace-pre-wrap break-words hover:underline"
      >
        {notes}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <NotebookPen className="h-3.5 w-3.5" /> Add note
    </button>
  );
}
