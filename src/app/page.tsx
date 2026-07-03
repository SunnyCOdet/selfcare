import { Activity, Brain, Camera, CheckCircle2, Dumbbell, Flame, Footprints, Sparkles } from "lucide-react";
import { GoogleSignIn } from "@/components/google-signin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Brain,
    title: "Coach-led plan",
    desc: "An AI interview turns your schedule, goals, meals, training, skin, and discipline into one plan.",
  },
  {
    icon: Footprints,
    title: "Daily execution",
    desc: "Steps, meals, workouts, water, sleep, mood, and habits are tracked in one focused surface.",
  },
  {
    icon: Camera,
    title: "Visual progress",
    desc: "Private progress photos and signed meal scans make the change visible without spreadsheet energy.",
  },
  {
    icon: Flame,
    title: "Streak pressure",
    desc: "The app keeps the day tight: one check-in, one streak, one honest scoreboard.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4">
      <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-center py-10 md:py-14">
        <div className="absolute inset-x-0 top-5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-md bg-accent text-background">
              <Flame className="size-4" fill="currentColor" strokeWidth={1.5} />
            </span>
            Ascend
          </div>
          <Badge variant="accent" className="hidden sm:inline-flex">
            Supabase-backed AI coach
          </Badge>
        </div>

        <section className="relative grid items-center gap-10 pt-20 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="z-10 max-w-xl motion-rise">
            <Badge variant="outline" className="mb-5 bg-background/50 backdrop-blur">
              <Sparkles className="size-3" />
              Personal transformation OS
            </Badge>
            <h1 className="text-balance text-6xl font-black leading-none sm:text-7xl lg:text-8xl">
              Ascend
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
              A ruthless but calm AI coach for body, food, progress, goals, routines, and the daily
              check-in that keeps everything honest.
            </p>
            <div className="mt-8">
              <GoogleSignIn />
            </div>
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div className="metric-tile px-3 py-2">
                <p className="font-bold text-foreground">20k</p>
                <p>step engine</p>
              </div>
              <div className="metric-tile px-3 py-2">
                <p className="font-bold text-foreground">AI</p>
                <p>meal scans</p>
              </div>
              <div className="metric-tile px-3 py-2">
                <p className="font-bold text-foreground">1</p>
                <p>daily score</p>
              </div>
            </div>
          </div>

          <div className="relative min-h-[560px] motion-rise [animation-delay:120ms]">
            <ProductPreview />
          </div>
        </section>

        <section className="grid gap-3 pb-8 md:grid-cols-4">
          {FEATURES.map((feature, index) => (
            <Card key={feature.title} className="glass-hover motion-rise" style={{ animationDelay: `${220 + index * 45}ms` }}>
              <CardHeader className="pb-3">
                <feature.icon className="size-5 text-accent" />
                <CardTitle className="text-sm">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-5 text-muted-foreground">{feature.desc}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}

function ProductPreview() {
  const habits = ["Training", "Skincare", "Water", "Sleep"];

  return (
    <div className="absolute inset-0">
      <Card className="absolute left-2 top-4 w-[78%] overflow-hidden border-accent/20 bg-surface/95 sm:left-10">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <Badge variant="accent">Today</Badge>
            <span className="text-xs text-muted-foreground">87 readiness</span>
          </div>
          <CardTitle className="text-2xl">Good morning, Sunny</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[7rem_1fr] gap-5">
            <div className="relative size-28">
              <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(247,248,242,0.08)" strokeWidth="10" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--move)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray="264"
                  strokeDashoffset="66"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Footprints className="size-4 text-move" />
                <span className="text-xl font-black">75%</span>
              </div>
            </div>
            <div className="space-y-2">
              {habits.map((habit, index) => (
                <div key={habit} className="flex items-center gap-2 rounded-md bg-white/[0.045] px-3 py-2 text-sm">
                  <CheckCircle2 className={index < 3 ? "size-4 text-success" : "size-4 text-muted-foreground"} />
                  <span className={index < 3 ? "text-foreground" : "text-muted-foreground"}>{habit}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="absolute right-8 top-48 w-[52%] bg-[#f7f8f2] text-background shadow-[0_30px_100px_-60px_rgba(247,248,242,0.85)] sm:right-14">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-4xl font-black leading-none">2,583</p>
              <p className="text-xs text-black/55">calories left</p>
            </div>
            <button
              type="button"
              aria-label="Scan food"
              className="flex size-12 items-center justify-center rounded-full bg-background text-foreground"
            >
              <Camera className="size-5" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-black/[0.05] p-2">
              <b>184g</b>
              <p>protein</p>
            </div>
            <div className="rounded-md bg-black/[0.05] p-2">
              <b>300g</b>
              <p>carbs</p>
            </div>
            <div className="rounded-md bg-black/[0.05] p-2">
              <b>71g</b>
              <p>fat</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="absolute bottom-10 left-8 w-[72%] bg-surface/96 sm:left-0">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-accent text-background">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-sm font-bold">Coach</p>
              <p className="text-xs text-muted-foreground">Your plan adapts after the check-in.</p>
            </div>
          </div>
          <div className="rounded-md bg-white/[0.055] p-3 text-sm leading-6 text-muted-foreground">
            Today is a high-readiness day. Push legs, keep dinner lean, and hit the last
            5,000 steps before 8 PM.
          </div>
        </CardContent>
      </Card>

      <div className="absolute bottom-24 right-0 hidden rounded-md border border-border bg-background/80 p-3 text-xs text-muted-foreground backdrop-blur md:block">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-accent-2" />
          Weekly momentum +18%
        </div>
      </div>

      <div className="absolute right-5 top-24 hidden rounded-md border border-border bg-background/80 p-3 text-xs text-muted-foreground backdrop-blur md:block">
        <div className="flex items-center gap-2">
          <Dumbbell className="size-4 text-warning" />
          Push day scheduled
        </div>
      </div>
    </div>
  );
}
