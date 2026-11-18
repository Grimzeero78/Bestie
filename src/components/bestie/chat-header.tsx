"use client";

/**
 * BESTIE — Header: mobile menu, brand, language picker, theme toggle, privacy info.
 */

import { Menu, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BestieLogo } from "@/components/bestie/logo";
import { ThemeToggle } from "@/components/bestie/theme-toggle";
import { LANGUAGES, type LanguageCode } from "@/lib/bestie/languages";
import type { Dictionary } from "@/lib/bestie/i18n";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  dict: Dictionary;
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  onOpenMenu: () => void;
}

export function ChatHeader({ dict, language, onLanguageChange, onOpenMenu }: ChatHeaderProps) {
  const activeLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-5">
      {/* mobile menu */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMenu}
        aria-label={dict.chats}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2.5">
        <BestieLogo size={34} />
        <div className="leading-none">
          <p className="font-display text-2xl tracking-wide">BESTIE</p>
          <p className="bestie-label mt-1 hidden sm:block">{dict.tagline}</p>
        </div>
      </div>

      <div className="flex-1" />

      {/* language picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="gap-1.5 px-3 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            aria-label={dict.languageLabel}
          >
            <span aria-hidden="true">{activeLang.flag}</span>
            <span className="hidden sm:inline">{activeLang.native}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44 rounded-md">
          <DropdownMenuLabel className="bestie-label">{dict.languageLabel}</DropdownMenuLabel>
          {LANGUAGES.map((l) => (
            <DropdownMenuItem
              key={l.code}
              onClick={() => onLanguageChange(l.code)}
              className={cn("gap-2", l.code === language && "text-primary")}
            >
              <span aria-hidden="true">{l.flag}</span>
              {l.native}
              {l.code === language && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      {/* privacy / about */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            aria-label={dict.privacyTitle}
          >
            <Info className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 rounded-md text-sm">
          <p className="bestie-label text-primary">{dict.privacyTitle}</p>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li>· {dict.privacyLine1}</li>
            <li>· {dict.privacyLine2}</li>
            <li>· {dict.privacyLine3}</li>
          </ul>
          <div className="my-3 border-t border-border" />
          <p className="bestie-label text-primary">{dict.aboutTitle}</p>
          <p className="mt-2 leading-relaxed text-muted-foreground">{dict.aboutLine1}</p>
          <p className="mt-2 leading-relaxed text-muted-foreground">{dict.aboutLine2}</p>
        </PopoverContent>
      </Popover>
    </header>
  );
}
