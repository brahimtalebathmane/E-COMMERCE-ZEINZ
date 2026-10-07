"use client";

import { AdminButton } from "@/components/admin/ui";

export function PrintButton({ label }: { label: string }) {
  return <AdminButton onClick={() => window.print()}>{label}</AdminButton>;
}
