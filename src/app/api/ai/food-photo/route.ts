import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSONWithImage, aiConfigured } from "@/lib/ai/provider";
import { buildUserContext } from "@/lib/ai/context";

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
1. Identify the dish and EVERY visible component (e.g. "3 chapatis, dal (looks like dal tadka), white rice ~1 cup, papad, pickle").
2. Decide what you genuinely cannot determine from the image that materially changes calories, and ask about it. Typical must-ask items:
   - Counts ("How many eggs are in this?")
   - Hidden fats ("How much oil/ghee/butter was used — 1 tsp, 1 tbsp, or generous?")
   - Cooking method if ambiguous (fried vs baked vs grilled)
   - Sugar in drinks/desserts
   - Homemade vs restaurant/street vendor (vendor portions use far more oil)
3. If the photo is unclear or you can't identify something, ASK the user what it is instead of guessing.
4. Street food: identify it by name if you can (vada pav, pani puri, momos...). If the user won't know details, you'll estimate typical vendor preparation later — but still ask how many pieces.
5. Ask 2-5 questions max — only ones that change the numbers. If the image is truly self-explanatory, return an empty questions array.

Respond with JSON:
{"dish_name": string, "confident": boolean, "components_seen": [string], "questions": [string]}`;

const FINALIZE_SYSTEM = `You are a forensic sports nutritionist. Using the food photo, the client's answers, and their hunger level, produce a full calorie dissection.

Rules:
- Break the meal into RAW measured components — each ingredient dissected separately with realistic raw quantities (e.g. "2 whole eggs (100g)", "cooking oil ~1 tbsp (14g)", "white rice ~150g cooked / 50g raw", "potato ~120g").
- Hidden calories are your specialty: count the oil, ghee, butter, sugar, chutneys, dressing. Street food gets typical vendor-level oil unless the answers say otherwise.
- If the user was unsure about contents, estimate from the image using standard preparations and say so in notes.
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

    const prompt = `CLIENT:
- Diet preference: ${context.profile?.diet_preference ?? "unknown"}
- Goal: ${context.profile?.body_goal ?? "transformation"}
- Daily targets: ${JSON.stringify(context.plan_summary?.nutrition_targets ?? {})}
- Eaten so far today: ~${context.food_today.calories_so_far} kcal, ${context.food_today.protein_so_far}g protein
- Hunger level right now: ${hungerLevel || "not stated"}

CLIENT'S ANSWERS ABOUT THIS FOOD:
${answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n") || "(none — estimate from the image using standard preparations)"}

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
