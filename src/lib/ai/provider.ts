/**
 * Multi-model AI provider layer.
 * Default: Gemini. Switch with AI_PROVIDER=openai | anthropic.
 * All providers return parsed JSON from a prompt.
 */

type Provider = "gemini" | "openai" | "anthropic" | "deepseek";

function getProvider(): Provider {
  const p = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  if (p === "openai" || p === "anthropic" || p === "deepseek") return p;
  return "gemini";
}

export function aiConfigured(): boolean {
  const p = getProvider();
  if (p === "gemini") return !!process.env.GEMINI_API_KEY;
  if (p === "openai") return !!process.env.OPENAI_API_KEY;
  if (p === "deepseek") return !!process.env.DEEPSEEK_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Fetch with automatic retry on rate limits (429) and transient overload
 * (500/503/529) — essential on free-tier API quotas. Honors the provider's
 * "retry in Ns" hint when present, capped so serverless functions don't
 * exceed their execution window.
 */
async function fetchWithRetry(
  makeRequest: () => Promise<Response>,
  label: string
): Promise<Response> {
  const RETRYABLE = new Set([429, 500, 503, 529]);
  let lastRes: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await makeRequest();
    if (res.ok || !RETRYABLE.has(res.status) || attempt === 3) return res;
    const body = await res.text().catch(() => "");
    const hint = body.match(/retry in ([\d.]+)\s*s/i);
    const wait = Math.min(hint ? Math.ceil(parseFloat(hint[1]) * 1000) + 1000 : attempt * 12000, 50000);
    console.warn(`${label}: ${res.status}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/3)`);
    await new Promise((r) => setTimeout(r, wait));
    lastRes = res;
  }
  return lastRes!;
}

async function callGemini(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetchWithRetry(
    () =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
      }),
    "Gemini"
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

/** OpenAI-compatible chat completions (OpenAI, DeepSeek, and other compat APIs). */
async function callOpenAICompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  label: string,
  system: string,
  user: string,
  extraBody: Record<string, unknown> = {}
): Promise<string> {
  const res = await fetchWithRetry(
    () =>
      fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 8000,
          ...extraBody,
        }),
      }),
    label
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${label} returned no content`);
  return text;
}

function callOpenAI(system: string, user: string): Promise<string> {
  return callOpenAICompat(
    "https://api.openai.com/v1",
    process.env.OPENAI_API_KEY!,
    process.env.OPENAI_MODEL || "gpt-4o",
    "OpenAI",
    system,
    user
  );
}

function callDeepSeek(system: string, user: string): Promise<string> {
  return callOpenAICompat(
    "https://api.deepseek.com",
    process.env.DEEPSEEK_API_KEY!,
    process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    "DeepSeek",
    system,
    user,
    // thinking mode roughly doubles latency — chat replies should be snappy
    { thinking: { type: "disabled" } }
  );
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

export async function generateJSON<T>(
  system: string,
  user: string,
  opts?: { provider?: Provider }
): Promise<T> {
  const provider = opts?.provider ?? getProvider();
  let raw: string;
  if (provider === "openai") raw = await callOpenAI(system, user);
  else if (provider === "deepseek") raw = await callDeepSeek(system, user);
  else if (provider === "anthropic") raw = await callAnthropic(system, user);
  else raw = await callGemini(system, user);
  return extractJson(raw) as T;
}

/** Parse a raw model completion into JSON (public wrapper for streaming callers). */
export function parseModelJson<T>(raw: string): T {
  return extractJson(raw) as T;
}

/**
 * Plan generation needs arithmetic that reconciles — on DeepSeek this runs
 * with reasoning enabled (slower, far better at macro math). Other providers
 * behave like generateJSON.
 */
export async function generatePlanJSON<T>(system: string, user: string): Promise<T> {
  const provider = getProvider();
  if (provider === "deepseek") {
    const raw = await callOpenAICompat(
      "https://api.deepseek.com",
      process.env.DEEPSEEK_API_KEY!,
      process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      "DeepSeek (reasoning)",
      system,
      user,
      { thinking: { type: "enabled" } }
    );
    return extractJson(raw) as T;
  }
  return generateJSON<T>(system, user);
}

/**
 * Incrementally extracts the value of the top-level "reply" string field
 * while a JSON completion streams in, emitting decoded text deltas.
 */
export function createReplyExtractor(onDelta: (text: string) => void) {
  let buf = "";
  let phase: "seek" | "inReply" | "done" = "seek";
  let escape = false;
  let unicode: string | null = null;

  return function feed(chunk: string) {
    buf += chunk;
    if (phase === "seek") {
      const m = buf.match(/"reply"\s*:\s*"/);
      if (!m || m.index === undefined) return;
      phase = "inReply";
      // reprocess everything after the opening quote
      const start = m.index + m[0].length;
      const rest = buf.slice(start);
      buf = "";
      feedReply(rest);
      return;
    }
    if (phase === "inReply") feedReply(chunk);
  };

  function feedReply(text: string) {
    let out = "";
    for (const ch of text) {
      if (phase !== "inReply") break;
      if (unicode !== null) {
        unicode += ch;
        if (unicode.length === 4) {
          const code = parseInt(unicode, 16);
          if (!Number.isNaN(code)) out += String.fromCharCode(code);
          unicode = null;
        }
        continue;
      }
      if (escape) {
        escape = false;
        if (ch === "n") out += "\n";
        else if (ch === "t") out += "\t";
        else if (ch === "r") out += "";
        else if (ch === "u") unicode = "";
        else out += ch; // \" \\ \/ etc.
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        phase = "done";
        break;
      }
      out += ch;
    }
    if (out) onDelta(out);
  }
}

/**
 * Streaming JSON completion (OpenAI-compatible providers). Emits decoded
 * "reply" text deltas as they arrive and resolves with the full raw
 * completion for parsing. Falls back to non-streaming for other providers.
 */
export async function streamJSON(
  system: string,
  user: string,
  onReplyDelta: (text: string) => void
): Promise<string> {
  const provider = getProvider();

  if (provider !== "deepseek" && provider !== "openai") {
    const raw =
      provider === "anthropic" ? await callAnthropic(system, user) : await callGemini(system, user);
    try {
      const parsed = extractJson(raw) as { reply?: string };
      if (typeof parsed.reply === "string") onReplyDelta(parsed.reply);
    } catch {
      /* caller will surface the parse error */
    }
    return raw;
  }

  const baseUrl = provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com/v1";
  const apiKey = provider === "deepseek" ? process.env.DEEPSEEK_API_KEY! : process.env.OPENAI_API_KEY!;
  const model =
    provider === "deepseek"
      ? process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
      : process.env.OPENAI_MODEL || "gpt-4o";

  const res = await fetchWithRetry(
    () =>
      fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 8000,
          stream: true,
          ...(provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
        }),
      }),
    `${provider} stream`
  );
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider} stream error ${res.status}: ${body.slice(0, 300)}`);
  }

  const extractor = createReplyExtractor(onReplyDelta);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let sseBuf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuf += decoder.decode(value, { stream: true });
    const lines = sseBuf.split("\n");
    sseBuf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: string = json?.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          extractor(delta);
        }
      } catch {
        /* ignore malformed keep-alive lines */
      }
    }
  }
  if (!full) throw new Error(`${provider} stream returned no content`);
  return full;
}

// ---------- Vision (image + text -> JSON) ----------

async function callGeminiVision(
  system: string,
  user: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetchWithRetry(
    () =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
      }),
    "Gemini vision"
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
  else {
    // DeepSeek's chat API is text-only — vision falls back to Gemini
    if (provider === "deepseek" && !process.env.GEMINI_API_KEY) {
      throw new Error("Photo analysis needs GEMINI_API_KEY (DeepSeek has no vision support)");
    }
    raw = await callGeminiVision(system, user, imageBase64, mimeType);
  }
  return extractJson(raw) as T;
}

/** Multi-image vision (photo comparisons). Gemini-backed. */
export async function generateJSONWithImages<T>(
  system: string,
  user: string,
  images: { data: string; mimeType: string }[]
): Promise<T> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetchWithRetry(
    () =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
                ...images.map((img) => ({
                  inline_data: { mime_type: img.mimeType, data: img.data },
                })),
                { text: user },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      }),
    "Gemini multi-vision"
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return extractJson(text) as T;
}
