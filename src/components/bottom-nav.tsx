import Link from "next/link";
import { LayoutDashboard, Sparkles, Map, TrendingUp } from "lucide-react";

const TABS = [
  { href: "/dashboard", label: "Today", key: "dashboard", icon: LayoutDashboard },
  { href: "/coach", label: "Jarvis", key: "coach", icon: Sparkles },
  { href: "/plan", label: "Plan", key: "plan", icon: Map },
  { href: "/progress", label: "Progress", key: "progress", icon: TrendingUp },
] as const;

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/[0.06] bg-background/85 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 h-[4.25rem]">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`relative flex flex-col items-center justify-center gap-1 transition-transform active:scale-90 ${
                isActive ? "text-accent" : "text-muted/70"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 h-0.5 w-10 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
              )}
              <t.icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.4 : 1.9} />
              <span className={`text-[10px] tracking-wide ${isActive ? "font-semibold" : "font-medium"}`}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
