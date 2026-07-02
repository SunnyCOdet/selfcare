import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import type { TransformationPlan } from "@/lib/types";
import {
  Dumbbell,
  UtensilsCrossed,
  Sparkles,
  Moon,
  Scissors,
  Waves,
  Target,
  Camera,
  CalendarDays,
} from "lucide-react";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { data: planRow }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase
      .from("transformation_plans")
      .select("plan, version, created_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!planRow) redirect("/onboarding");
  const plan = planRow.plan as TransformationPlan;

  return (
    <div className="flex-1">
      <Nav avatarUrl={profile?.avatar_url ?? null} name={profile?.full_name ?? null} active="plan" />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <header className="fade-up">
          <p className="text-sm text-accent font-medium uppercase tracking-wide">
            Plan v{planRow.version} · {plan.timeline_weeks} week transformation
          </p>
          <h1 className="text-3xl font-bold mt-1">Your roadmap</h1>
          <p className="text-muted mt-3 max-w-3xl leading-relaxed">{plan.summary}</p>
        </header>

        <Section icon={Target} title="The honest analysis" delay={0.05}>
          <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{plan.goal_analysis}</p>
        </Section>

        <Section icon={Dumbbell} title={`Training — ${plan.workout_plan.split_name} (${plan.workout_plan.gym_days_per_week}x/week)`} delay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plan.workout_plan.days.map((d) => (
              <div key={d.day} className="bg-surface-2 rounded-xl p-4">
                <p className="font-semibold text-sm">
                  {d.day} <span className="text-accent font-normal">· {d.focus}</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {d.exercises.map((e, i) => (
                    <li key={i} className="text-sm text-muted flex justify-between gap-2">
                      <span>{e.name}</span>
                      <span className="text-foreground/80 font-mono text-xs shrink-0">
                        {e.sets}×{e.reps}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted mt-4">{plan.workout_plan.cardio_guidance}</p>
        </Section>

        <Section
          icon={UtensilsCrossed}
          title={`Nutrition — ${plan.nutrition.daily_calories} kcal · ${plan.nutrition.protein_g}g protein`}
          delay={0.15}
        >
          <div className="flex flex-wrap gap-3 mb-4">
            <Macro label="Protein" value={`${plan.nutrition.protein_g}g`} />
            <Macro label="Carbs" value={`${plan.nutrition.carbs_g}g`} />
            <Macro label="Fat" value={`${plan.nutrition.fat_g}g`} />
            <Macro label="Water" value={`${plan.nutrition.water_liters}L`} />
          </div>
          <div className="space-y-3">
            {plan.nutrition.meals.map((m, i) => (
              <div key={i} className="bg-surface-2 rounded-xl p-4">
                <p className="font-semibold text-sm">
                  <span className="text-accent font-mono text-xs mr-2">{m.time}</span>
                  {m.name}
                </p>
                <p className="text-sm text-muted mt-1">{m.items.join(" · ")}</p>
                {m.notes && <p className="text-xs text-muted/70 mt-1">{m.notes}</p>}
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1">
            {plan.nutrition.guidelines.map((g, i) => (
              <li key={i} className="text-sm text-muted flex gap-2">
                <span className="text-accent">•</span> {g}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Sparkles} title="Skincare protocol" delay={0.2}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface-2 rounded-xl p-4">
              <p className="font-semibold text-sm mb-2">☀️ Morning</p>
              <ol className="space-y-1.5">
                {plan.skincare.morning.map((s, i) => (
                  <li key={i} className="text-sm text-muted">
                    <span className="text-foreground/80">{i + 1}. {s.step}</span> — {s.product_type}
                  </li>
                ))}
              </ol>
            </div>
            <div className="bg-surface-2 rounded-xl p-4">
              <p className="font-semibold text-sm mb-2">🌙 Night</p>
              <ol className="space-y-1.5">
                {plan.skincare.evening.map((s, i) => (
                  <li key={i} className="text-sm text-muted">
                    <span className="text-foreground/80">{i + 1}. {s.step}</span> — {s.product_type}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          {plan.skincare.weekly.length > 0 && (
            <p className="text-sm text-muted mt-3">
              <span className="text-foreground/80 font-medium">Weekly:</span> {plan.skincare.weekly.join(" · ")}
            </p>
          )}
          <ul className="mt-3 space-y-1">
            {plan.skincare.guidance.map((g, i) => (
              <li key={i} className="text-sm text-muted flex gap-2">
                <span className="text-accent">•</span> {g}
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Section icon={Waves} title="Your activities" delay={0.25}>
            <div className="space-y-3">
              {plan.activities.map((a, i) => (
                <div key={i} className="bg-surface-2 rounded-xl p-4">
                  <p className="font-semibold text-sm">
                    {a.name} <span className="text-accent font-normal">· {a.frequency}</span>
                  </p>
                  <p className="text-sm text-muted mt-1">{a.progression}</p>
                </div>
              ))}
            </div>
          </Section>

          <div className="space-y-6">
            <Section icon={Moon} title={`Sleep — ${plan.sleep.target_hours}h target`} delay={0.3}>
              <ul className="space-y-1">
                {plan.sleep.wind_down.map((w, i) => (
                  <li key={i} className="text-sm text-muted flex gap-2">
                    <span className="text-accent">•</span> {w}
                  </li>
                ))}
              </ul>
            </Section>

            <Section icon={Scissors} title="Grooming" delay={0.35}>
              <ul className="space-y-1">
                {plan.grooming.map((g, i) => (
                  <li key={i} className="text-sm text-muted flex gap-2">
                    <span className="text-accent">•</span> {g}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>

        <Section icon={Camera} title="Model prep" delay={0.4}>
          <ul className="space-y-1">
            {plan.model_prep.map((m, i) => (
              <li key={i} className="text-sm text-muted flex gap-2">
                <span className="text-accent">•</span> {m}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={CalendarDays} title="Full weekly schedule" delay={0.45}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plan.weekly_schedule.map((d) => (
              <div key={d.day} className="bg-surface-2 rounded-xl p-4">
                <p className="font-semibold text-sm mb-2">{d.day}</p>
                <div className="space-y-1.5">
                  {d.blocks.map((b, i) => (
                    <div key={i} className="text-xs flex gap-2">
                      <span className="text-accent font-mono shrink-0 w-11">{b.time}</span>
                      <span className="text-muted">{b.activity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="glass p-6 fade-up border-accent/20" style={{ animationDelay: "0.5s" }}>
          <h3 className="font-semibold mb-3">Weekly milestones</h3>
          <ol className="space-y-2">
            {plan.weekly_milestones.map((m, i) => (
              <li key={i} className="text-sm text-muted flex gap-3">
                <span className="text-accent font-bold shrink-0">W{i + 1}</span> {m}
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <section className="glass p-6 fade-up" style={{ animationDelay: `${delay}s` }}>
      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-accent" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl px-4 py-2 text-center">
      <p className="font-bold text-sm">{value}</p>
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
    </div>
  );
}
