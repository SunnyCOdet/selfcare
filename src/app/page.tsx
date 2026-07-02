import { Sparkles, Flame, Dumbbell, Camera, Brain, Footprints } from "lucide-react";
import { GoogleSignIn } from "@/components/google-signin";

const FEATURES = [
  {
    icon: Brain,
    title: "AI-built plan",
    desc: "An AI coach interviews you — goals, body, skin, schedule — and writes a plan that fits your life.",
  },
  {
    icon: Footprints,
    title: "20k steps, daily",
    desc: "The non-negotiable engine of your transformation. Tracked every single day.",
  },
  {
    icon: Dumbbell,
    title: "Training that fits you",
    desc: "Gym splits, swimming, any activity you love — matched to your real proficiency.",
  },
  {
    icon: Sparkles,
    title: "Skin & grooming",
    desc: "Morning and night skincare, grooming, posture — the full model-prep package.",
  },
  {
    icon: Flame,
    title: "Streaks that stick",
    desc: "Check in daily, keep the flame alive, watch the consistency compound.",
  },
  {
    icon: Camera,
    title: "Visual progress",
    desc: "Private progress photos and weight tracking so you can see the change.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center px-6">
      <main className="w-full max-w-5xl flex flex-col items-center pt-28 pb-24">
        <div className="fade-up flex items-center gap-2 text-sm text-muted border border-white/10 rounded-full px-4 py-1.5 mb-8">
          <Sparkles className="w-4 h-4 text-accent" />
          Your personal AI transformation coach
        </div>

        <h1
          className="fade-up text-5xl sm:text-7xl font-bold text-center tracking-tight leading-[1.05]"
          style={{ animationDelay: "0.05s" }}
        >
          Become the version
          <br />
          <span className="gradient-text">you decided to be.</span>
        </h1>

        <p
          className="fade-up text-muted text-lg text-center max-w-xl mt-6"
          style={{ animationDelay: "0.1s" }}
        >
          Face, body, skin, discipline — one plan built around <em>you</em> by AI.
          Daily routines, 20,000 steps, streaks, and a transformation roadmap to
          your dream physique.
        </p>

        <div className="fade-up mt-10" style={{ animationDelay: "0.15s" }}>
          <GoogleSignIn />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-24 w-full">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="glass glass-hover fade-up p-6"
              style={{ animationDelay: `${0.2 + i * 0.05}s` }}
            >
              <f.icon className="w-6 h-6 text-accent mb-4" />
              <h3 className="font-semibold mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="text-xs text-muted/60 pb-8">
        Built for the grind. Your data stays yours.
      </footer>
    </div>
  );
}
