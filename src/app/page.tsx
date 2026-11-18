"use client";

/**
 * BESTIE — Main chat application.
 * Everything here is device-local: chats live in localStorage, the API is
 * stateless, and deleting a chat removes it from existence.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BestieLogo } from "@/components/bestie/logo";
import { ChatHeader } from "@/components/bestie/chat-header";
import { ChatSidebar } from "@/components/bestie/chat-sidebar";
import { MessageList } from "@/components/bestie/message-list";
import { EmptyState } from "@/components/bestie/empty-state";
import { Composer } from "@/components/bestie/composer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useBestieStore } from "@/lib/bestie/store";
import { getDictionary } from "@/lib/bestie/i18n";
import { getLanguage, type LanguageCode } from "@/lib/bestie/languages";

export default function BestiePage() {
  const chats = useBestieStore((s) => s.chats);
  const activeChatId = useBestieStore((s) => s.activeChatId);
  const language = useBestieStore((s) => s.language);
  const hydrated = useBestieStore((s) => s.hydrated);

  const addMessage = useBestieStore((s) => s.addMessage);
  const appendToLast = useBestieStore((s) => s.appendToLast);
  const setMessageContent = useBestieStore((s) => s.setMessageContent);
  const removeMessage = useBestieStore((s) => s.removeMessage);
  const setLanguage = useBestieStore((s) => s.setLanguage);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const dict = getDictionary(language);
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];

  // Keep the document language in sync for screen readers.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const send = useCallback(
    async (text: string) => {
      if (streamingRef.current || !text.trim()) return;
      const state = useBestieStore.getState();

      let chatId = state.activeChatId;
      if (!chatId || !state.chats.some((c) => c.id === chatId)) {
        chatId = state.createChat();
      }

      const priorMessages =
        state.chats.find((c) => c.id === chatId)?.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })) ?? [];

      addMessage(chatId, { id: crypto.randomUUID(), role: "user", content: text.trim() });
      const assistantId = crypto.randomUUID();
      addMessage(chatId, { id: assistantId, role: "assistant", content: "" });

      const payloadMessages = [...priorMessages, { role: "user" as const, content: text.trim() }];

      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payloadMessages, language }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let received = false;

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
              if (json.t) {
                received = true;
                appendToLast(chatId, json.t);
              }
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
        if (!received) setMessageContent(chatId, assistantId, dict.error);
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort) {
          const current = useBestieStore.getState().chats.find((c) => c.id === chatId);
          const target = current?.messages.find((m) => m.id === assistantId);
          if (target && target.content === "") removeMessage(chatId, assistantId);
        } else {
          setMessageContent(chatId, assistantId, dict.error);
        }
      } finally {
        streamingRef.current = false;
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [language, dict, addMessage, appendToLast, setMessageContent, removeMessage]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  if (!hydrated) {
    // Pre-hydration skeleton — avoids any localStorage SSR mismatch.
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <BestieLogo size={64} className="animate-pulse" />
          <div className="h-1 w-24 animate-pulse bg-muted" />
        </div>
      </div>
    );
  }

  const showEmptyState = !activeChat || messages.length === 0;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <ChatSidebar dict={dict} language={language} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-80 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">{dict.chats}</SheetTitle>
          <ChatSidebar dict={dict} language={language} onOpenChanged={setMobileOpen} />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          dict={dict}
          language={language}
          onLanguageChange={(code: LanguageCode) => setLanguage(code)}
          onOpenMenu={() => setMobileOpen(true)}
        />

        {showEmptyState ? (
          <EmptyState dict={dict} onPick={(text) => void send(text)} />
        ) : (
          <MessageList dict={dict} messages={messages} streaming={streaming} />
        )}

        <Composer dict={dict} disabled={false} streaming={streaming} onSend={(t) => void send(t)} onStop={stop} />
      </main>
    </div>
  );
}
