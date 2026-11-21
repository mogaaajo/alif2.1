import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, Brain, GraduationCap, LayoutDashboard, Users } from "lucide-react";
import Header from "@/components/Header";

const Explore = () => {
  const lastPage = Number(localStorage.getItem("alif_last_page") || 1);

  const tools = [
    { to: `/mushaf/${lastPage}`, icon: BookOpen, title: "Full Mushaf", text: `Read page by page (resuming p. ${lastPage}) with Tajweed and audio.` },
    { to: "/memorize", icon: Brain, title: "Memorize", text: "Practise recitation with reveal and guided listening modes." },
    { to: "/dashboard", icon: LayoutDashboard, title: "My Progress", text: "See your sessions, streak, XP, and memorization map." },
    { to: "/group", icon: Users, title: "Recite together", text: "Create or join a recitation circle." },
    { to: "/teacher", icon: GraduationCap, title: "Teacher portal", text: "Create classes and follow student practice." },
  ];

  return (
    <div className="min-h-screen pb-16">
      <Header title="Learning & Tools" subtitle="Everything beyond the Qur'an browser" />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="font-heading text-3xl font-semibold text-foreground">Choose how you want to practise</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your Qur’an browser stays simple; these tools are here whenever you need them.</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {tools.map(({ to, icon: Icon, title, text }) => <Link key={to} to={to} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/35">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Icon className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-foreground">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{text}</span></span>
          </Link>)}
        </div>
      </main>
    </div>
  );
};

export default Explore;
