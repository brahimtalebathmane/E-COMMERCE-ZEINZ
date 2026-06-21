"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AdminAssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openAssistant: () => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
};

const AdminAssistantContext = createContext<AdminAssistantContextValue | null>(
  null,
);

/**
 * Shares the AI Admin Assistant drawer open/close state across the dashboard
 * shell so the sidebar/bottom-nav trigger and the chat drawer (siblings in the
 * layout) can talk to each other without lifting the heavy chat state.
 */
export function AdminAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openAssistant = useCallback(() => setOpen(true), []);
  const closeAssistant = useCallback(() => setOpen(false), []);
  const toggleAssistant = useCallback(() => setOpen((prev) => !prev), []);

  const value = useMemo(
    () => ({ open, setOpen, openAssistant, closeAssistant, toggleAssistant }),
    [open, openAssistant, closeAssistant, toggleAssistant],
  );

  return (
    <AdminAssistantContext.Provider value={value}>
      {children}
    </AdminAssistantContext.Provider>
  );
}

export function useAdminAssistant(): AdminAssistantContextValue {
  const ctx = useContext(AdminAssistantContext);
  if (!ctx) {
    throw new Error(
      "useAdminAssistant must be used within an AdminAssistantProvider",
    );
  }
  return ctx;
}
