import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip as RTooltip } from "recharts";
import { ArrowLeft, Flame, Trophy, Target, BookOpen, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { studentProfile, getTeacherToken, getSurahs } from "@/lib/api";
import { getVerifiedScore, getVerifiedSurahScore } from "@/lib/assessment";

const scoreColor = (s) => (s >= 85 ? "#10B981" : s >= 65 ? "#FF7E1E" : s > 0 ? "#DD0008" : "");

const Mini = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
      <Icon className="h-4 w-4" />
    </span>
    <p className="text-2xl font-bold text-foreground">{value}</p>
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
  </div>
);

const TeacherStudent = () => {
  const { code, userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [surahs, setSurahs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getTeacherToken()) {
      navigate("/teacher");
      return;
    }
    studentProfile(code, userId)
      .then(setData)
      .catch(() => navigate(`/teacher/class/${code}`))
      .finally(() => setLoading(false));
    getSurahs().then(setSurahs).catch(() => {});
  }, [code, userId, navigate]);

  const p = data?.progress;
  const daily = (p?.daily_activity || []).map((d) => ({
    ...d,
    day: new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })[0],
  }));

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border bg-background/70">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link to={`/teacher/class/${code}`} data-testid="ts-back">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="leading-tight">
            <p className="font-heading text-2xl font-semibold text-foreground">{data?.name || "Student"}</p>
            <p className="text-xs text-muted-foreground">{data?.class_name}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div data-testid="student-profile">
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini icon={Flame} label="Streak" value={`${p.current_streak}d`} />
              <Mini icon={Trophy} label="Best Streak" value={`${p.best_streak}d`} />
              <Mini
                icon={Target}
                label="Avg Accuracy"
                value={(() => {
                  const avgScore = getVerifiedScore(p, "average_score");
                  return avgScore !== null ? `${avgScore}%` : "Not assessed yet";
                })()}
              />
              <Mini icon={Zap} label="XP · Lvl" value={`${p.total_xp}·${p.level}`} />
            </div>

            <div className="mb-8 rounded-2xl border border-border bg-card p-6">
              <p className="mb-1 font-heading text-2xl font-semibold text-foreground">Activity timeline</p>
              <p className="mb-5 text-sm text-muted-foreground">Recitations over the last 14 days</p>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily}>
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <RTooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                      labelFormatter={(_, pl) => (pl && pl[0] ? pl[0].payload.date : "")}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="mb-1 font-heading text-2xl font-semibold text-foreground">Memorization Map</p>
              <p className="mb-5 text-sm text-muted-foreground">Surahs practised by this student.</p>
              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12 lg:grid-cols-[repeat(19,minmax(0,1fr))]">
                {surahs.map((s) => {
                  const best = getVerifiedSurahScore(p, s.number);
                  const count = p?.surah_counts?.[s.number] || p?.surah_counts?.[String(s.number)] || 0;
                  const color = (best !== null ? scoreColor(best) : "") || (count ? "#FF7E1E" : "");
                  return (
                    <span
                      key={s.number}
                      title={`${s.number}. ${s.englishName}${best !== null ? ` — best ${best}%` : count ? ` — practised (${count}×)` : ""}`}
                      className="flex aspect-square items-center justify-center rounded-md border border-border text-[10px] font-semibold"
                      style={color ? { background: color, color: "#fff", borderColor: color } : { color: "hsl(var(--muted-foreground))" }}
                    >
                      {s.number}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherStudent;
