import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword, formatApiError } from "@/lib/api";

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (pw.length < 6) return toast.error("Password must be at least 6 characters.");
    setBusy(true);
    try {
      await resetPassword(token, pw);
      setDone(true);
      toast.success("Password updated — you can sign in now.");
      setTimeout(() => navigate("/teacher"), 1800);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="glass border-b border-border bg-background/70">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link to="/teacher" data-testid="rp-back">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <p className="font-heading text-2xl font-semibold text-foreground">Choose a new password</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-14 sm:px-8">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <KeyRound className="h-7 w-7" />
        </span>
        {!token ? (
          <p className="text-center text-sm text-muted-foreground" data-testid="rp-no-token">
            This link is missing its token. Please request a new reset link.
          </p>
        ) : done ? (
          <div className="text-center" data-testid="rp-done">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 font-heading text-2xl font-semibold text-foreground">Password updated</p>
            <p className="mt-1 text-sm text-muted-foreground">Redirecting you to sign in…</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="text-center font-heading text-3xl font-bold text-foreground">Set a new password</h1>
            <div className="space-y-2">
              <Label>New password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="At least 6 characters" data-testid="rp-password" />
            </div>
            <Button className="w-full rounded-full" onClick={submit} disabled={busy} data-testid="rp-submit">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Update password
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default ResetPassword;
