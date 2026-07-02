import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSONWithImages, aiConfigured } from "@/lib/ai/provider";

const SYSTEM = `You are an elite physique and modeling-prep coach reviewing a client's progress photos. Photo 1 is the EARLIER photo, Photo 2 is the MOST RECENT.

Compare honestly and specifically — face (jawline definition, skin, puffiness) and body (shoulders, waist, arms, posture, overall composition). Never flatter emptily; never be cruel. If the photos are too similar or too different in lighting/angle to judge fairly, say so.

Respond with JSON:
{"verdict": string,             // one-line headline verdict
 "improvements": [string],      // specific visible changes for the better (empty if none)
 "unchanged_or_worse": [string],// what hasn't moved or regressed
 "focus_areas": [string],       // 2-4 concrete priorities for the next block
 "photo_tips": string}          // one tip for taking a more comparable next photo`;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI provider not configured" }, { status: 503 });
  }

  const { data: photos } = await supabase
    .from("progress_photos")
    .select("storage_path, photo_type, taken_on")
    .eq("user_id", user.id)
    .order("taken_on", { ascending: true });

  if (!photos || photos.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 progress photos to compare — upload one now and one in a few weeks." },
      { status: 400 }
    );
  }

  // Prefer earliest + latest of the same photo type for a fair comparison
  let first = photos[0];
  let last = photos[photos.length - 1];
  for (const type of ["front", "face", "side", "back"]) {
    const ofType = photos.filter((p) => p.photo_type === type);
    if (ofType.length >= 2) {
      first = ofType[0];
      last = ofType[ofType.length - 1];
      break;
    }
  }
  if (first.storage_path === last.storage_path) {
    return NextResponse.json({ error: "Photos are the same image" }, { status: 400 });
  }

  try {
    const [a, b] = await Promise.all(
      [first, last].map(async (p) => {
        const { data: blob, error } = await supabase.storage.from("photos").download(p.storage_path);
        if (error || !blob) throw new Error("Could not load photo");
        return Buffer.from(await blob.arrayBuffer()).toString("base64");
      })
    );

    const result = await generateJSONWithImages<{
      verdict: string;
      improvements: string[];
      unchanged_or_worse: string[];
      focus_areas: string[];
      photo_tips: string;
    }>(
      SYSTEM,
      `Photo 1 (earlier): ${first.photo_type}, taken ${first.taken_on}\nPhoto 2 (recent): ${last.photo_type}, taken ${last.taken_on}\n\nCompare them now.`,
      [
        { data: a, mimeType: "image/jpeg" },
        { data: b, mimeType: "image/jpeg" },
      ]
    );

    // Persist as a coach message so the comparison lives in the conversation
    const summary = `📸 Progress photo review (${first.taken_on} → ${last.taken_on}):\n${result.verdict}\n\nImproved: ${result.improvements.join("; ") || "—"}\nNeeds work: ${result.unchanged_or_worse.join("; ") || "—"}\nFocus next: ${result.focus_areas.join("; ")}`;
    await supabase.from("coach_messages").insert({
      user_id: user.id,
      role: "coach",
      content: summary,
      kind: "chat",
    });

    return NextResponse.json({ ...result, from: first.taken_on, to: last.taken_on });
  } catch (e) {
    console.error("photo-compare error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Comparison failed" },
      { status: 500 }
    );
  }
}
