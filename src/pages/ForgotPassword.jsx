import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Mail, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword, formatApiError } from "@/lib/api";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!email.trim()) return toast.error("Enter your email.");
    setBusy(true);
    try {
      const res = await forgotPassword(email.trim());
      setSent(true);
      if (res.dev_reset_path) setDevLink(`${window.location.origin}${res.dev_reset_path}`);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard?.writeText(devLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="min-h-screen">
      <header className="glass border-b border-border bg-background/70">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link to="/teacher" data-testid="fp-back">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <p className="font-heading text-2xl font-semibold text-foreground">Reset password</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-14 sm:px-8">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Mail className="h-7 w-7" />
        </span>
        <h1 className="text-center font-heading text-3xl font-bold text-foreground">Forgot your password?</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Enter your email and we'll send you a link to choose a new one.
        </p>

        {!sent ? (
          <div className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@school.com" data-testid="fp-email" />
            </div>
            <Button className="w-full rounded-full" onClick={submit} disabled={busy} data-testid="fp-submit">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Send reset link
            </Button>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center" data-testid="fp-sent">
            <p className="font-semibold text-foreground">Check your email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              If an account exists for {email}, a reset link is on its way.
            </p>
            {devLink && (
              <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email not set up yet — use this link:
                </p>
                <div className="flex items-center gap-2">
                  <Link to={devLink.replace(window.location.origin, "")} className="flex-1 truncate text-sm font-medium text-primary underline" data-testid="fp-dev-link">
                    {devLink}
                  </Link>
                  <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={copy} data-testid="fp-copy">
                    {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ForgotPassword;
