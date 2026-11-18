"use client";

/**
 * BESTIE — Message list: renders the conversation with streaming support,
 * friendly bubbles, a typing indicator and per-message copy.
 */

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Check } from "lucide-react";
import { BestieLogo } from "@/components/bestie/logo";
import type { Dictionary } from "@/lib/bestie/i18n";
import type { ChatMessage } from "@/lib/bestie/store";
import { cn } from "@/lib/utils";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-2" aria-live="polite">
      <span className="bestie-dot h-2 w-2 rounded-full bg-primary/70" />
      <span className="bestie-dot h-2 w-2 rounded-full bg-primary/70" />
      <span className="bestie-dot h-2 w-2 rounded-full bg-primary/70" />
    </span>
  );
}

function CopyButton({ text, copied, done }: { text: string; copied: string; done: string }) {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="absolute -top-1 right-0 flex translate-y-0 items-center gap-1 border border-border bg-popover px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
      aria-label={copied}
    >
      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {isCopied ? done : copied}
    </button>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="bestie-md">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface MessageListProps {
  dict: Dictionary;
  messages: ChatMessage[];
  streaming: boolean;
}

export function MessageList({ dict, messages, streaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const lastContent = messages.length ? messages[messages.length - 1].content : "";
  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, lastContent]);

  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const waiting = streaming && lastMessage?.role === "assistant" && lastMessage.content === "";

  return (
    <div
      ref={containerRef}
      className="bestie-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6"
      role="log"
      aria-live="polite"
      aria-label={dict.chats}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const isLast = i === messages.length - 1;
          const showTyping = isLast && waiting;
          if (isUser) {
            return (
              <div key={m.id} className="bestie-rise flex justify-end">
                <div className="max-w-[85%] bg-primary px-4 py-3 text-[15px] font-medium leading-relaxed text-primary-foreground md:max-w-[75%]">
                  <MarkdownContent content={m.content} />
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="bestie-rise group flex items-start gap-3">
              <BestieLogo size={30} className="mt-0.5 shrink-0" />
              <div className="relative min-w-0 max-w-[85%] border-l-2 border-primary/70 pl-4 md:max-w-[80%]">
                <div className="text-[15px] leading-relaxed">
                  {showTyping ? <TypingDots /> : <MarkdownContent content={m.content} />}
                  {!showTyping && streaming && isLast && (
                    <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse bg-primary align-text-bottom" />
                  )}
                </div>
                {!showTyping && m.content && (
                  <CopyButton text={m.content} copied={dict.copied} done={dict.copied} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
