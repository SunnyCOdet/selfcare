import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSONWithImage, aiConfigured } from "@/lib/ai/provider";
import { buildUserContext } from "@/lib/ai/context";
import { lookupNutrition, searchNutrition } from "@/lib/ai/nutrition";

/**
 * Photo-based food logging, two phases:
 *  Phase 1 "identify": upload photo -> AI names the dish, lists every visible
 *    component, and asks targeted questions (quantities, oil/ghee used,
 *    homemade vs street vendor) for anything that changes the calorie math.
 *  Phase 2 "finalize": photo + user's answers + hunger level -> full raw
 *    dissection with per-component macros, verdict, and a saved log.
 */

const IDENTIFY_SYSTEM = `You are a forensic food analyst for a body-transformation app. You are looking at a photo of food the client is about to eat (or ate).

Your job in this phase:
1. Identify the dish and EVERY visible component (e.g. "chapatis, dal, white rice, papad, pickle").
2. You must NEVER guess a portion. For EVERY single component, ask the client its exact amount — a count, weight, or standard measure (e.g. "How many chapatis?", "How much rice — how many cups or grams?", "How many pieces of paneer / roughly how many grams?"). Do not skip a single item. A photo is not enough to know grams.
3. Also ask (as separate questions) anything else that changes the math:
   - Hidden fats ("How much oil/ghee/butter was used — 1 tsp, 1 tbsp, or generous?")
   - Cooking method if ambiguous (fried vs baked vs grilled)
   - Sugar in drinks/desserts
   - Homemade vs restaurant/street vendor
   - For BRANDED / PACKAGED / cafe / dessert items: the brand or exact product name and the size/weight or number of pieces.
4. If you can't identify something, ask the client what it is.
5. Always set "confident" to false — we always confirm portions with the client before estimating.

Respond with JSON:
{"dish_name": string, "confident": false, "components_seen": [string], "questions": [string]}
Order the questions so every component's amount is covered first, then hidden fats / method / brand.`;

const FINALIZE_SYSTEM = `You are a forensic sports nutritionist. Using the food photo, the client's answers, and their hunger level, produce a full calorie dissection.

Rules:
- The client has told you the exact portion of every component in their answers — use those exact amounts, do not override them with your own guess.
- COUNT-BASED ITEMS: when the client gives a count (e.g. "4 eggs", "3 rotis", "5 idlis"), compute the macros of ONE unit at its normal size (1 large egg ≈ 50 g ≈ 72 kcal; 1 medium roti ≈ 40 g ≈ 110 kcal) and MULTIPLY by the count. Never invent a huge gram weight for the whole plate — think per-unit × count.
- Break the meal into RAW measured components — each ingredient dissected separately with the client's quantities (e.g. "4 eggs (≈72 kcal each)", "cooking oil ~1 tbsp (14g)", "white rice ~150g cooked / 50g raw", "potato ~120g").
- Hidden calories are your specialty: count the oil, ghee, butter, sugar, chutneys, dressing per the client's answers. Street food gets typical vendor-level oil unless the answers say otherwise.
- Only if the client explicitly said they don't know a specific amount, estimate that one item from the image using a standard preparation and say so in notes.
- verdict: "good" | "okay" | "avoid" judged against their remaining daily targets, goal, and diet preference.
- notes: 1-3 short sentences, specific to their remaining macros today. Factor in their hunger level — if they're starving and the food is bad, suggest what to add/swap so they still get full (protein first).
- alternative: better swap if verdict is "okay"/"avoid", else null.

Respond with JSON:
{"dish_name": string,
 "components": [{"name": string, "quantity": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}],
 "total_calories": number, "total_protein_g": number, "total_carbs_g": number, "total_fat_g": number,
 "verdict": "good"|"okay"|"avoid", "notes": string, "alternative": string|null}`;

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
  const phase: string = body.phase === "finalize" ? "finalize" : "identify";

  try {
    if (phase === "identify") {
      const photoB64: string = body.photo_b64 ?? "";
      if (!photoB64 || photoB64.length < 100) {
        return NextResponse.json({ error: "No photo received" }, { status: 400 });
      }
      if (photoB64.length > 8_000_000) {
        return NextResponse.json({ error: "Photo too large" }, { status: 413 });
      }

      // Store the photo so phase 2 (and the log) can reference it
      const path = `${user.id}/food/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("photos")
        .upload(path, Buffer.from(photoB64, "base64"), { contentType: "image/jpeg" });
      if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);

      const result = await generateJSONWithImage<{
        dish_name: string;
        confident: boolean;
        components_seen: string[];
        questions: string[];
      }>(
        IDENTIFY_SYSTEM,
        "Analyze this food photo. What is it, what components do you see, and what do you need to ask?",
        photoB64,
        "image/jpeg"
      );

      return NextResponse.json({ photo_path: path, ...result });
    }

    // ---- finalize ----
    const photoPath: string = body.photo_path ?? "";
    if (!photoPath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid photo path" }, { status: 400 });
    }
    const answers: { question: string; answer: string }[] = Array.isArray(body.answers)
      ? body.answers
      : [];
    const hungerLevel: string = (body.hunger_level ?? "").toString().slice(0, 40);

    const { data: blob, error: dlErr } = await supabase.storage.from("photos").download(photoPath);
    if (dlErr || !blob) throw new Error("Could not load the photo for analysis");
    const photoB64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    const context = await buildUserContext(supabase, user.id);

    // Ground the estimate in web-verified nutrition data (branded items
    // especially) — the dish name from the identify phase or the answers.
    const dishHint = (body.dish_name ?? "").toString().slice(0, 100);
    const searchQuery =
      dishHint || answers.map((a) => a.answer).join(" ").slice(0, 100) || "meal";
    const [dbNutrition, webNutrition] = await Promise.all([
      lookupNutrition(searchQuery),
      searchNutrition(searchQuery),
    ]);
    const grounding = [dbNutrition, webNutrition].filter(Boolean).join("\n");

    const prompt = `CLIENT:
- Diet preference: ${context.profile?.diet_preference ?? "unknown"}
- Goal: ${context.profile?.body_goal ?? "transformation"}
- Daily targets: ${JSON.stringify(context.plan_summary?.nutrition_targets ?? {})}
- Eaten so far today: ~${context.food_today.calories_so_far} kcal, ${context.food_today.protein_so_far}g protein
- Hunger level right now: ${hungerLevel || "not stated"}

CLIENT'S ANSWERS ABOUT THIS FOOD:
${answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n") || "(none — estimate from the image using standard preparations)"}
${grounding ? `\nVERIFIED NUTRITION DATABASE (per 100 g unless noted — scale to the portion, prefer over your own recall):\n${grounding}\n` : ""}
Dissect this meal now.`;

    const result = await generateJSONWithImage<{
      dish_name: string;
      components: {
        name: string;
        quantity: string;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }[];
      total_calories: number;
      total_protein_g: number;
      total_carbs_g: number;
      total_fat_g: number;
      verdict: string;
      notes: string;
      alternative: string | null;
    }>(FINALIZE_SYSTEM, prompt, photoB64, "image/jpeg");

    const verdict = ["good", "okay", "avoid"].includes(result.verdict) ? result.verdict : "okay";

    const { data: saved, error: insertErr } = await supabase
      .from("food_logs")
      .insert({
        user_id: user.id,
        description: result.dish_name || "Photo meal",
        calories: Math.round(result.total_calories) || null,
        protein_g: Math.round(result.total_protein_g) || null,
        carbs_g: Math.round(result.total_carbs_g) || null,
        fat_g: Math.round(result.total_fat_g) || null,
        verdict,
        ai_notes: [result.notes, result.alternative ? `Better: ${result.alternative}` : null]
          .filter(Boolean)
          .join(" "),
        photo_path: photoPath,
        breakdown: { components: result.components },
        hunger_level: hungerLevel || null,
      })
      .select()
      .single();
    if (insertErr) throw new Error(insertErr.message);

    return NextResponse.json({ log: saved });
  } catch (e) {
    console.error("food-photo error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Photo analysis failed" },
      { status: 500 }
    );
  }
}
