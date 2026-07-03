import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import { buildUserContext } from "@/lib/ai/context";
import { searchNutrition } from "@/lib/ai/nutrition";

const SYSTEM = `You are a precision sports nutritionist inside a body-transformation app. The client tells you a food they ate (or want to eat). You estimate its macros for the described portion and judge it against their remaining daily targets and diet preference.

Rules:
- Estimate realistically for typical Indian/global portions; if portion unstated, assume a standard serving and say so in notes.
- verdict: "good" (fits goals/macros well), "okay" (fine in moderation or with tweaks), "avoid" (works against their goal — say why and give a swap).
- notes: one or two short sentences, specific to THEIR remaining calories/protein today. Mention remaining protein if they're behind.
- alternative: a better swap if verdict is "okay" or "avoid", else null.

Respond with JSON:
{"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "verdict": "good"|"okay"|"avoid", "notes": string, "alternative": string|null}`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI provider not configured. Add GEMINI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const description: string = (body.description ?? "").toString().trim().slice(0, 300);
  if (!description) {
    return NextResponse.json({ error: "Describe the food first" }, { status: 400 });
  }

  try {
    const [context, webNutrition] = await Promise.all([
      buildUserContext(supabase, user.id),
      searchNutrition(description),
    ]);

    const userPrompt = `CLIENT:
- Diet preference: ${context.profile?.diet_preference ?? "unknown"}
- Goal: ${context.profile?.body_goal ?? "transformation"}
- Daily targets: ${JSON.stringify(context.plan_summary?.nutrition_targets ?? {})}
- Eaten so far today: ${JSON.stringify(context.food_today.items)} (total ~${context.food_today.calories_so_far} kcal, ${context.food_today.protein_so_far}g protein)
${webNutrition ? `\nWEB-VERIFIED NUTRITION DATA (prefer these values over your own estimates when they match the item):\n${webNutrition}\n` : ""}
FOOD TO ANALYZE: "${description}"`;

    const result = await generateJSON<{
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      verdict: string;
      notes: string;
      alternative: string | null;
    }>(SYSTEM, userPrompt);

    const verdict = ["good", "okay", "avoid"].includes(result.verdict) ? result.verdict : "okay";

    const { data: saved, error: insertErr } = await supabase
      .from("food_logs")
      .insert({
        user_id: user.id,
        description,
        calories: Math.round(result.calories) || null,
        protein_g: Math.round(result.protein_g) || null,
        carbs_g: Math.round(result.carbs_g) || null,
        fat_g: Math.round(result.fat_g) || null,
        verdict,
        ai_notes: [result.notes, result.alternative ? `Better: ${result.alternative}` : null]
          .filter(Boolean)
          .join(" "),
      })
      .select()
      .single();
    if (insertErr) throw new Error(insertErr.message);

    return NextResponse.json({
      log: saved,
      totals: {
        calories: context.food_today.calories_so_far + (Math.round(result.calories) || 0),
        protein_g: context.food_today.protein_so_far + (Math.round(result.protein_g) || 0),
      },
    });
  } catch (e) {
    console.error("food error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Food analysis failed" },
      { status: 500 }
    );
  }
}
