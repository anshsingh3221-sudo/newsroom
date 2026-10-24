# The Record: AI news analysis and fact-checking platform

Next.js 14 (App Router) + TypeScript (strict) + Tailwind + Supabase (Postgres, Auth, pgvector) + a pluggable LLM adapter (Gemini free tier, OpenAI/Groq, or Claude).

## What works
- RSS ingestion, de-duplication and clustering of coverage, with disclosed trending rules (publishers covering a story in the last 48h)
- Political Memory Engine (`src/lib/ai/memory-engine.ts`): extract claims, identify speakers, hybrid keyword and semantic search of the statement archive, compare statements, save drafts to the review queue
- Statement archive where every quote is verified against the fetched source text before it is saved
- Dated affiliations (never overwritten), explicit statement relationships with review status
- Fact-check drafts that stay hidden until an editor approves them (enforced by database row-level security)
- Public pages: home, news, fact-checks, statements, comparisons, people, topics, search, methodology and policy pages
- Editorial desk at `/admin` (Supabase Auth, staff table)
- Unit tests for clustering, feed parsing, quote verification and citation validation

## Setup (about 20 minutes)

### 1. Install tools
- Node.js 20.6 or newer (https://nodejs.org), VS Code, Git

### 2. Create the Supabase project (free)
1. https://supabase.com, New project. Save the database password.
2. SQL Editor, New query, paste all of `supabase/migrations/0001_init.sql`, Run.
3. Project Settings, API: copy the Project URL, the `anon` key and the `service_role` key.

### 3. Get a free LLM key (pick one)
- Gemini (free tier): https://aistudio.google.com/apikey. Use `LLM_PROVIDER=gemini`.
- Groq (free tier, OpenAI-compatible): create a key at https://console.groq.com, then `LLM_PROVIDER=openai`, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_API_KEY=...`, `LLM_MODEL=llama-3.3-70b-versatile`.
- Claude: `LLM_PROVIDER=anthropic` with an API key from https://console.anthropic.com. The API is billed separately from a claude.ai subscription.
Model names change often. If a call fails with "model not found", set `LLM_MODEL` to a current name from the provider's docs.

### 4. Configure and run
```bash
cd newsroom
cp .env.example .env.local        # Windows: copy .env.example .env.local
# fill in .env.local (Supabase keys, LLM key, CRON_SECRET)
npm install
npm run typecheck                  # should pass; see "First run" below if it does not
npm test
npm run dev                        # http://localhost:3000
```

### 5. Create your editor account
1. Supabase, Authentication, Users, Add user (email + password, tick auto-confirm).
2. SQL Editor: `insert into staff (user_id, role) values ('<that user id>', 'admin');`
3. Open http://localhost:3000/admin and sign in.

### 6. Use it (the order matters)
1. Admin, Fetch news. Trending stories appear on the home page.
2. Admin, Add a person (for example a politician you want to track), then Record an affiliation with a source URL.
3. Admin, Add statements from a source: paste URLs of real speeches, interviews or transcripts. Only quotes found verbatim in the page are saved.
4. Admin, Run research on a trending story. This creates an article draft and proposed statement comparisons. Comparisons only appear when the speaker already exists in People and has earlier statements in the archive.
5. Review queue: check sources, then Approve and publish (or reject). Approved items go live.
6. Fact-check: Draft a fact-check, review, approve.

Optional: set `EMBEDDING_PROVIDER=gemini` (free key) for semantic search. Statements saved before you turn it on have no vectors and are found by keyword only.

### Scheduled ingestion
`npm run ingest` fetches feeds once. When deployed on Vercel, call `GET /api/cron/ingest` with header `Authorization: Bearer <CRON_SECRET>` from Vercel Cron or any scheduler.

## First run
This code was written without being able to install packages or compile it. If `npm run typecheck` reports errors, fix them first (usually small typing issues); `npm test` covers the core logic. Feed URLs in `src/config/feeds.ts` may need updating if a publisher moves its RSS.

## Not built yet
shadcn/ui components, dark mode, voting records and manifesto data, in-browser editing of drafts (editors approve or reject; text edits need a follow-up), and Supabase Storage uploads. Replace the privacy and terms text with reviewed legal copy before launch.
