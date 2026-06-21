"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAr as a } from "@/locales/admin-ar";

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
  const [open, setOpen] = useState(false);
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

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={a.assistant.openButton}
          className="fixed bottom-20 end-4 z-40 flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 lg:bottom-4"
        >
          <span aria-hidden>💬</span>
          <span>{a.assistant.openButton}</span>
        </button>
      )}

      {open && (
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
          <div className="relative flex h-full w-full max-w-md flex-col bg-[var(--card)] shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-[var(--accent-muted)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{a.assistant.title}</p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {a.assistant.subtitle}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={startNewChat}
                  disabled={sending}
                  className="rounded-lg border border-[var(--accent-muted)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  {a.assistant.newChat}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={a.assistant.close}
                  className="rounded-lg px-2 py-1.5 text-lg leading-none text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 ? (
                <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] p-4 text-sm">
                  <p className="font-semibold">{a.assistant.emptyTitle}</p>
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
                        ? "ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-[var(--accent)] px-4 py-2.5 text-sm text-white"
                        : m.role === "error"
                          ? "me-auto max-w-[90%] rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-300"
                          : "me-auto max-w-[90%] rounded-2xl rounded-ss-sm border border-[var(--accent-muted)] bg-[var(--background)] px-4 py-2.5 text-sm"
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
                <div className="me-auto max-w-[90%] rounded-2xl border border-[var(--accent-muted)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--muted)]">
                  {a.assistant.sending}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--accent-muted)] p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={2}
                  dir="auto"
                  placeholder={a.assistant.placeholder}
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--accent-muted)] bg-[var(--background)] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || input.trim().length === 0}
                  className="min-h-[44px] rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? a.assistant.sending : a.assistant.send}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
