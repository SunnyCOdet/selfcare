/** Instant skeleton shown while a tab's server data loads. */
export function PageSkeleton({ variant = "cards" }: { variant?: "cards" | "chat" }) {
  return (
    <div className="flex-1 animate-pulse">
      {/* nav ghost */}
      <div className="sticky top-0 h-14 md:h-16 border-b border-white/5 bg-background/70 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="w-24 h-8 rounded-lg bg-white/5" />
          <div className="w-8 h-8 rounded-full bg-white/5" />
        </div>
      </div>

      {variant === "chat" ? (
        <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
          <div className="w-2/3 h-16 rounded-2xl bg-white/5" />
          <div className="w-1/2 h-10 rounded-2xl bg-white/5 ml-auto" />
          <div className="w-3/4 h-20 rounded-2xl bg-white/5" />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
          <div className="w-56 h-8 rounded-lg bg-white/5" />
          <div className="w-full h-16 rounded-2xl bg-white/5" />
          <div className="w-full h-44 rounded-2xl bg-white/5" />
          <div className="w-full h-32 rounded-2xl bg-white/5" />
        </div>
      )}
    </div>
  );
}
