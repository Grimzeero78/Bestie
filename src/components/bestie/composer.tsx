"use client";

/**
 * BESTIE — Composer: input area with auto-growing textarea, send/stop,
 * and the safety disclaimer line.
 */

import { useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/bestie/i18n";

interface ComposerProps {
  dict: Dictionary;
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ dict, disabled, streaming, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  };

  return (
    <div className="border-t border-border bg-background px-4 pb-3 pt-3 md:px-6">
      <div className="mx-auto max-w-2xl">
        <form
          className="flex items-end gap-2 border border-border bg-card p-2 transition-colors focus-within:border-primary"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="bestie-input" className="sr-only">
            {dict.placeholder}
          </label>
          <textarea
            id="bestie-input"
            ref={textareaRef}
            rows={1}
            value={value}
            placeholder={dict.placeholder}
            className="bestie-scroll max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
            onChange={(e) => {
              setValue(e.target.value);
              resize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {streaming ? (
            <Button
              type="button"
              size="icon"
              onClick={onStop}
              className="h-11 w-11 shrink-0"
              aria-label={dict.stop}
              title={dict.stop}
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!value.trim() || disabled}
              className="h-11 w-11 shrink-0"
              aria-label={dict.send}
              title={dict.send}
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
            </Button>
          )}
        </form>
        <p className="bestie-label mt-2 text-center">{dict.safetyLine}</p>
      </div>
    </div>
  );
}
