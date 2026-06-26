"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  ADMIN_ORDER_SELECT,
  mergeOrderPayload,
  sortOrdersNewestFirst,
  type RealtimeOrderPayload,
} from "@/app/admin/(dashboard)/orders/queries";
import type { AdminOrderRow } from "@/app/admin/(dashboard)/orders/types";

const HIGHLIGHT_MS = 6000;
const RECONCILE_LIMIT_MIN = 50;
const RECONCILE_LIMIT_MAX = 200;

type Options = {
  setRows: React.Dispatch<React.SetStateAction<AdminOrderRow[]>>;
  setActive: React.Dispatch<React.SetStateAction<AdminOrderRow | null>>;
};

async function fetchOrderById(id: string): Promise<AdminOrderRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as AdminOrderRow;
}

/**
 * Keeps the admin orders list in sync via Supabase Realtime (INSERT/UPDATE/DELETE)
 * and reconciles missed events when the PWA/tab regains focus after backgrounding.
 */
export function useOrdersRealtime({ setRows, setActive }: Options) {
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const rowsRef = useRef<AdminOrderRow[]>([]);
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const setRowsRef = useRef(setRows);
  const setActiveRef = useRef(setActive);
  const reconcilingRef = useRef(false);
  const initialSyncDoneRef = useRef(false);

  setRowsRef.current = setRows;
  setActiveRef.current = setActive;

  const trackRows = useCallback((rows: AdminOrderRow[]) => {
    rowsRef.current = rows;
  }, []);

  const highlightOrder = useCallback((orderId: string) => {
    setHighlightedIds((prev) => {
      if (prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });

    const existing = highlightTimersRef.current.get(orderId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setHighlightedIds((prev) => {
        if (!prev.has(orderId)) return prev;
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      highlightTimersRef.current.delete(orderId);
    }, HIGHLIGHT_MS);

    highlightTimersRef.current.set(orderId, timer);
  }, []);

  const prependOrder = useCallback(
    (order: AdminOrderRow) => {
      setRowsRef.current((prev) => {
        if (prev.some((row) => row.id === order.id)) return prev;
        const next = sortOrdersNewestFirst([order, ...prev]);
        rowsRef.current = next;
        return next;
      });
      highlightOrder(order.id);
    },
    [highlightOrder],
  );

  const removeOrder = useCallback((orderId: string) => {
    setRowsRef.current((prev) => {
      const next = prev.filter((row) => row.id !== orderId);
      rowsRef.current = next;
      return next;
    });
    setActiveRef.current((prev) => (prev?.id === orderId ? null : prev));
  }, []);

  const reconcile = useCallback(async () => {
    if (reconcilingRef.current) return;
    reconcilingRef.current = true;
    try {
      const supabase = createClient();
      const current = rowsRef.current;
      const limit = Math.min(
        RECONCILE_LIMIT_MAX,
        Math.max(current.length + 20, RECONCILE_LIMIT_MIN),
      );

      const { data, error } = await supabase
        .from("orders")
        .select(ADMIN_ORDER_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error || !data?.length) return;

      const incoming = data as unknown as AdminOrderRow[];
      const byId = new Map(current.map((row) => [row.id, row]));
      const brandNew: string[] = [];

      for (const order of incoming) {
        if (!byId.has(order.id)) brandNew.push(order.id);
        const existing = byId.get(order.id);
        byId.set(
          order.id,
          existing
            ? { ...existing, ...order, products: order.products ?? existing.products }
            : order,
        );
      }

      const merged = sortOrdersNewestFirst(Array.from(byId.values()));
      rowsRef.current = merged;
      setRowsRef.current(merged);

      setActiveRef.current((prev) => {
        if (!prev) return prev;
        const refreshed = byId.get(prev.id);
        return refreshed ? refreshed : prev;
      });

      if (initialSyncDoneRef.current) {
        for (const id of brandNew) highlightOrder(id);
      } else {
        initialSyncDoneRef.current = true;
      }
    } finally {
      reconcilingRef.current = false;
    }
  }, [highlightOrder]);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    const subscribe = () => {
      if (disposed) return;
      channel?.unsubscribe();

      channel = supabase
        .channel("admin-orders-realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          (payload) => {
            const row = payload.new as RealtimeOrderPayload;
            void fetchOrderById(row.id).then((order) => {
              if (order) prependOrder(order);
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders" },
          (payload) => {
            const incoming = payload.new as RealtimeOrderPayload;
            setRowsRef.current((prev) => {
              const existing = prev.find((row) => row.id === incoming.id);
              if (!existing) {
                void fetchOrderById(incoming.id).then((order) => {
                  if (order) prependOrder(order);
                });
                return prev;
              }
              const merged = mergeOrderPayload(existing, incoming);
              const next = prev.map((row) => (row.id === incoming.id ? merged : row));
              rowsRef.current = next;
              setActiveRef.current((active) =>
                active?.id === incoming.id ? merged : active,
              );
              return next;
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "orders" },
          (payload) => {
            const row = payload.old as { id?: string };
            if (row.id) removeOrder(row.id);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void reconcile();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            window.setTimeout(subscribe, 2000);
          }
        });
    };

    subscribe();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void reconcile();
      subscribe();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const highlightTimers = highlightTimersRef.current;

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      channel?.unsubscribe();
      for (const timer of highlightTimers.values()) clearTimeout(timer);
      highlightTimers.clear();
    };
  }, [prependOrder, reconcile, removeOrder]);

  return { highlightedIds, trackRows };
}
