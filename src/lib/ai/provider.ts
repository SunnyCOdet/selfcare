/**
 * Multi-model AI provider layer.
 * Default: Gemini. Switch with AI_PROVIDER=openai | anthropic.
 * All providers return parsed JSON from a prompt.
 */

type Provider = "gemini" | "openai" | "anthropic";

function getProvider(): Provider {
  const p = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  if (p === "openai" || p === "anthropic") return p;
  return "gemini";
}

export function aiConfigured(): boolean {
  const p = getProvider();
  if (p === "gemini") return !!process.env.GEMINI_API_KEY;
  if (p === "openai") return !!process.env.OPENAI_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}

async function callGemini(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return text;
}

async function callOpenAI(system: string, user: string): Promise<string> {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned no content");
  return text;
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: `${system}\n\nRespond with valid JSON only — no markdown fences, no prose.`,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Anthropic returned no content");
  return text;
}

function extractJson(raw: string): unknown {
  let text = raw.trim();
  // Strip markdown fences if a model added them anyway
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Fall back to the outermost JSON object/array
  const start = text.search(/[{[]/);
  if (start > 0) text = text.slice(start);
  return JSON.parse(text);
}

export async function generateJSON<T>(system: string, user: string): Promise<T> {
  const provider = getProvider();
  let raw: string;
  if (provider === "openai") raw = await callOpenAI(system, user);
  else if (provider === "anthropic") raw = await callAnthropic(system, user);
  else raw = await callGemini(system, user);
  return extractJson(raw) as T;
}

// ---------- Vision (image + text -> JSON) ----------

async function callGeminiVision(
  system: string,
  user: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: user },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini vision error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return text;
}

async function callOpenAIVision(
  system: string,
  user: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: "text", text: user },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI vision error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned no content");
  return text;
}

async function callAnthropicVision(
  system: string,
  user: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: `${system}\n\nRespond with valid JSON only — no markdown fences, no prose.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBase64 },
            },
            { type: "text", text: user },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic vision error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Anthropic returned no content");
  return text;
}

export async function generateJSONWithImage<T>(
  system: string,
  user: string,
  imageBase64: string,
  mimeType: string
): Promise<T> {
  const provider = getProvider();
  let raw: string;
  if (provider === "openai") raw = await callOpenAIVision(system, user, imageBase64, mimeType);
  else if (provider === "anthropic")
    raw = await callAnthropicVision(system, user, imageBase64, mimeType);
  else raw = await callGeminiVision(system, user, imageBase64, mimeType);
  return extractJson(raw) as T;
}
