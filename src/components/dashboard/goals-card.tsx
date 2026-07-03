import Link from "next/link";
import { Target, ChevronRight } from "lucide-react";

type Milestone = { title: string; deadline?: string | null; status?: string };

export type Goal = {
  id: string;
  title: string;
  category: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number;
  deadline: string | null;
  milestones: Milestone[];
};

export function goalPct(g: Goal): number {
  if (g.target_value && g.target_value > 0) {
    return Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100));
  }
  const ms = g.milestones ?? [];
  if (ms.length === 0) return 0;
  return Math.round((ms.filter((m) => m.status === "done").length / ms.length) * 100);
}

export function nextMilestone(g: Goal): Milestone | null {
  return (g.milestones ?? []).find((m) => m.status !== "done") ?? null;
}

const CATEGORY_LABEL: Record<string, string> = {
  income: "Income",
  career: "Career",
  skill: "Skill",
  body: "Body",
  life: "Life",
};

export function GoalsCard({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) {
    return (
      <Link
        href="/coach"
        className="glass glass-hover fade-up flex items-center justify-between px-5 py-4"
        style={{ animationDelay: "0.18s" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-warning/15 border border-warning/25 flex items-center justify-center">
            <Target className="w-4 h-4 text-warning" />
          </div>
          <div>
            <p className="font-semibold text-sm">Set your first life goal</p>
            <p className="text-xs text-muted">Income, career, skills - the coach builds the roadmap.</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted" />
      </Link>
    );
  }

  return (
    <div className="glass p-5 fade-up" style={{ animationDelay: "0.18s" }}>
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-warning" /> Goals
        </h3>
        <Link href="/plan#goals" className="text-xs text-muted flex items-center">
          Roadmap <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="space-y-3.5">
        {goals.slice(0, 3).map((g) => {
          const pct = goalPct(g);
          const next = nextMilestone(g);
          return (
            <div key={g.id}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-semibold truncate">
                  <span className="mr-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase text-muted">
                    {CATEGORY_LABEL[g.category] ?? "Goal"}
                  </span>
                  {g.title}
                </p>
                <span className="text-xs font-bold text-warning shrink-0">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {next && (
                <p className="text-xs text-muted mt-1 truncate">
                  Next: {next.title}
                  {next.deadline ? ` / by ${next.deadline}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
