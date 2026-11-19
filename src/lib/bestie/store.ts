"use client";

/**
 * BESTIE — Local-only chat store.
 * Privacy guarantees:
 *  - Every conversation is persisted ONLY in this device's localStorage.
 *  - The server is stateless: it never stores, logs or echoes conversations.
 *  - "Delete" is absolute — once removed, the data exists nowhere.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LanguageCode } from "./languages";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface BestieState {
  chats: Chat[];
  activeChatId: string | null;
  language: LanguageCode;
  hydrated: boolean;

  createChat: () => string;
  setActiveChat: (id: string | null) => void;
  deleteChat: (id: string) => void;
  deleteAllChats: () => void;
  renameChat: (id: string, title: string) => void;
  addMessage: (chatId: string, msg: Omit<ChatMessage, "createdAt">) => void;
  appendToLast: (chatId: string, delta: string) => void;
  setMessageContent: (chatId: string, messageId: string, content: string) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  /** Remove the message and every message after it (for edit-and-resend). */
  truncateFrom: (chatId: string, messageId: string) => void;
  setLanguage: (code: LanguageCode) => void;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function touchTitle(chat: Chat): Chat {
  // Derive a friendly title from the first user message if the chat is untitled.
  if (chat.title) return chat;
  const firstUser = chat.messages.find((m) => m.role === "user");
  if (firstUser) {
    const t = firstUser.content.trim().replace(/\s+/g, " ").slice(0, 42);
    return { ...chat, title: t + (firstUser.content.trim().length > 42 ? "…" : "") };
  }
  return chat;
}

export const useBestieStore = create<BestieState>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      language: "en",
      hydrated: false,

      createChat: () => {
        const id = uid();
        const chat: Chat = { id, title: "", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
        set((s) => ({ chats: [chat, ...s.chats], activeChatId: id }));
        return id;
      },

      setActiveChat: (id) => set({ activeChatId: id }),

      deleteChat: (id) =>
        set((s) => {
          const chats = s.chats.filter((c) => c.id !== id);
          const activeChatId = s.activeChatId === id ? null : s.activeChatId;
          return { chats, activeChatId };
        }),

      deleteAllChats: () => set({ chats: [], activeChatId: null }),

      renameChat: (id, title) =>
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) })),

      addMessage: (chatId, msg) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId
              ? touchTitle({
                  ...c,
                  messages: [...c.messages, { ...msg, createdAt: Date.now() }],
                  updatedAt: Date.now(),
                })
              : c
          ),
        })),

      appendToLast: (chatId, delta) =>
        set((s) => ({
          chats: s.chats.map((c) => {
            if (c.id !== chatId || c.messages.length === 0) return c;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last.role !== "assistant") return c;
            msgs[msgs.length - 1] = { ...last, content: last.content + delta };
            return { ...c, messages: msgs, updatedAt: Date.now() };
          }),
        })),

      setMessageContent: (chatId, messageId, content) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === messageId ? { ...m, content } : m)),
                  updatedAt: Date.now(),
                }
              : c
          ),
        })),

      removeMessage: (chatId, messageId) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.filter((m) => m.id !== messageId), updatedAt: Date.now() }
              : c
          ),
        })),

      truncateFrom: (chatId, messageId) =>
        set((s) => ({
          chats: s.chats.map((c) => {
            if (c.id !== chatId) return c;
            const idx = c.messages.findIndex((m) => m.id === messageId);
            if (idx === -1) return c;
            return { ...c, messages: c.messages.slice(0, idx), updatedAt: Date.now() };
          }),
        })),

      setLanguage: (code) => set({ language: code }),
    }),
    {
      name: "bestie-local-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
        language: state.language,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
