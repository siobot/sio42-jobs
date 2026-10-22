import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createDemoAccount } from "@/lib/demo.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Job Monitor" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuthSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const createDemo = useServerFn(createDemoAccount);

  // Sends an already-signed-in visitor straight to the app. Stands down once
  // the form or demo button starts signing in: they navigate themselves, and
  // this effect firing on the new session would replace the demo's
  // navigation (dropping its ?demo=1 flag).
  const signingInRef = useRef(false);
  useEffect(() => {
    if (!loading && session && !signingInRef.current) navigate({ to: "/" });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    signingInRef.current = true;
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (err) {
      signingInRef.current = false;
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function tryDemo() {
    setDemoBusy(true);
    signingInRef.current = true;
    try {
      const creds = await createDemo();
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) throw error;
      // Navigate immediately — account setup is DB-only now and fast. The
      // Jobs Feed page itself runs the live scan (and shows loading
      // skeletons while it does), so sign-in doesn't wait on a scan across
      // every seeded ATS board.
      navigate({ to: "/", search: { demo: "1" } });
    } catch (err) {
      signingInRef.current = false;
      toast.error(err instanceof Error ? err.message : "Could not start demo");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold mb-1">Job Monitor</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "signin" ? "Sign in to your tracker." : "Create your tracker account."}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || demoBusy} className="w-full">
            {busy ? "..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-sm text-muted-foreground hover:text-foreground mt-4 w-full text-center"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full h-12 text-base font-semibold text-white shadow-lg shadow-purple-500/30 bg-[oklch(0.55_0.22_300)] hover:bg-[oklch(0.5_0.22_300)] focus-visible:ring-[oklch(0.66_0.21_305)]"
          disabled={busy || demoBusy}
          onClick={tryDemo}
        >
          {demoBusy ? "Setting up demo..." : "Try the demo"}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          No signup — explore live software-engineering jobs across EMEA, plus sample applications.
        </p>
      </Card>
    </div>
  );
}
