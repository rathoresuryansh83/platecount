// Vercel serverless function (free Hobby plan). Uses Google Gemini FREE tier (no billing needed).
// The key stays on the server. Never enable billing on the Google project and you can never be charged.
const MODELS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.5-flash"].filter(Boolean);
const PROMPT = `You are a nutrition assistant. The image shows a meal. Identify each distinct food item (the user may eat Indian, Asian or Western food; use specific names like "dal tadka", "roti", "biryani"). For each, estimate the visible portion in grams (g) and typical calories per 100 g (per100). Respond ONLY with JSON: {"items":[{"name":string,"g":number,"per100":number}]}. If no food is visible return {"items":[]}.`;

const hits = new Map(); // best-effort per-IP limit
function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter((t) => now - t < 60000);
  a.push(now);
  hits.set(ip, a);
  return a.length > 4;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "server not configured" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "rate" });
  const image = req.body && req.body.image;
  if (typeof image !== "string" || image.length < 100 || image.length > 3000000)
    return res.status(400).json({ error: "bad image" });

  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: PROMPT }] }],
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048, temperature: 0.2 },
  });
  try {
    let r;
    for (const m of MODELS) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
      });
      if (r.status !== 404) break; // unknown model id -> try next
    }
    if (r.status === 429) return res.status(429).json({ error: "rate" });
    if (!r.ok) return res.status(502).json({ error: "upstream" });
    const d = await r.json();
    const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    const j = JSON.parse(m ? m[0] : '{"items":[]}');
    const items = (j.items || []).slice(0, 12)
      .map((x) => ({ name: String(x.name || "").slice(0, 60), g: Math.min(Math.max(+x.g, 5), 1500), per100: Math.min(Math.max(+x.per100, 1), 900) }))
      .filter((x) => x.name && x.g && x.per100);
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: "fail" });
  }
};
