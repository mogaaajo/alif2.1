import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, Check, Flame, Users, Loader2, BookOpen, Trophy, ClipboardList, Plus, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  classDetail,
  listAssignments,
  createAssignment,
  reviewSubmission,
  getSurahs,
  getTeacherToken,
  formatApiError,
} from "@/lib/api";
import { getVerifiedScore, getVerifiedSurahScore } from "@/lib/assessment";

const scoreColor = (s) => (s >= 85 ? "#10B981" : s >= 65 ? "#FF7E1E" : s > 0 ? "#DD0008" : "");
const MEDALS = ["#F5C518", "#B8B8B8", "#CD7F32"];

const TeacherClass = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [surahs, setSurahs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [surahNumber, setSurahNumber] = useState("1");
  const [note, setNote] = useState("");
  const [assigning, setAssigning] = useState(false);

  const loadAll = () => {
    classDetail(code).then(setData).catch((e) => toast.error(formatApiError(e?.response?.data?.detail)));
    listAssignments(code).then(setAssignments).catch(() => {});
  };

  useEffect(() => {
    if (!getTeacherToken()) {
      navigate("/teacher");
      return;
    }
    loadAll();
    getSurahs().then(setSurahs).catch(() => {});
    setLoading(false);
    const id = setInterval(loadAll, 8000);
    return () => clearInterval(id);
  }, [code, navigate]);

  const leaderboard = useMemo(
    () => [...(data?.students || [])].sort((a, b) => b.weekly_xp - a.weekly_xp).filter((s) => s.weekly_xp > 0).slice(0, 5),
    [data]
  );

  const copyCode = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const assign = async () => {
    setAssigning(true);
    try {
      const sName = surahs.find((s) => String(s.number) === surahNumber)?.englishName || "";
      await createAssignment(code, { surah_number: Number(surahNumber), surah_name: sName, note });
      setNote("");
      loadAll();
      toast.success("Homework assigned");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setAssigning(false);
    }
  };

  const markReviewed = async (aid, userId) => {
    try {
      await reviewSubmission(aid, userId);
      loadAll();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border bg-background/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Link to="/teacher/dashboard" data-testid="tc-back">
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <p className="font-heading text-2xl font-semibold text-foreground">{data?.name || "Class"}</p>
          </div>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold tracking-widest text-foreground"
            data-testid="tc-code-chip"
          >
            {code} {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {data ? `${data.student_count} student${data.student_count === 1 ? "" : "s"}` : "…"}
          <span className="ml-auto text-xs">Share code <b className="text-primary">{code}</b> so students can join.</span>
        </div>

        {/* Weekly leaderboard */}
        {leaderboard.length > 0 && (
          <div className="mb-8 rounded-2xl border border-border bg-card p-6" data-testid="class-leaderboard">
            <p className="mb-4 flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
              <Trophy className="h-5 w-5 text-primary" /> This week's top reciters
            </p>
            <div className="space-y-2">
              {leaderboard.map((s, i) => (
                <div key={s.user_id} className={`flex items-center gap-3 rounded-xl border p-3 ${i === 0 ? "border-primary/50 bg-primary/5" : "border-border"}`} data-testid={`leader-row-${i}`}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold" style={i < 3 ? { background: MEDALS[i], color: "#1C1917" } : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate font-semibold text-foreground">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.weekly_count} this week</span>
                  <span className="flex items-center gap-1 text-lg font-bold text-primary">{s.weekly_xp} XP</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Homework */}
        <div className="mb-8 rounded-2xl border border-border bg-card p-6" data-testid="homework-section">
          <p className="mb-4 flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
            <ClipboardList className="h-5 w-5 text-primary" /> Homework
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={surahNumber} onValueChange={setSurahNumber}>
              <SelectTrigger className="sm:w-56" data-testid="hw-surah-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {surahs.map((s) => (
                  <SelectItem key={s.number} value={String(s.number)}>
                    {s.number}. {s.englishName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="flex-1" data-testid="hw-note" />
            <Button className="rounded-full sm:px-6" onClick={assign} disabled={assigning} data-testid="assign-hw-btn">
              {assigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Assign
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            {assignments.length === 0 && <p className="text-sm text-muted-foreground">No homework assigned yet.</p>}
            {assignments.map((a) => (
              <div key={a.id} className="rounded-xl border border-border p-4" data-testid={`assignment-${a.id}`}>
                <div className="mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-foreground">Surah {a.surah_number} · {a.surah_name}</p>
                  <span className="ml-auto text-xs text-muted-foreground">{a.submissions.length} submitted</span>
                </div>
                {a.note && <p className="mb-3 text-sm text-muted-foreground">“{a.note}”</p>}
                {a.submissions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Waiting for submissions…</p>
                ) : (
                  <div className="space-y-2">
                    {a.submissions.map((sub) => {
                      const subBest = getVerifiedScore(sub, "best_score");
                      return (
                        <div key={sub.user_id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2" data-testid={`submission-${a.id}-${sub.user_id}`}>
                          <span className="flex-1 truncate text-sm font-medium text-foreground">{sub.name}</span>
                          <span
                            className={`text-sm font-semibold ${subBest === null ? "text-muted-foreground" : ""}`}
                            style={subBest !== null ? { color: scoreColor(subBest) || "inherit" } : undefined}
                          >
                            {subBest !== null ? `${subBest}%` : "Submitted"}
                          </span>
                          {sub.reviewed ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-primary">
                              <CheckCircle2 className="h-4 w-4" /> Reviewed
                            </span>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => markReviewed(a.id, sub.user_id)} data-testid={`review-btn-${a.id}-${sub.user_id}`}>
                              Mark reviewed
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Roster */}
        <p className="mb-3 font-heading text-2xl font-semibold text-foreground">Students</p>
        {loading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : data?.students?.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center" data-testid="no-students">
            <p className="font-heading text-2xl font-semibold text-foreground">No students yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask students to open <b>My Progress → Join a class</b> and enter <b className="text-primary">{code}</b>.
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="students-list">
            {data.students.map((s) => {
              const avgScore = getVerifiedScore(s, "average_score");
              const practicedMap = s.surah_counts || {};
              const surahNums = Object.keys(practicedMap).sort((a, b) => Number(a) - Number(b));
              return (
                <Link
                  key={s.user_id}
                  to={`/teacher/class/${code}/student/${s.user_id}`}
                  className="block rounded-2xl border border-border bg-card p-5 transition-[border-color] hover:border-primary/40"
                  data-testid={`student-row-${s.user_id}`}
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">Level {s.level} · {s.total_recitations} recitations · {avgScore !== null ? `${avgScore}% avg` : "Not assessed yet"}</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground" data-testid={`student-streak-${s.user_id}`}>
                      <Flame className="h-4 w-4" /> {s.current_streak}d
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" /> Surahs practised ({s.surahs_practiced})
                    </p>
                    {surahNums.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No recitations yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5" data-testid={`student-surahs-${s.user_id}`}>
                        {surahNums.map((num) => {
                          const best = getVerifiedSurahScore(s, num);
                          const count = practicedMap[num] || 0;
                          return (
                            <span
                              key={num}
                              title={best !== null ? `Surah ${num} — best ${best}%` : `Surah ${num} — practised (${count}×)`}
                              className="flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-semibold text-white"
                              style={{ background: (best !== null ? scoreColor(best) : "") || "#FF7E1E" }}
                            >
                              {num}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherClass;
