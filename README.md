# PlateCount – photo calorie tracker (100% free stack)

Snap a meal → AI detects foods & portions → adjust → daily calories tracked.
If the free AI quota is busy, search 40+ common (Indian + global) foods or add manually, all free and unlimited.

| Part | Service | Cost |
|---|---|---|
| Hosting + serverless API | Vercel Hobby | Free |
| Photo recognition | Google Gemini API free tier (AI Studio) | Free, no credit card |
| Data storage | Browser localStorage | Free |

## Deploy (about 10 minutes)
1. **Free key:** aistudio.google.com → *Get API key* → Create. **Do not enable billing** on that project. With billing off, you cannot be charged; if the free quota runs out you just get "busy" errors.
2. **GitHub:** `git init && git add . && git commit -m "PlateCount" && git branch -M main`, create an empty repo, `git remote add origin <url> && git push -u origin main`.
3. **Vercel:** vercel.com → Add New → Project → import repo → preset **Other** → Deploy.
4. **Secret:** Project → Settings → Environment Variables → `GEMINI_API_KEY` = your key. Redeploy.
   If you get "couldn't analyze", set `GEMINI_MODEL` to a current free Flash model name shown in AI Studio.
5. Open the `.vercel.app` link on your phone. Install: Android Chrome → ⋮ → *Install app*; iPhone Safari → Share → *Add to Home Screen*.

## Good to know
- **Shared quota:** all users share YOUR free key's limits (not published as fixed numbers; AI Studio shows them). The app caps each device at 10 photos/day and 4/min per IP to stretch it. Best for you, friends and a college group.
- **Privacy:** on Google's free tier, submitted content may be used to improve their products. Tell users, and avoid photos with faces or personal info. Data is stored only in the user's browser.
- **Accuracy:** AI portions/calories are estimates (shown as ranges). The built-in food list is approximate averages.
- Never commit your key. Health note: a tracking aid, not medical advice.

## Resume bullets (use your real numbers)
- Built a zero-cost mobile PWA that estimates meal calories from photos via a serverless API and vision model, with an offline-capable search fallback.
- Handled free-tier constraints with client-side downscaling, per-device and per-IP rate limits, and graceful degradation to a local food database.
