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

  // Allow unauthenticated browsing inside the Lovable preview so the UI is
  // explorable without signing in. Published deployments still require auth.
  const isPreview =
    typeof window !== "undefined" &&
    (window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com"));

  useEffect(() => {
    if (!loading && !session && !isPreview) navigate({ to: "/auth" });
  }, [loading, session, navigate, isPreview]);

  useEffect(() => {
    if (session && !seedM.isPending && !seedM.isSuccess) {
      seedM.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (loading || (!session && !isPreview)) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  return (
    <AppShell email={user?.email ?? (!session ? "preview mode" : null)}>
      <Outlet />
    </AppShell>
  );
}
