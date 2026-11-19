"use client";

/**
 * BESTIE — Message list: renders the conversation with streaming support,
 * typing indicator, per-message copy, and edit-and-resend for user messages.
 */

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Check, Pencil, X } from "lucide-react";
import { BestieLogo } from "@/components/bestie/logo";
import { Button } from "@/components/ui/button";
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

function ActionChip({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 border border-border bg-popover px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary",
        className
      )}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function CopyChip({ text, copied }: { text: string; copied: string }) {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <ActionChip
      label={copied}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {isCopied ? copied : copied}
    </ActionChip>
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

function UserMessageEditor({
  initialText,
  dict,
  onSave,
  onCancel,
}: {
  initialText: string;
  dict: Dictionary;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    onSave(text);
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        ref={textareaRef}
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        className="bestie-scroll w-full resize-none border border-primary bg-card px-3 py-2.5 text-[15px] leading-relaxed text-foreground outline-none"
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="border border-border"
        >
          <X className="h-3.5 w-3.5" />
          {dict.cancel}
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!draft.trim()}>
          <Check className="h-3.5 w-3.5" />
          {dict.saveResend}
        </Button>
      </div>
    </div>
  );
}

interface MessageListProps {
  dict: Dictionary;
  messages: ChatMessage[];
  streaming: boolean;
  onEditResend: (messageId: string, text: string) => void;
}

export function MessageList({ dict, messages, streaming, onEditResend }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Leave edit mode whenever the conversation changes shape (e.g. resend).
  useEffect(() => {
    if (editingId && !messages.some((m) => m.id === editingId)) setEditingId(null);
  }, [messages, editingId]);

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
          const editing = editingId === m.id;

          if (isUser) {
            if (editing) {
              return (
                <div key={m.id} className="bestie-rise flex justify-end">
                  <div className="w-full max-w-[85%] md:max-w-[75%]">
                    <UserMessageEditor
                      initialText={m.content}
                      dict={dict}
                      onSave={(text) => {
                        setEditingId(null);
                        onEditResend(m.id, text);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className="bestie-rise group relative flex justify-end">
                <div className="max-w-[85%] bg-primary px-4 py-3 text-[15px] font-medium leading-relaxed text-primary-foreground md:max-w-[75%]">
                  <MarkdownContent content={m.content} />
                </div>
                {!streaming && (
                  <div className="absolute -top-2 right-0 flex translate-y-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <CopyChip text={m.content} copied={dict.copied} />
                    <ActionChip label={dict.edit} onClick={() => setEditingId(m.id)}>
                      <Pencil className="h-3 w-3" />
                      {dict.edit}
                    </ActionChip>
                  </div>
                )}
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
                  <div className="absolute -top-1 right-0 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <CopyChip text={m.content} copied={dict.copied} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
