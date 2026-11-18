"use client";

/**
 * BESTIE — Empty state: bold display greeting + numbered starter chips.
 * ISAACART-style: huge condensed type, mono labels, sharp borders.
 */

import { BestieLogo } from "@/components/bestie/logo";
import type { Dictionary } from "@/lib/bestie/i18n";

interface EmptyStateProps {
  dict: Dictionary;
  onPick: (text: string) => void;
}

export function EmptyState({ dict, onPick }: EmptyStateProps) {
  return (
    <div className="bestie-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-8">
      <div className="bestie-glow mx-auto my-auto flex w-full max-w-2xl flex-col items-center px-4 py-10 text-center">
        <BestieLogo size={56} className="shadow-[4px_4px_0_0_rgba(233,180,76,0.35)]" />

        <h1 className="font-display mt-6 text-5xl leading-[0.95] tracking-wide md:text-7xl">
          {dict.greeting}
        </h1>
        <p className="bestie-label mt-4">{dict.greetingSub}</p>

        <div className="mt-10 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {dict.chips.map((chip, i) => (
            <button
              key={chip}
              onClick={() => onPick(chip)}
              className="group flex min-h-[52px] items-center gap-3 border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="font-display text-xl leading-none text-primary/70 transition-colors group-hover:text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium text-foreground">{chip}</span>
            </button>
          ))}
        </div>

        <p className="bestie-label mt-10">{dict.memoryNote}</p>
      </div>
    </div>
  );
}
