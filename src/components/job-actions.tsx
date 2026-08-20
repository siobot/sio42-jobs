import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { setJobStatus } from "@/lib/jobs/api.functions";
import { toast } from "sonner";

type Status = "new" | "interested" | "applied" | "dismissed" | "archived";

interface JobActionsProps {
  jobId: string;
  status: Status;
}

export function JobActions({ jobId, status }: JobActionsProps) {
  const qc = useQueryClient();
  const setStatus = useServerFn(setJobStatus);

  const mut = useMutation({
    mutationFn: (next: Status) => setStatus({ data: { id: jobId, status: next } }),
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard-recent"] });
      qc.invalidateQueries({ queryKey: ["dashboard-interested"] });
      if (next === "applied") toast.success("Added to application tracker");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  // Clicking the active status reverts to "new"
  const handle = (next: Status) => mut.mutate(status === next ? "new" : next);

  const btn = (key: Status, label: string) => (
    <Button
      size="sm"
      variant={status === key ? "default" : "outline"}
      onClick={() => handle(key)}
      disabled={mut.isPending}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {btn("interested", "Interested")}
      {btn("applied", "Applied")}
      {btn("dismissed", "Not Interested")}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handle("archived")}
        disabled={mut.isPending}
        className="text-muted-foreground"
      >
        {status === "archived" ? "Unarchive" : "Archive"}
      </Button>
    </div>
  );
}
