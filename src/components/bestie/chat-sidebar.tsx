"use client";

/**
 * BESTIE — Sidebar: chat history (device-local), new chat, rename, export, delete.
 * Rendered statically on desktop and inside a Sheet on mobile.
 */

import { useMemo, useState } from "react";
import {
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Download,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Dictionary } from "@/lib/bestie/i18n";
import { useBestieStore, type Chat } from "@/lib/bestie/store";
import type { LanguageCode } from "@/lib/bestie/languages";

const LOCALES: Record<string, string> = {
  en: "en-GB",
  sw: "sw-KE",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-BR",
  zh: "zh-CN",
  hi: "hi-IN",
};

function formatDate(ts: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(ts));
}

export function exportChatToText(chat: Chat) {
  const lines = chat.messages.map(
    (m) => `${m.role === "user" ? "You" : "Bestie"}: ${m.content}`
  );
  const header = `Bestie — ${chat.title || "Chat"}\n${new Date(chat.createdAt).toLocaleString()}\n\n`;
  const blob = new Blob([header + lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bestie-chat-${new Date(chat.createdAt).toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

interface ChatSidebarProps {
  dict: Dictionary;
  language: LanguageCode;
  onOpenChanged?: (open: boolean) => void;
}

export function ChatSidebar({ dict, language, onOpenChanged }: ChatSidebarProps) {
  const chats = useBestieStore((s) => s.chats);
  const activeChatId = useBestieStore((s) => s.activeChatId);
  const setActiveChat = useBestieStore((s) => s.setActiveChat);
  const createChat = useBestieStore((s) => s.createChat);
  const deleteChat = useBestieStore((s) => s.deleteChat);
  const deleteAllChats = useBestieStore((s) => s.deleteAllChats);
  const renameChat = useBestieStore((s) => s.renameChat);
  const { toast } = useToast();

  const [renameTarget, setRenameTarget] = useState<Chat | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const sortedChats = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats]);

  const handleNewChat = () => {
    createChat();
    onOpenChanged?.(false);
  };

  const handleSelect = (id: string) => {
    setActiveChat(id);
    onOpenChanged?.(false);
  };

  const handleExport = (chat: Chat) => {
    exportChatToText(chat);
    toast({ title: dict.exportDone });
    onOpenChanged?.(false);
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteChat(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleRenameConfirm = () => {
    if (renameTarget && renameValue.trim()) {
      renameChat(renameTarget.id, renameValue.trim());
      toast({ title: dict.renamed });
    }
    setRenameTarget(null);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <Button
        onClick={handleNewChat}
        className="w-full justify-start gap-2 font-mono text-xs uppercase tracking-wider shadow-none"
        size="lg"
      >
        <MessageSquarePlus className="h-5 w-5" />
        {dict.newChat}
      </Button>

      <p className="bestie-label px-2 pt-1">{dict.chats}</p>

      <ScrollArea className="min-h-0 flex-1 pr-1 bestie-scroll">
        {sortedChats.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">{dict.emptyChats}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {sortedChats.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  "group flex items-center gap-1 border-l-2 pr-1 transition-colors",
                  chat.id === activeChatId
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-transparent hover:bg-accent/60"
                )}
              >
                <button
                  onClick={() => handleSelect(chat.id)}
                  className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-current={chat.id === activeChatId ? "page" : undefined}
                >
                  <span className="block truncate text-sm font-medium">
                    {chat.title || dict.newChat}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {chat.messages.length > 0
                      ? `${chat.messages.length} · ${formatDate(chat.updatedAt, LOCALES[language] ?? "en-GB")}`
                      : formatDate(chat.createdAt, LOCALES[language] ?? "en-GB")}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground opacity-70 hover:opacity-100 md:opacity-0 md:group-hover:opacity-70 md:focus:opacity-100"
                      aria-label={`${dict.rename} / ${dict.delete}: ${chat.title || dict.newChat}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameTarget(chat);
                        setRenameValue(chat.title);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      {dict.rename}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(chat)}>
                      <Download className="h-4 w-4" />
                      {dict.export}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(chat)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {dict.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-sidebar-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 font-mono text-xs uppercase tracking-wider text-destructive hover:text-destructive"
          onClick={() => setConfirmDeleteAll(true)}
          disabled={chats.length === 0}
        >
          <Trash2 className="h-4 w-4" />
          {dict.deleteAll}
        </Button>
        <p className="bestie-label mt-2 flex items-start gap-1.5 px-2 leading-snug">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {dict.privacyLine1}
        </p>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dict.rename}</DialogTitle>
            <DialogDescription asChild>
              <div />
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={80}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
            aria-label={dict.rename}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {dict.cancel}
            </Button>
            <Button onClick={handleRenameConfirm}>{dict.rename}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete one chat */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.deleteChatTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.deleteChatDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {dict.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all chats */}
      <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.deleteAllTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.deleteAllDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteAllChats();
                setConfirmDeleteAll(false);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {dict.deleteAll}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
