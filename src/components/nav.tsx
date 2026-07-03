import Link from "next/link";
import Image from "next/image";
import { Flame, LayoutDashboard, Map, TrendingUp, LogOut, Sparkles } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { sanitizeThemeVars, themeToCss } from "@/lib/themes";
import { Button } from "@/components/ui/button";

/** AI-set theme overrides passed in by the page after the profile fetch. */
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
    <nav className="sticky top-0 z-40 border-b border-border bg-background/78 pt-[env(safe-area-inset-top)] backdrop-blur-2xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:h-16">
        <Link href="/dashboard" className="group flex items-center gap-2 font-bold text-lg">
          <span className="flex size-8 items-center justify-center rounded-md border border-accent/25 bg-accent text-background transition-transform group-hover:rotate-3">
            <Flame className="size-4" fill="currentColor" strokeWidth={1.5} />
          </span>
          Ascend
        </Link>

        <div className="hidden items-center gap-1 rounded-full border border-border bg-white/[0.035] p-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                active === l.key
                  ? "bg-accent text-accent-foreground shadow-[0_12px_30px_-24px_rgba(200,255,61,0.9)]"
                  : "text-muted hover:bg-white/[0.045] hover:text-foreground"
              }`}
            >
              <l.icon className="size-4" />
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
              className="rounded-full border border-border"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full border border-accent/25 bg-accent/10 text-sm font-bold text-accent">
              {(name ?? "U").charAt(0).toUpperCase()}
            </div>
          )}
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="icon-sm" className="rounded-full" title="Sign out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </nav>
    <BottomNav active={active} />
    </>
  );
}
