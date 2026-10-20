import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { excludeCompany, setJobStatus } from "@/lib/jobs/api.functions";
import { toast } from "sonner";

type Status = "new" | "interested" | "applied" | "dismissed" | "archived";

interface JobActionsProps {
  jobId: string;
  status: Status;
  company?: string;
}

const refreshJobLists = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["jobs"] });
  qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["dashboard-recent"] });
  qc.invalidateQueries({ queryKey: ["dashboard-interested"] });
};

export function JobActions({ jobId, status, company }: JobActionsProps) {
  const qc = useQueryClient();
  const setStatus = useServerFn(setJobStatus);
  const exclude = useServerFn(excludeCompany);

  const mut = useMutation({
    mutationFn: (next: Status) => setStatus({ data: { id: jobId, status: next } }),
    onSuccess: (_d, next) => {
      refreshJobLists(qc);
      if (next === "applied") toast.success("Added to application tracker");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const excludeM = useMutation({
    mutationFn: (name: string) => exclude({ data: { company: name } }),
    onSuccess: (r, name) => {
      refreshJobLists(qc);
      qc.invalidateQueries({ queryKey: ["keyword-config"] });
      qc.invalidateQueries({ queryKey: ["sources"] });
      toast.success(
        `${name} removed from your search` +
          (r.hiddenJobs ? ` — ${r.hiddenJobs} job${r.hiddenJobs === 1 ? "" : "s"} marked Not Interested` : ""),
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove company"),
  });

  // Clicking the active status reverts to "new"
  const handle = (next: Status) => mut.mutate(status === next ? "new" : next);
  const busy = mut.isPending || excludeM.isPending;

  const btn = (key: Status, label: string) => (
    <Button
      size="sm"
      variant={status === key ? "default" : "outline"}
      onClick={() => handle(key)}
      disabled={busy}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {btn("interested", "Interested")}
      {btn("applied", "Applied")}
      {btn("dismissed", "Not Interested")}
      {company && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy} className="text-muted-foreground">
              Remove company
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {company} from your search?</AlertDialogTitle>
              <AlertDialogDescription>
                Future scans will skip {company}, and its new jobs will be marked Not Interested.
                Jobs you marked Interested or Applied are kept. You can undo this under
                Settings → Keyword filters → Excluded companies.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => excludeM.mutate(company)}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
