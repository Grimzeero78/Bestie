# Bestie — Your Faith Friend

Bestie is a warm Christian AI companion website. It listens first, asks eye-opening questions, reasons gently, and points people to biblical truth — with short sentences, zero judgment and maximum kindness.

## Highlights

- **Character-driven**: one carefully engineered system prompt (`src/lib/bestie/system-prompt.ts`) governs every reply — modeled on how Jesus communicated (love, wisdom, humility, truth, patience, authority, mercy).
- **Private by design**: no accounts, no database, no server-side logging. Chats live **only** in the visitor's browser (localStorage). Deleting a chat erases it everywhere, forever.
- **Chat memory**: Bestie remembers the entire conversation (until the user deletes it) — history is sent with every request.
- **7 languages**: English, Kiswahili, Français, Español, Português, 中文, हिन्दी — for both UI and AI replies.
- **Light / dark mode**, streaming replies, stop button, rename / export / delete chats.
- **Deploy-ready for Cloudflare Workers** via OpenNext, with GitHub Actions CI included.

## What Bestie must never do (enforced in the system prompt)

- Never claim to be Jesus Christ, God or the Holy Spirit
- Never claim to receive direct revelations from God
- Never invent Bible verses or references
- Never manipulate people through fear or guilt
- Never automatically agree just to be liked
- Never present personal interpretations as unquestionable fact
- Never lecture with long paragraphs or shame anyone

## Tech stack

| Layer      | Choice |
| ---------- | ------ |
| Framework  | Next.js 16 (App Router) + TypeScript |
| Styling    | Tailwind CSS 4 + shadcn/ui, warm honey palette |
| State      | Zustand persisted to localStorage (device-only) |
| AI         | Streaming SSE, OpenAI-compatible (Cloudflare Workers AI by default) |
| Deploy     | Cloudflare Workers via `@opennextjs/cloudflare` |

## Local development

```bash
bun install
cp .env.example .env        # fill in your LLM keys (or leave empty for sandbox default)
bun run dev                 # http://localhost:3000
```

If no `LLM_BASE_URL` / `LLM_API_KEY` is configured, the server falls back to the bundled `z-ai-web-dev-sdk` provider.

## Deploy to Cloudflare

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "Bestie"
git remote add origin git@github.com:YOUR_USER/bestie.git
git push -u origin main
```

### 2. Give Cloudflare the tokens

```bash
bunx wrangler login          # or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
bun install
bunx opennextjs-cloudflare build
bunx opennextjs-cloudflare deploy
```

### 3. Give the Worker its AI keys (as secrets — never in code)

```bash
bunx wrangler secret put LLM_BASE_URL
# → https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1
bunx wrangler secret put LLM_API_KEY
# → an API token with Workers AI permissions
```

The model is set in `wrangler.jsonc` (`LLM_MODEL`). The default `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is a good, fast, multilingual Workers AI model. You can point `LLM_BASE_URL` at any OpenAI-compatible provider instead.

### 4. Auto-deploy from GitHub (optional)

Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets (Settings → Secrets and variables → Actions). `.github/workflows/deploy.yml` then deploys on every push to `main`.

## Privacy notes

- The API route (`src/app/api/chat/route.ts`) is **stateless**: it streams the answer and forgets everything. Nothing is logged or stored.
- Chat history never touches a server disk — it is sent per-request for memory, then dropped.
- All data on the client lives under the `bestie-local-storage` localStorage key. "Delete all chats" wipes it.

## Safety

Bestie offers biblical encouragement, not professional counselling. The system prompt detects crisis situations (self-harm, abuse, danger) and urges the person to contact emergency services, a pastor, a doctor or a trusted person immediately.
