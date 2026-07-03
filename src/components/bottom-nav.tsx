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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/88 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
      <div className="grid h-[4.35rem] grid-cols-4">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`relative flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                isActive ? "text-accent" : "text-muted/70 hover:text-foreground"
              }`}
            >
              {isActive && (
                <span className="absolute top-2 h-1 w-1 rounded-full bg-accent shadow-[0_0_18px_rgba(200,255,61,0.8)]" />
              )}
              <span
                className={`flex size-9 items-center justify-center rounded-full transition-colors ${
                  isActive ? "bg-accent/10" : "bg-transparent"
                }`}
              >
                <t.icon className="size-[21px]" strokeWidth={isActive ? 2.4 : 1.9} />
              </span>
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
