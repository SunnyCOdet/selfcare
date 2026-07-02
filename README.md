# Ascend — Personal AI Transformation

AI-powered self-care and body-transformation app. Google login, AI onboarding interview, personalized daily plan (20k steps mandatory), streaks, progress photos, and weight tracking.

**Stack:** Next.js 16 (App Router) · Supabase (auth, Postgres, storage) · Gemini (default AI, OpenAI/Anthropic pluggable) · Tailwind v4 · Vercel

## Setup

### 1. Environment

Copy `.env.example` to `.env.local`. Supabase URL/key are already filled in for the `selfcare` project. Add an AI key:

- **Gemini (default):** get a free key at https://aistudio.google.com/apikey → set `GEMINI_API_KEY`
- Or switch providers: `AI_PROVIDER=openai` + `OPENAI_API_KEY`, or `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`

### 2. Google login (Supabase dashboard — one-time)

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → Create OAuth Client ID (Web application)
   - Authorized redirect URI: `https://iujyivroiiyfinyqvuxg.supabase.co/auth/v1/callback`
2. In [Supabase → Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/iujyivroiiyfinyqvuxg/auth/providers): enable Google, paste the Client ID + Secret.
3. In [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/iujyivroiiyfinyqvuxg/auth/url-configuration):
   - Site URL: your Vercel URL (e.g. `https://yourapp.vercel.app`)
   - Additional redirect URLs: `http://localhost:3000/auth/callback` and `https://yourapp.vercel.app/auth/callback`

### 3. Run locally

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

```bash
npx vercel
```

Then in the Vercel project settings → Environment Variables, add everything from `.env.local`. After the first deploy, update the Supabase redirect URLs (step 2.3) with the production domain.

## Database

Schema lives in Supabase (project `iujyivroiiyfinyqvuxg`), applied via migration `initial_selfcare_schema`:

- `profiles` — auto-created on signup (trigger), stores stats + goals + preferences
- `intake_answers` — AI interview Q&A history
- `transformation_plans` — versioned AI-generated plans (JSON)
- `daily_checkins` — one row per day: steps, tasks, water, sleep, mood, weight
- `streaks` — current/longest streak, counted when a day hits ≥70% completion
- `progress_photos` + private `photos` storage bucket

All tables have row-level security — users can only ever read/write their own rows.

## Apple Health sync

`POST /api/steps?token=<your-sync-token>` (token shown on the dashboard → "Auto-sync Apple Health steps" card). Two payload formats:

- **iOS Shortcut (free):** `GET /api/steps?token=...&steps=12345` — nightly Shortcut automation reads Health steps and hits this URL.
- **Health Auto Export app:** point a REST API automation at `POST /api/steps?token=...` with JSON format — steps, walking/running distance, sleep, and heart rate are parsed per day and stored on the matching check-in. Runs hourly if you want.

Both update today's completion % and streak automatically (≥70% keeps the flame).

## How it works

1. Sign in with Google → profile row auto-created
2. Onboarding wizard: basics → dream physique + inspiration (e.g. Hrithik Roshan) → activities with proficiency → lifestyle → photos
3. AI coach interviews you with dynamic follow-up questions (8–12, never static)
4. AI writes the full plan: workout split, meals + macros, skincare AM/PM, grooming, sleep, activity progressions, model-prep, weekly schedule with 20,000 daily steps baked in
5. Dashboard: check off daily non-negotiables, log steps/water/sleep/weight/mood → streak updates automatically
