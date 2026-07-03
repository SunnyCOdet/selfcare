import Link from "next/link";
import Image from "next/image";
import { Flame, LayoutDashboard, Map, TrendingUp, LogOut, Sparkles } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { sanitizeThemeVars, themeToCss } from "@/lib/themes";

/** AI-set theme overrides — passed in by the page (already fetched with the profile). */
function UserTheme({ theme }: { theme?: { vars?: Record<string, string> } | null }) {
  const vars = sanitizeThemeVars(theme?.vars);
  if (!vars) return null;
  return <style id="user-theme">{themeToCss(vars)}</style>;
}

export function Nav({
  avatarUrl,
  name,
  active,
  theme,
}: {
  avatarUrl: string | null;
  name: string | null;
  active: "dashboard" | "coach" | "plan" | "progress";
  theme?: { vars?: Record<string, string> } | null;
}) {
  const links = [
    { href: "/dashboard", label: "Today", key: "dashboard", icon: LayoutDashboard },
    { href: "/coach", label: "Jarvis", key: "coach", icon: Sparkles },
    { href: "/plan", label: "Plan", key: "plan", icon: Map },
    { href: "/progress", label: "Progress", key: "progress", icon: TrendingUp },
  ] as const;

  return (
    <>
    <UserTheme theme={theme} />
    <nav className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-white/5 pt-[env(safe-area-inset-top)]">
      <div className="max-w-5xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Flame className="w-4.5 h-4.5 text-white" />
          </span>
          Ascend
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                active === l.key
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <l.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{l.label}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name ?? "You"}
              width={32}
              height={32}
              className="rounded-full border border-white/10"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-bold text-accent">
              {(name ?? "U").charAt(0).toUpperCase()}
            </div>
          )}
          <form action="/auth/signout" method="post">
            <button className="text-muted hover:text-foreground transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </nav>
    <BottomNav active={active} />
    </>
  );
}
