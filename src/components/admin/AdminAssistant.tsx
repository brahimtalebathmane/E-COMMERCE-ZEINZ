"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";
import { CloseIcon } from "./AdminIcons";
import { useAdminAssistant } from "./AdminAssistantContext";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
};

const THREAD_KEY = "admin_assistant_thread_id";
const MESSAGES_KEY = "admin_assistant_messages";
const MAX_PERSISTED = 50;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AdminAssistant() {
  const { open, setOpen } = useAdminAssistant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const storedThread = window.localStorage.getItem(THREAD_KEY);
      if (storedThread) setThreadId(storedThread);
      const storedMessages = window.localStorage.getItem(MESSAGES_KEY);
      if (storedMessages) {
        const parsed = JSON.parse(storedMessages) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // ignore corrupt storage
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(
        MESSAGES_KEY,
        JSON.stringify(messages.slice(-MAX_PERSISTED)),
      );
    } catch {
      // ignore quota errors
    }
  }, [messages]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, sending]);

  const persistThread = useCallback((id: string | null) => {
    setThreadId(id);
    try {
      if (id) window.localStorage.setItem(THREAD_KEY, id);
      else window.localStorage.removeItem(THREAD_KEY);
    } catch {
      // ignore
    }
  }, []);

  const startNewChat = useCallback(() => {
    if (sending) return;
    setMessages([]);
    persistThread(null);
    try {
      window.localStorage.removeItem(MESSAGES_KEY);
    } catch {
      // ignore
    }
  }, [persistThread, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = { id: makeId(), role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, threadId }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        threadId?: string;
        error?: string;
      };

      if (!res.ok || !data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "error",
            text: data.error || a.assistant.errorGeneric,
          },
        ]);
        return;
      }

      if (data.threadId) persistThread(data.threadId);
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", text: data.reply as string },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "error", text: a.assistant.errorGeneric },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, persistThread, sending, threadId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start"
      role="dialog"
      aria-modal="true"
      aria-label={a.assistant.title}
    >
      <button
        type="button"
        aria-label={a.assistant.close}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative flex h-full w-full max-w-md flex-col border-e border-[var(--admin-border)] bg-[var(--admin-elevated)] shadow-[var(--admin-shadow-lg)]">
        <header className="admin-glass flex items-center justify-between gap-3 border-b px-4 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--foreground)]">{a.assistant.title}</p>
            <p className="truncate text-xs text-[var(--muted)]">
              {a.assistant.subtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={startNewChat}
              disabled={sending}
              className="admin-btn-ghost !min-h-[36px] !px-3 !py-1.5 !text-xs disabled:opacity-50"
            >
              {a.assistant.newChat}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={a.assistant.close}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--admin-border-strong)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="admin-card p-4 text-sm">
              <p className="font-semibold text-[var(--foreground)]">{a.assistant.emptyTitle}</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                {a.assistant.emptyBody}
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-[var(--accent)] px-4 py-2.5 text-sm text-white shadow-[0_6px_16px_-8px_rgba(34,197,94,0.6)]"
                    : m.role === "error"
                      ? "me-auto max-w-[90%] rounded-2xl border border-red-400/35 bg-red-400/10 px-4 py-2.5 text-sm text-red-300"
                      : "me-auto max-w-[90%] rounded-2xl rounded-ss-sm border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm"
                }
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  {m.role === "user"
                    ? a.assistant.youLabel
                    : a.assistant.assistantLabel}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
              </div>
            ))
          )}
          {sending && (
            <div className="me-auto max-w-[90%] rounded-2xl border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm text-[var(--muted)]">
              {a.assistant.sending}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--admin-border)] p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              dir="auto"
              placeholder={a.assistant.placeholder}
              className="admin-input min-h-[44px] flex-1 resize-none py-2.5"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || input.trim().length === 0}
              className="admin-btn-primary !min-h-[44px] !px-4"
            >
              {sending ? a.assistant.sending : a.assistant.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
