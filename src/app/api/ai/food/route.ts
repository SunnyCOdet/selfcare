import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import { buildUserContext } from "@/lib/ai/context";
import { lookupNutrition, searchNutrition } from "@/lib/ai/nutrition";

const SYSTEM = `You are a precision sports nutritionist inside a body-transformation app. The client tells you a food they ate (or want to eat). You estimate its macros for the described portion and judge it against their remaining daily targets and diet preference.

Rules:
- When a VERIFIED NUTRITION DATABASE block is provided, those numbers are per 100 g from real databases (USDA / Open Food Facts). Pick the closest matching item, scale it to the stated portion (grams / 100 × the value), and PREFER these over your own recall. Do the arithmetic carefully and make sure calories ≈ protein×4 + carbs×4 + fat×9.
- The client has already given the exact portion of every item (in the description and/or the PORTIONS block). Use those exact amounts. Do NOT invent or assume portions.
- verdict: "good" (fits goals/macros well), "okay" (fine in moderation or with tweaks), "avoid" (works against their goal — say why and give a swap).
- notes: one or two short sentences, specific to THEIR remaining calories/protein today. Mention remaining protein if they're behind.
- alternative: a better swap if verdict is "okay" or "avoid", else null.

Respond with JSON:
{"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "verdict": "good"|"okay"|"avoid", "notes": string, "alternative": string|null}`;

// First pass: make sure every item has a real portion before we estimate anything.
const CHECK_SYSTEM = `You are a nutrition intake checker. The client typed what they ate. Split it into distinct food ITEMS. For each item decide whether a SPECIFIC portion/quantity is stated — a count ("2 eggs"), a weight ("200 g"), a volume ("1 cup", "1 glass"), or a clear standard unit ("2 rotis", "1 bowl"). Vague amounts ("some", "a bit", "a plate of", "a little", "handful") are NOT specific enough.

Return JSON: {"items": [{"name": string, "portion_given": boolean, "question": string}]}
- For EVERY item with portion_given=false, "question" must ask exactly how much of THAT specific item, naming it, e.g. "How much rice — how many cups or grams?" or "How many rotis?".
- If portion_given=true, set "question" to "".
- Never skip an item. Every distinct food must appear.`;

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
  const answers: { question: string; answer: string }[] = Array.isArray(body.answers)
    ? body.answers.slice(0, 20)
    : [];
  // Use Gemini for all food reasoning when available — better numeric accuracy.
  const modelOpt = { provider: process.env.GEMINI_API_KEY ? ("gemini" as const) : undefined };

  try {
    // First pass (no answers yet): refuse to guess — ask for any missing portion.
    if (answers.length === 0) {
      const check = await generateJSON<{
        items: { name: string; portion_given: boolean; question: string }[];
      }>(CHECK_SYSTEM, `FOOD THE CLIENT TYPED: "${description}"`, modelOpt);
      const items = Array.isArray(check.items) ? check.items : [];
      const missing = items.filter((i) => !i.portion_given);
      if (missing.length > 0) {
        return NextResponse.json({
          needs_portions: true,
          dish_name: description.slice(0, 80),
          components: items.map((i) => i.name),
          questions: missing.map(
            (i) => (i.question || "").trim() || `How much ${i.name}? (count, grams, or cups)`
          ),
        });
      }
    }

    const [context, dbNutrition, webNutrition] = await Promise.all([
      buildUserContext(supabase, user.id),
      lookupNutrition(description),
      searchNutrition(description),
    ]);
    const grounding = [dbNutrition, webNutrition].filter(Boolean).join("\n");
    const portionsBlock =
      answers.length > 0
        ? `\nPORTIONS THE CLIENT SPECIFIED (use these exact amounts):\n${answers
            .map((a) => `- ${a.question} → ${a.answer}`)
            .join("\n")}\n`
        : "";

    const userPrompt = `CLIENT:
- Diet preference: ${context.profile?.diet_preference ?? "unknown"}
- Goal: ${context.profile?.body_goal ?? "transformation"}
- Daily targets: ${JSON.stringify(context.plan_summary?.nutrition_targets ?? {})}
- Eaten so far today: ${JSON.stringify(context.food_today.items)} (total ~${context.food_today.calories_so_far} kcal, ${context.food_today.protein_so_far}g protein)
${grounding ? `\nVERIFIED NUTRITION DATABASE (per 100 g unless noted — scale to the portion, prefer over your own recall):\n${grounding}\n` : ""}${portionsBlock}
FOOD TO ANALYZE: "${description}"`;

    const result = await generateJSON<{
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      verdict: string;
      notes: string;
      alternative: string | null;
    }>(SYSTEM, userPrompt, modelOpt);

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
