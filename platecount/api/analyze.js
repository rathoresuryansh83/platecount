// Vercel serverless function (free Hobby plan) -> Google Gemini FREE tier. Key stays on the server.
const API = "https://generativelanguage.googleapis.com/v1beta";
const STATIC = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash-lite"];
const PROMPT = `You are a nutrition assistant. Identify each distinct food item in the meal (the user may eat Indian, Asian or Western food; use specific names like "dal tadka", "roti", "biryani"). Count items (e.g. 2 rotis = one item with the total grams). For each, estimate the total portion in grams (g) and typical calories per 100 g (per100). Include cooking oil/ghee in per100 when likely. Respond ONLY with JSON: {"items":[{"name":string,"g":number,"per100":number}]}. If no food is visible return {"items":[]}.`;

let found = null, foundAt = 0;
const score = (n) => (/preview/.test(n) ? 10 : 0) + (/lite/.test(n) ? 5 : 0) + (/latest/.test(n) ? -1 : 0);
async function discover(key) { // ask Google which models this key can really use
  if (found && Date.now() - foundAt < 3600000) return found;
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    if (r.ok) {
      const d = await r.json();
      found = (d.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .filter((n) => /flash/.test(n) && !/image|tts|live|audio|robotics|embedding|thinking|exp/.test(n))
        .sort((a, b) => score(a) - score(b));
      foundAt = Date.now();
    }
  } catch (e) {}
  return found || [];
}

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter((t) => now - t < 60000);
  a.push(now); hits.set(ip, a);
  return a.length > 6;
}
const clean = (j) => (j.items || []).slice(0, 12)
  .map((x) => ({ name: String(x.name || "").slice(0, 60), g: Math.min(Math.max(+x.g, 5), 1500), per100: Math.min(Math.max(+x.per100, 1), 900) }))
  .filter((x) => x.name && x.g && x.per100);

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (req.method === "GET") { // open /api/analyze in a browser to check setup
    const models = key ? await discover(key) : [];
    return res.status(200).json({ keyConfigured: !!key, usableModels: models.slice(0, 6) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!key) return res.status(500).json({ error: "server", detail: "GEMINI_API_KEY is not set in Vercel" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "rate" });

  const { image } = req.body || {};
  const hint = String((req.body && req.body.hint) || "").slice(0, 200);
  const hasImg = typeof image === "string" && image.length > 100 && image.length < 3000000;
  if (!hasImg && hint.length < 3) return res.status(400).json({ error: "bad", detail: "no image or description" });

  let text = hasImg ? PROMPT : PROMPT.replace("in the meal", "in this meal description");
  if (hint) text += hasImg ? ` The user says this meal is: "${hint}". Use that to name foods and counts.` : ` No photo. Estimate from this description with typical home/restaurant portions: "${hint}".`;
  const parts = hasImg ? [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text }] : [{ text }];
  const body = (think) => JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2,
      maxOutputTokens: think ? 2048 : 8192, ...(think ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
  });

  const cands = [...new Set([process.env.GEMINI_MODEL, ...(await discover(key)).slice(0, 3), ...STATIC].filter(Boolean))].slice(0, 5);
  let last = { status: 0, msg: "no model tried" }, all429 = true;
  try {
    for (const m of cands) {
      for (const think of [true, false]) { // retry without thinkingConfig if the model rejects it
        const r = await fetch(`${API}/models/${m}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: body(think) });
        if (r.ok) {
          const d = await r.json();
          const out = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [])
            .filter((p) => !p.thought).map((p) => p.text || "").join("");
          const mm = out.match(/\{[\s\S]*\}/);
          try { return res.status(200).json({ items: clean(JSON.parse(mm ? mm[0] : "")), model: m }); }
          catch (e) { last = { status: 200, msg: "unreadable reply", model: m }; all429 = false; break; }
        }
        const t = await r.text().catch(() => "");
        last = { status: r.status, msg: t.slice(0, 160).replace(/\s+/g, " "), model: m };
        if (r.status !== 429) all429 = false;
        if (r.status === 400 && think) continue;
        break;
      }
    }
  } catch (e) { last = { status: 0, msg: String(e).slice(0, 120) }; all429 = false; }
  if (all429 && last.status === 429) return res.status(429).json({ error: "rate" });
  res.status(502).json({ error: "upstream", detail: `${last.status} ${last.model || ""} ${last.msg}` });
};
