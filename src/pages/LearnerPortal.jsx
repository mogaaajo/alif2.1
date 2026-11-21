import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clearLearnerToken, formatApiError, getLearnerToken, learnerLogin, learnerMe, learnerRegister, setLearnerToken } from "@/lib/api";
import { clearLearner, getLearner, getUserId, setLearner } from "@/lib/user";

const LearnerPortal = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [learner, setLearnerState] = useState(getLearner());
  const [login, setLogin] = useState({ email: "", password: "" });
  const [register, setRegister] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    if (!getLearnerToken()) return;
    learnerMe().then((saved) => { setLearner(saved); setLearnerState(saved); }).catch(() => {});
  }, []);

  const complete = ({ token, learner: saved }) => {
    setLearnerToken(token);
    setLearner(saved);
    setLearnerState(saved);
    toast.success(`Welcome, ${saved.name}. Your progress is now saved.`);
    navigate("/dashboard");
  };

  const signIn = async () => {
    setBusy(true);
    try { complete(await learnerLogin({ ...login, previous_user_id: getUserId() })); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const signUp = async () => {
    setBusy(true);
    try { complete(await learnerRegister({ ...register, previous_user_id: getUserId() })); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const signOut = () => {
    clearLearnerToken(); clearLearner(); setLearnerState(null);
    toast.success("Signed out. Your saved account stays available when you sign in again.");
  };

  return <div className="min-h-screen">
    <header className="glass border-b border-border bg-background/70">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
        <Link to="/dashboard"><Button variant="ghost" size="icon" className="rounded-full" aria-label="Back to progress"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <p className="font-heading text-2xl font-semibold text-foreground">My account</p>
      </div>
    </header>
    <main className="mx-auto flex max-w-md flex-col px-5 py-14 sm:px-8">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><BookOpen className="h-7 w-7" /></span>
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">Keep your journey</h1>
        <p className="mt-2 text-sm text-muted-foreground">Save your progress and return to it from any device.</p>
      </div>
      {learner ? <div className="rounded-2xl border border-border bg-card p-6 text-center" data-testid="learner-account">
        <p className="font-heading text-2xl font-semibold">{learner.name}</p><p className="mt-1 text-sm text-muted-foreground">{learner.email}</p>
        <Button variant="outline" className="mt-6 rounded-full" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
      </div> : <Tabs defaultValue="login" className="w-full">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="login">Sign in</TabsTrigger><TabsTrigger value="register">Create account</TabsTrigger></TabsList>
        <TabsContent value="login" className="mt-6 space-y-4">
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="you@example.com" /></div>
          <div className="space-y-2"><Label>Password</Label><Input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && signIn()} /></div>
          <Button className="w-full rounded-full" onClick={signIn} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in</Button>
        </TabsContent>
        <TabsContent value="register" className="mt-6 space-y-4">
          <div className="space-y-2"><Label>Your name</Label><Input value={register.name} onChange={(e) => setRegister({ ...register, name: e.target.value })} placeholder="Your name" /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={register.email} onChange={(e) => setRegister({ ...register, email: e.target.value })} placeholder="you@example.com" /></div>
          <div className="space-y-2"><Label>Password</Label><Input type="password" value={register.password} onChange={(e) => setRegister({ ...register, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && signUp()} placeholder="At least 6 characters" /></div>
          <Button className="w-full rounded-full" onClick={signUp} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create account</Button>
        </TabsContent>
      </Tabs>}
    </main>
  </div>;
};

export default LearnerPortal;
