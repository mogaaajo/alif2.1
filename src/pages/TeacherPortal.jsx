import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GraduationCap, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  teacherLogin,
  teacherRegister,
  teacherMe,
  setTeacherToken,
  getTeacherToken,
  formatApiError,
} from "@/lib/api";

const TeacherPortal = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    if (getTeacherToken()) {
      teacherMe()
        .then(() => navigate("/teacher/dashboard"))
        .catch(() => {});
    }
  }, [navigate]);

  const doLogin = async () => {
    setBusy(true);
    try {
      const { token } = await teacherLogin(login);
      setTeacherToken(token);
      navigate("/teacher/dashboard");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    setBusy(true);
    try {
      const { token } = await teacherRegister(reg);
      setTeacherToken(token);
      navigate("/teacher/dashboard");
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
          <Link to="/" data-testid="teacher-home-link">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <p className="font-heading text-2xl font-semibold text-foreground">Teacher Portal</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-5 py-14 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <GraduationCap className="h-7 w-7" />
          </span>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">Teach with Tilāwah</h1>
          <p className="mt-2 text-sm text-muted-foreground">Create classes and follow every student's progress.</p>
        </motion.div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" data-testid="tab-login">Sign in</TabsTrigger>
            <TabsTrigger value="register" data-testid="tab-register">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="you@school.com" data-testid="login-email" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="••••••••" data-testid="login-password" />
            </div>
            <Button className="w-full rounded-full" onClick={doLogin} disabled={busy} data-testid="login-submit">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Sign in
            </Button>
            <div className="text-center">
              <Link to="/teacher/forgot" className="text-xs font-medium text-primary hover:underline" data-testid="forgot-link">
                Forgot password?
              </Link>
            </div>
            <p className="text-center text-xs text-muted-foreground">Demo: teacher@example.com / teacher123</p>
          </TabsContent>

          <TabsContent value="register" className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} placeholder="Ustadh Ahmad" data-testid="reg-name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} placeholder="you@school.com" data-testid="reg-email" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doRegister()} placeholder="Choose a password" data-testid="reg-password" />
            </div>
            <Button className="w-full rounded-full" onClick={doRegister} disabled={busy} data-testid="reg-submit">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Create account
            </Button>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default TeacherPortal;
