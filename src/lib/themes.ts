/**
 * App theme templates. A theme is a set of CSS-variable overrides on top of
 * the base design system in globals.css. The AI coach can switch presets or
 * generate entirely new themes — everything funnels through sanitizeTheme()
 * so only known variables with valid color values ever reach the DOM.
 */

export type Theme = {
  name: string;
  description: string;
  vars: Record<string, string>;
};

/** Only these variables may be themed. */
export const THEME_VAR_KEYS = [
  "--background",
  "--surface",
  "--surface-2",
  "--border",
  "--foreground",
  "--muted",
  "--accent",
  "--accent-2",
  "--move",
  "--move-light",
  "--success",
  "--warning",
  "--flame",
  "--protein",
  "--carbs",
  "--fat",
] as const;

const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/;

export const PRESET_THEMES: Record<string, Theme> = {
  ascend: {
    name: "Ascend",
    description: "The default — true black, Apple Move pink, flame orange, AI violet.",
    vars: {}, // base design system, no overrides
  },
  ceo: {
    name: "CEO",
    description: "Old-money luxury — obsidian black, champagne gold, ivory text.",
    vars: {
      "--background": "#0a0908",
      "--surface": "#12100d",
      "--surface-2": "#1a1713",
      "--border": "rgba(212, 175, 55, 0.14)",
      "--foreground": "#f2ead9",
      "--muted": "#a89e8a",
      "--accent": "#d4af37",
      "--accent-2": "#b8860b",
      "--move": "#d4af37",
      "--move-light": "#f0d97a",
      "--success": "#9caf5f",
      "--warning": "#e0a63d",
      "--flame": "#c9902a",
      "--protein": "#c96a4a",
      "--carbs": "#d4af37",
      "--fat": "#8fa3b8",
    },
  },
  midnight: {
    name: "Midnight",
    description: "Deep ocean blues with electric cyan energy.",
    vars: {
      "--background": "#030712",
      "--surface": "#0a1120",
      "--surface-2": "#111a2e",
      "--border": "rgba(56, 189, 248, 0.12)",
      "--foreground": "#e8f4fd",
      "--muted": "#8aa3bd",
      "--accent": "#38bdf8",
      "--accent-2": "#818cf8",
      "--move": "#22d3ee",
      "--move-light": "#7dd3fc",
      "--success": "#34d399",
      "--warning": "#fbbf24",
      "--flame": "#f97316",
      "--protein": "#f472b6",
      "--carbs": "#fbbf24",
      "--fat": "#60a5fa",
    },
  },
  crimson: {
    name: "Crimson",
    description: "Aggressive — pitch black and blood red. Villain-arc energy.",
    vars: {
      "--background": "#080404",
      "--surface": "#110a0a",
      "--surface-2": "#1a1010",
      "--border": "rgba(239, 68, 68, 0.14)",
      "--foreground": "#fdf2f2",
      "--muted": "#a88f8f",
      "--accent": "#ef4444",
      "--accent-2": "#f97316",
      "--move": "#ef4444",
      "--move-light": "#fca5a5",
      "--success": "#a3e635",
      "--warning": "#fbbf24",
      "--flame": "#ff3b30",
      "--protein": "#f87171",
      "--carbs": "#fb923c",
      "--fat": "#94a3b8",
    },
  },
  forest: {
    name: "Forest",
    description: "Calm discipline — deep greens, sage, and warm earth.",
    vars: {
      "--background": "#050807",
      "--surface": "#0c120f",
      "--surface-2": "#131c17",
      "--border": "rgba(74, 222, 128, 0.12)",
      "--foreground": "#eef7f1",
      "--muted": "#8fa89a",
      "--accent": "#4ade80",
      "--accent-2": "#2dd4bf",
      "--move": "#4ade80",
      "--move-light": "#86efac",
      "--success": "#a3e635",
      "--warning": "#facc15",
      "--flame": "#fb923c",
      "--protein": "#f87171",
      "--carbs": "#facc15",
      "--fat": "#7dd3fc",
    },
  },
};

/** Validate an arbitrary (possibly AI-generated) theme. Returns clean vars or null. */
export function sanitizeThemeVars(vars: unknown): Record<string, string> | null {
  if (!vars || typeof vars !== "object") return null;
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
    if (!(THEME_VAR_KEYS as readonly string[]).includes(k)) continue;
    if (typeof v !== "string" || !COLOR_RE.test(v.trim())) continue;
    clean[k] = v.trim();
  }
  return Object.keys(clean).length >= 4 ? clean : null;
}

/** Render a theme as a CSS override block. Inputs must already be sanitized. */
export function themeToCss(vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return body ? `:root{${body}}` : "";
}
