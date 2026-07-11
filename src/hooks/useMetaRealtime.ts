"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { MetaEventLogRow } from "@/app/admin/(dashboard)/meta/types";

const HIGHLIGHT_MS = 6000;
const PAGE_SIZE = 50;

type Options = {
  setRows: React.Dispatch<React.SetStateAction<MetaEventLogRow[]>>;
  setTotal: React.Dispatch<React.SetStateAction<number>>;
};

export function useMetaRealtime({ setRows, setTotal }: Options) {
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setRowsRef = useRef(setRows);
  const setTotalRef = useRef(setTotal);
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  setRowsRef.current = setRows;
  setTotalRef.current = setTotal;

  const highlightRow = useCallback((id: string) => {
    setHighlightedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const existing = highlightTimersRef.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setHighlightedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      highlightTimersRef.current.delete(id);
    }, HIGHLIGHT_MS);

    highlightTimersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;

    const subscribe = () => {
      channel?.unsubscribe();
      channel = supabase
        .channel("meta_event_log_admin")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "meta_event_log" },
          (payload) => {
            const row = payload.new as MetaEventLogRow;
            if (!row?.id) return;
            setRowsRef.current((prev) => {
              if (prev.some((r) => r.id === row.id)) return prev;
              return [row, ...prev].slice(0, PAGE_SIZE);
            });
            setTotalRef.current((t) => t + 1);
            highlightRow(row.id);
          },
        )
        .subscribe();
    };

    subscribe();

    const onFocus = () => subscribe();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });

    return () => {
      channel?.unsubscribe();
      window.removeEventListener("focus", onFocus);
      for (const timer of highlightTimersRef.current.values()) {
        clearTimeout(timer);
      }
      highlightTimersRef.current.clear();
    };
  }, [highlightRow]);

  return { highlightedIds };
}
