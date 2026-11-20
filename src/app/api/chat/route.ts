/**
 * BESTIE — /api/chat
 * Stateless chat endpoint with a paced SSE stream.
 *
 * Privacy: this route stores and logs NOTHING. It receives messages, calls the
 * LLM, streams the reply back, and forgets everything. There is no database,
 * no persistence and no analytics anywhere in this app.
 *
 * Quality control: the full reply is generated, then the QUESTION LAW is
 * enforced deterministically — a reply may hold at most ONE question mark.
 * If the draft holds more, one quick repair pass rewrites the extras into
 * statements before anything is sent to the client. The finished text is then
 * released word-by-word so the chat still feels alive.
 *
 * Provider priority:
 *   1. Cloudflare Workers AI binding (production on Workers — no API keys needed).
 *   2. OpenAI-compatible endpoint via LLM_BASE_URL + LLM_API_KEY (any provider).
 *   3. z-ai-web-dev-sdk (sandbox default).
 */

import { buildSystemPrompt } from "@/lib/bestie/system-prompt";
import { getLanguage } from "@/lib/bestie/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

type ChatMsg = { role: string; content: string };

// Context-window safety: smaller fast models have less room, and every token
// of history costs Neurons. 12 recent turns is plenty for a companion chat.
const MAX_HISTORY_MESSAGES = 12;
const MAX_CONTENT_CHARS = 2000;

/** The QUESTION LAW: one reply, at most one question mark. */
const QUESTION_LIMIT = 1;

/** Daily free-tier allowance exhausted (Cloudflare error 4006). */
const QUOTA_RE = /neurons|free allocation|quota|4006|exceeded your daily/i;

const QUOTA_MESSAGES: Record<string, string> = {
  en: "(Bestie's free AI allowance for today is used up — she'll be back after the daily reset. Thanks for your patience.)",
  sw: "(Ruhusa ya bure ya AI ya Bestie kwa leo imeisha — atarudi baada ya kuweka upya kwa siku. Asante kwa subira yako.)",
  fr: "(Le quota quotidien gratuit d'IA de Bestie est épuisé — elle sera de retour après la réinitialisation quotidienne. Merci de votre patience.)",
  es: "(La cuota diaria gratuita de IA de Bestie se agotó — volverá después del reinicio diario. Gracias por tu paciencia.)",
  pt: "(A cota diária gratuita de IA da Bestie acabou — ela volta depois da redefinição diária. Obrigado pela paciência.)",
  zh: "(Bestie 的免费 AI 每日额度已用完 — 每日重置后她会回来。感谢你的耐心。)",
  hi: "(Bestie का निःशुल्क दैनिक AI कोटा समाप्त हो गया है — दैनिक रीसेट के बाद वह वापस आ जाएगी। धैर्य के लिए धन्यवाद।)",
};

function quotaMessage(languageCode: string): string {
  return QUOTA_MESSAGES[languageCode] ?? QUOTA_MESSAGES.en;
}

const REPAIR_SYSTEM = `You are a precise text editor. Your ONLY job: enforce the question law on the draft reply below.
THE QUESTION LAW: the whole reply may contain AT MOST ONE question mark. Zero is allowed and often better.
HOW TO FIX: keep the single strongest question (an opening one or the last one) and rewrite every other question into a plain statement with the same meaning.
CHANGE NOTHING ELSE — same language, same length, same paragraph breaks, same tone, every Scripture quotation kept word-for-word in double quotation marks, no verse references added anywhere.
Output ONLY the corrected reply text — no preamble, no explanation, no quotation marks around the whole reply.`;

function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) || []).length;
}

/** Keep the draft unless it breaks the question law; then try one repair pass. */
async function enforceQuestionLaw(
  generate: (messages: ChatMsg[]) => Promise<string>,
  draft: string
): Promise<string> {
  if (countQuestionMarks(draft) <= QUESTION_LIMIT) return draft;
  try {
    const fixed = await generate([
      { role: "system", content: REPAIR_SYSTEM },
      {
        role: "user",
        content: `Draft reply:\n\n${draft}\n\nReturn the corrected reply with at most one question mark.`,
      },
    ]);
    const text = (fixed ?? "").trim();
    const validShape = text.length > 40 && text.length < draft.length * 1.6;
    if (validShape && countQuestionMarks(text) < countQuestionMarks(draft)) return text;
  } catch {
    /* repair failed — send the draft unchanged rather than nothing */
  }
  return draft;
}

/** Release a finished reply in small chunks so the chat still feels live. */
async function releaseText(
  text: string,
  stream: ReturnType<typeof makeStream>,
  paceMs = 24
): Promise<void> {
  const words = text.match(/\S+\s*/g) ?? [text];
  let chunk = "";
  for (const word of words) {
    chunk += word;
    if (chunk.length >= 26) {
      stream.enqueue(chunk);
      chunk = "";
      await new Promise((resolve) => setTimeout(resolve, paceMs));
    }
  }
  if (chunk) stream.enqueue(chunk);
}

function serviceError(stream: ReturnType<typeof makeStream>) {
  stream.enqueue("(Something went wrong on the service side. Please try again.)");
  stream.close();
}

function sanitize(messages: IncomingMessage[]): IncomingMessage[] {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) }))
    .slice(-MAX_HISTORY_MESSAGES);
}

/** SSE stream encoder shared by both providers. */
function makeStream(): {
  enqueue: (text: string) => void;
  close: () => void;
  readable: ReadableStream<Uint8Array>;
} {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    enqueue(text) {
      try {
        controllerRef?.enqueue(encoder.encode(`data: ${JSON.stringify({ t: text })}\n\n`));
      } catch {
        /* stream already closed */
      }
    },
    close() {
      try {
        controllerRef?.enqueue(encoder.encode("data: [DONE]\n\n"));
        controllerRef?.close();
      } catch {
        /* already closed */
      }
    },
    readable,
  };
}

async function streamFromOpenAICompatible(
  system: string,
  history: IncomingMessage[],
  stream: ReturnType<typeof makeStream>
): Promise<void> {
  const baseUrl = process.env.LLM_BASE_URL!.replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const baseMessages: ChatMsg[] = [{ role: "system", content: system }, ...history];

  const generate = async (messages: ChatMsg[]): Promise<string> => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({ model, stream: false, messages }),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "";
  };

  const draft = await generate(baseMessages);
  if (!draft.trim()) return serviceError(stream);
  const finalText = await enforceQuestionLaw(generate, draft);
  await releaseText(finalText, stream);
  stream.close();
}

/** Extract text deltas from an OpenAI-style SSE payload line. */
function extractDeltaFromSsePayload(payload: string): string | undefined {
  try {
    const json = JSON.parse(payload);
    return (
      json.choices?.[0]?.delta?.content ??
      json.choices?.[0]?.message?.content ??
      json.response ??
      (typeof json.t === "string" ? json.t : undefined)
    );
  } catch {
    return undefined;
  }
}

/**
 * Cloudflare Workers AI via the `AI` binding — used when the app runs inside
 * a Cloudflare Worker (deployed with @opennextjs/cloudflare).
 * Needs no API keys: the binding is tied to the worker's own account.
 *
 * Model strategy on the free plan (10,000 Neurons/day, account-wide):
 *   FAST  @cf/meta/llama-3.1-8b-instruct-fp8-fast  ≈ 26 Neurons/message → ~380 msgs/day
 *   SMART @cf/meta/llama-3.3-70b-instruct-fp8-fast ≈ 163 Neurons/message → ~60 msgs/day
 * The FAST model is the primary; if it fails transiently or returns nothing,
 * the request escalates to the SMART model so a chat never dies on a hiccup.
 * LLM_MODEL (wrangler.jsonc vars) overrides the primary.
 */
const MODEL_FAST = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const MODEL_SMART = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

async function streamFromWorkersAI(
  aiBinding: { run: (model: string, body: object) => Promise<unknown> },
  system: string,
  history: IncomingMessage[],
  stream: ReturnType<typeof makeStream>,
  languageCode = "en"
): Promise<void> {
  const primary = process.env.LLM_MODEL || MODEL_FAST;
  const fallback = primary === MODEL_SMART ? MODEL_FAST : MODEL_SMART;
  const baseMessages: ChatMsg[] = [{ role: "system", content: system }, ...history];

  const runOnce = async (model: string, messages: ChatMsg[]): Promise<string> => {
    const result = (await aiBinding.run(model, {
      messages,
      stream: false,
      max_tokens: 1024,
    })) as { response?: string };
    return result?.response ?? "";
  };

  const generate = (messages: ChatMsg[]) => runOnce(primary, messages);

  // Attempt chain: primary, primary retry, then the other model.
  // Quota exhaustion is NOT retried — it is account-wide, not per-model.
  let draft = "";
  let quotaHit = false;
  for (const model of [primary, primary, fallback]) {
    try {
      draft = await runOnce(model, baseMessages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (QUOTA_RE.test(msg)) {
        quotaHit = true;
        break;
      }
      continue;
    }
    if (draft.trim()) break;
  }
  if (!draft.trim()) {
    if (quotaHit) {
      stream.enqueue(quotaMessage(languageCode));
      stream.close();
      return;
    }
    return serviceError(stream);
  }
  const finalText = await enforceQuestionLaw(generate, draft);
  await releaseText(finalText, stream);
  stream.close();
}

/** Resolve the Workers AI binding when running on Cloudflare, else null. */
async function getWorkersAIBinding(): Promise<{
  run: (model: string, body: object) => Promise<unknown>;
} | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = (getCloudflareContext() as unknown as { env?: Record<string, unknown> }).env;
    const ai = env?.AI;
    if (ai && typeof (ai as { run?: unknown }).run === "function") {
      return ai as { run: (model: string, body: object) => Promise<unknown> };
    }
    return null;
  } catch {
    // Not running on Cloudflare (local dev / other hosts).
    return null;
  }
}

async function streamFromZAI(
  system: string,
  history: IncomingMessage[],
  stream: ReturnType<typeof makeStream>
): Promise<void> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const completion = await zai.chat.completions.create({
    messages: [{ role: "system", content: system }, ...history],
    stream: true,
    thinking: { type: "disabled" },
  });

  const anyCompletion = completion as unknown as {
    getReader?: () => ReadableStreamDefaultReader<Uint8Array>;
    body?: { getReader?: () => ReadableStreamDefaultReader<Uint8Array> };
    choices?: Array<{ message?: { content?: string } }>;
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<unknown>;
  };

  // Case 1: SDK returns a ReadableStream of raw SSE bytes.
  const byteReader =
    typeof anyCompletion?.getReader === "function"
      ? anyCompletion.getReader()
      : typeof anyCompletion?.body?.getReader === "function"
        ? anyCompletion.body.getReader()
        : null;

  if (byteReader) {
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await byteReader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        const delta = extractDeltaFromSsePayload(payload);
        if (delta) stream.enqueue(delta);
      }
    }
    // Flush any remaining complete line.
    const rest = buffer.trim();
    if (rest.startsWith("data:") && rest !== "[DONE]") {
      const delta = extractDeltaFromSsePayload(rest.slice(5).trim());
      if (delta) stream.enqueue(delta);
    }
    stream.close();
    return;
  }

  // Case 2: async iterable of OpenAI-style chunk objects.
  if (typeof anyCompletion?.[Symbol.asyncIterator] === "function") {
    for await (const chunk of anyCompletion as unknown as AsyncIterable<{
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    }>) {
      const delta = chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.message?.content;
      if (delta) stream.enqueue(delta);
    }
    stream.close();
    return;
  }

  // Case 3: non-streamed completion.
  if (anyCompletion?.choices?.[0]?.message?.content) {
    stream.enqueue(anyCompletion.choices[0].message.content as string);
  }
  stream.close();
}

export async function POST(req: Request) {
  let body: { messages?: IncomingMessage[]; language?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const history = sanitize(Array.isArray(body.messages) ? body.messages : []);
  if (history.length === 0) {
    return new Response(JSON.stringify({ error: "No messages provided." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lang = getLanguage(body.language ?? "en");
  const system = buildSystemPrompt({ languageCode: lang.code, languageName: lang.native });

  // Capture the AI binding synchronously — it stays valid inside the stream.
  const aiBinding = await getWorkersAIBinding();

  const stream = makeStream();

  const run = async () => {
    try {
      if (aiBinding) {
        await streamFromWorkersAI(aiBinding, system, history, stream, lang.code);
      } else if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
        await streamFromOpenAICompatible(system, history, stream);
      } else {
        await streamFromZAI(system, history, stream);
      }
    } catch {
      // Never echo internal details or log message content.
      stream.enqueue("(Something went wrong on the service side. Please try again.)");
      stream.close();
    }
  };

  // Kick off without awaiting so the SSE stream starts immediately.
  void run();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
