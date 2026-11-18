/**
 * BESTIE — /api/chat
 * Stateless streaming chat endpoint.
 *
 * Privacy: this route stores and logs NOTHING. It receives messages, calls the
 * LLM, streams the reply back, and forgets everything. There is no database,
 * no persistence and no analytics anywhere in this app.
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

const MAX_HISTORY_MESSAGES = 40;
const MAX_CONTENT_CHARS = 16000;

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

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: "system", content: system }, ...history],
    }),
  });

  if (!res.ok || !res.body) {
    stream.enqueue(`(Service error ${res.status} — please try again.)`);
    stream.close();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json.choices?.[0]?.delta?.content;
        if (delta) stream.enqueue(delta);
      } catch {
        /* ignore malformed keep-alive lines */
      }
    }
  }
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

/** Read a byte stream of `data: {...}` SSE lines and forward text deltas. */
async function pumpSseByteStream(
  body: ReadableStream<Uint8Array>,
  stream: ReturnType<typeof makeStream>
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
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
  const rest = buffer.trim();
  if (rest.startsWith("data:") && rest !== "[DONE]") {
    const delta = extractDeltaFromSsePayload(rest.slice(5).trim());
    if (delta) stream.enqueue(delta);
  }
  stream.close();
}

/**
 * Cloudflare Workers AI via the `AI` binding — used when the app runs inside
 * a Cloudflare Worker (deployed with @opennextjs/cloudflare).
 * Needs no API keys: the binding is tied to the worker's own account.
 */
async function streamFromWorkersAI(
  aiBinding: { run: (model: string, body: object) => Promise<unknown> },
  system: string,
  history: IncomingMessage[],
  stream: ReturnType<typeof makeStream>
): Promise<void> {
  const model = process.env.LLM_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const result = (await aiBinding.run(model, {
    messages: [{ role: "system", content: system }, ...history],
    stream: true,
    max_tokens: 2048,
  })) as ReadableStream<Uint8Array>;

  if (result && typeof (result as ReadableStream).getReader === "function") {
    await pumpSseByteStream(result as ReadableStream<Uint8Array>, stream);
  } else {
    const maybeText = result as { response?: string };
    if (maybeText?.response) stream.enqueue(maybeText.response);
    stream.close();
  }
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
        await streamFromWorkersAI(aiBinding, system, history, stream);
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
