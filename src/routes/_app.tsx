import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { AppShell } from "@/components/app-shell";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { seedDefaults } from "@/lib/jobs/api.functions";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { session, loading, user } = useAuthSession();
  const navigate = useNavigate();
  const seed = useServerFn(seedDefaults);
  const seedM = useMutation({ mutationFn: () => seed({ data: undefined as never }) });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session && !seedM.isPending && !seedM.isSuccess) {
      seedM.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  return (
    <AppShell email={user?.email}>
      <Outlet />
    </AppShell>
  );
}
