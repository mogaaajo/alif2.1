import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GraduationCap, Plus, Users, ChevronRight, LogOut, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listClasses,
  createClass,
  teacherMe,
  getTeacherToken,
  clearTeacherToken,
  formatApiError,
} from "@/lib/api";

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [classes, setClasses] = useState([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => listClasses().then(setClasses).catch(() => {});

  useEffect(() => {
    if (!getTeacherToken()) {
      navigate("/teacher");
      return;
    }
    teacherMe()
      .then((t) => {
        setTeacher(t);
        return load();
      })
      .catch(() => {
        clearTeacherToken();
        navigate("/teacher");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const addClass = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createClass(newName.trim());
      setNewName("");
      await load();
      toast.success("Class created");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearTeacherToken();
    navigate("/teacher");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border bg-background/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Link to="/" data-testid="td-home-link">
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Home">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <p className="font-heading text-xl font-semibold text-foreground">{teacher?.name}</p>
                <p className="text-xs text-muted-foreground">{teacher?.email}</p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={logout} data-testid="td-logout">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">Your classes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a class, share its code with students, and watch their progress here.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClass()}
            placeholder="New class name (e.g. Sunday Hifz)"
            data-testid="new-class-input"
          />
          <Button className="rounded-full sm:px-6" onClick={addClass} disabled={busy} data-testid="create-class-btn">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create class
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {classes.length === 0 && (
            <p className="text-sm text-muted-foreground">No classes yet — create your first one above.</p>
          )}
          {classes.map((c, i) => (
            <motion.div key={c.code} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link
                to={`/teacher/class/${c.code}`}
                data-testid={`class-card-${c.code}`}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/40"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Code <span className="font-bold tracking-widest text-primary">{c.code}</span> · {c.student_count} students
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default TeacherDashboard;
