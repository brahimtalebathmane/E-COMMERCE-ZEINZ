"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const defaultObserverOptions: IntersectionObserverInit = {
  root: null,
  rootMargin: "0px 0px -5% 0px",
  threshold: 0.1,
};

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Fires once when the observed element intersects the viewport.
 * Respects `prefers-reduced-motion`: treats as visible immediately.
 */
export function useInViewOnce(
  overrides?: IntersectionObserverInit,
): readonly [(element: Element | null) => void, boolean] {
  const [node, setNode] = useState<Element | null>(null);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  const setRef = useCallback((el: Element | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    if (!node || visible) return;
    const merged: IntersectionObserverInit = {
      ...defaultObserverOptions,
      ...overridesRef.current,
    };
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
          return;
        }
      }
    }, merged);
    io.observe(node);
    return () => io.disconnect();
  }, [node, visible, reduced]);

  return [setRef, visible] as const;
}
