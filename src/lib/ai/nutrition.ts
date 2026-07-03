/**
 * Web-verified nutrition lookup (Tavily). Returns condensed search findings
 * to ground calorie/macro estimates for branded and prepared foods.
 * Returns null when no key is configured or the search fails — callers
 * should degrade gracefully to model knowledge.
 */
export async function searchNutrition(query: string): Promise<string | null> {
  if (!process.env.TAVILY_API_KEY) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `${query} calories nutrition facts per serving`,
        max_results: 4,
        include_answer: true,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data.results ?? [])
      .map(
        (r: { title: string; content: string }) =>
          `- ${r.title}: ${(r.content ?? "").slice(0, 250)}`
      )
      .join("\n");
    const out = [data.answer ? `Answer: ${data.answer}` : null, results].filter(Boolean).join("\n");
    return out || null;
  } catch (e) {
    console.error("nutrition search failed:", e);
    return null;
  }
}
