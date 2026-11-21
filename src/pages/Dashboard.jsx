import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  Tooltip as RTooltip,
  Cell,
} from "recharts";
import { Flame, Trophy, Star, Target, BookOpen, Zap, Sparkles, Heart, Medal, CalendarCheck, Compass, Map as MapIcon, Lock, Award, GraduationCap, Loader2, ClipboardList, CheckCircle2, Play } from "lucide-react";
import Header from "@/components/Header";
import { getProgress, getSurahs, joinClass, myClasses, formatApiError, studentAssignments, submitAssignment } from "@/lib/api";
import { getVerifiedScore, getVerifiedSurahScore } from "@/lib/assessment";
import { getLearner, getUserId, getUserName, setUserName } from "@/lib/user";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Stat = ({ icon: Icon, label, value, sub, testid }) => (
  <div className="rounded-2xl border border-border bg-card p-5" data-testid={testid}>
    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
      <Icon className="h-5 w-5" />
    </span>
    <p className="text-3xl font-bold text-foreground">{value}</p>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>
);

const BADGE_ICONS = {
  sparkles: Sparkles,
  heart: Heart,
  medal: Medal,
  flame: Flame,
  "calendar-check": CalendarCheck,
  trophy: Trophy,
  compass: Compass,
  map: MapIcon,
  target: Target,
  star: Star,
};

const scoreColor = (score) => {
  if (score >= 85) return "#10B981";
  if (score >= 65) return "#FF7E1E";
  if (score > 0) return "#DD0008";
  return "";
};

const Dashboard = () => {
  const [p, setP] = useState(null);
  const [surahs, setSurahs] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const learner = getLearner();

  const loadClasses = () => myClasses(getUserId()).then(setClasses).catch(() => {});
  const loadHomework = () => studentAssignments(getUserId()).then(setAssignments).catch(() => {});

  useEffect(() => {
    getProgress(getUserId()).then(setP).catch(() => {});
    getSurahs().then(setSurahs).catch(() => {});
    loadClasses();
    loadHomework();
  }, []);

  const doJoinClass = async () => {
    if (!joinCode.trim() || !joinName.trim()) {
      toast.error("Enter both the class code and your name.");
      return;
    }
    setJoining(true);
    try {
      setUserName(joinName.trim());
      const res = await joinClass({ code: joinCode.trim().toUpperCase(), user_id: getUserId(), name: joinName.trim() });
      toast.success(`Joined ${res.class_name}!`);
      setJoinCode("");
      await loadClasses();
      await loadHomework();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setJoining(false);
    }
  };

  const submitHomework = async (aid) => {
    try {
      const res = await submitAssignment(aid, { user_id: getUserId(), name: getUserName() || "Student" });
      const verifiedBest = getVerifiedScore(res, "best_score");
      toast.success(verifiedBest !== null ? `Submitted! Best score ${verifiedBest}%` : "Homework submitted!");
      await loadHomework();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  const daily = (p?.daily_activity || []).map((d) => ({
    ...d,
    day: new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })[0],
  }));

  return (
    <div className="pb-20">
      <Header title="My Progress" subtitle="Your recitation journey" />

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        {/* Level banner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 overflow-hidden rounded-3xl border border-border bg-primary p-8 text-primary-foreground"
          data-testid="level-banner"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-widest opacity-80">Level</p>
              <p className="font-heading text-6xl font-bold leading-none">{p?.level ?? 1}</p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-2xl font-bold">
                <Zap className="h-5 w-5" /> {p?.total_xp ?? 0} XP
              </p>
              <p className="text-sm opacity-80">
                {p ? `${p.xp_in_level}/${p.xp_to_next} to level ${p.level + 1}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-primary-foreground/20">
            <div
              className="h-full rounded-full bg-primary-foreground transition-[width] duration-700"
              style={{ width: `${p ? p.xp_in_level : 0}%` }}
            />
          </div>
        </motion.div>

        {/* Stats */}
        <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={Flame} label="Current Streak" value={`${p?.current_streak ?? 0}d`} sub={`Best ${p?.best_streak ?? 0} days`} testid="stat-streak" />
          <Stat
            icon={Target}
            label="Avg Accuracy"
            value={(() => {
              const verifiedAvg = getVerifiedScore(p, "average_score");
              return verifiedAvg !== null ? `${verifiedAvg}%` : "Not assessed yet";
            })()}
            testid="stat-avg"
          />
          <Stat icon={BookOpen} label="Surahs Practiced" value={p?.surahs_practiced ?? 0} testid="stat-surahs-practiced" />
          <Stat icon={Star} label="Recitations" value={p?.total_recitations ?? 0} testid="stat-total" />
        </div>

        {/* Badges & Goals */}
        <div className="mb-10 rounded-2xl border border-border bg-card p-6" data-testid="badges-section">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-heading text-2xl font-semibold text-foreground">Badges &amp; Goals</p>
              <p className="text-sm text-muted-foreground">Unlock rewards as you keep reciting.</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
              <Award className="h-4 w-4" /> {p?.badges_earned ?? 0}/{p?.badges?.length ?? 0}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(p?.badges || []).map((b) => {
              const Icon = BADGE_ICONS[b.icon] || Award;
              return (
                <div
                  key={b.id}
                  className={`rounded-2xl border p-4 text-center transition-colors ${
                    b.earned ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                  }`}
                  data-testid={`badge-${b.id}`}
                  title={b.desc}
                >
                  <span
                    className={`mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full ${
                      b.earned ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {b.earned ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <p className={`text-sm font-semibold ${b.earned ? "text-foreground" : "text-muted-foreground"}`}>
                    {b.name}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{b.desc}</p>
                  {!b.earned && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(b.progress * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {b.value}/{b.target}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity chart */}
        <div className="mb-10 rounded-2xl border border-border bg-card p-6" data-testid="activity-chart">
          <p className="mb-1 font-heading text-2xl font-semibold text-foreground">Last 14 days</p>
          <p className="mb-5 text-sm text-muted-foreground">Recitations logged each day</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <RTooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(_, pl) => (pl && pl[0] ? pl[0].payload.date : "")}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Link to="/account" className="mb-10 block rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-accent/40" data-testid="account-card">
          <p className="font-semibold text-foreground">{learner ? `Signed in as ${learner.name}` : "Save your progress"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{learner ? learner.email : "Create a free account to keep your learning record across devices."}</p>
        </Link>

        <div className="mb-10 rounded-2xl border border-border bg-card p-6" data-testid="recent-practice">
          <p className="font-heading text-2xl font-semibold text-foreground">Recent practice</p>
          <p className="mb-4 text-sm text-muted-foreground">Your latest reading and recitation sessions.</p>
          {p?.recent?.length ? <div className="space-y-2">
            {p.recent.slice(0, 5).map((item, index) => {
              const itemScore = getVerifiedScore(item, "score");
              return (
                <div key={`${item.created_at}-${index}`} className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-sm">
                  <span className="font-medium text-foreground">{item.surah_name || `Surah ${item.surah_number}`} · {item.kind === "assisted_practice" ? "Assisted practice" : item.kind === "memorize" ? "Recitation practice" : item.kind === "recite_along" ? "Recite Along" : item.kind === "recite_practice" ? "Ayah practice" : item.kind === "group_recitation" ? "Group recitation" : "Recitation"}{item.page ? ` · Page ${item.page}` : item.ayah_keys?.length ? ` · ${item.ayah_keys[0]}–${item.ayah_keys[item.ayah_keys.length - 1]}` : ""}</span>
                  <span className="text-muted-foreground">+{item.xp || 0} XP{itemScore !== null ? ` · ${itemScore}%` : ""}</span>
                </div>
              );
            })}
          </div> : <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">Complete Memorize or Recite Along to begin your learning record.</p>}
        </div>

        {/* Memorization map */}
        <div className="rounded-2xl border border-border bg-card p-6" data-testid="memorization-map">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-heading text-2xl font-semibold text-foreground">Memorization Map</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" /> Untouched</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: "#FF7E1E" }} /> Practised</span>
              {getVerifiedScore(p, "average_score") !== null && (
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: "#10B981" }} /> Strong</span>
              )}
            </div>
          </div>
          <p className="mb-5 text-sm text-muted-foreground">Every surah you practise lights up as you build consistency.</p>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12 lg:grid-cols-[repeat(19,minmax(0,1fr))]">
            {surahs.map((s) => {
              const best = getVerifiedSurahScore(p, s.number);
              const count = p?.surah_counts?.[s.number] || p?.surah_counts?.[String(s.number)] || 0;
              const color = (best !== null ? scoreColor(best) : "") || (count ? "#FF7E1E" : "");
              return (
                <Link
                  key={s.number}
                  to={`/surah/${s.number}`}
                  title={`${s.number}. ${s.englishName}${best !== null ? ` — best ${best}%` : count ? ` — practised (${count}×)` : ""}`}
                  data-testid={`map-surah-${s.number}`}
                  className="flex aspect-square items-center justify-center rounded-md border border-border text-[10px] font-semibold transition-transform hover:scale-110"
                  style={color ? { background: color, color: "#fff", borderColor: color } : { color: "hsl(var(--muted-foreground))" }}
                >
                  {s.number}
                </Link>
              );
            })}
          </div>
        </div>
        {/* Homework */}
        {assignments.length > 0 && (
          <div className="mt-10 rounded-2xl border border-border bg-card p-6" data-testid="homework-student-section">
            <p className="flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
              <ClipboardList className="h-5 w-5 text-primary" /> Homework
            </p>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">Assignments from your teachers.</p>
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4" data-testid={`hw-item-${a.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">Surah {a.surah_number} · {a.surah_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.class_name}
                      {a.note ? ` · “${a.note}”` : ""}
                    </p>
                  </div>
                  {a.submitted ? (() => {
                    const hwBest = getVerifiedScore(a, "best_score");
                    return (
                      <span className="flex items-center gap-1 text-sm font-medium text-primary" data-testid={`hw-status-${a.id}`}>
                        <CheckCircle2 className="h-4 w-4" />
                        {a.reviewed ? "Reviewed" : hwBest !== null ? `Submitted ${hwBest}%` : "Submitted"}
                      </span>
                    );
                  })() : (
                    <div className="flex gap-2">
                      <Link to={`/surah/${a.surah_number}`}>
                        <Button variant="outline" size="sm" className="rounded-full" data-testid={`hw-practice-${a.id}`}>
                          <Play className="mr-1.5 h-3.5 w-3.5" /> Practice
                        </Button>
                      </Link>
                      <Button size="sm" className="rounded-full" onClick={() => submitHomework(a.id)} data-testid={`hw-submit-${a.id}`}>
                        Submit
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Join a class */}
        <div className="mt-10 rounded-2xl border border-border bg-card p-6" data-testid="join-class-section">
          <p className="flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
            <GraduationCap className="h-5 w-5 text-primary" /> Join a class
          </p>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Have a teacher? Enter their class code once and your progress will show on their dashboard.
          </p>

          {classes.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2" data-testid="joined-classes">
              {classes.map((c) => (
                <span key={c.code} className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
                  <GraduationCap className="h-3.5 w-3.5" /> {c.class_name} · as {c.student_name}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Class code"
              maxLength={6}
              className="sm:w-40 text-center font-bold tracking-[0.25em]"
              data-testid="join-class-code"
            />
            <Input
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Your name"
              className="flex-1"
              data-testid="join-class-name"
            />
            <Button className="rounded-full sm:px-6" onClick={doJoinClass} disabled={joining} data-testid="join-class-btn">
              {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
              Join
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
